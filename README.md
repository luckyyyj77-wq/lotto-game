# 행운수집기 🎲

로또 번호를 미니게임으로 뽑는 웹 서비스. 캔버스 게임으로 공을 수집해 6개 번호를 완성하고,
기록 저장 · 실제 당첨번호 비교 · 통계 · 로또 정보 콘텐츠를 제공한다.

- **배포**: https://luckyyyj77-wq.github.io/lotto-game/
- **호스팅**: GitHub Pages (main 브랜치 루트)
- **스택**: Vanilla JS + HTML5 Canvas + CSS — 프레임워크/빌드 도구 없음

## 파일 구조

```
lotto-game/
├── index.html            메인 (게임 + 콘텐츠 섹션 + 푸터)
├── style.css             전체 스타일 (모바일 기본, 769px↑ PC 미디어쿼리)
├── favicon.svg
├── js/
│   ├── draw-time.js      회차·추첨 시각 계산 (KST 고정, 순수 함수)
│   ├── physics.js        두 게임이 공유하는 물리 (중력·반발·공 충돌)
│   ├── game.js           캔버스·소리·입력·게임 전환 + 공 수집 게임
│   ├── pinball-core.js   바구니 핀볼 시뮬레이션 (화면 없음, Node에서 실행 가능)
│   ├── pinball-camera.js 바구니 핀볼 카메라 (선두 무리 추적, 줌)
│   ├── pinball.js        바구니 핀볼 입력·화면
│   ├── bricks-core.js    행운 벽돌깨기 시뮬레이션 (화면 없음)
│   ├── bricks.js         행운 벽돌깨기 입력·화면
│   └── content.js        콘텐츠 로직 (기록·통계·당첨번호·D-day)
├── data/                 GitHub Actions가 매주 자동 갱신
│   ├── draws.json        전 회차 당첨 정보 (회차당 한 줄)
│   ├── latest.json       최신 당첨번호
│   └── stats.json        번호별 본번호 출현 횟수
├── scripts/
│   └── fetch_lotto.py    당첨번호 수집기
├── tests/                node --test tests/draw-time.test.js tests/pinball.test.js tests/bricks.test.js tests/index-assets.test.js
│                         python -m unittest discover tests
├── guide.html            로또 구매 가이드 (정보 콘텐츠)
├── odds.html             로또 확률의 이해
├── tax.html              당첨금 수령과 세금
├── faq.html              자주 묻는 질문
├── about.html            사이트 소개 · 문의
├── privacy.html          개인정보처리방침 (애드센스 필수)
├── sitemap.xml / robots.txt
└── .github/workflows/
    └── fetch-lotto.yml   당첨번호 자동 수집 워크플로우
```

## 아키텍처

### 게임 엔진 (js/game.js)

섹션 번호 주석으로 구분된 단일 파일 구조:

1. **캔버스 셋업** — `resizeCanvas()`가 뷰포트에서 UI 높이(모바일 160px / PC 184px)를
   빼고 600:400 비율로 캔버스 크기 결정. 광고 유닛을 다시 넣으면 이 상수 조정 필요.
   뷰포트 폭은 `clientWidth` 기준 (`innerWidth`는 모바일에서 넘치는 콘텐츠만큼 커짐)
2. **WebAudio BGM 엔진** — 외부 파일 없이 오실레이터로 BGM/효과음 생성.
   모바일 자동재생 정책 대응(첫 터치에 unlock). 음소거는 `lotto_muted`에 저장
3. **게임 상태** — 플레이어, 공, 폭탄존
4. ~ 8. 유틸 / 입력(터치+키보드) / 폭발 처리 / 업데이트 루프 / 렌더링
9. **번호/공유** — 6개 완성 시 `lottoComplete` CustomEvent 발생, 기기 공유(미지원 시 복사)/트위터/링크 공유

물리는 `gameLoop`에서 초당 60회 고정 스텝으로 돈다. 쿨다운 등 프레임 단위 값은 이 기준이다.

### 게임 전환

`game.js`의 `games` 객체에 게임을 등록하면 상단 "게임 바꾸기" 버튼이 차례로 순환한다.
각 게임은 `width·height`(캔버스 크기), `update·render`, `pointerDown·pointerMove·pointerUp`,
`getNumbers`(완성 전 `null`)를 제공하고, 완성되면 `announceNumbers()`를 호출한다.
게임을 바꿔도 각 게임의 진행 상태는 유지된다.

### 바구니 핀볼 (js/pinball-core.js, js/pinball-camera.js, js/pinball.js)

중심축에 고정된 둥근 바구니(코드에서는 drum)에 번호 공 45개 + 더미 20개를 넣고, 돌려서 게이지를
채운 뒤 바닥 문을 열어 쏟는다. 길이 2520의 코스를 내려가 결승선에 먼저 도착한 번호 공 6개를 뽑는다.
더미는 그냥 통과한다. 화면은 400x600 단위이고, 캔버스 픽셀은 선명도를 위해 2배다.

- **공정성**: 물리는 번호를 보지 않고, 시작 위치와 처리 순서를 무작위로 섞는다.
  번호에 따라 물리를 달리하는 코드를 넣으면 이 성질이 깨진다 (`tests/pinball.test.js`가 확인)
- **코스**: 핀 밭 → 경사로 → 범퍼·회전 막대 → 수문 → 좁은 핀 통로 → 결승선.
  수문은 쏟아진 공을 모았다가 약 3초마다 몇 개씩 내보내, 도착을 앞 무리와 다음 무리로 나눈다.
  수문이 없으면 6개가 1~2초 사이에 몰려 도착해 카메라 전환을 볼 수 없다
- **카메라**: 화면에만 영향을 준다. 선두 번호 공과 가까운 공을 함께 담아 따라가고, 선두가 바뀌면
  잠깐 기다렸다가 옮겨 간다. 안착하면 결승선을 잠시 비춘 뒤 다음 무리로 돌아가며, 멀면 줌아웃했다가
  다시 당긴다. 방식은 [lazygyu/roulette](https://github.com/lazygyu/roulette)(MIT)를 참고해 직접 구현했다
- **막힘 해제**: 구조물 위에 멈춘 공은 1초 뒤 살짝 튕긴다. 바구니와 수문 저수지에서 기다리는 공은 제외

### 행운 벽돌깨기 (js/bricks-core.js, js/bricks.js)

벽돌 54개(번호 45, 꽝 6, 공 추가 3)를 패들로 튕긴 공으로 깨서, 먼저 깬 번호 6개를 뽑는다.

- **공정성**: 내용물을 벽돌 위치에 무작위로 섞고 끝날 때까지 화면에 표시하지 않는다.
  벽돌 모양을 내용물에 따라 달리하면 노려서 뽑을 수 있게 되므로 금지
- **공유 범위**: 공 크기와 공끼리 충돌만 `physics.js`를 쓴다. 공 비행에는 중력을 적용하지 않고
  (중력 0.5로는 공이 벽돌까지 올라가지 못한다), 파편 효과에만 쓴다
- **실패 없음**: 공을 놓쳐도 뽑은 번호는 유지하고 다시 발사한다. 번호를 뽑는 것이 목적이기 때문이다
- **궤도 보정**: 공 속도를 일정하게 맞추고, 수평·수직으로만 도는 궤도는 살짝 기울인다.
  수직 보정이 없으면 빈 칸에서 위아래로만 왕복해 게임이 끝나지 않는다

### 콘텐츠 (js/content.js)

- **내 번호 기록** — `lottoComplete` 이벤트 수신 → `lotto_history`(localStorage, 최대 20개) 저장.
  서버 전송 없음. 저장 시점의 대상 회차를 `round`로 함께 기록 (토요일 20:00 KST 마감 기준)
- **번호 통계** — `data/stats.json`을 불러와 핫/콜드 탭 표시 (본번호 기준, 보너스 제외)
- **최신 당첨번호** — `data/latest.json` 표시. 추첨이 끝난 회차보다 뒤처져 있으면 안내 문구 표시
- **번호 비교** — `round`가 최신 회차와 같은 기록 중 최고 일치를 등수로 표시.
  없으면 최근 기록과의 일치 개수만 참고용으로 표시
- **D-day·회차 계산** — `js/draw-time.js`. 방문자 시간대와 무관하게 토요일 20:35 KST 기준

### 당첨번호 자동 수집 (scripts/fetch_lotto.py)

`data/draws.json`의 마지막 회차부터 추첨이 끝난 회차까지 빠진 회차를 순서대로 채운다.
빠진 회차가 없으면 바로 끝나므로 재시도 비용이 거의 없다.

- **스케줄**: 토 21:00, 21:30 / 일 00:00, 09:00, 21:00 / 월 09:00 KST (+ workflow_dispatch).
  GitHub 예약 실행은 수 시간 지연되기도 한다
- **수집 경로**: 회차별로 아래 순서로 시도, 전체를 최대 3회 반복
  1. 동행복권 공식 JSON `lt645/selectPstLt645Info.do?srchLtEpsd=<회차|all>`
     (GitHub Actions IP에서 열리는지는 실행 로그로 확인할 것)
  2. 네이버 검색 위젯 — `.win_area.type_lotto`의 `.winning_number .ball`, `.bonus_number .ball`,
     `"1230회차 (2026.06.27.)"`, `.win_text`
- **검증**: 요청한 회차와 일치, 번호 1~45, 본번호·보너스 중복 없음, 날짜 형식. 회차 연속성은 저장 시 확인
- **실패 처리**: 추첨 후 12시간 안에는 다음 예약 실행에 맡기고 성공 처리, 그 뒤로는 워크플로우 실패로
  표시해 GitHub 알림이 오게 한다. 일부 회차만 수집돼도 커밋한다
- **디버그**: 네이버 파싱 실패 시 HTML을 `debug-html` 아티팩트로 업로드
- **전체 재구성**: `python scripts/fetch_lotto.py --rebuild` (공식 JSON 필요)

`latest.json` 스키마 (동행복권 API 호환):

```json
{
  "returnValue": "success",
  "drwNo": 1230, "drwNoDate": "2026-06-27",
  "drwtNo1": 3, "drwtNo2": 8, "drwtNo3": 9,
  "drwtNo4": 22, "drwtNo5": 28, "drwtNo6": 42,
  "bnusNo": 45,
  "firstWinamnt": 1771357196, "firstPrzwnerCo": 16
}
```

## 로컬 개발

빌드 없음. 정적 서버만 띄우면 된다:

```bash
python -m http.server 8899
# http://localhost:8899
```

`file://`로 열면 `data/latest.json` fetch가 CORS로 실패하니 서버 필수.

## 배포

`main` 푸시 = 배포. 봇이 매주 `latest.json`을 자동 커밋하므로
푸시 전 `git pull --rebase` 습관화 (non-fast-forward 거절 자주 발생).

**JS·CSS를 바꾸면 `index.html`의 `?v=` 값을 모두 새 값으로 올릴 것.** GitHub Pages는 파일을 10분 캐시하므로,
버전을 안 올리면 옛 파일과 새 파일이 섞일 수 있다. 실제로 공용 함수를 `game.js`로 옮긴 배포에서
옛 `game.js` + 새 `bricks.js` 조합이 되어 첫 번호 벽돌에서 게임이 멈췄다.

## 애드센스 (진행 중)

- 게시자 ID: `ca-pub-6481527875589889` — 전 페이지 head에 스크립트 유지 (소유권 확인용)
- **2026-07 거절**: "게시자 콘텐츠가 없는 화면에 광고" → 광고 자리표시·고정바 전부 제거,
  정보 콘텐츠 페이지 6개·개인정보처리방침·sitemap 추가 후 재심사 요청 상태
- **승인 후 할 일**: 광고 유닛 코드 삽입 + `game.js`의 `uiH` 상수(160/184)에 광고 높이 반영
- **도메인 제약**: 프로젝트 페이지라 도메인 루트(`luckyyyj77-wq.github.io/`)의 `ads.txt`, `robots.txt`를
  둘 수 없다. 커스텀 도메인을 연결하면 해결되며, 그때 canonical·OG·sitemap의 URL도 함께 바꿀 것.
  그 전까지 sitemap은 Search Console에 직접 제출

## 주의사항

- 광고 심사 통과 전까지 빈 광고 슬롯/자리표시 박스를 다시 넣지 말 것
- 수집이 실패하면 Actions 로그부터 확인 — 네이버 위젯 마크업이 바뀌었으면 `debug-html` 아티팩트로 셀렉터 확인
- 수령처·판매 시간 등 콘텐츠는 [동행복권 로또6/45 소개](https://www.dhlottery.co.kr/lt645/intro) 기준으로 유지
