// 실행: node --test tests/draw-time.test.js
const test = require('node:test');
const assert = require('node:assert');
const { latestDrawnRound, nextDrawTimeMs, purchaseRound } = require('../js/draw-time.js');

const kst = s => Date.parse(`${s}+09:00`);

test('latestDrawnRound: 추첨 시각 기준으로 회차가 바뀐다', () => {
    assert.strictEqual(latestDrawnRound(kst('2002-12-07T20:35:00')), 1);
    assert.strictEqual(latestDrawnRound(kst('2026-10-31T20:34:59')), 1247);
    assert.strictEqual(latestDrawnRound(kst('2026-10-31T20:35:00')), 1248);
    assert.strictEqual(latestDrawnRound(kst('2026-11-01T10:00:00')), 1248);
    assert.strictEqual(latestDrawnRound(kst('2026-11-06T22:00:00')), 1248);
    assert.strictEqual(latestDrawnRound(kst('2026-11-07T08:00:00')), 1248);
});

test('nextDrawTimeMs: 토요일 추첨 전이면 당일, 추첨 후면 다음 주', () => {
    assert.strictEqual(nextDrawTimeMs(kst('2026-11-07T10:00:00')), kst('2026-11-07T20:35:00'));
    assert.strictEqual(nextDrawTimeMs(kst('2026-11-07T20:35:00')), kst('2026-11-14T20:35:00'));
    assert.strictEqual(nextDrawTimeMs(kst('2026-11-02T10:00:00')), kst('2026-11-07T20:35:00'));
});

test('purchaseRound: 토요일 20:00 마감 후에는 다음 회차', () => {
    assert.strictEqual(purchaseRound(kst('2026-11-02T10:00:00')), 1249);
    assert.strictEqual(purchaseRound(kst('2026-11-07T19:59:59')), 1249);
    assert.strictEqual(purchaseRound(kst('2026-11-07T20:00:00')), 1250);
});
