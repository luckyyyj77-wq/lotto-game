// 내 번호 자동 대조: 저장된 번호마다 그 번호가 대상으로 한 회차의 당첨번호와 맞춰 본다.
// 계산 함수는 tests/my-results.test.js가 직접 검사한다.
(function (root) {
    // draw: { nums: [6개], bonus }
    function rankOf(numbers, draw) {
        const matches = draw.nums.filter(n => numbers.includes(n)).length;
        if (matches === 6) return 1;
        if (matches === 5) return numbers.includes(draw.bonus) ? 2 : 3;
        if (matches === 4) return 4;
        if (matches === 3) return 5;
        return 0;
    }

    // history: 저장된 기록 배열, drawsByRound: { 회차: draw }, drawnRound: 지금까지 추첨이 끝난 회차
    // status — done: 결과 있음, waiting: 추첨은 끝났지만 데이터 반영 전, pending: 추첨 전, unknown: 회차 정보 없음
    function resultFor(item, drawsByRound, drawnRound) {
        if (!item || !Number.isInteger(item.round)) return { status: 'unknown' };
        if (item.round > drawnRound) return { status: 'pending', round: item.round };
        const draw = drawsByRound[item.round];
        if (!draw) return { status: 'waiting', round: item.round };
        const matched = item.numbers.filter(n => draw.nums.includes(n));
        return {
            status: 'done',
            round: item.round,
            matched,
            bonusMatch: item.numbers.includes(draw.bonus),
            rank: rankOf(item.numbers, draw)
        };
    }

    // 결과가 나온 기록 전체의 등수별 횟수
    function summarize(results) {
        const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 0: 0 };
        let checked = 0;
        results.forEach(r => {
            if (r.status !== 'done') return;
            checked++;
            counts[r.rank]++;
        });
        return { checked, counts };
    }

    // 아직 보지 않은 새 결과가 있는 가장 최근 회차 (없으면 0)
    function unseenRound(results, seenRound) {
        return results.reduce((max, r) => r.status === 'done' && r.round > seenRound && r.round > max ? r.round : max, 0);
    }

    const api = { rankOf, resultFor, summarize, unseenRound };
    if (typeof module !== 'undefined') module.exports = api;
    else root.MyResults = api;
})(this);
