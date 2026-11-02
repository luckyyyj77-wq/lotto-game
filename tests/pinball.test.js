// 실행: node --test tests/pinball.test.js
const test = require('node:test');
const assert = require('node:assert');
const { collideBalls, gravity, bounce } = require('../js/physics.js');
const { createGame, NUMBER_COUNT, DUMMY_COUNT, MAX_SPIN } = require('../js/pinball-core.js');
const { createCamera } = require('../js/pinball-camera.js');

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

function spin(game) {
    for (let i = 0; !game.canRelease() && i < 3000; i++) {
        game.spinBy(MAX_SPIN);
        game.step();
    }
}

function play(seed, onStep) {
    const game = createGame({ rng: seeded(seed) });
    spin(game);
    assert.ok(game.release());
    let steps = 0;
    while (game.state !== 'done' && steps < 14400) {
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

test('드럼에는 번호 45개와 더미가 들어 있다', () => {
    const game = createGame({ rng: seeded(1) });
    const numbers = game.balls.filter(b => b.number !== null).map(b => b.number);
    assert.strictEqual(numbers.length, NUMBER_COUNT);
    assert.strictEqual(new Set(numbers).size, NUMBER_COUNT);
    assert.strictEqual(game.balls.length, NUMBER_COUNT + DUMMY_COUNT);
});

test('돌리기 전에는 내려보낼 수 없고, 문이 닫혀 있으면 공이 드럼 밖으로 나가지 않는다', () => {
    const game = createGame({ rng: seeded(2) });
    assert.strictEqual(game.release(), false);
    for (let i = 0; i < 300; i++) game.step();
    assert.strictEqual(game.state, 'ready');
    assert.strictEqual(game.spinProgress(), 0);

    spin(game);
    assert.ok(game.canRelease());
    for (let i = 0; i < 300; i++) {
        game.spinBy(i % 200 < 100 ? MAX_SPIN : -MAX_SPIN);
        game.step();
    }
    assert.ok(game.balls.every(b => b.inDrum));
    assert.ok(game.balls.every(b => Math.hypot(b.x - game.drum.x, b.y - game.drum.y) <= game.drum.radius));
    assert.strictEqual(game.exitedCount, 0);
});

test('내려보내면 대부분의 공이 한꺼번에 쏟아진다', () => {
    const game = createGame({ rng: seeded(3) });
    spin(game);
    game.release();
    for (let i = 0; i < 180; i++) game.step();
    const left = game.balls.filter(b => b.inDrum).length;
    assert.ok(left <= 15, `3초 뒤 드럼에 ${left}개 남음`);
});

test('여러 판 모두 막히지 않고 서로 다른 번호 6개로 끝난다', () => {
    for (let seed = 100; seed < 125; seed++) {
        const { game, steps } = play(seed, g => {
            for (const b of g.balls) {
                assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y), `seed ${seed}: 좌표 이상`);
                assert.ok(b.x >= 0 && b.x <= g.W && b.y >= 0 && b.y <= g.H, `seed ${seed}: 코스 이탈`);
            }
        });
        assert.strictEqual(game.state, 'done', `seed ${seed}: ${steps}스텝 안에 끝나지 않음`);
        const numbers = game.numbers();
        assert.strictEqual(new Set(numbers).size, 6);
        assert.ok(numbers.every(n => Number.isInteger(n) && n >= 1 && n <= 45));
    }
});

test('공의 움직임은 적힌 번호와 무관하다 (번호를 바꿔 달아도 같은 공이 뽑힌다)', () => {
    for (let seed = 200; seed < 204; seed++) {
        const original = createGame({ rng: seeded(seed) });
        const relabeled = createGame({ rng: seeded(seed) });
        relabeled.balls.forEach(b => {
            if (b.number !== null) b.number = 46 - b.number;
        });
        for (const game of [original, relabeled]) {
            spin(game);
            game.release();
            for (let i = 0; i < 14400 && game.state !== 'done'; i++) game.step();
        }
        assert.deepStrictEqual(relabeled.numbers(), original.numbers().map(n => 46 - n));
    }
});

test('시작 배치는 판마다 달라진다', () => {
    const order = seed => createGame({ rng: seeded(seed) }).balls.map(b => b.number).join();
    assert.notStrictEqual(order(1), order(2));
});

test('6개가 뽑힌 뒤에는 공이 더 나와도 번호가 늘지 않는다', () => {
    const { game } = play(7);
    for (let i = 0; i < 3600; i++) game.step();
    assert.strictEqual(game.picked.length, 6);
    assert.ok(game.exitedCount > 6);
});

test('카메라는 선두 공을 화면 안에 담고 코스 밖을 비추지 않으며 물리를 바꾸지 않는다', () => {
    const viewW = 400;
    const viewH = 600;
    const withCamera = createGame({ rng: seeded(11) });
    const without = createGame({ rng: seeded(11) });
    const cam = createCamera({ viewW, viewH, worldW: withCamera.W, worldH: withCamera.H });
    spin(withCamera);
    spin(without);
    withCamera.release();
    without.release();

    let visible = 0;
    let total = 0;
    let picks = 0;
    let minZoom = Infinity;
    let maxZoom = 0;
    for (let i = 0; i < 14400 && withCamera.state !== 'done'; i++) {
        withCamera.step().forEach(e => {
            if (e.type === 'pick') {
                cam.notePick();
                picks++;
            }
        });
        without.step();
        cam.update(withCamera);

        assert.ok(cam.x >= 0 && cam.x <= withCamera.W, '카메라 x가 코스 밖');
        assert.ok(cam.visibleTop() >= -1 && cam.visibleBottom() <= withCamera.H + 1, '카메라 y가 코스 밖');
        minZoom = Math.min(minZoom, cam.zoom);
        maxZoom = Math.max(maxZoom, cam.zoom);

        const leader = withCamera.balls.filter(b => b.number !== null).sort((a, b) => b.y - a.y)[0];
        if (leader && !cam.holdSteps && i > 120) {
            total++;
            const p = cam.toScreen(leader);
            if (p.x >= 0 && p.x <= viewW && p.y >= 0 && p.y <= viewH) visible++;
        }
    }
    assert.strictEqual(picks, 6);
    assert.ok(visible / total > 0.9, `선두가 화면에 보인 비율 ${(visible / total).toFixed(2)}`);
    assert.ok(maxZoom > minZoom + 0.3, '줌 변화가 없음');
    assert.deepStrictEqual(withCamera.numbers(), without.numbers());
});
