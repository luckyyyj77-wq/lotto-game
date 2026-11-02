// 실행: node --test tests/pinball.test.js
const test = require('node:test');
const assert = require('node:assert');
const { collideBalls, gravity, bounce } = require('../js/physics.js');
const { createGame, NUMBER_COUNT, DUMMY_COUNT } = require('../js/pinball-core.js');

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

function shake(game) {
    let side = 1;
    for (let i = 0; !game.canRelease() && i < 3000; i++) {
        if (i % 8 === 0) side = -side;
        game.setShakeTarget(side * 100, -side * 100);
        game.step();
    }
    game.setShakeTarget(0, 0);
}

function play(seed, onStep) {
    const game = createGame({ rng: seeded(seed) });
    shake(game);
    assert.ok(game.release());
    let steps = 0;
    while (game.state !== 'done' && steps < 7200) {
        game.step();
        steps++;
        if (onStep) onStep(game);
    }
    return { game, steps };
}

test('공용 충돌은 운동량을 보존하고 탄성 충돌이면 속도를 교환한다', () => {
    const a = { x: 0, y: 0, vx: 2, vy: 0, radius: 10 };
    const b = { x: 15, y: 0, vx: 0, vy: 0, radius: 10 };
    assert.ok(collideBalls(a, b));
    assert.strictEqual(a.vx, 0);
    assert.strictEqual(b.vx, 2);
    assert.strictEqual(b.x - a.x, 20);
    assert.strictEqual(gravity, 0.5);
    assert.strictEqual(bounce, 0.6);
});

test('이미 멀어지는 두 공은 속도를 바꾸지 않는다', () => {
    const a = { x: 0, y: 0, vx: -1, vy: 0, radius: 10 };
    const b = { x: 15, y: 0, vx: 1, vy: 0, radius: 10 };
    collideBalls(a, b);
    assert.strictEqual(a.vx, -1);
    assert.strictEqual(b.vx, 1);
});

test('바구니에는 번호 45개와 더미가 들어 있다', () => {
    const game = createGame({ rng: seeded(1) });
    const numbers = game.balls.filter(b => b.number !== null).map(b => b.number);
    assert.strictEqual(numbers.length, NUMBER_COUNT);
    assert.strictEqual(new Set(numbers).size, NUMBER_COUNT);
    assert.strictEqual(game.balls.length, NUMBER_COUNT + DUMMY_COUNT);
});

test('흔들기 전에는 내려보낼 수 없고, 문이 닫혀 있으면 공이 나가지 않는다', () => {
    const game = createGame({ rng: seeded(2) });
    assert.strictEqual(game.release(), false);
    for (let i = 0; i < 300; i++) game.step();
    assert.strictEqual(game.state, 'ready');
    assert.strictEqual(game.shakeProgress(), 0);
    shake(game);
    assert.ok(game.canRelease());
    assert.strictEqual(game.exitedCount, 0);
    assert.ok(game.balls.every(b => b.inBasket));
});

test('여러 판 모두 막히지 않고 서로 다른 번호 6개로 끝난다', () => {
    for (let seed = 100; seed < 130; seed++) {
        const { game, steps } = play(seed, g => {
            for (const b of g.balls) {
                assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y), `seed ${seed}: 좌표 이상`);
                assert.ok(b.x >= 0 && b.x <= g.W && b.y >= 0 && b.y <= g.H, `seed ${seed}: 화면 이탈`);
            }
        });
        assert.strictEqual(game.state, 'done', `seed ${seed}: ${steps}스텝 안에 끝나지 않음`);
        const numbers = game.numbers();
        assert.strictEqual(new Set(numbers).size, 6);
        assert.ok(numbers.every(n => Number.isInteger(n) && n >= 1 && n <= 45));
    }
});

test('공의 움직임은 적힌 번호와 무관하다 (번호를 바꿔 달아도 같은 공이 뽑힌다)', () => {
    for (let seed = 200; seed < 205; seed++) {
        const original = createGame({ rng: seeded(seed) });
        const relabeled = createGame({ rng: seeded(seed) });
        relabeled.balls.forEach(b => {
            if (b.number !== null) b.number = 46 - b.number;
        });
        for (const game of [original, relabeled]) {
            shake(game);
            game.release();
            for (let i = 0; i < 7200 && game.state !== 'done'; i++) game.step();
        }
        assert.deepStrictEqual(relabeled.numbers(), original.numbers().map(n => 46 - n));
    }
});

test('시작 배치는 판마다 달라진다', () => {
    const order = seed => createGame({ rng: seeded(seed) }).balls.map(b => b.number).join();
    assert.notStrictEqual(order(1), order(2));
});

test('6개가 뽑히면 문이 닫혀 더 뽑히지 않는다', () => {
    const { game } = play(7);
    for (let i = 0; i < 1200; i++) game.step();
    assert.strictEqual(game.picked.length, 6);
    assert.ok(game.balls.length > 0);
});
