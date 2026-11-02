// 드럼 핀볼 시뮬레이션 — 화면과 무관한 순수 로직 (Node에서 대량 검증 가능)
//
// 공정성: 물리 계산은 번호를 보지 않는다. 공의 시작 위치와 처리 순서를 무작위로 섞으므로
// 어느 번호든 먼저 내려올 확률이 같다. 코스를 바꿔도 이 성질은 유지되니,
// 번호에 따라 물리를 달리하는 코드를 넣지 말 것.
(function (root) {
    const physics = typeof module !== 'undefined' ? require('./physics.js') : root.LottoPhysics;
    const { gravity, bounce, ballRadius, collideBalls } = physics;

    const W = 520;
    const H = 2520;
    const CX = W / 2;
    const NUMBER_COUNT = 45;
    const DUMMY_COUNT = 20;
    const PICK_COUNT = 6;

    const MAX_SPEED = 12;       // 공이 구조물을 뚫지 않는 속도 (구조물 + 공 지름보다 작게)
    const SOLVER_PASSES = 4;    // 쌓인 공이 서로 파묻히지 않도록 여러 번 푼다
    const WALL_FRICTION = 0.995;

    // 드럼: 중심축에 고정된 원통. 안쪽 날개가 함께 돌며 공을 뒤섞는다
    const DRUM = {
        x: CX,
        y: 190,
        radius: 150,
        hubRadius: 14,
        finCount: 4,
        finInner: 62       // 날개 안쪽 끝의 중심 거리
    };
    const MAX_SPIN = 0.07;       // 테두리 속도가 공 속도 상한을 넘지 않는 회전 속도 (rad/스텝)
    const SPIN_DECAY = 0.985;    // 손을 떼면 관성으로 돌다가 잦아든다
    const SPIN_GOAL = Math.PI * 4; // 누적 회전량. 두 바퀴 돌리면 내려보낼 수 있다
    const DOOR_MAX_ANGLE = Math.PI * 0.31; // 열렸을 때 바닥에서 좌우로 벌어지는 각도
    const DOOR_OPEN_SPEED = 0.05;
    const IDLE_SPIN = 0.025;     // 쏟아지는 동안 남은 공을 밀어 주는 회전

    const GOAL = { x: CX, y: 2480, halfWidth: 32 };

    // 수문: 쏟아진 공을 모았다가 몇 개씩 무리 지어 내보낸다.
    // 이 덕분에 결승선 도착이 한꺼번에 몰리지 않고 앞 무리, 다음 무리로 나뉜다
    const GATE = { y: 1800, halfWidth: 60, top: 1690 };
    const GATE_HOLD_FIRST = 150; // 첫 공이 도착한 뒤 처음 열릴 때까지
    const GATE_CLOSED_STEPS = 210;
    const GATE_OPEN_STEPS = 8;

    const STILL_SPEED = 0.35;
    const STILL_STEPS = 60;      // 이만큼 멈춰 있으면 살짝 튕겨 준다
    const BUCKET_SIZE = 64;
    const BUCKET_MARGIN = ballRadius + 8;

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
        const bumpers = [];
        const spinners = [];
        const segments = [];
        const peg = (x, y) => pegs.push({ x, y, radius: 4 });
        const bumper = (x, y, radius = 22) => bumpers.push({ x, y, radius, flash: 0 });
        const spinner = (x, y, length, speed) => spinners.push({ x, y, length, speed, angle: 0 });

        // 1구간: 드럼 아래 깔때기와 넓은 핀 밭
        segments.push(...mirrored(0, 300, 190, 420));
        for (let row = 0; row < 9; row++) {
            const y = 470 + row * 40;
            const start = row % 2 ? 62 : 40;
            for (let x = start; x <= W - start; x += 44) peg(x, y);
        }
        segments.push(...mirrored(0, 560, 28, 578), ...mirrored(0, 680, 28, 698));

        // 2구간: 좌우로 번갈아 내려가는 경사로
        segments.push(segment(0, 830, 400, 900));
        segments.push(segment(W, 950, 120, 1020));
        segments.push(segment(0, 1070, 400, 1140));
        segments.push(segment(W, 1190, 120, 1260));

        // 3구간: 범퍼와 회전 막대
        bumper(110, 1350);
        bumper(CX, 1400);
        bumper(410, 1350);
        bumper(110, 1510);
        bumper(410, 1510);
        bumper(CX, 1570);
        spinner(185, 1465, 50, 0.05);
        spinner(335, 1465, 50, -0.05);
        spinner(110, 1640, 42, -0.06);
        spinner(410, 1640, 42, 0.06);

        // 4구간: 수문 저수지, 그 아래 좁은 통로의 촘촘한 핀
        segments.push(...mirrored(0, GATE.top + 10, CX - GATE.halfWidth, GATE.y));
        segments.push(...mirrored(150, GATE.y, CX - GATE.halfWidth, GATE.y));
        segments.push(...mirrored(150, GATE.y, 150, 2130));
        for (let row = 0; row < 8; row++) {
            const y = 1840 + row * 38;
            const xs = row % 2 ? [216, 260, 304] : [194, 238, 282, 326];
            xs.forEach(x => peg(x, y));
        }

        // 5구간: 넓어졌다가 결승선으로 모인다
        segments.push(...mirrored(150, 2130, 60, 2230));
        segments.push(...mirrored(60, 2230, 60, 2340));
        segments.push(...mirrored(60, 2340, CX - GOAL.halfWidth, GOAL.y - 10));
        bumper(CX, 2260, 20);
        spinner(165, 2300, 50, 0.06);
        spinner(355, 2300, 50, -0.06);

        return { pegs, bumpers, spinners, segments, buckets: buildBuckets(pegs, bumpers, segments) };
    }

    // 고정 구조물을 높이별로 묶어 공 근처의 것만 검사한다
    function buildBuckets(pegs, bumpers, segments) {
        const count = Math.ceil(H / BUCKET_SIZE) + 1;
        const buckets = Array.from({ length: count }, () => ({ pegs: [], bumpers: [], segments: [] }));
        const insert = (kind, item, top, bottom) => {
            const first = Math.max(0, Math.floor((top - BUCKET_MARGIN) / BUCKET_SIZE));
            const last = Math.min(count - 1, Math.floor((bottom + BUCKET_MARGIN) / BUCKET_SIZE));
            for (let i = first; i <= last; i++) buckets[i][kind].push(item);
        };
        pegs.forEach(p => insert('pegs', p, p.y - p.radius, p.y + p.radius));
        bumpers.forEach(b => insert('bumpers', b, b.y - b.radius, b.y + b.radius));
        segments.forEach(s =>
            insert('segments', s, Math.min(s.y1, s.y2) - s.thickness, Math.max(s.y1, s.y2) + s.thickness));
        return buckets;
    }

    // 번호와 더미를 뒤섞어 드럼 안에 배치한다. 배열 순서도 번호와 무관해진다.
    function buildBalls(rng) {
        const labels = [];
        for (let n = 1; n <= NUMBER_COUNT; n++) labels.push(n);
        for (let i = 0; i < DUMMY_COUNT; i++) labels.push(null);
        shuffle(labels, rng);

        const spots = [];
        const spacing = ballRadius * 2 + 2;
        const reach = DRUM.radius - ballRadius - 3;
        for (let y = -reach; y <= reach; y += spacing) {
            for (let x = -reach; x <= reach; x += spacing) {
                const dist = Math.hypot(x, y);
                if (dist <= reach && dist > DRUM.hubRadius + ballRadius + 2) {
                    spots.push({ x: DRUM.x + x, y: DRUM.y + y });
                }
            }
        }
        // 아래쪽부터 채운다
        spots.sort((a, b) => b.y - a.y);

        return labels.map((number, i) => ({
            x: spots[i].x,
            y: spots[i].y,
            vx: (rng() - 0.5) * 2,
            vy: 0,
            radius: ballRadius,
            number,
            inDrum: true,
            still: 0
        }));
    }

    function createGame(options = {}) {
        const rng = options.rng || Math.random;

        const game = {
            W,
            H,
            drum: DRUM,
            goal: GOAL,
            gate: GATE,
            gateOpen: false,
            gateTimer: null,     // 첫 공이 저수지에 도착하면 시작
            course: buildCourse(),
            state: 'ready',      // ready → falling → done
            balls: buildBalls(rng),
            picked: [],
            exitedCount: 0,
            drumAngle: 0,
            drumSpin: 0,
            spinInput: 0,
            spinTotal: 0,
            doorAngle: 0,
            stepCount: 0,
            fins: []
        };

        game.spinProgress = () => Math.min(1, game.spinTotal / SPIN_GOAL);
        game.canRelease = () => game.state === 'ready' && game.spinProgress() >= 1;
        game.numbers = () => game.picked.map(p => p.number);

        // 드럼을 돌린다 (radian). 입력은 다음 스텝에 회전 속도로 반영된다
        game.spinBy = delta => {
            if (game.state === 'ready') game.spinInput += delta;
        };

        game.release = () => {
            if (!game.canRelease()) return false;
            game.state = 'falling';
            return true;
        };

        game.step = () => stepGame(game, rng);
        updateFins(game);
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

    function collideCircle(ball, circle) {
        const dx = ball.x - circle.x;
        const dy = ball.y - circle.y;
        const minDist = ball.radius + circle.radius;
        if (Math.abs(dx) >= minDist || Math.abs(dy) >= minDist) return 0;
        const dist = Math.hypot(dx, dy);
        if (dist >= minDist || dist === 0) return 0;
        return hitSurface(ball, dx / dist, dy / dist, minDist - dist);
    }

    function collideSegment(ball, seg, center = null, spin = 0) {
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

        const surfaceVx = center ? -(py - center.y) * spin : 0;
        const surfaceVy = center ? (px - center.x) * spin : 0;
        return hitSurface(ball, dx / dist, dy / dist, minDist - dist, surfaceVx, surfaceVy);
    }

    function spinnerSegment(spinner) {
        const cos = Math.cos(spinner.angle) * spinner.length;
        const sin = Math.sin(spinner.angle) * spinner.length;
        return segment(spinner.x - cos, spinner.y - sin, spinner.x + cos, spinner.y + sin, 4);
    }

    function updateFins(game) {
        const { x, y, radius, finCount, finInner } = DRUM;
        game.fins = [];
        for (let i = 0; i < finCount; i++) {
            const angle = game.drumAngle + (i * Math.PI * 2) / finCount;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            game.fins.push(segment(
                x + cos * finInner, y + sin * finInner,
                x + cos * (radius - 1), y + sin * (radius - 1), 4));
        }
    }

    // 드럼 벽. 안/밖을 기억해 항상 같은 쪽으로 밀어내므로 공이 벽을 뚫지 않는다
    function collideDrumWall(game, ball) {
        const dx = ball.x - DRUM.x;
        const dy = ball.y - DRUM.y;
        const dist = Math.hypot(dx, dy) || 1;
        const r = ball.radius;
        const fromBottom = Math.abs(Math.atan2(dx, dy));

        if (fromBottom < game.doorAngle) {
            ball.inDrum = dist < DRUM.radius;
            return;
        }
        if (ball.inDrum) {
            if (dist + r > DRUM.radius) hitSurface(ball, -dx / dist, -dy / dist, dist + r - DRUM.radius);
        } else if (dist - r < DRUM.radius) {
            hitSurface(ball, dx / dist, dy / dist, DRUM.radius - (dist - r));
        }
    }

    function collideInsideDrum(game, ball) {
        collideCircle(ball, { x: DRUM.x, y: DRUM.y, radius: DRUM.hubRadius });
        for (const fin of game.fins) collideSegment(ball, fin, DRUM, game.drumSpin);
    }

    function collideCourse(game, ball, events) {
        const r = ball.radius;
        if (ball.x < r) hitSurface(ball, 1, 0, r - ball.x);
        if (ball.x > W - r) hitSurface(ball, -1, 0, ball.x - (W - r));
        if (ball.y < r) hitSurface(ball, 0, 1, r - ball.y);

        const index = Math.floor(ball.y / BUCKET_SIZE);
        const bucket = game.course.buckets[Math.max(0, Math.min(game.course.buckets.length - 1, index))];

        for (const peg of bucket.pegs) {
            if (collideCircle(ball, peg) > 1.5) events.push({ type: 'peg' });
        }
        for (const seg of bucket.segments) collideSegment(ball, seg);
        for (const bumper of bucket.bumpers) {
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
        for (const spinner of game.course.spinners) {
            if (Math.abs(ball.y - spinner.y) < spinner.length + BUCKET_MARGIN) {
                collideSegment(ball, spinner.segment, spinner, spinner.speed);
            }
        }
    }

    function updateDrum(game, events) {
        if (game.state === 'ready') {
            if (game.spinInput !== 0) {
                const wanted = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, game.spinInput));
                game.drumSpin += (wanted - game.drumSpin) * 0.5;
                game.spinInput = 0;
            } else {
                game.drumSpin *= SPIN_DECAY;
            }
            game.spinTotal += Math.abs(game.drumSpin);
        } else {
            const wanted = game.drumSpin < 0 ? -IDLE_SPIN : IDLE_SPIN;
            game.drumSpin += (wanted - game.drumSpin) * 0.05;
            if (game.doorAngle === 0) events.push({ type: 'release' });
            game.doorAngle = Math.min(DOOR_MAX_ANGLE, game.doorAngle + DOOR_OPEN_SPEED);
        }
        game.drumAngle += game.drumSpin;
        updateFins(game);
    }

    function updateGate(game, events) {
        if (game.state === 'done') {
            game.gateOpen = true; // 번호가 다 뽑히면 남은 공은 그대로 흘려보낸다
            return;
        }
        if (game.gateTimer === null) {
            if (game.balls.some(b => b.y > GATE.top)) game.gateTimer = GATE_HOLD_FIRST;
            return;
        }
        game.gateTimer--;
        if (game.gateTimer > 0) return;
        game.gateOpen = !game.gateOpen;
        game.gateTimer = game.gateOpen ? GATE_OPEN_STEPS : GATE_CLOSED_STEPS;
        if (game.gateOpen) events.push({ type: 'gate' });
    }

    function collideGate(ball) {
        if (ball.y < GATE.y - BUCKET_MARGIN || ball.y > GATE.y + BUCKET_MARGIN) return;
        collideSegment(ball, segment(CX - GATE.halfWidth, GATE.y, CX + GATE.halfWidth, GATE.y, 3));
    }

    function clampSpeed(ball) {
        const speed = Math.hypot(ball.vx, ball.vy);
        if (speed > MAX_SPEED) {
            ball.vx *= MAX_SPEED / speed;
            ball.vy *= MAX_SPEED / speed;
        }
    }

    // 구조물 위에 얹혀 멈춘 공을 풀어 준다
    function unjam(game, rng) {
        for (const ball of game.balls) {
            // 드럼과 저수지에서는 멈춰 기다리는 것이 정상이다
            const waiting = ball.y > GATE.top - 40 && ball.y < GATE.y;
            if (ball.inDrum || waiting) {
                ball.still = 0;
                continue;
            }
            if (Math.hypot(ball.vx, ball.vy) < STILL_SPEED) ball.still++;
            else ball.still = 0;
            if (ball.still > STILL_STEPS) {
                ball.vx = (rng() < 0.5 ? -1 : 1) * (1 + rng() * 2);
                ball.vy = -1 - rng() * 2;
                ball.still = 0;
            }
        }
    }

    function stepGame(game, rng) {
        const events = [];
        game.stepCount++;

        updateDrum(game, events);
        updateGate(game, events);

        for (const spinner of game.course.spinners) {
            spinner.angle += spinner.speed;
            spinner.segment = spinnerSegment(spinner);
        }
        for (const bumper of game.course.bumpers) if (bumper.flash > 0) bumper.flash--;

        const balls = game.balls;
        for (const ball of balls) {
            ball.vy += gravity;
            clampSpeed(ball);
            ball.x += ball.vx;
            ball.y += ball.vy;
        }

        const reach = ballRadius * 2;
        for (let pass = 0; pass < SOLVER_PASSES; pass++) {
            for (let i = 0; i < balls.length; i++) {
                const a = balls[i];
                for (let j = i + 1; j < balls.length; j++) {
                    const b = balls[j];
                    if (Math.abs(a.y - b.y) < reach && Math.abs(a.x - b.x) < reach) {
                        collideBalls(a, b, bounce);
                    }
                }
            }
            for (const ball of balls) {
                collideDrumWall(game, ball);
                if (ball.inDrum) collideInsideDrum(game, ball);
                else {
                    collideCourse(game, ball, pass === 0 ? events : []);
                    if (!game.gateOpen) collideGate(ball);
                }
            }
        }

        for (let i = balls.length - 1; i >= 0; i--) {
            const ball = balls[i];
            if (ball.y > GOAL.y) {
                balls.splice(i, 1);
                game.exitedCount++;
                events.push(...recordExit(game, ball));
            }
        }

        unjam(game, rng);
        return events;
    }

    function recordExit(game, ball) {
        if (ball.number === null) return [{ type: 'dummy' }];
        if (game.picked.length >= PICK_COUNT) return [];

        game.picked.push({ number: ball.number, step: game.stepCount });
        const events = [{ type: 'pick', number: ball.number }];
        if (game.picked.length === PICK_COUNT) {
            game.state = 'done';
            events.push({ type: 'complete', numbers: game.numbers() });
        }
        return events;
    }

    const api = { createGame, W, H, NUMBER_COUNT, DUMMY_COUNT, PICK_COUNT, MAX_SPIN, DOOR_MAX_ANGLE };
    if (typeof module !== 'undefined') module.exports = api;
    else root.LottoPinball = api;
})(typeof window !== 'undefined' ? window : globalThis);
