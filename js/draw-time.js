// 로또 회차·추첨 시각 계산 — 추첨은 한국 시간 기준이므로 방문자 시간대와 무관하게 UTC로 계산한다
const FIRST_DRAW_MS = Date.UTC(2002, 11, 7, 11, 35);   // 1회 추첨: 2002-12-07 20:35 KST
const FIRST_CUTOFF_MS = Date.UTC(2002, 11, 7, 11, 0);  // 1회 판매 마감: 20:00 KST
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// nowMs 시점까지 추첨이 끝난 마지막 회차
function latestDrawnRound(nowMs) {
    return Math.floor((nowMs - FIRST_DRAW_MS) / WEEK_MS) + 1;
}

// 다음 추첨 시각
function nextDrawTimeMs(nowMs) {
    return FIRST_DRAW_MS + latestDrawnRound(nowMs) * WEEK_MS;
}

// nowMs 시점에 구매하면 대상이 되는 회차 (토요일 20:00 KST 마감 후에는 다음 회차)
function purchaseRound(nowMs) {
    return Math.floor((nowMs - FIRST_CUTOFF_MS) / WEEK_MS) + 2;
}

if (typeof module !== 'undefined') {
    module.exports = { latestDrawnRound, nextDrawTimeMs, purchaseRound };
}
