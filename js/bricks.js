// 행운 벽돌깨기 — 입력과 화면 (시뮬레이션은 bricks-core.js)
(function () {
    const { createGame, W: VIEW_W, H: VIEW_H, PICK_COUNT } = LottoBricks;

    const RES = 2; // 캔버스 픽셀 배율 (핀볼과 같은 선명도)
    const { gravity } = LottoPhysics;

    const ROW_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#b197fc'];
    const rowColor = row => ROW_COLORS[Math.floor(row / 2) % ROW_COLORS.length];
    const HUD_Y = 26;
    const HUD_SPACING = 46;
    const CONTINUE_BUTTON = { x: 40, y: 400, w: 155, h: 50, label: '이어하기', color: '#f08c00' };
    const RESTART_BUTTON = { x: 205, y: 400, w: 155, h: 50, label: '다시 뽑기', color: '#2a7aff' };
    const RESTART_ONLY_BUTTON = { x: 105, y: 400, w: 190, h: 50, label: '다시 뽑기', color: '#2a7aff' };
    const HARD_COLOR = '#6c7693';
    const ITEM_INFO = {
        split: { label: '분열', color: '#ff6bd6', notice: '공 분열!' },
        wide: { label: '확대', color: '#3ecf8e', notice: '받침 확대 10초!' },
        slow: { label: '감속', color: '#4dabf7', notice: '공 감속 8초!' },
        laser: { label: '광선', color: '#ff6b6b', notice: '광선 7초!' }
    };
    const PICK_ANIM_STEPS = 24;
    const POPUP_STEPS = 45;
    const DEBRIS_PER_BRICK = 8;

    let sim = createGame();
    let dragging = false;
    let hint = 'start'; // 발사 전 안내: start, continue, miss
    const debris = [];
    const popups = [];

    function clearEffects() {
        debris.length = 0;
        popups.length = 0;
    }

    function reset() {
        sim = createGame();
        hint = 'start';
        clearEffects();
        syncResultUI();
    }

    function continuePlay() {
        if (!sim.continueGame()) return false;
        hint = 'continue';
        clearEffects();
        playGrabSound();
        return true;
    }

    function launch() {
        if (!sim.launch()) return false;
        playGrabSound();
        return true;
    }

    function pressAction() {
        if (sim.state === 'done') {
            if (!continuePlay()) reset();
            return true;
        }
        return launch();
    }

    function doneButtons() {
        return sim.canContinue() ? [CONTINUE_BUTTON, RESTART_BUTTON] : [RESTART_ONLY_BUTTON];
    }

    // 번호가 드러나면 이어서 노려 뽑을 수 있으므로 더 이어갈 수 없을 때만 공개한다
    const isRevealed = () => sim.state === 'done' && !sim.canContinue();

    function brickColor(brick) {
        if (brick.hits > 1) return HARD_COLOR;
        if (brick.item) return ITEM_INFO[brick.item].color;
        return rowColor(brick.row);
    }

    function burstBrick(brick) {
        for (let i = 0; i < DEBRIS_PER_BRICK; i++) {
            debris.push({
                x: brick.x + Math.random() * brick.width,
                y: brick.y + Math.random() * brick.height,
                vx: (Math.random() - 0.5) * 4,
                vy: -Math.random() * 3,
                size: 2 + Math.random() * 3,
                color: brickColor(brick),
                life: 40
            });
        }
    }

    function handleEvent(event) {
        switch (event.type) {
            case 'wall':
            case 'paddle':
            case 'hardHit':
            case 'shot':
                playTickSound();
                break;
            case 'item':
                playSlotSound();
                popups.push({
                    text: ITEM_INFO[event.item].notice,
                    x: VIEW_W / 2,
                    y: sim.paddle.y - 30,
                    age: 0,
                    color: ITEM_INFO[event.item].color
                });
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
                hint = 'miss';
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
        if (brick.broken) return;
        const revealed = isRevealed();

        ctx.globalAlpha = sim.state === 'done' ? 0.45 : 1;
        ctx.fillStyle = brickColor(brick);
        ctx.beginPath();
        ctx.roundRect(brick.x, brick.y, brick.width, brick.height, 4);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.fillRect(brick.x + 4, brick.y + 2, brick.width - 8, 2);

        // 단단한 벽돌은 테두리로 표시하고, 남은 횟수만큼 두껍게 그린다
        if (brick.hits > 1) {
            ctx.strokeStyle = '#d8dcf0';
            ctx.lineWidth = brick.hits;
            ctx.strokeRect(brick.x + 1, brick.y + 1, brick.width - 2, brick.height - 2);
        }

        // 깨기 전에는 번호를 보여 주지 않는다
        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(20, 20, 40, 0.85)';
        let label = '?';
        if (revealed) {
            if (brick.type === 'number') label = brick.number;
            else label = brick.type === 'dud' ? '꽝' : '+2';
        } else if (brick.item) {
            label = ITEM_INFO[brick.item].label;
        }
        ctx.fillText(label, brick.x + brick.width / 2, brick.y + brick.height / 2 + 1);
        ctx.globalAlpha = 1;
    }

    function drawCapsules() {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = uiFont(11, 13);
        sim.capsules.forEach(capsule => {
            const info = ITEM_INFO[capsule.item];
            ctx.fillStyle = info.color;
            ctx.beginPath();
            ctx.roundRect(capsule.x - capsule.width / 2, capsule.y - capsule.height / 2, capsule.width, capsule.height, 8);
            ctx.fill();
            ctx.fillStyle = 'rgba(20, 20, 40, 0.9)';
            ctx.fillText(info.label, capsule.x, capsule.y + 1);
        });

        ctx.fillStyle = '#ff8787';
        sim.shots.forEach(shot => ctx.fillRect(shot.x - 1.5, shot.y - 8, 3, 12));
    }

    // 남은 아이템 시간
    function drawEffectTimers() {
        const active = [
            ['wide', sim.effects.wide],
            ['slow', sim.effects.slow],
            ['laser', sim.effects.laser]
        ].filter(([, steps]) => steps > 0);
        if (active.length === 0) return;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = uiFont(11, 14);
        ctx.fillStyle = '#d8dcf0';
        const text = active
            .map(([key, steps]) => `${ITEM_INFO[key].label} ${Math.ceil(steps / 60)}초`)
            .join(' · ');
        ctx.fillText(text, VIEW_W / 2, 586);
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
            const x = brick ? brick.x + brick.width / 2 : popup.x;
            const y = brick ? brick.y + brick.height / 2 : popup.y;
            ctx.globalAlpha = 1 - age / POPUP_STEPS;
            ctx.fillStyle = color;
            ctx.fillText(text, x, y - age * 0.4);
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
            ctx.fillStyle = 'rgba(10, 10, 20, 0.85)';
            ctx.beginPath();
            ctx.roundRect(24, 340, VIEW_W - 48, 124, 12);
            ctx.fill();
            ctx.fillStyle = 'white';
            ctx.font = uiFont(13, 17);
            const title = sim.setCount > 1
                ? `${sim.setCount}번째 번호 완성! 아래에 저장됐어요`
                : '번호 완성! 아래에 저장됐어요';
            ctx.fillText(title, VIEW_W / 2, 360);
            ctx.font = uiFont(11, 14);
            ctx.fillStyle = '#c0c4d6';
            ctx.fillText(
                sim.canContinue() ? '이어하면 기믹이 생기고, 6개를 더 깨면 새 번호가 저장돼요' : '남은 번호가 6개보다 적어 끝났어요',
                VIEW_W / 2,
                383
            );
            doneButtons().forEach(button => {
                ctx.fillStyle = button.color;
                ctx.beginPath();
                ctx.roundRect(button.x, button.y, button.w, button.h, 25);
                ctx.fill();
                ctx.fillStyle = 'white';
                ctx.font = uiFont(15, 20);
                ctx.fillText(button.label, button.x + button.w / 2, button.y + button.h / 2 + 1);
            });
        } else if (sim.state === 'ready') {
            const lines = {
                start: ['벽돌 속 번호 중 먼저 깬 6개가 뽑혀요', '드래그로 받침을 움직이고, 손을 떼면 발사'],
                continue: ['벽돌이 바뀌었어요! 회색은 여러 번 맞혀야 깨져요', '글자 벽돌을 깨면 아이템이 떨어져요'],
                miss: ['놓쳤어요! 뽑은 번호는 그대로예요', '손을 떼면 다시 발사해요']
            }[hint];
            ctx.font = uiFont(13, 17);
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillStyle = 'white';
            lines.forEach((line, i) => {
                ctx.strokeText(line, VIEW_W / 2, 420 + i * 26);
                ctx.fillText(line, VIEW_W / 2, 420 + i * 26);
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
            drawCapsules();
            drawPaddle();
            drawBalls();
            drawEffectTimers();
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
                const pressed = doneButtons().find(button =>
                    point.x >= button.x && point.x <= button.x + button.w
                    && point.y >= button.y && point.y <= button.y + button.h);
                if (pressed === CONTINUE_BUTTON) continuePlay();
                else if (pressed) reset();
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
            // 이어하는 동안에도 가장 최근 세트를 표시·공유한다
            return sim.lastSet;
        }
    };

    updateSwitchBtn();
})();
