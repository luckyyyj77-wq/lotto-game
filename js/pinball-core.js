// 바구니 핀볼 시뮬레이션 — 화면과 무관한 순수 로직 (Node에서 대량 검증 가능)
//
// 공정성: 물리 계산은 번호를 보지 않는다. 공의 시작 위치와 처리 순서를 무작위로 섞으므로
// 어느 번호든 먼저 내려올 확률이 같다. 구조물 배치를 바꿔도 이 성질은 유지되니,
// 번호에 따라 물리를 달리하는 코드를 넣지 말 것.
(function (root) {
    const physics = typeof module !== 'undefined' ? require('./physics.js') : root.LottoPhysics;
    const { gravity, bounce, ballRadius, collideBalls } = physics;

    const W = 400;
    const H = 600;
    const CX = W / 2;
    const NUMBER_COUNT = 45;
    const DUMMY_COUNT = 20;
    const PICK_COUNT = 6;

    const MAX_SPEED = 12;       // 공이 구조물을 뚫지 않는 속도 (구조물 + 공 지름보다 작게)
    const SOLVER_PASSES = 4;    // 바구니에 쌓인 공이 서로 파묻히지 않도록 여러 번 푼다
    const WALL_FRICTION = 0.995;

    // 바구니 (basket): 볼록 다각형 안에 공을 가둔다
    const BASKET = {
        left: 30,
        right: 370,
        top: 8,
        shoulderY: 105,  // 세로 벽이 끝나고 깔때기가 시작되는 높이
        neckY: 170,      // 출구 높이
        // 경사면 때문에 공 중심이 지날 수 있는 폭은 이보다 약 48 좁다.
        // 그 폭이 공 지름(20)보다 충분히 넓어야 두 공이 나란히 끼지 않는다
        neckWidth: 88
    };
    const SHAKE_LIMIT_X = 28;
    const SHAKE_LIMIT_Y = 12;
    const SHAKE_SPEED = 9;
    const SHAKE_GOAL = 900;     // 바구니 누적 이동 거리. 쉬지 않고 흔들면 약 3초

    const EXIT_Y = 552;
    const EXIT_HALF_WIDTH = 32;

    const STILL_SPEED = 0.35;
    const STILL_STEPS = 60;     // 이만큼 멈춰 있으면 살짝 튕겨 준다
    const GATE_CYCLE = 90;      // 문은 1.5초마다
    const GATE_OPEN_STEPS = 8;  // 이만큼만 열려 공이 몇 개씩 내려간다
    const JAM_STEPS = 240;      // 이만큼 출구로 아무것도 안 나오면 출구 근처 공을 흔든다

    function shuffle(list, rng) {
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }

    function segment(x1, y1, x2, y2, thickness = 3) {
        return { x1, y1, x2, y2, thickness };
    }

    function mirrored(x1, y1, x2, y2) {
        return [segment(x1, y1, x2, y2), segment(W - x1, y1, W - x2, y2)];
    }

    function buildCourse() {
        const pegs = [];
        const addRow = (y, startX) => {
            for (let x = startX; x <= W - startX; x += 40) pegs.push({ x, y, radius: 4 });
        };
        addRow(205, 40);
        addRow(240, 60);
        addRow(275, 40);
        addRow(372, 60);
        addRow(407, 40);

        const bumpers = [
            { x: 90, y: 326, radius: 17, flash: 0 },
            { x: 310, y: 326, radius: 17, flash: 0 },
            { x: CX, y: 452, radius: 15, flash: 0 }
        ];

        const spinners = [
            { x: CX, y: 326, length: 40, angle: 0, speed: 0.05 },
            { x: 105, y: 456, length: 28, angle: Math.PI / 4, speed: 0.06 },
            { x: W - 105, y: 456, length: 28, angle: -Math.PI / 4, speed: -0.06 }
        ];

        const { left, right, shoulderY, neckY, neckWidth } = BASKET;
        const segments = [
            // 바구니 바깥면 — 튀어 오른 공이 바구니 옆으로 넘어가지 못하게 막는다
            segment(0, shoulderY, left, shoulderY),
            segment(W, shoulderY, right, shoulderY),
            ...mirrored(left, shoulderY, CX - neckWidth / 2, neckY),
            // 벽에서 안쪽으로 밀어 주는 경사 막대
            ...mirrored(0, 296, 42, 318),
            ...mirrored(0, 345, 34, 365),
            // 출구 깔때기
            ...mirrored(0, 462, CX - EXIT_HALF_WIDTH, 545)
        ];

        return { pegs, bumpers, spinners, segments };
    }

    // 번호와 더미를 뒤섞어 바구니 위쪽에 배치한다. 배열 순서도 번호와 무관해진다.
    function buildBalls(rng) {
        const labels = [];
        for (let n = 1; n <= NUMBER_COUNT; n++) labels.push(n);
        for (let i = 0; i < DUMMY_COUNT; i++) labels.push(null);
        shuffle(labels, rng);

        const balls = [];
        const spacing = ballRadius * 2 + 1;
        const cols = Math.floor((BASKET.right - BASKET.left - ballRadius * 2) / spacing);
        labels.forEach((number, i) => {
            const row = Math.floor(i / cols);
            balls.push({
                x: BASKET.left + ballRadius + 2 + (i % cols) * spacing + (row % 2) * 4,
                y: BASKET.top + ballRadius + 2 + row * spacing,
                vx: (rng() - 0.5) * 2,
                vy: 0,
                radius: ballRadius,
                number,
                inBasket: true,
                still: 0
            });
        });
        return balls;
    }

    function createGame(options = {}) {
        const rng = options.rng || Math.random;
        const course = buildCourse();

        const game = {
            W,
            H,
            basket: BASKET,
            course,
            state: 'ready',      // ready → centering → falling → done
            balls: buildBalls(rng),
            picked: [],
            exitedCount: 0,
            shakeDistance: 0,
            offsetX: 0,
            offsetY: 0,
            targetX: 0,
            targetY: 0,
            gateOpen: false,
            stepCount: 0,
            lastExitStep: 0,
            fallStartStep: 0
        };

        game.shakeProgress = () => Math.min(1, game.shakeDistance / SHAKE_GOAL);
        game.canRelease = () => game.state === 'ready' && game.shakeProgress() >= 1;
        game.numbers = () => game.picked.map(p => p.number);

        // 바구니를 흔들 목표 위치 (중심 기준 변위, 범위를 넘으면 잘림)
        game.setShakeTarget = (x, y) => {
            if (game.state !== 'ready') return;
            game.targetX = Math.max(-SHAKE_LIMIT_X, Math.min(SHAKE_LIMIT_X, x));
            game.targetY = Math.max(-SHAKE_LIMIT_Y, Math.min(SHAKE_LIMIT_Y, y));
        };

        game.release = () => {
            if (!game.canRelease()) return false;
            game.state = 'centering';
            game.targetX = 0;
            game.targetY = 0;
            return true;
        };

        game.step = () => stepGame(game, rng);
        return game;
    }

    // 면에 부딪힌 공을 밀어내고 반사한다. (nx, ny)는 공 쪽을 향하는 단위 법선
    function hitSurface(ball, nx, ny, depth, surfaceVx = 0, surfaceVy = 0) {
        ball.x += nx * depth;
        ball.y += ny * depth;
        const rvx = ball.vx - surfaceVx;
        const rvy = ball.vy - surfaceVy;
        const normal = rvx * nx + rvy * ny;
        if (normal >= 0) return 0;
        ball.vx -= (1 + bounce) * normal * nx;
        ball.vy -= (1 + bounce) * normal * ny;
        ball.vx *= WALL_FRICTION;
        ball.vy *= WALL_FRICTION;
        return -normal;
    }

    // 바구니 안쪽 면. 항상 안쪽으로 밀어내므로 빠르게 흔들어도 공이 벽을 뚫지 않는다
    function containInBasket(game, ball, wallVx, wallVy) {
        const { left, right, top, shoulderY, neckY, neckWidth } = BASKET;
        const ox = game.offsetX;
        const oy = game.offsetY;
        const r = ball.radius;

        if (ball.y - r < top + oy) hitSurface(ball, 0, 1, top + oy - (ball.y - r), wallVx, wallVy);
        if (ball.x - r < left + ox) hitSurface(ball, 1, 0, left + ox - (ball.x - r), wallVx, wallVy);
        if (ball.x + r > right + ox) hitSurface(ball, -1, 0, ball.x + r - (right + ox), wallVx, wallVy);

        // 깔때기 양쪽 경사면
        const dx = CX - neckWidth / 2 - left;
        const dy = neckY - shoulderY;
        const len = Math.hypot(dx, dy);
        const nx = dy / len;
        const ny = -dx / len;
        const leftDist = (ball.x - (left + ox)) * nx + (ball.y - (shoulderY + oy)) * ny;
        if (leftDist < r) hitSurface(ball, nx, ny, r - leftDist, wallVx, wallVy);
        const rightDist = (right + ox - ball.x) * nx + (ball.y - (shoulderY + oy)) * ny;
        if (rightDist < r) hitSurface(ball, -nx, ny, r - rightDist, wallVx, wallVy);

        if (!game.gateOpen && ball.y + r > neckY + oy) {
            hitSurface(ball, 0, -1, ball.y + r - (neckY + oy), wallVx, wallVy);
        }
    }

    function collideCircle(ball, circle) {
        const dx = ball.x - circle.x;
        const dy = ball.y - circle.y;
        const dist = Math.hypot(dx, dy);
        const minDist = ball.radius + circle.radius;
        if (dist >= minDist || dist === 0) return 0;
        return hitSurface(ball, dx / dist, dy / dist, minDist - dist);
    }

    function collideSegment(ball, seg, surfaceSpin = null) {
        const ex = seg.x2 - seg.x1;
        const ey = seg.y2 - seg.y1;
        const t = Math.max(0, Math.min(1,
            ((ball.x - seg.x1) * ex + (ball.y - seg.y1) * ey) / (ex * ex + ey * ey)));
        const px = seg.x1 + ex * t;
        const py = seg.y1 + ey * t;
        const dx = ball.x - px;
        const dy = ball.y - py;
        const dist = Math.hypot(dx, dy);
        const minDist = ball.radius + seg.thickness;
        if (dist >= minDist || dist === 0) return 0;

        let surfaceVx = 0;
        let surfaceVy = 0;
        if (surfaceSpin) {
            surfaceVx = -(py - surfaceSpin.y) * surfaceSpin.speed;
            surfaceVy = (px - surfaceSpin.x) * surfaceSpin.speed;
        }
        return hitSurface(ball, dx / dist, dy / dist, minDist - dist, surfaceVx, surfaceVy);
    }

    function spinnerSegment(spinner) {
        const cos = Math.cos(spinner.angle) * spinner.length;
        const sin = Math.sin(spinner.angle) * spinner.length;
        return segment(spinner.x - cos, spinner.y - sin, spinner.x + cos, spinner.y + sin, 4);
    }

    function collideCourse(game, ball, events) {
        const r = ball.radius;
        if (ball.x < r) hitSurface(ball, 1, 0, r - ball.x);
        if (ball.x > W - r) hitSurface(ball, -1, 0, ball.x - (W - r));
        if (ball.y < r) hitSurface(ball, 0, 1, r - ball.y);

        for (const peg of game.course.pegs) {
            if (collideCircle(ball, peg) > 1.5) events.push({ type: 'peg' });
        }
        for (const seg of game.course.segments) collideSegment(ball, seg);
        for (const spinner of game.course.spinners) {
            collideSegment(ball, spinnerSegment(spinner), spinner);
        }
        for (const bumper of game.course.bumpers) {
            if (collideCircle(ball, bumper) > 0) {
                // 범퍼는 공을 튕겨 낸다
                const dx = ball.x - bumper.x;
                const dy = ball.y - bumper.y;
                const dist = Math.hypot(dx, dy) || 1;
                ball.vx += (dx / dist) * 3;
                ball.vy += (dy / dist) * 3;
                bumper.flash = 10;
                events.push({ type: 'bumper' });
            }
        }
    }

    function moveBasket(game) {
        const ease = (value, target) =>
            value + Math.max(-SHAKE_SPEED, Math.min(SHAKE_SPEED, target - value));
        const nextX = ease(game.offsetX, game.targetX);
        const nextY = ease(game.offsetY, game.targetY);
        const wallVx = nextX - game.offsetX;
        const wallVy = nextY - game.offsetY;
        game.offsetX = nextX;
        game.offsetY = nextY;
        if (game.state === 'ready') game.shakeDistance += Math.abs(wallVx) + Math.abs(wallVy);
        return { wallVx, wallVy };
    }

    function clampSpeed(ball) {
        const speed = Math.hypot(ball.vx, ball.vy);
        if (speed > MAX_SPEED) {
            ball.vx *= MAX_SPEED / speed;
            ball.vy *= MAX_SPEED / speed;
        }
    }

    // 구조물 위에 얹혀 멈춘 공과 출구 막힘을 풀어 준다
    function unjam(game, rng) {
        for (const ball of game.balls) {
            if (ball.inBasket) continue;
            if (Math.hypot(ball.vx, ball.vy) < STILL_SPEED) ball.still++;
            else ball.still = 0;
            if (ball.still > STILL_STEPS) {
                ball.vx = (rng() < 0.5 ? -1 : 1) * (1 + rng() * 2);
                ball.vy = -1 - rng() * 2;
                ball.still = 0;
            }
        }

        if (game.state === 'falling' && game.stepCount - game.lastExitStep > JAM_STEPS) {
            for (const ball of game.balls) {
                if (ball.inBasket && ball.y > BASKET.shoulderY - 30) {
                    ball.vx += (rng() - 0.5) * 6;
                    ball.vy -= rng() * 4;
                }
            }
            game.lastExitStep = game.stepCount;
        }
    }

    function stepGame(game, rng) {
        const events = [];
        game.stepCount++;

        const { wallVx, wallVy } = moveBasket(game);

        if (game.state === 'centering' && game.offsetX === 0 && game.offsetY === 0) {
            game.state = 'falling';
            game.fallStartStep = game.stepCount;
            game.lastExitStep = game.stepCount;
            events.push({ type: 'release' });
        }
        if (game.state === 'falling') {
            game.gateOpen = (game.stepCount - game.fallStartStep) % GATE_CYCLE < GATE_OPEN_STEPS;
        }

        for (const spinner of game.course.spinners) spinner.angle += spinner.speed;
        for (const bumper of game.course.bumpers) if (bumper.flash > 0) bumper.flash--;

        for (const ball of game.balls) {
            ball.vy += gravity;
            clampSpeed(ball);
            ball.x += ball.vx;
            ball.y += ball.vy;
        }

        for (let pass = 0; pass < SOLVER_PASSES; pass++) {
            const balls = game.balls;
            for (let i = 0; i < balls.length; i++) {
                for (let j = i + 1; j < balls.length; j++) {
                    collideBalls(balls[i], balls[j], bounce);
                }
            }
            for (const ball of balls) {
                if (ball.inBasket) containInBasket(game, ball, wallVx, wallVy);
                else collideCourse(game, ball, pass === 0 ? events : []);
            }
        }

        // 바구니 경계 통과 및 출구 판정
        for (let i = game.balls.length - 1; i >= 0; i--) {
            const ball = game.balls[i];
            const insideNeck = Math.abs(ball.x - CX) < BASKET.neckWidth / 2;

            if (ball.inBasket && game.gateOpen && ball.y > BASKET.neckY) {
                ball.inBasket = false;
            } else if (!ball.inBasket && ball.y < BASKET.neckY - ball.radius && insideNeck) {
                ball.inBasket = true; // 튀어 올라 바구니로 되돌아온 공
            }

            if (ball.y > EXIT_Y) {
                game.balls.splice(i, 1);
                game.exitedCount++;
                game.lastExitStep = game.stepCount;
                events.push(...recordExit(game, ball));
            }
        }

        unjam(game, rng);
        return events;
    }

    function recordExit(game, ball) {
        if (ball.number === null) return [{ type: 'dummy', x: ball.x, y: ball.y }];
        if (game.picked.length >= PICK_COUNT) return [];

        game.picked.push({ number: ball.number, x: ball.x, y: ball.y, step: game.stepCount });
        const events = [{ type: 'pick', number: ball.number }];
        if (game.picked.length === PICK_COUNT) {
            game.state = 'done';
            game.gateOpen = false;
            events.push({ type: 'complete', numbers: game.numbers() });
        }
        return events;
    }

    const api = { createGame, W, H, NUMBER_COUNT, DUMMY_COUNT, PICK_COUNT, spinnerSegment };
    if (typeof module !== 'undefined') module.exports = api;
    else root.LottoPinball = api;
})(typeof window !== 'undefined' ? window : globalThis);
