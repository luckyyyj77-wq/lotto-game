#!/usr/bin/env python3
"""당첨번호 수집기.

data/draws.json(전 회차)에 빠진 회차를 채우고 latest.json, stats.json을 다시 만든다.
수집 경로: 동행복권 공식 JSON → 실패 시 네이버 검색 위젯.

사용법:
    python scripts/fetch_lotto.py            # 빠진 회차만 수집
    python scripts/fetch_lotto.py --rebuild  # 공식 JSON으로 전 회차 재구성
"""
import json
import os
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
FIRST_DRAW = datetime(2002, 12, 7, 20, 35, tzinfo=KST)
WEEK = timedelta(days=7)
# 추첨 후 이 시간 안에는 수집 실패를 오류로 보지 않는다 (아직 미게시일 수 있고 다음 예약 실행이 재시도한다)
GRACE = timedelta(hours=12)
RETRIES = 3
RETRY_WAIT_SECONDS = 20

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
OFFICIAL_URL = "https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do"
NAVER_URL = "https://search.naver.com/search.naver"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def latest_drawn_round(now):
    """now 시점까지 추첨이 끝난 마지막 회차."""
    return (now - FIRST_DRAW) // WEEK + 1


def draw_time(round_no):
    return FIRST_DRAW + (round_no - 1) * WEEK


def is_valid_draw(draw):
    nums = draw["nums"]
    bonus = draw["bonus"]
    return (
        len(nums) == 6
        and len(set(nums)) == 6
        and all(isinstance(n, int) and 1 <= n <= 45 for n in nums + [bonus])
        and bonus not in nums
        and re.fullmatch(r"\d{4}-\d{2}-\d{2}", draw["date"]) is not None
    )


def from_official(item):
    ymd = item["ltRflYmd"]
    return {
        "round": item["ltEpsd"],
        "date": f"{ymd[:4]}-{ymd[4:6]}-{ymd[6:8]}",
        "nums": [item[f"tm{i}WnNo"] for i in range(1, 7)],
        "bonus": item["bnsWnNo"],
        "amount": item["rnk1WnAmt"],
        "winners": item["rnk1WnNope"],
    }


def fetch_official(query):
    import requests

    resp = requests.get(
        OFFICIAL_URL,
        params={"srchLtEpsd": query},
        headers={"User-Agent": USER_AGENT, "X-Requested-With": "XMLHttpRequest"},
        timeout=30,
        allow_redirects=False,
    )
    print(f"Official status: {resp.status_code}")
    resp.raise_for_status()
    if resp.status_code != 200:
        raise RuntimeError(f"unexpected status {resp.status_code}")
    return [from_official(item) for item in resp.json()["data"]["list"]]


def parse_naver(html, round_no):
    """네이버 검색 HTML에서 요청한 회차의 당첨 정보를 추출한다. 회차가 다르면 None."""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    area = soup.select_one(".win_area.type_lotto")
    if area is None:
        return None

    main = [b.get_text(strip=True) for b in area.select(".winning_number .ball")]
    bonus = [b.get_text(strip=True) for b in area.select(".bonus_number .ball")]
    if len(main) != 6 or not bonus:
        return None

    match = re.search(r"(\d{3,4})\s*회차\s*\((\d{4})\.(\d{2})\.(\d{2})", soup.get_text(" "))
    if not match or int(match.group(1)) != round_no:
        return None

    amount, winners = 0, 0
    win_text = area.select_one(".win_text")
    if win_text:
        text = win_text.get_text(" ", strip=True)
        found = re.search(r"당첨금\s*([\d,]+)\s*원", text)
        if found:
            amount = int(found.group(1).replace(",", ""))
        found = re.search(r"당첨게임\s*수\s*([\d,]+)\s*개", text)
        if found:
            winners = int(found.group(1).replace(",", ""))

    return {
        "round": round_no,
        "date": f"{match.group(2)}-{match.group(3)}-{match.group(4)}",
        "nums": [int(x) for x in main],
        "bonus": int(bonus[0]),
        "amount": amount,
        "winners": winners,
    }


def fetch_naver(round_no):
    import requests

    resp = requests.get(
        NAVER_URL,
        params={"query": f"로또 {round_no}회"},
        headers={
            "User-Agent": USER_AGENT,
            "Accept-Language": "ko-KR,ko;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        timeout=15,
    )
    print(f"Naver status: {resp.status_code}")
    resp.encoding = "utf-8"
    resp.raise_for_status()
    draw = parse_naver(resp.text, round_no)
    if draw is None:
        # 셀렉터 확인용. 워크플로우가 debug-html 아티팩트로 올린다.
        with open(os.path.join(DATA_DIR, "debug_naver.html"), "w", encoding="utf-8") as f:
            f.write(resp.text)
    return draw


def fetch_round(round_no):
    """공식 → 네이버 순서로 시도. 검증을 통과한 해당 회차만 돌려준다."""
    for attempt in range(1, RETRIES + 1):
        for name, fetcher in (
            ("official", lambda: next((d for d in fetch_official(round_no) if d["round"] == round_no), None)),
            ("naver", lambda: fetch_naver(round_no)),
        ):
            try:
                draw = fetcher()
            except Exception as e:  # 네트워크/차단/형식 변경 모두 다음 경로로 넘긴다
                print(f"{name} failed for round {round_no}: {e}")
                continue
            if draw and is_valid_draw(draw):
                print(f"Fetched round {round_no} via {name}")
                return draw
            print(f"{name}: no valid data for round {round_no}")
        if attempt < RETRIES:
            time.sleep(RETRY_WAIT_SECONDS * attempt)
    return None


def build_latest(draw):
    """기존 동행복권 API와 같은 스키마."""
    data = {"returnValue": "success", "drwNo": draw["round"], "drwNoDate": draw["date"]}
    for i, n in enumerate(draw["nums"], start=1):
        data[f"drwtNo{i}"] = n
    data.update(bnusNo=draw["bonus"], firstWinamnt=draw["amount"], firstPrzwnerCo=draw["winners"])
    return data


def build_stats(draws):
    counts = {str(n): 0 for n in range(1, 46)}
    for draw in draws:
        for n in draw["nums"]:
            counts[str(n)] += 1
    return {"lastRound": draws[-1]["round"], "lastDate": draws[-1]["date"], "counts": counts}


def check_contiguous(draws):
    for expected, draw in enumerate(draws, start=1):
        if draw["round"] != expected:
            raise ValueError(f"round gap: expected {expected}, got {draw['round']}")


def read_draws():
    path = os.path.join(DATA_DIR, "draws.json")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(name, obj):
    with open(os.path.join(DATA_DIR, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)


def write_outputs(draws):
    check_contiguous(draws)
    # 회차당 한 줄 — 주간 커밋 diff가 한 줄로 남도록
    with open(os.path.join(DATA_DIR, "draws.json"), "w", encoding="utf-8") as f:
        f.write("[\n" + ",\n".join(json.dumps(d, ensure_ascii=False) for d in draws) + "\n]\n")
    write_json("latest.json", build_latest(draws[-1]))
    write_json("stats.json", build_stats(draws))


def rebuild():
    draws = sorted(fetch_official("all"), key=lambda d: d["round"])
    invalid = [d["round"] for d in draws if not is_valid_draw(d)]
    if invalid:
        raise ValueError(f"invalid rounds: {invalid}")
    write_outputs(draws)
    print(f"Rebuilt {len(draws)} rounds, last {draws[-1]['round']} ({draws[-1]['date']})")


def update(now):
    draws = read_draws()
    if not draws:
        raise SystemExit("data/draws.json이 없습니다. --rebuild를 먼저 실행하세요.")
    target = latest_drawn_round(now)
    last = draws[-1]["round"]
    print(f"Have round {last}, target {target}")

    missing = None
    for round_no in range(last + 1, target + 1):
        draw = fetch_round(round_no)
        if draw is None:
            missing = round_no
            break
        draws.append(draw)

    if draws[-1]["round"] != last:
        write_outputs(draws)
        print(f"Saved up to round {draws[-1]['round']}")

    if missing is None:
        return 0
    if now < draw_time(missing) + GRACE:
        print(f"Round {missing} not available yet; a later scheduled run will retry")
        return 0
    print(f"Round {missing} still unavailable {now - draw_time(missing)} after the draw")
    return 1


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    if "--rebuild" in sys.argv:
        rebuild()
        return 0
    return update(datetime.now(KST))


if __name__ == "__main__":
    sys.exit(main())
