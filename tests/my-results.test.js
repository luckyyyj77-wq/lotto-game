// 실행: node --test tests/my-results.test.js
// 내 번호 기록을 대상 회차 당첨번호와 맞춰 보는 계산을 확인한다.
const test = require('node:test');
const assert = require('node:assert');
const { rankOf, resultFor, summarize, unseenRound } = require('../js/my-results.js');
const backtest = require('../js/backtest.js');

const draws = {
    1249: { nums: [2, 11, 16, 25, 34, 35], bonus: 14 },
    1248: { nums: [1, 2, 3, 4, 5, 6], bonus: 7 }
};

test('등수 계산이 번호 돌려보기와 같다', () => {
    const draw = { nums: [1, 2, 3, 4, 5, 6], bonus: 7 };
    [[1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 7], [1, 2, 3, 4, 5, 8], [1, 2, 3, 4, 7, 8], [1, 2, 3, 7, 8, 9], [1, 2, 7, 8, 9, 10]]
        .forEach(picks => assert.strictEqual(rankOf(picks, draw), backtest.rankOf(picks, draw)));
});

test('대상 회차의 당첨번호와 맞춰 본다', () => {
    const r = resultFor({ round: 1249, numbers: [2, 11, 16, 20, 30, 40] }, draws, 1249);
    assert.strictEqual(r.status, 'done');
    assert.deepStrictEqual(r.matched, [2, 11, 16]);
    assert.strictEqual(r.rank, 5);
    // 지난 회차 기록은 최신 회차가 아니라 자기 회차와 비교한다
    const old = resultFor({ round: 1248, numbers: [1, 2, 3, 4, 5, 7] }, draws, 1249);
    assert.strictEqual(old.rank, 2);
    assert.strictEqual(old.bonusMatch, true);
});

test('추첨 전, 반영 전, 회차 없는 옛 기록을 구분한다', () => {
    assert.strictEqual(resultFor({ round: 1250, numbers: [1, 2, 3, 4, 5, 6] }, draws, 1249).status, 'pending');
    assert.strictEqual(resultFor({ round: 1250, numbers: [1, 2, 3, 4, 5, 6] }, draws, 1250).status, 'waiting');
    assert.strictEqual(resultFor({ numbers: [1, 2, 3, 4, 5, 6] }, draws, 1249).status, 'unknown');
});

test('결과가 나온 기록만 등수별로 센다', () => {
    const results = [
        { status: 'done', round: 1249, rank: 5 },
        { status: 'done', round: 1249, rank: 0 },
        { status: 'done', round: 1248, rank: 2 },
        { status: 'pending', round: 1250 }
    ];
    const { checked, counts } = summarize(results);
    assert.strictEqual(checked, 3);
    assert.deepStrictEqual(counts, { 1: 0, 2: 1, 3: 0, 4: 0, 5: 1, 0: 1 });
});

test('본 적 없는 가장 최근 결과 회차를 찾는다', () => {
    const results = [{ status: 'pending', round: 1250 }, { status: 'done', round: 1249 }, { status: 'done', round: 1248 }];
    assert.strictEqual(unseenRound(results, 0), 1249);
    assert.strictEqual(unseenRound(results, 1249), 0);
});

test('안내 문구의 5등 이상 확률 1/42가 맞다', () => {
    const ways = Object.values(backtest.WAYS).reduce((a, b) => a + b, 0);
    assert.strictEqual(Math.round(backtest.TOTAL_COMBINATIONS / ways), 42);
});
