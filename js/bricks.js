// 행운 벽돌깨기 — 입력과 화면 (시뮬레이션은 bricks-core.js)
(function () {
    const { createGame, W: VIEW_W, H: VIEW_H, PICK_COUNT } = LottoBricks;

    const RES = 2; // 캔버스 픽셀 배율 (핀볼과 같은 선명도)
    const { gravity } = LottoPhysics;

    const ROW_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#b197fc'];
    const HUD_Y = 26;
    const HUD_SPACING = 46;
    const BUTTON = { x: 105, y: 340, w: 190, h: 50 };
    const PICK_ANIM_STEPS = 24;
    const POPUP_STEPS = 45;
    const DEBRIS_PER_BRICK = 8;

    let sim = createGame();
    let dragging = false;
    let hasLaunched = false;
    const debris = [];
    const popups = [];

    function reset() {
        sim = createGame();
        hasLaunched = false;
        debris.length = 0;
        popups.length = 0;
        syncResultUI();
    }

    function launch() {
        if (!sim.launch()) return false;
        hasLaunched = true;
        playGrabSound();
        return true;
    }

    function pressAction() {
        if (sim.state === 'done') {
            reset();
            return true;
        }
        return launch();
    }

    function burstBrick(brick) {
        for (let i = 0; i < DEBRIS_PER_BRICK; i++) {
            debris.push({
                x: brick.x + Math.random() * brick.width,
                y: brick.y + Math.random() * brick.height,
                vx: (Math.random() - 0.5) * 4,
                vy: -Math.random() * 3,
                size: 2 + Math.random() * 3,
                color: ROW_COLORS[brick.row],
                life: 40
            });
        }
    }

    function handleEvent(event) {
        switch (event.type) {
            case 'wall':
            case 'paddle':
                playTickSound();
                break;
            case 'brick':
                burstBrick(event.brick);
                break;
            case 'pick':
                playSlotSound();
                break;
            case 'dud':
                playGrabSound();
                popups.push({ text: '꽝', brick: event.brick, age: 0, color: '#c0c4d6' });
                break;
            case 'multi':
                playGrabSound();
                popups.push({ text: '공 +2', brick: event.brick, age: 0, color: '#ffe08a' });
                break;
            case 'miss':
                playExplodeSound();
                break;
            case 'complete':
                announceNumbers();
                break;
        }
    }

    function updateEffects() {
        for (let i = debris.length - 1; i >= 0; i--) {
            const d = debris[i];
            d.vy += gravity * 0.5;
            d.x += d.vx;
            d.y += d.vy;
            d.life--;
            if (d.life <= 0) debris.splice(i, 1);
        }
        for (let i = popups.length - 1; i >= 0; i--) {
            popups[i].age++;
            if (popups[i].age > POPUP_STEPS) popups.splice(i, 1);
        }
    }

    function updateBricks() {
        const direction = (keys['ArrowRight'] ? 1 : 0) - (keys['ArrowLeft'] ? 1 : 0);
        if (direction) sim.movePaddle(direction);
        sim.step().forEach(handleEvent);
        updateEffects();
    }

    // ---------- 렌더링 ----------
    const uiFont = (displayPx, maxPx) =>
        `bold ${Math.round(Math.min(maxPx, displayPx / (displayScale * RES)))}px Arial`;

    function drawBrick(brick, font) {
        const done = sim.state === 'done';
        if (brick.broken) return;

        ctx.globalAlpha = done ? 0.45 : 1;
        ctx.fillStyle = ROW_COLORS[brick.row];
        ctx.beginPath();
        ctx.roundRect(brick.x, brick.y, brick.width, brick.height, 5);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.fillRect(brick.x + 4, brick.y + 3, brick.width - 8, 3);

        // 깨기 전에는 번호를 보여 주지 않는다. 끝난 뒤에는 어디에 무엇이 있었는지 공개한다
        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(20, 20, 40, 0.8)';
        let label = '?';
        if (done) {
            if (brick.type === 'number') label = brick.number;
            else label = brick.type === 'dud' ? '꽝' : '+2';
        }
        ctx.fillText(label, brick.x + brick.width / 2, brick.y + brick.height / 2 + 1);
        ctx.globalAlpha = 1;
    }

    function drawPaddle() {
        const { x, y, width, height } = sim.paddle;
        ctx.fillStyle = '#7f8cff';
        ctx.beginPath();
        ctx.roundRect(x - width / 2, y, width, height, 7);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.beginPath();
        ctx.roundRect(x - width / 2 + 6, y + 2, width - 12, 3, 2);
        ctx.fill();
    }

    function drawBalls() {
        sim.balls.forEach(ball => {
            ctx.fillStyle = '#f4f5ff';
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(120, 130, 200, 0.5)';
            ctx.beginPath();
            ctx.arc(ball.x + ball.radius * 0.25, ball.y + ball.radius * 0.25, ball.radius * 0.55, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function drawEffects(font) {
        debris.forEach(d => {
            ctx.globalAlpha = Math.min(1, d.life / 20);
            ctx.fillStyle = d.color;
            ctx.fillRect(d.x, d.y, d.size, d.size);
        });
        ctx.globalAlpha = 1;

        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        popups.forEach(popup => {
            const { brick, age, text, color } = popup;
            ctx.globalAlpha = 1 - age / POPUP_STEPS;
            ctx.fillStyle = color;
            ctx.fillText(text, brick.x + brick.width / 2, brick.y + brick.height / 2 - age * 0.4);
        });
        ctx.globalAlpha = 1;
    }

    function drawPickSlots() {
        const slotX = i => VIEW_W / 2 + (i - (PICK_COUNT - 1) / 2) * HUD_SPACING;

        ctx.fillStyle = 'rgba(10, 10, 20, 0.72)';
        ctx.fillRect(0, 0, VIEW_W, HUD_Y * 2);
        for (let i = 0; i < PICK_COUNT; i++) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(slotX(i), HUD_Y, 17, 0, Math.PI * 2);
            ctx.stroke();
        }

        const font = uiFont(12, 15);
        sim.picked.forEach((pick, i) => {
            const t = Math.min(1, (sim.stepCount - pick.step) / PICK_ANIM_STEPS);
            const eased = t * (2 - t);
            drawNumberBall(
                pick.x + (slotX(i) - pick.x) * eased,
                pick.y + (HUD_Y - pick.y) * eased,
                15,
                pick.number,
                font
            );
        });
    }

    function drawOverlay() {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (sim.state === 'done') {
            ctx.fillStyle = 'rgba(10, 10, 20, 0.82)';
            ctx.beginPath();
            ctx.roundRect(30, 290, VIEW_W - 60, 114, 12);
            ctx.fill();
            ctx.fillStyle = 'white';
            ctx.font = uiFont(13, 17);
            ctx.fillText('번호 완성! 아래에 저장됐어요', VIEW_W / 2, 314);
            ctx.fillStyle = '#2a7aff';
            ctx.beginPath();
            ctx.roundRect(BUTTON.x, BUTTON.y, BUTTON.w, BUTTON.h, 25);
            ctx.fill();
            ctx.fillStyle = 'white';
            ctx.font = uiFont(15, 22);
            ctx.fillText('다시 뽑기', VIEW_W / 2, BUTTON.y + BUTTON.h / 2 + 1);
        } else if (sim.state === 'ready') {
            const lines = hasLaunched
                ? ['놓쳤어요! 뽑은 번호는 그대로예요', '손을 떼면 다시 발사해요']
                : ['벽돌 속 번호 중 먼저 깬 6개가 뽑혀요', '드래그로 받침을 움직이고, 손을 떼면 발사'];
            ctx.font = uiFont(13, 17);
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillStyle = 'white';
            lines.forEach((line, i) => {
                ctx.strokeText(line, VIEW_W / 2, 400 + i * 26);
                ctx.fillText(line, VIEW_W / 2, 400 + i * 26);
            });
        }
    }

    function renderBricks() {
        ctx.setTransform(RES, 0, 0, RES, 0, 0);
        ctx.fillStyle = '#16162a';
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);

        const brickFont = uiFont(11, 15);
        sim.bricks.forEach(brick => drawBrick(brick, brickFont));
        drawEffects(uiFont(14, 20));
        if (sim.state !== 'done') {
            drawPaddle();
            drawBalls();
        }
        drawPickSlots();
        drawOverlay();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // 캔버스 픽셀 좌표 → 화면 단위
    const toView = coords => ({ x: coords.x / RES, y: coords.y / RES });

    games.bricks = {
        name: '행운 벽돌깨기',
        width: VIEW_W * RES,
        height: VIEW_H * RES,
        update: updateBricks,
        render: renderBricks,
        get sim() {
            return sim;
        },
        pointerDown(coords) {
            const point = toView(coords);
            if (sim.state === 'done') {
                const onButton = point.x >= BUTTON.x && point.x <= BUTTON.x + BUTTON.w
                    && point.y >= BUTTON.y && point.y <= BUTTON.y + BUTTON.h;
                if (onButton) reset();
                return;
            }
            dragging = true;
            sim.setPaddleTarget(point.x);
        },
        pointerMove(coords) {
            if (dragging) sim.setPaddleTarget(toView(coords).x);
        },
        pointerUp() {
            if (!dragging) return;
            dragging = false;
            sim.setPaddleTarget(null);
            if (sim.state === 'ready') launch();
        },
        onKey(key) {
            return (key === ' ' || key === 'Enter') && pressAction();
        },
        getNumbers() {
            if (sim.picked.length < PICK_COUNT) return null;
            return sim.numbers().sort((a, b) => a - b);
        }
    };

    updateSwitchBtn();
})();
