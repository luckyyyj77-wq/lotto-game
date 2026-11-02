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
    const EXTRA_BALLS = 2;
    const MAX_BALLS = 6;

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
                    broken: false
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
            state: 'ready',      // ready(공이 패들 위) → playing → done
            paddle: { ...PADDLE, x: W / 2 },
            paddleTarget: null,
            balls: [],
            bricks: buildBricks(rng),
            picked: [],
            brokenCount: 0,
            stepCount: 0
        };

        game.numbers = () => game.picked.map(p => p.number);
        game.speed = () => Math.min(MAX_SPEED, START_SPEED + game.brokenCount * SPEED_PER_BRICK);

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

    function placeBallOnPaddle(game) {
        game.balls = [newBall(game.paddle.x, PADDLE.y - ballRadius - 1)];
        game.state = 'ready';
    }

    // 속도를 현재 기준으로 맞추고, 너무 수평인 궤도를 바로잡는다
    function normalizeVelocity(ball, speed) {
        const current = Math.hypot(ball.vx, ball.vy) || 1;
        ball.vx *= speed / current;
        ball.vy *= speed / current;
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

    function collidePaddle(game, ball, events) {
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
        breakBrick(game, brick, ball, events);
    }

    function breakBrick(game, brick, ball, events) {
        brick.broken = true;
        brick.brokenStep = game.stepCount;
        game.brokenCount++;
        events.push({ type: 'brick', brick });

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
        } else if (game.picked.length < PICK_COUNT) {
            game.picked.push({
                number: brick.number,
                x: brick.x + brick.width / 2,
                y: brick.y + brick.height / 2,
                step: game.stepCount
            });
            events.push({ type: 'pick', number: brick.number, brick });
            if (game.picked.length === PICK_COUNT) {
                game.state = 'done';
                events.push({ type: 'complete', numbers: game.numbers() });
            }
        }
    }

    function stepGame(game) {
        const events = [];
        game.stepCount++;
        updatePaddle(game);

        if (game.state === 'ready') {
            const ball = game.balls[0];
            ball.x = game.paddle.x;
            ball.y = PADDLE.y - ballRadius - 1;
            return events;
        }
        if (game.state === 'done') return events;

        const speed = game.speed();
        for (const ball of game.balls) {
            ball.x += ball.vx;
            ball.y += ball.vy;
            collideWalls(ball, events);
            collidePaddle(game, ball, events);
            collideBricks(game, ball, events);
            if (game.state === 'done') return events;
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
            placeBallOnPaddle(game);
        }
        return events;
    }

    const api = { createGame, W, H, NUMBER_COUNT, DUD_COUNT, MULTI_COUNT, PICK_COUNT, COLS, ROWS };
    if (typeof module !== 'undefined') module.exports = api;
    else root.LottoBricks = api;
})(typeof window !== 'undefined' ? window : globalThis);
