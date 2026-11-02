// 바구니 핀볼 — 입력과 화면 (시뮬레이션은 pinball-core.js)
(function () {
    const { createGame, spinnerSegment, W, H, PICK_COUNT } = LottoPinball;

    const BALL_COLORS = ['#f0ad00', '#69c8f2', '#ff6363', '#aaaaaa', '#b0d840']; // style.css .ball.b1~b5
    const DUMMY_COLOR = '#3c3c4c';
    const BUTTON = { x: 105, y: 322, w: 190, h: 50 };
    const TRAY_Y = 578;
    const TRAY_SPACING = 46;
    const PICK_ANIM_STEPS = 24;
    const SHAKE_KEY_X = 100;
    const SHAKE_KEY_Y = 100;
    const TICK_INTERVAL_MS = 70;

    let sim = createGame();
    let dragStart = null;
    let lastTickTime = 0;

    const buttonLabel = () => {
        if (sim.canRelease()) return '내려보내기 ▼';
        if (sim.state === 'done') return '다시 뽑기';
        return null;
    };

    function pressButton() {
        if (sim.canRelease()) {
            dragStart = null;
            sim.release();
            return true;
        }
        if (sim.state === 'done') {
            sim = createGame();
            syncResultUI();
            return true;
        }
        return false;
    }

    function playTick() {
        if (isMuted || !audioCtx || document.hidden || !isCanvasInView()) return;
        const now = performance.now();
        if (now - lastTickTime < TICK_INTERVAL_MS) return;
        lastTickTime = now;

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.value = 1300 + Math.random() * 500;
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.05);
    }

    function handleEvent(event) {
        if (event.type === 'peg' || event.type === 'bumper') playTick();
        else if (event.type === 'release') playGrabSound();
        else if (event.type === 'pick') playSlotSound();
        else if (event.type === 'complete') announceNumbers();
    }

    function updatePinball() {
        if (sim.state === 'ready' && !dragStart) {
            const x = (keys['ArrowRight'] ? 1 : 0) - (keys['ArrowLeft'] ? 1 : 0);
            const y = (keys['ArrowDown'] ? 1 : 0) - (keys['ArrowUp'] ? 1 : 0);
            sim.setShakeTarget(x * SHAKE_KEY_X, y * SHAKE_KEY_Y);
        }
        sim.step().forEach(handleEvent);
    }

    // ---------- 렌더링 ----------
    function ballColor(number) {
        if (number === null) return DUMMY_COLOR;
        return BALL_COLORS[Math.min(4, Math.floor((number - 1) / 10))];
    }

    function drawBall(x, y, radius, number) {
        ctx.fillStyle = ballColor(number);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.35, 0, Math.PI * 2);
        ctx.fill();

        if (number !== null) {
            ctx.font = scaledFont(11, 14);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
            ctx.fillStyle = 'white';
            ctx.strokeText(number, x, y + 0.5);
            ctx.fillText(number, x, y + 0.5);
        }
    }

    function drawLine(x1, y1, x2, y2, color, width) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    function drawBasket() {
        const { left, right, top, shoulderY, neckY, neckWidth } = sim.basket;
        const ox = sim.offsetX;
        const oy = sim.offsetY;
        const neckLeft = W / 2 - neckWidth / 2 + ox;
        const neckRight = W / 2 + neckWidth / 2 + ox;

        ctx.beginPath();
        ctx.moveTo(left + ox, top + oy);
        ctx.lineTo(right + ox, top + oy);
        ctx.lineTo(right + ox, shoulderY + oy);
        ctx.lineTo(neckRight, neckY + oy);
        ctx.lineTo(neckLeft, neckY + oy);
        ctx.lineTo(left + ox, shoulderY + oy);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(neckLeft, neckY + oy);
        ctx.lineTo(left + ox, shoulderY + oy);
        ctx.lineTo(left + ox, top + oy);
        ctx.lineTo(right + ox, top + oy);
        ctx.lineTo(right + ox, shoulderY + oy);
        ctx.lineTo(neckRight, neckY + oy);
        ctx.stroke();

        if (!sim.gateOpen) {
            drawLine(neckLeft, neckY + oy, neckRight, neckY + oy, '#ff8a3d', 4);
        }
    }

    function drawCourse() {
        const { pegs, bumpers, spinners, segments } = sim.course;

        // 바구니 바깥면은 drawBasket이 그리는 선과 겹치므로 경사 막대·출구 깔때기만 그린다
        segments.forEach(seg => {
            if (Math.min(seg.y1, seg.y2) > sim.basket.neckY) {
                drawLine(seg.x1, seg.y1, seg.x2, seg.y2, '#7f8cff', seg.thickness * 2);
            }
        });

        ctx.fillStyle = '#d8dcf0';
        pegs.forEach(peg => {
            ctx.beginPath();
            ctx.arc(peg.x, peg.y, peg.radius, 0, Math.PI * 2);
            ctx.fill();
        });

        bumpers.forEach(bumper => {
            ctx.fillStyle = bumper.flash > 0 ? '#ffe08a' : '#e0524f';
            ctx.beginPath();
            ctx.arc(bumper.x, bumper.y, bumper.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 3;
            ctx.stroke();
        });

        spinners.forEach(spinner => {
            const seg = spinnerSegment(spinner);
            drawLine(seg.x1, seg.y1, seg.x2, seg.y2, '#3ecf8e', seg.thickness * 2);
        });
    }

    function drawTray() {
        const slotX = i => W / 2 + (i - (PICK_COUNT - 1) / 2) * TRAY_SPACING;

        for (let i = 0; i < PICK_COUNT; i++) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(slotX(i), TRAY_Y, 15, 0, Math.PI * 2);
            ctx.stroke();
        }

        sim.picked.forEach((pick, i) => {
            const t = Math.min(1, (sim.stepCount - pick.step) / PICK_ANIM_STEPS);
            const eased = t * (2 - t);
            drawBall(
                pick.x + (slotX(i) - pick.x) * eased,
                pick.y + (TRAY_Y - pick.y) * eased,
                13,
                pick.number
            );
        });
    }

    function drawPanel(lines, gauge) {
        const label = buttonLabel();
        const lineHeight = 26;
        const contentH = lines.length * lineHeight + (gauge !== null ? 26 : 0) + (label ? 62 : 0);
        const panelY = label ? BUTTON.y - lines.length * lineHeight - 18 : 300;

        ctx.fillStyle = 'rgba(10, 10, 20, 0.82)';
        ctx.beginPath();
        ctx.roundRect(30, panelY, W - 60, contentH + 20, 12);
        ctx.fill();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'white';
        ctx.font = scaledFont(13, 18);
        lines.forEach((line, i) => {
            ctx.fillText(line, W / 2, panelY + 22 + i * lineHeight);
        });

        if (gauge !== null) {
            const barY = panelY + 12 + lines.length * lineHeight;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.fillRect(70, barY, W - 140, 12);
            ctx.fillStyle = '#ffb347';
            ctx.fillRect(70, barY, (W - 140) * gauge, 12);
        }

        if (label) {
            ctx.fillStyle = '#2a7aff';
            ctx.beginPath();
            ctx.roundRect(BUTTON.x, BUTTON.y, BUTTON.w, BUTTON.h, 25);
            ctx.fill();
            ctx.fillStyle = 'white';
            ctx.font = scaledFont(15, 22);
            ctx.fillText(label, BUTTON.x + BUTTON.w / 2, BUTTON.y + BUTTON.h / 2 + 1);
        }
    }

    function drawOverlay() {
        if (sim.state === 'ready') {
            if (sim.canRelease()) {
                drawPanel(['잘 섞였어요! 더 흔들어도 돼요'], null);
            } else {
                drawPanel(['바구니를 드래그해서 마구 흔드세요', 'PC는 방향키도 돼요'], sim.shakeProgress());
            }
        } else if (sim.state === 'done') {
            drawPanel(['번호 완성! 아래에 저장됐어요'], null);
        }
    }

    function renderPinball() {
        ctx.fillStyle = '#16162a';
        ctx.fillRect(0, 0, W, H);

        drawCourse();
        sim.balls.forEach(ball => drawBall(ball.x, ball.y, ball.radius, ball.number));
        drawBasket();
        drawTray();
        drawOverlay();
    }

    games.pinball = {
        name: '바구니 핀볼',
        width: W,
        height: H,
        update: updatePinball,
        render: renderPinball,
        get sim() {
            return sim;
        },
        pointerDown(coords) {
            const onButton = buttonLabel()
                && coords.x >= BUTTON.x && coords.x <= BUTTON.x + BUTTON.w
                && coords.y >= BUTTON.y && coords.y <= BUTTON.y + BUTTON.h;
            if (onButton) pressButton();
            else if (sim.state === 'ready') dragStart = coords;
        },
        pointerMove(coords) {
            if (!dragStart) return;
            sim.setShakeTarget(coords.x - dragStart.x, coords.y - dragStart.y);
        },
        pointerUp() {
            if (!dragStart) return;
            dragStart = null;
            sim.setShakeTarget(0, 0);
        },
        onKey(key) {
            return (key === ' ' || key === 'Enter') && pressButton();
        },
        getNumbers() {
            if (sim.picked.length < PICK_COUNT) return null;
            return sim.numbers().sort((a, b) => a - b);
        }
    };

    updateSwitchBtn();
})();
