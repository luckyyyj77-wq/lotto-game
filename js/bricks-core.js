// 행운 벽돌깨기 시뮬레이션 — 화면과 무관한 순수 로직 (Node에서 대량 검증 가능)
//
// 공정성: 번호는 벽돌 위치와 무관하게 무작위로 섞이고, 깨기 전에는 화면에 보이지 않는다.
// 벽돌의 모양이나 물리를 번호에 따라 달리하는 코드를 넣지 말 것.
(function (root) {
    const physics = typeof module !== 'undefined' ? require('./physics.js') : root.LottoPhysics;
    const { ballRadius, collideBalls } = physics;

    const W = 400;
    const H = 600;
    const NUMBER_COUNT = 45;
    const DUD_COUNT = 72;       // 꽝: 깨져도 번호가 없다
    const MULTI_COUNT = 3;      // 공 추가
    const PICK_COUNT = 6;

    const COLS = 10;
    const ROWS = 12;
    // 격자를 2x4칸 구역 15개로 나누고 구역마다 번호를 3개씩 넣어, 번호가 한쪽에 몰리지 않게 한다
    const ZONE_COLS = 2;
    const ZONE_ROWS = 4;
    const NUMBERS_PER_ZONE = 3;
    const BRICK_GAP = 3;
    const BRICK_H = 18;
    const BRICK_TOP = 64;
    const BRICK_MARGIN = 6;
    const BRICK_W = (W - BRICK_MARGIN * 2 - BRICK_GAP * (COLS - 1)) / COLS;

    const CEILING = 54;         // 번호 칸 아래부터 공이 움직인다
    const PADDLE = { y: 556, width: 84, height: 14, speed: 8 };
    const MAX_BOUNCE_ANGLE = Math.PI / 3;

    const START_SPEED = 4.5;
    const SPEED_PER_BRICK = 0.03;
    const MAX_SPEED = 7;        // 벽돌 높이 + 공 지름보다 작아 공이 벽돌을 뚫지 않는다
    const MIN_VERTICAL = 0.3;   // 공이 거의 수평으로 오래 왕복하지 않게 한다
    const MIN_HORIZONTAL = 0.12; // 비어 있는 칸에서 위아래로만 영원히 왕복하지 않게 한다
    const STALL_STEPS = 600;    // 10초 동안 아무것도 못 맞히면 받침이 남은 벽돌 쪽으로 튕겨 준다
    const EXTRA_BALLS = 2;
    const MAX_BALLS = 6;

    // 이어하기 기믹. 내용물(번호·꽝)과 무관하게 무작위로 고르므로 외형으로 번호를 짐작할 수 없다
    const HARD_SHARE = 0.25;     // 남은 벽돌 중 단단한 벽돌 비율
    const ITEM_SHARE = 0.15;     // 남은 벽돌 중 아이템을 품는 비율
    const ITEMS = ['split', 'wide', 'slow', 'laser'];
    const ITEM_FALL_SPEED = 2.5;
    const ITEM_SIZE = { width: 40, height: 16 };
    const WIDE_STEPS = 600;      // 받침 확대 10초
    const WIDE_WIDTH = 132;
    const SLOW_STEPS = 480;      // 공 감속 8초
    const SLOW_FACTOR = 0.7;
    const LASER_STEPS = 420;     // 광선 7초
    const LASER_INTERVAL = 24;
    const SHOT_SPEED = 10;       // 벽돌 높이보다 작아 광선이 벽돌을 뚫지 않는다

    function shuffle(list, rng) {
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }

    function buildBricks(rng) {
        const numbers = [];
        for (let n = 1; n <= NUMBER_COUNT; n++) numbers.push(n);
        shuffle(numbers, rng); // 어느 번호가 어느 구역에 갈지는 완전히 무작위

        const zoneCount = (COLS / ZONE_COLS) * (ROWS / ZONE_ROWS);
        const zones = [];
        for (let z = 0; z < zoneCount; z++) zones.push(z);
        const multiZones = new Set(shuffle(zones.slice(), rng).slice(0, MULTI_COUNT));

        const zoneContents = zones.map(zone => {
            const contents = [];
            for (let i = 0; i < NUMBERS_PER_ZONE; i++) {
                contents.push({ type: 'number', number: numbers.pop() });
            }
            if (multiZones.has(zone)) contents.push({ type: 'multi', number: null });
            while (contents.length < ZONE_COLS * ZONE_ROWS) contents.push({ type: 'dud', number: null });
            return shuffle(contents, rng);
        });

        const bricks = [];
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const zone = Math.floor(row / ZONE_ROWS) * (COLS / ZONE_COLS) + Math.floor(col / ZONE_COLS);
                bricks.push({
                    ...zoneContents[zone].pop(),
                    zone,
                    row,
                    x: BRICK_MARGIN + col * (BRICK_W + BRICK_GAP),
                    y: BRICK_TOP + row * (BRICK_H + BRICK_GAP),
                    width: BRICK_W,
                    height: BRICK_H,
                    broken: false,
                    hits: 1,
                    item: null
                });
            }
        }
        return bricks;
    }

    function newBall(x, y) {
        return { x, y, vx: 0, vy: 0, radius: ballRadius };
    }

    function createGame(options = {}) {
        const rng = options.rng || Math.random;

        const game = {
            W,
            H,
            state: 'ready',      // ready(공이 패들 위) → playing → done → (이어하기) → cleared
            continuing: false,   // 이어하기 중. 번호는 더 뽑지 않고 벽돌을 다 깨면 클리어
            paddle: { ...PADDLE, x: W / 2 },
            paddleTarget: null,
            balls: [],
            bricks: buildBricks(rng),
            picked: [],
            lastSet: null,       // 완성한 번호 6개 (한 판에 한 번만 정해진다)
            brokenCount: 0,
            lastHitStep: 0,      // 마지막으로 벽돌을 맞힌 시점. 같은 궤도만 도는 정체를 감지한다
            stepCount: 0,
            capsules: [],
            shots: [],
            effects: { wide: 0, slow: 0, laser: 0 }
        };

        game.numbers = () => game.picked.map(p => p.number);
        game.speed = () => {
            const base = Math.min(MAX_SPEED, START_SPEED + game.brokenCount * SPEED_PER_BRICK);
            return game.effects.slow > 0 ? base * SLOW_FACTOR : base;
        };

        game.canContinue = () => game.state === 'done' && !game.continuing;

        // 같은 판을 이어 간다. 남은 벽돌의 내용물은 그대로 두고 기믹만 입힌다.
        // 번호는 이미 정해졌으므로 이후로는 게임을 클리어하는 재미만 남는다
        game.continueGame = () => {
            if (!game.canContinue()) return false;
            game.continuing = true;
            game.capsules = [];
            game.shots = [];
            game.effects = { wide: 0, slow: 0, laser: 0 };
            assignGimmicks(game, rng);
            placeBallOnPaddle(game);
            return true;
        };

        // 패들 중심의 목표 위치 (드래그). null이면 해제
        game.setPaddleTarget = x => {
            game.paddleTarget = x;
        };

        game.movePaddle = direction => {
            game.paddleTarget = null;
            game.paddle.x += direction * PADDLE.speed;
        };

        game.launch = () => {
            if (game.state !== 'ready') return false;
            game.lastHitStep = game.stepCount;
            const ball = game.balls[0];
            const angle = (rng() - 0.5) * (Math.PI / 6);
            ball.vx = Math.sin(angle) * game.speed();
            ball.vy = -Math.cos(angle) * game.speed();
            game.state = 'playing';
            return true;
        };

        game.step = () => stepGame(game, rng);
        placeBallOnPaddle(game);
        return game;
    }

    function assignGimmicks(game, rng) {
        const plain = game.bricks.filter(b => !b.broken && b.hits === 1 && !b.item);
        shuffle(plain, rng);
        const remaining = game.bricks.filter(b => !b.broken).length;
        const hardCount = Math.round(remaining * HARD_SHARE);
        const itemCount = Math.round(remaining * ITEM_SHARE);
        plain.slice(0, hardCount).forEach(brick => {
            brick.hits = rng() < 0.7 ? 2 : 3;
        });
        plain.slice(hardCount, hardCount + itemCount).forEach((brick, i) => {
            brick.item = ITEMS[i % ITEMS.length];
        });
    }

    function placeBallOnPaddle(game) {
        game.balls = [newBall(game.paddle.x, PADDLE.y - ballRadius - 1)];
        game.state = 'ready';
    }

    // 속도를 현재 기준으로 맞추고, 너무 수평인 궤도를 바로잡는다
    function normalizeVelocity(ball, speed) {
        const current = Math.hypot(ball.vx, ball.vy) || 1;
        ball.vx *= speed / current;
        ball.vy *= speed / current;
        if (ball.aimed) return;
        const minVy = speed * MIN_VERTICAL;
        if (Math.abs(ball.vy) < minVy) {
            ball.vy = (ball.vy < 0 ? -1 : 1) * minVy;
            ball.vx = (ball.vx < 0 ? -1 : 1) * Math.sqrt(speed * speed - minVy * minVy);
        }
        const minVx = speed * MIN_HORIZONTAL;
        if (Math.abs(ball.vx) < minVx) {
            ball.vx = (ball.vx < 0 ? -1 : 1) * minVx;
            ball.vy = (ball.vy < 0 ? -1 : 1) * Math.sqrt(speed * speed - minVx * minVx);
        }
    }

    function updatePaddle(game) {
        const paddle = game.paddle;
        paddle.width = game.effects.wide > 0 ? WIDE_WIDTH : PADDLE.width;
        if (game.paddleTarget !== null) {
            const delta = game.paddleTarget - paddle.x;
            paddle.x += Math.max(-PADDLE.speed * 2, Math.min(PADDLE.speed * 2, delta));
        }
        const half = paddle.width / 2;
        paddle.x = Math.max(half, Math.min(W - half, paddle.x));
    }

    function collideWalls(ball, events) {
        const r = ball.radius;
        let hit = false;
        if (ball.x < r) {
            ball.x = r;
            ball.vx = Math.abs(ball.vx);
            hit = true;
        } else if (ball.x > W - r) {
            ball.x = W - r;
            ball.vx = -Math.abs(ball.vx);
            hit = true;
        }
        if (ball.y < CEILING + r) {
            ball.y = CEILING + r;
            ball.vy = Math.abs(ball.vy);
            hit = true;
        }
        if (hit) events.push({ type: 'wall' });
    }

    // 정체 중이면 남은 벽돌 하나를 향해 곧장 튕긴다. 길을 막는 벽돌이 있으면 그 벽돌이 맞는다
    function aimAtRemainingBrick(game, ball, rng, speed) {
        const alive = game.bricks.filter(b => !b.broken);
        if (alive.length === 0) return;
        const brick = alive[Math.floor(rng() * alive.length)];
        const dx = brick.x + brick.width / 2 - ball.x;
        const dy = brick.y + brick.height / 2 - ball.y;
        const distance = Math.hypot(dx, dy) || 1;
        ball.vx = (dx / distance) * speed;
        ball.vy = (dy / distance) * speed;
        ball.aimed = true; // 궤도 보정이 방향을 틀면 벽돌을 비껴가므로 맞힐 때까지 보정하지 않는다
    }

    function collidePaddle(game, ball, rng, events) {
        const paddle = game.paddle;
        const halfWidth = paddle.width / 2 + ball.radius;
        const offset = ball.x - paddle.x;
        const touching = ball.vy > 0
            && ball.y + ball.radius >= paddle.y
            && ball.y - ball.radius <= paddle.y + paddle.height
            && Math.abs(offset) <= halfWidth;
        if (!touching) return;

        // 맞은 위치에 따라 튕기는 각도가 달라진다
        const angle = (offset / halfWidth) * MAX_BOUNCE_ANGLE;
        const speed = game.speed();
        ball.vx = Math.sin(angle) * speed;
        ball.vy = -Math.cos(angle) * speed;
        ball.y = paddle.y - ball.radius;
        if (game.stepCount - game.lastHitStep > STALL_STEPS) aimAtRemainingBrick(game, ball, rng, speed);
        events.push({ type: 'paddle' });
    }

    // 공과 가장 깊게 겹친 벽돌 하나를 깬다
    function collideBricks(game, ball, events) {
        let best = null;
        let bestDistance = ball.radius;
        for (const brick of game.bricks) {
            if (brick.broken) continue;
            const px = Math.max(brick.x, Math.min(brick.x + brick.width, ball.x));
            const py = Math.max(brick.y, Math.min(brick.y + brick.height, ball.y));
            const distance = Math.hypot(ball.x - px, ball.y - py);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = { brick, px, py, distance };
            }
        }
        if (!best) return;

        const { brick, px, py, distance } = best;
        ball.aimed = false;
        // 중심이 벽돌 안으로 들어갔으면 가까운 위아래 면으로 내보낸다
        let nx = 0;
        let ny = ball.y < brick.y + brick.height / 2 ? -1 : 1;
        if (distance > 0) {
            nx = (ball.x - px) / distance;
            ny = (ball.y - py) / distance;
        }
        ball.x = px + nx * ball.radius;
        ball.y = py + ny * ball.radius;
        const normal = ball.vx * nx + ball.vy * ny;
        if (normal < 0) {
            ball.vx -= 2 * normal * nx;
            ball.vy -= 2 * normal * ny;
        }
        damageBrick(game, brick, ball, events);
    }

    // 단단한 벽돌은 여러 번 맞아야 깨진다. source는 공이나 광선
    function damageBrick(game, brick, source, events) {
        game.lastHitStep = game.stepCount;
        brick.hits--;
        if (brick.hits > 0) events.push({ type: 'hardHit', brick });
        else breakBrick(game, brick, source, events);
    }

    function breakBrick(game, brick, ball, events) {
        brick.broken = true;
        brick.brokenStep = game.stepCount;
        game.brokenCount++;
        events.push({ type: 'brick', brick });

        if (brick.item) {
            game.capsules.push({
                item: brick.item,
                x: brick.x + brick.width / 2,
                y: brick.y + brick.height / 2,
                ...ITEM_SIZE
            });
        }

        if (brick.type === 'multi') {
            const speed = game.speed();
            for (let i = 0; i < EXTRA_BALLS && game.balls.length < MAX_BALLS; i++) {
                const extra = newBall(ball.x, ball.y);
                const angle = (i === 0 ? -1 : 1) * (Math.PI / 5);
                extra.vx = Math.sin(angle) * speed;
                extra.vy = Math.cos(angle) * speed;
                game.balls.push(extra);
            }
            events.push({ type: 'multi', brick });
        } else if (brick.type === 'dud') {
            events.push({ type: 'dud', brick });
        } else if (!game.continuing && game.picked.length < PICK_COUNT) {
            game.picked.push({
                number: brick.number,
                x: brick.x + brick.width / 2,
                y: brick.y + brick.height / 2,
                step: game.stepCount
            });
            events.push({ type: 'pick', number: brick.number, brick });
            if (game.picked.length === PICK_COUNT) {
                game.state = 'done';
                game.lastSet = game.numbers().sort((a, b) => a - b);
                events.push({ type: 'complete', numbers: game.numbers() });
            }
        }

        if (game.continuing && game.bricks.every(b => b.broken)) {
            game.state = 'cleared';
            events.push({ type: 'clear' });
        }
    }

    function applyItem(game, item, rng) {
        if (item === 'wide') game.effects.wide = WIDE_STEPS;
        else if (item === 'slow') game.effects.slow = SLOW_STEPS;
        else if (item === 'laser') game.effects.laser = LASER_STEPS;
        else {
            // 공 분열: 공마다 하나씩 늘린다
            const speed = game.speed();
            for (const ball of game.balls.slice()) {
                if (game.balls.length >= MAX_BALLS) break;
                const extra = newBall(ball.x, ball.y);
                const angle = (rng() - 0.5) * (Math.PI / 2);
                extra.vx = Math.sin(angle) * speed;
                extra.vy = -Math.cos(angle) * speed;
                game.balls.push(extra);
            }
        }
    }

    function updateCapsules(game, rng, events) {
        const paddle = game.paddle;
        game.capsules = game.capsules.filter(capsule => {
            capsule.y += ITEM_FALL_SPEED;
            const caught = capsule.y + capsule.height / 2 >= paddle.y
                && capsule.y - capsule.height / 2 <= paddle.y + paddle.height
                && Math.abs(capsule.x - paddle.x) <= paddle.width / 2 + capsule.width / 2;
            if (caught) {
                applyItem(game, capsule.item, rng);
                events.push({ type: 'item', item: capsule.item });
                return false;
            }
            return capsule.y < H + capsule.height;
        });
    }

    function updateLaser(game, events) {
        const { paddle, effects } = game;
        if (effects.laser > 0 && effects.laser % LASER_INTERVAL === 0) {
            const half = paddle.width / 2 - 6;
            game.shots.push({ x: paddle.x - half, y: paddle.y }, { x: paddle.x + half, y: paddle.y });
            events.push({ type: 'shot' });
        }
        game.shots = game.shots.filter(shot => {
            shot.y -= SHOT_SPEED;
            if (shot.y < CEILING) return false;
            const brick = game.bricks.find(b => !b.broken
                && shot.x >= b.x && shot.x <= b.x + b.width
                && shot.y >= b.y && shot.y <= b.y + b.height);
            if (!brick || game.state !== 'playing') return true;
            damageBrick(game, brick, shot, events);
            return false;
        });
    }

    function updateEffects(game) {
        for (const key of Object.keys(game.effects)) {
            if (game.effects[key] > 0) game.effects[key]--;
        }
    }

    function stepGame(game, rng) {
        const events = [];
        game.stepCount++;
        updatePaddle(game);

        if (game.state === 'ready') {
            const ball = game.balls[0];
            ball.x = game.paddle.x;
            ball.y = PADDLE.y - ballRadius - 1;
            return events;
        }
        if (game.state !== 'playing') return events;

        updateEffects(game);
        updateCapsules(game, rng, events);
        updateLaser(game, events);
        if (game.state !== 'playing') return events;

        const speed = game.speed();
        for (const ball of game.balls) {
            ball.x += ball.vx;
            ball.y += ball.vy;
            collideWalls(ball, events);
            collidePaddle(game, ball, rng, events);
            collideBricks(game, ball, events);
            if (game.state !== 'playing') return events;
        }

        for (let i = 0; i < game.balls.length; i++) {
            for (let j = i + 1; j < game.balls.length; j++) {
                collideBalls(game.balls[i], game.balls[j]);
            }
        }
        for (const ball of game.balls) {
            normalizeVelocity(ball, speed);
            collideWalls(ball, events);
        }

        // 놓친 공 처리. 번호는 그대로 두고 다시 발사한다
        game.balls = game.balls.filter(ball => ball.y - ball.radius <= H);
        if (game.balls.length === 0) {
            events.push({ type: 'miss' });
            game.capsules = [];
            game.shots = [];
            placeBallOnPaddle(game);
        }
        return events;
    }

    const api = { createGame, W, H, NUMBER_COUNT, DUD_COUNT, MULTI_COUNT, PICK_COUNT, COLS, ROWS };
    if (typeof module !== 'undefined') module.exports = api;
    else root.LottoBricks = api;
})(typeof window !== 'undefined' ? window : globalThis);
