// 드럼 핀볼 — 입력과 화면 (시뮬레이션은 pinball-core.js, 카메라는 pinball-camera.js)
(function () {
    const { createGame, W: WORLD_W, H: WORLD_H, PICK_COUNT, MAX_SPIN, DOOR_MAX_ANGLE } = LottoPinball;
    const { createCamera } = LottoCamera;

    // 화면 단위는 400x600, 카메라 확대에도 선명하도록 캔버스 픽셀은 2배로 둔다
    const VIEW_W = 400;
    const VIEW_H = 600;
    const RES = 2;

    const BALL_COLORS = ['#f0ad00', '#69c8f2', '#ff6363', '#aaaaaa', '#b0d840']; // style.css .ball.b1~b5
    const DUMMY_COLOR = '#3c3c4c';
    const WALL_COLOR = '#7f8cff';
    const BUTTON = { x: 105, y: 490, w: 190, h: 50 };
    const HUD_Y = 26;
    const HUD_SPACING = 42;
    const RAIL = { x: 388, top: 56, bottom: 586 };
    const PICK_ANIM_STEPS = 24;
    const MIN_DRAG_RADIUS = 25;
    const TICK_INTERVAL_MS = 70;

    let sim = createGame();
    let camera = newCamera();
    let dragAngle = null;
    let lastTickTime = 0;

    function newCamera() {
        return createCamera({ viewW: VIEW_W, viewH: VIEW_H, worldW: WORLD_W, worldH: WORLD_H });
    }

    const buttonLabel = () => {
        if (sim.canRelease()) return '내려보내기 ▼';
        if (sim.state === 'done') return '다시 뽑기';
        return null;
    };

    function pressButton() {
        if (sim.canRelease()) {
            dragAngle = null;
            sim.release();
            return true;
        }
        if (sim.state === 'done') {
            sim = createGame();
            camera = newCamera();
            syncResultUI();
            return true;
        }
        return false;
    }

    // 드럼 중심에서 본 포인터 각도. 중심에 너무 가까우면 각도가 튀므로 무시한다
    function pointerAngle(point) {
        const world = camera.toWorld(point);
        const dx = world.x - sim.drum.x;
        const dy = world.y - sim.drum.y;
        if (Math.hypot(dx, dy) < MIN_DRAG_RADIUS) return null;
        return Math.atan2(dy, dx);
    }

    // 캔버스 픽셀 좌표 → 화면 단위
    const toView = coords => ({ x: coords.x / RES, y: coords.y / RES });

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
        else if (event.type === 'release' || event.type === 'gate') playGrabSound();
        else if (event.type === 'pick') {
            playSlotSound();
            camera.notePick();
        } else if (event.type === 'complete') announceNumbers();
    }

    function updatePinball() {
        if (sim.state === 'ready') {
            const direction = (keys['ArrowRight'] ? 1 : 0) - (keys['ArrowLeft'] ? 1 : 0);
            if (direction) sim.spinBy(direction * MAX_SPIN);
        }
        sim.step().forEach(handleEvent);
        camera.update(sim);
    }

    // ---------- 렌더링 ----------
    function ballColor(number) {
        if (number === null) return DUMMY_COLOR;
        return BALL_COLORS[Math.min(4, Math.floor((number - 1) / 10))];
    }

    // 실제 화면에서 글자가 읽히는 크기를 공 크기 안에서 맞춘다
    function ballFont() {
        const screenScale = displayScale * RES * camera.zoom;
        return `bold ${Math.max(9, Math.min(15, Math.round(11 / screenScale)))}px Arial`;
    }

    function drawBall(x, y, radius, number, font) {
        ctx.fillStyle = ballColor(number);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.35, 0, Math.PI * 2);
        ctx.fill();

        if (number !== null) {
            ctx.font = font;
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

    function drawDrumBack() {
        const { x, y, radius } = sim.drum;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawDrumFront() {
        const { x, y, radius, hubRadius } = sim.drum;
        const bottom = Math.PI / 2;

        sim.fins.forEach(fin => drawLine(fin.x1, fin.y1, fin.x2, fin.y2, '#3ecf8e', fin.thickness * 2));

        // 테두리 (열린 문 부분만 비운다)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(x, y, radius, bottom + DOOR_MAX_ANGLE, bottom - DOOR_MAX_ANGLE + Math.PI * 2);
        ctx.stroke();

        // 닫힌 문은 양쪽으로 벌어지며 사라진다
        if (sim.doorAngle < DOOR_MAX_ANGLE) {
            ctx.strokeStyle = '#ff8a3d';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(x, y, radius, bottom + sim.doorAngle, bottom + DOOR_MAX_ANGLE);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y, radius, bottom - DOOR_MAX_ANGLE, bottom - sim.doorAngle);
            ctx.stroke();
        }

        // 중심축
        ctx.fillStyle = '#d8dcf0';
        ctx.beginPath();
        ctx.arc(x, y, hubRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#16162a';
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawCourse(top, bottom) {
        const { pegs, bumpers, spinners, segments } = sim.course;
        const inView = (y, margin = 40) => y > top - margin && y < bottom + margin;

        // 배경 격자 — 카메라 이동이 느껴지도록
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        for (let y = Math.floor(top / 100) * 100; y < bottom; y += 100) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(WORLD_W, y);
            ctx.stroke();
        }

        segments.forEach(seg => {
            if (Math.max(seg.y1, seg.y2) > top && Math.min(seg.y1, seg.y2) < bottom) {
                drawLine(seg.x1, seg.y1, seg.x2, seg.y2, WALL_COLOR, seg.thickness * 2);
            }
        });

        ctx.fillStyle = '#d8dcf0';
        pegs.forEach(peg => {
            if (!inView(peg.y)) return;
            ctx.beginPath();
            ctx.arc(peg.x, peg.y, peg.radius, 0, Math.PI * 2);
            ctx.fill();
        });

        bumpers.forEach(bumper => {
            if (!inView(bumper.y)) return;
            ctx.fillStyle = bumper.flash > 0 ? '#ffe08a' : '#e0524f';
            ctx.beginPath();
            ctx.arc(bumper.x, bumper.y, bumper.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 3;
            ctx.stroke();
        });

        spinners.forEach(spinner => {
            if (!inView(spinner.y, 80) || !spinner.segment) return;
            const seg = spinner.segment;
            drawLine(seg.x1, seg.y1, seg.x2, seg.y2, '#3ecf8e', seg.thickness * 2);
        });

        // 수문과 결승선
        const { gate, goal } = sim;
        if (!sim.gateOpen) {
            drawLine(WORLD_W / 2 - gate.halfWidth, gate.y, WORLD_W / 2 + gate.halfWidth, gate.y, '#ff8a3d', 6);
        }
        ctx.fillStyle = 'rgba(255, 215, 0, 0.25)';
        ctx.fillRect(goal.x - goal.halfWidth, goal.y - 4, goal.halfWidth * 2, 40);
    }

    function drawBalls(top, bottom) {
        const font = ballFont();
        sim.balls.forEach(ball => {
            if (ball.y < top - 20 || ball.y > bottom + 20) return;
            drawBall(ball.x, ball.y, ball.radius, ball.number, font);
        });

        // 카메라가 따라가는 공 표시
        const target = camera.target;
        if (target && sim.state === 'falling' && sim.balls.includes(target)) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(target.x, target.y, target.radius + 4, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    function drawPickSlots() {
        const slotX = i => (VIEW_W - 16) / 2 + (i - (PICK_COUNT - 1) / 2) * HUD_SPACING;

        ctx.fillStyle = 'rgba(10, 10, 20, 0.72)';
        ctx.fillRect(0, 0, VIEW_W, HUD_Y * 2);
        for (let i = 0; i < PICK_COUNT; i++) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(slotX(i), HUD_Y, 17, 0, Math.PI * 2);
            ctx.stroke();
        }

        const start = camera.toScreen({ x: sim.goal.x, y: sim.goal.y });
        const font = `bold ${Math.max(11, Math.min(15, Math.round(12 / (displayScale * RES))))}px Arial`;
        sim.picked.forEach((pick, i) => {
            const t = Math.min(1, (sim.stepCount - pick.step) / PICK_ANIM_STEPS);
            const eased = t * (2 - t);
            drawBall(
                start.x + (slotX(i) - start.x) * eased,
                start.y + (HUD_Y - start.y) * eased,
                15,
                pick.number,
                font
            );
        });
    }

    // 오른쪽 진행 막대: 코스 전체에서 공들이 어디쯤 있는지
    function drawProgressRail() {
        const railY = y => RAIL.top + (Math.max(0, Math.min(WORLD_H, y)) / WORLD_H) * (RAIL.bottom - RAIL.top);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.fillRect(RAIL.x - 2, RAIL.top, 4, RAIL.bottom - RAIL.top);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        const viewTop = railY(camera.visibleTop());
        ctx.fillRect(RAIL.x - 7, viewTop, 14, railY(camera.visibleBottom()) - viewTop);

        sim.balls.forEach(ball => {
            if (ball.number === null) return;
            ctx.fillStyle = ballColor(ball.number);
            ctx.beginPath();
            ctx.arc(RAIL.x, railY(ball.y), 3, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function drawPanel(lines, gauge) {
        const label = buttonLabel();
        const lineHeight = 24;
        const bottom = BUTTON.y + BUTTON.h + 14;
        const top = bottom - 14 - (label ? BUTTON.h + 10 : 0) - (gauge !== null ? 26 : 0)
            - lines.length * lineHeight - 8;

        ctx.fillStyle = 'rgba(10, 10, 20, 0.82)';
        ctx.beginPath();
        ctx.roundRect(24, top, VIEW_W - 64, bottom - top, 12);
        ctx.fill();

        const centerX = 24 + (VIEW_W - 64) / 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'white';
        ctx.font = `bold ${Math.round(Math.min(17, 13 / (displayScale * RES)))}px Arial`;
        lines.forEach((line, i) => {
            ctx.fillText(line, centerX, top + 20 + i * lineHeight);
        });

        if (gauge !== null) {
            const barY = top + 12 + lines.length * lineHeight;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.fillRect(centerX - 130, barY, 260, 12);
            ctx.fillStyle = '#ffb347';
            ctx.fillRect(centerX - 130, barY, 260 * gauge, 12);
        }

        if (label) {
            ctx.fillStyle = '#2a7aff';
            ctx.beginPath();
            ctx.roundRect(BUTTON.x, BUTTON.y, BUTTON.w, BUTTON.h, 25);
            ctx.fill();
            ctx.fillStyle = 'white';
            ctx.font = `bold ${Math.round(Math.min(22, 15 / (displayScale * RES)))}px Arial`;
            ctx.fillText(label, BUTTON.x + BUTTON.w / 2, BUTTON.y + BUTTON.h / 2 + 1);
        }
    }

    function drawOverlay() {
        if (sim.state === 'ready') {
            if (sim.canRelease()) {
                drawPanel(['잘 섞였어요! 더 돌려도 돼요'], null);
            } else {
                drawPanel(['바구니를 원 그리듯 돌려 섞으세요', 'PC는 ← → 방향키도 돼요'], sim.spinProgress());
            }
        } else if (sim.state === 'done') {
            drawPanel(['번호 완성! 아래에 저장됐어요'], null);
        }
    }

    function renderPinball() {
        ctx.setTransform(RES, 0, 0, RES, 0, 0);
        ctx.fillStyle = '#16162a';
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);

        ctx.save();
        camera.apply(ctx);
        const top = camera.visibleTop();
        const bottom = camera.visibleBottom();
        drawCourse(top, bottom);
        drawDrumBack();
        drawBalls(top, bottom);
        drawDrumFront();
        ctx.restore();

        drawProgressRail();
        drawPickSlots();
        drawOverlay();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    games.pinball = {
        name: '바구니 핀볼',
        width: VIEW_W * RES,
        height: VIEW_H * RES,
        update: updatePinball,
        render: renderPinball,
        get sim() {
            return sim;
        },
        get camera() {
            return camera;
        },
        pointerDown(coords) {
            const point = toView(coords);
            const onButton = buttonLabel()
                && point.x >= BUTTON.x && point.x <= BUTTON.x + BUTTON.w
                && point.y >= BUTTON.y && point.y <= BUTTON.y + BUTTON.h;
            if (onButton) pressButton();
            else if (sim.state === 'ready') dragAngle = pointerAngle(point);
        },
        pointerMove(coords) {
            if (sim.state !== 'ready') return;
            const angle = pointerAngle(toView(coords));
            if (angle === null) {
                dragAngle = null;
                return;
            }
            if (dragAngle !== null) {
                // -π~π 경계를 넘어도 짧은 쪽 회전으로 계산한다
                let delta = angle - dragAngle;
                if (delta > Math.PI) delta -= Math.PI * 2;
                if (delta < -Math.PI) delta += Math.PI * 2;
                sim.spinBy(delta);
            }
            dragAngle = angle;
        },
        pointerUp() {
            dragAngle = null;
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
