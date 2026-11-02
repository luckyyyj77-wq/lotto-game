// 실행: node --test tests/bricks.test.js
const test = require('node:test');
const assert = require('node:assert');
const { createGame, NUMBER_COUNT, DUD_COUNT, MULTI_COUNT, COLS, ROWS } = require('../js/bricks-core.js');

function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// 가장 낮은 공을 패들로 따라가는 자동 플레이어. skew는 패들 중심에서 비껴 맞히는 정도
function autoPlay(game, skew = 0, limit = 36000, onStep = null) {
    let steps = 0;
    while (game.state !== 'done' && steps < limit) {
        if (game.state === 'ready') game.launch();
        const lowest = game.balls.reduce((a, b) => (b.y > a.y ? b : a));
        game.setPaddleTarget(lowest.x + skew);
        game.step();
        steps++;
        if (onStep) onStep(game);
    }
    return steps;
}

test('벽돌은 번호 45개와 꽝, 공 추가로 격자를 채운다', () => {
    const game = createGame({ rng: seeded(1) });
    const numbers = game.bricks.filter(b => b.type === 'number').map(b => b.number);
    assert.strictEqual(new Set(numbers).size, NUMBER_COUNT);
    assert.strictEqual(game.bricks.length, COLS * ROWS);
    assert.strictEqual(game.bricks.length, NUMBER_COUNT + DUD_COUNT + MULTI_COUNT);
    assert.ok(game.bricks.every(b => b.x >= 0 && b.x + b.width <= game.W));
});

test('번호가 모든 구역에 고르게 퍼진다', () => {
    for (let seed = 1; seed <= 20; seed++) {
        const game = createGame({ rng: seeded(seed) });
        const perZone = new Map();
        game.bricks.forEach(b => {
            if (b.type === 'number') perZone.set(b.zone, (perZone.get(b.zone) || 0) + 1);
        });
        assert.strictEqual(perZone.size, 15);
        assert.ok([...perZone.values()].every(count => count === 3));
    }
});

test('어느 번호든 어느 구역에나 놓일 수 있다', () => {
    const zonesOfOne = new Set();
    for (let seed = 1; seed <= 400; seed++) {
        const brick = createGame({ rng: seeded(seed) }).bricks.find(b => b.number === 1);
        zonesOfOne.add(brick.zone);
    }
    assert.strictEqual(zonesOfOne.size, 15);
});

test('번호 배치는 판마다 달라진다', () => {
    const order = seed => createGame({ rng: seeded(seed) }).bricks.map(b => b.number).join();
    assert.notStrictEqual(order(1), order(2));
});

test('발사 전에는 공이 패들을 따라다니고 벽돌이 깨지지 않는다', () => {
    const game = createGame({ rng: seeded(2) });
    game.setPaddleTarget(80);
    for (let i = 0; i < 60; i++) game.step();
    assert.strictEqual(game.state, 'ready');
    assert.strictEqual(game.balls[0].x, game.paddle.x);
    assert.strictEqual(game.paddle.x, 80);
    assert.strictEqual(game.brokenCount, 0);
    assert.ok(game.launch());
    assert.strictEqual(game.state, 'playing');
    assert.strictEqual(game.launch(), false);
});

test('패들은 화면 밖으로 나가지 않는다', () => {
    const game = createGame({ rng: seeded(3) });
    for (let i = 0; i < 100; i++) {
        game.movePaddle(-1);
        game.step();
    }
    assert.strictEqual(game.paddle.x, game.paddle.width / 2);
    game.setPaddleTarget(9999);
    for (let i = 0; i < 100; i++) game.step();
    assert.strictEqual(game.paddle.x, game.W - game.paddle.width / 2);
});

test('공을 놓치면 뽑은 번호를 유지한 채 다시 발사할 수 있다', () => {
    const game = createGame({ rng: seeded(4) });
    autoPlay(game, 0, 400);
    const pickedBefore = game.picked.length;
    const brokenBefore = game.brokenCount;
    assert.ok(brokenBefore > 0);

    game.setPaddleTarget(game.balls[0].x < 200 ? 400 : 0);
    const events = [];
    for (let i = 0; i < 3000 && game.state === 'playing'; i++) {
        const lowest = game.balls.reduce((a, b) => (b.y > a.y ? b : a));
        game.setPaddleTarget(lowest.x < 200 ? 400 : 0);
        events.push(...game.step());
    }
    if (game.state === 'ready') {
        assert.ok(events.some(e => e.type === 'miss'));
        assert.ok(game.picked.length >= pickedBefore);
        assert.strictEqual(game.balls.length, 1);
        assert.ok(game.launch());
    } else {
        assert.strictEqual(game.state, 'done');
    }
});

test('여러 판 모두 서로 다른 번호 6개로 끝나고 공이 경기장을 벗어나지 않는다', () => {
    for (let seed = 100; seed < 200; seed++) {
        const game = createGame({ rng: seeded(seed) });
        const steps = autoPlay(game, ((seed % 5) - 2) * 15, 36000, g => {
            for (const b of g.balls) {
                assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y), `seed ${seed}: 좌표 이상`);
                assert.ok(b.x >= 0 && b.x <= g.W && b.y >= 0, `seed ${seed}: 경기장 이탈`);
                // 놓친 뒤 발사 대기(ready) 중에는 공이 패들 위에 멈춰 있는 것이 정상이다
                if (g.state === 'playing') assert.ok(Math.abs(b.vy) > 0, `seed ${seed}: 수평 고착`);
            }
        });
        assert.strictEqual(game.state, 'done', `seed ${seed}: ${steps}스텝 안에 끝나지 않음`);
        const numbers = game.numbers();
        assert.strictEqual(new Set(numbers).size, 6);
        assert.ok(numbers.every(n => Number.isInteger(n) && n >= 1 && n <= 45));
    }
});

test('패들 정중앙에만 맞혀도 공이 수직으로 고착되지 않고 끝난다', () => {
    for (let seed = 400; seed < 450; seed++) {
        const game = createGame({ rng: seeded(seed) });
        autoPlay(game, 0);
        assert.strictEqual(game.state, 'done', `seed ${seed}`);
    }
});

test('공의 움직임은 벽돌에 적힌 번호와 무관하다', () => {
    for (let seed = 300; seed < 310; seed++) {
        const original = createGame({ rng: seeded(seed) });
        const relabeled = createGame({ rng: seeded(seed) });
        relabeled.bricks.forEach(b => {
            if (b.number !== null) b.number = 46 - b.number;
        });
        autoPlay(original);
        autoPlay(relabeled);
        assert.deepStrictEqual(relabeled.numbers(), original.numbers().map(n => 46 - n));
    }
});

test('6개가 뽑히면 더 진행되지 않는다', () => {
    const game = createGame({ rng: seeded(7) });
    autoPlay(game);
    const broken = game.brokenCount;
    for (let i = 0; i < 300; i++) game.step();
    assert.strictEqual(game.brokenCount, broken);
    assert.strictEqual(game.picked.length, 6);
    assert.strictEqual(game.launch(), false);
});
