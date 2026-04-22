// =========================
// 1. 캔버스 / 기본 DOM 셋업
// =========================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const luckyNumbersEl = document.getElementById('luckyNumbers');

let isMobile = window.innerWidth <= 768;

// 캔버스 리사이즈 — 모바일: 스크롤 없이 한 화면에 맞춤
function resizeCanvas() {
    isMobile = window.innerWidth <= 768;
    const vw = window.innerWidth;

    if (isMobile) {
        // 헤더(44) + 번호표시(32) + 공유버튼(44) + sticky광고(58) + 여유(10) = 188px
        const available = (window.innerHeight || screen.height) - 188;
        const aspectH = Math.round(vw * (400 / 600)); // 3:2 비율 유지
        const finalH = Math.max(160, Math.min(aspectH, available));

        canvas.style.width = vw + 'px';
        canvas.style.height = finalH + 'px';
    } else {
        canvas.style.width = '600px';
        canvas.style.height = '400px';
    }
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => {
    setTimeout(resizeCanvas, 100);
});

// ==============================
// 2. 완전 호환 WebAudio BGM 엔진
// ==============================
let audioCtx;
let bgmStarted = false;
let isMuted = localStorage.getItem('lotto_muted') === 'true';

function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
        audioCtx.resume();
    }
}

function unlockAudio() {
    initAudioContext();

    // iOS용 dummy 사운드 (첫 터치 시 오디오 잠금 해제용)
    const buffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start(0);

    setTimeout(() => {
        if (audioCtx.state === "suspended") {
            audioCtx.resume();
        }
    }, 50);
}

function ensureAudioStarted() {
    if (bgmStarted) return;
    bgmStarted = true;

    initAudioContext();
    startBGM();
}

// 멜로디 데이터
const melodies = [
    {
        notes: [523.25, 659.25, 587.33, 783.99],
        pattern: [0, 1, 2, 3, 0, 1, 2, 3, 1, 3, 0, 2],
        tempo: 250,
        name: "멜로디 1"
    },
    {
        notes: [523.25, 587.33, 659.25, 698.46, 783.99, 880.00],
        pattern: [0, 2, 4, 5, 4, 2, 0, 2, 4, 5, 4, 2, 1, 3, 5, 4],
        tempo: 200,
        name: "사다리타기"
    },
    {
        notes: [659.25, 622.25, 659.25, 622.25, 659.25, 493.88, 587.33, 523.25, 440.00],
        pattern: [0, 1, 0, 1, 0, 5, 6, 7, 8, 0, 1, 7, 5, 0, 1, 0, 1, 0],
        tempo: 250,
        name: "엘리제를 위하여"
    },
    {
        notes: [523.25, 587.33, 659.25, 698.46, 783.99, 880.00],
        pattern: [0, 4, 5, 4, 2, 4, 5, 4, 1, 4, 5, 4, 3, 4, 5, 4],
        tempo: 250,
        name: "캐논"
    },
    {
        notes: [523.25, 523.25, 783.99, 783.99, 880.00, 880.00, 783.99],
        pattern: [0, 1, 2, 3, 4, 5, 6, 2, 3, 4, 5, 6],
        tempo: 300,
        name: "작은 별"
    },
    {
        notes: [659.25, 698.46, 783.99, 880.00, 987.77],
        pattern: [0, 0, 1, 2, 2, 1, 0, 3, 3, 3, 0, 0, 1, 2, 2, 1],
        tempo: 250,
        name: "환희의 송가"
    },
    {
        notes: [587.33, 659.25, 698.46, 783.99, 880.00],
        pattern: [0, 1, 2, 1, 0, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1],
        tempo: 250,
        name: "미뉴엣"
    },
    {
        notes: [523.25, 587.33, 659.25, 523.25],
        pattern: [0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 2, 3, 3, 2],
        tempo: 280,
        name: "종달새"
    }
];

// BGM 루프
function startBGM() {
    const melody = melodies[Math.floor(Math.random() * melodies.length)];
    let noteIndex = 0;
    let playing = true;
    const startTime = Date.now();

    function playNextNote() {
        if (!playing) return;
        initAudioContext();

        if (!isMuted) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc.type = "square";
            osc.frequency.value =
                melody.notes[melody.pattern[noteIndex % melody.pattern.length]];

            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(
                0.05,
                audioCtx.currentTime + 0.25
            );

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start();
            osc.stop(audioCtx.currentTime + 0.3);
        }

        noteIndex++;

        const elapsed = Date.now() - startTime;

        if (elapsed > 15000) {
            playing = false;
            setTimeout(startBGM, 800);
            return;
        }

        setTimeout(playNextNote, melody.tempo);
    }

    playNextNote();
}

// 효과음
function playGrabSound() {
    if (isMuted) return;
    initAudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
        0.01,
        audioCtx.currentTime + 0.1
    );
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.1);
}

function playSlotSound() {
    if (isMuted) return;
    initAudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 1200;
    osc.type = 'square';
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
        0.01,
        audioCtx.currentTime + 0.15
    );
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.15);
}

function playExplodeSound() {
    if (isMuted) return;
    initAudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
        50,
        audioCtx.currentTime + 0.5
    );
    osc.type = 'sawtooth';
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
        0.01,
        audioCtx.currentTime + 0.5
    );
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.5);
}

// 소리 온오프
function updateMuteBtn() {
    const btn = document.getElementById('muteBtn');
    if (!btn) return;
    if (isMuted) {
        btn.textContent = '🔇 OFF';
        btn.classList.add('muted');
    } else {
        btn.textContent = '🔊 ON';
        btn.classList.remove('muted');
    }
}

function toggleMute() {
    isMuted = !isMuted;
    localStorage.setItem('lotto_muted', isMuted);
    updateMuteBtn();
}
window.toggleMute = toggleMute;

// =====================
// 3. 게임 상태 / 데이터
// =====================
const usedNumbers = new Set();

const player = {
    x: 300,
    y: 200,
    width: 60,
    height: 45,
    speed: 7,
    hookX: 0,
    hookY: 0,
    heldBall: null,
    caughtBalls: [],
    maxBalls: 6,
    targetX: null,
    targetY: null
};

const slots = [];
const slotStartX = 30;
const slotStartY = 30;
const slotSize = 13;
const slotSpacing = 32.5;

for (let i = 0; i < 6; i++) {
    slots.push({
        x: slotStartX + (i * slotSpacing),
        y: slotStartY,
        radius: slotSize + 5,
        filled: false
    });
}

const balls = [];
const ballRadius = 10;
const gravity = 0.5;
const bounce = 0.6;
const maxActiveBalls = 100;

let isSpawning = true;
let cooldownTimer = 0;

const debris = [];

const bombZone = {
    x: canvas.width - 70,
    y: 10,
    size: 60,
    pulseSize: 0,
    pulseDirection: 1
};

const keys = {};
let touchActive = false;

// =====================
// 4. 유틸 함수들
// =====================
function randomColor() {
    const hue = Math.random() * 360;
    return `hsl(${hue}, 70%, 60%)`;
}

function getUniqueNumber() {
    if (usedNumbers.size >= 45) {
        return null;
    }
    let num;
    do {
        num = Math.floor(Math.random() * 45) + 1;
    } while (usedNumbers.has(num));
    usedNumbers.add(num);
    return num;
}

// 공 생성
function createBall() {
    const isNumberBall = Math.random() < 0.5;
    let ballNumber = null;

    if (isNumberBall) {
        ballNumber = getUniqueNumber();
        if (ballNumber === null) {
            return;
        }
    }

    balls.push({
        x: Math.random() * (canvas.width - ballRadius * 2) + ballRadius,
        y: -ballRadius,
        vx: (Math.random() - 0.5) * 3,
        vy: 0,
        radius: ballRadius,
        color: randomColor(),
        onGround: false,
        number: ballNumber,
        isNumberBall: ballNumber !== null,
        inSlot: false
    });
}

// 공 스폰 타이머
setInterval(() => {
    if (isSpawning) {
        const activeBalls = balls.filter(b => !b.inSlot).length;
        if (activeBalls < maxActiveBalls) {
            createBall();
        }
    }
}, 80);

// =====================
// 5. 입력 처리
// =====================
document.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (e.key === 'r' || e.key === 'R') {
        resetPlayerPosition();
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

function resetPlayerPosition() {
    player.x = 300;
    player.y = 200;
    player.targetX = null;
    player.targetY = null;
}

// 마우스/터치 → 캔버스 좌표 변환
function getCanvasCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;

    if (e.touches) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }

    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

// 터치 / 마우스 → 부드러운 타겟 이동
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    touchActive = true;
    const coords = getCanvasCoordinates(e);
    player.targetX = coords.x;
    player.targetY = coords.y;
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const coords = getCanvasCoordinates(e);
    player.targetX = coords.x;
    player.targetY = coords.y;
});

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    touchActive = false;
    player.targetX = null;
    player.targetY = null;
});

canvas.addEventListener('mousedown', (e) => {
    touchActive = true;
    const coords = getCanvasCoordinates(e);
    player.targetX = coords.x;
    player.targetY = coords.y;
});

canvas.addEventListener('mousemove', (e) => {
    if (e.buttons === 1) {
        const coords = getCanvasCoordinates(e);
        player.targetX = coords.x;
        player.targetY = coords.y;
    }
});

canvas.addEventListener('mouseup', () => {
    touchActive = false;
    player.targetX = null;
    player.targetY = null;
});

// =====================
// 6. 폭발 / 폭탄 처리
// =====================
function explodeAllBalls(isNuclear = false) {
    playExplodeSound();

    balls.forEach(ball => {
        if (!isNuclear && ball.inSlot) return;

        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 * i) / 8;
            debris.push({
                x: ball.inSlot ? slots[ball.slotIndex].x : ball.x,
                y: ball.inSlot ? slots[ball.slotIndex].y : ball.y,
                vx: Math.cos(angle) * (Math.random() * 3 + 2),
                vy: Math.sin(angle) * (Math.random() * 3 + 2) - 5,
                size: Math.random() * 4 + 2,
                color: ball.color,
                life: 60,
                alpha: 1
            });
        }
    });

    if (isNuclear) {
        balls.length = 0;
        player.caughtBalls.length = 0;
        player.heldBall = null;
        slots.forEach(slot => (slot.filled = false));
        usedNumbers.clear();
        luckyNumbersEl.textContent = '';
        document.getElementById('shareButtons').classList.remove('visible');
    } else {
        for (let i = balls.length - 1; i >= 0; i--) {
            if (!balls[i].inSlot) {
                if (balls[i].isNumberBall && balls[i].number) {
                    usedNumbers.delete(balls[i].number);
                }
                balls.splice(i, 1);
            }
        }
        player.heldBall = null;
    }

    isSpawning = false;
    cooldownTimer = 300;
}

function checkBombZone() {
    const px = player.x + player.width / 2;
    const py = player.y + player.height / 2;
    const bx = bombZone.x + bombZone.size / 2;
    const by = bombZone.y + bombZone.size / 2 + 5;
    const distance = Math.sqrt((px - bx) ** 2 + (py - by) ** 2);

    // 폭탄 판정 조금 좁게
    if (distance < bombZone.size / 2) {
        explodeAllBalls(true);
    }
}

// =====================
// 7. 메인 업데이트
// =====================
function update() {
    // 플레이어 이동
    if (player.targetX != null && player.targetY != null) {
        const dx = player.targetX - (player.x + player.width / 2);
        const dy = player.targetY - (player.y + player.height / 2);
        player.x += dx * 0.2;
        player.y += dy * 0.2;
    } else {
        if (keys['ArrowUp']) player.y -= player.speed;
        if (keys['ArrowDown']) player.y += player.speed;
        if (keys['ArrowLeft']) player.x -= player.speed;
        if (keys['ArrowRight']) player.x += player.speed;
    }

    // 화면 경계
    if (player.x < -10) player.x = -10;
    if (player.y < 0) player.y = 0;
    if (player.x + player.width > canvas.width) {
        player.x = canvas.width - player.width;
    }
    if (player.y + player.height > canvas.height) {
        player.y = canvas.height - player.height;
    }

    // 훅 위치
    player.hookX = player.x + player.width / 2 + 10;
    player.hookY = player.y + player.height + 1;

    // 공 업데이트
    for (let i = balls.length - 1; i >= 0; i--) {
        const ball = balls[i];

        if (ball.inSlot) continue;

        // 플레이어가 들고 있을 때
        if (player.heldBall === ball) {
            ball.x = player.hookX;
            ball.y = player.hookY;
            ball.vx = 0;
            ball.vy = 0;
            ball.onGround = false;

            // 슬롯 체크
            for (let s = 0; s < slots.length; s++) {
                const slot = slots[s];
                const dist = Math.sqrt((ball.x - slot.x) ** 2 + (ball.y - slot.y) ** 2);

                if (dist < slot.radius && player.caughtBalls.length < player.maxBalls) {
                    const emptySlotIndex = player.caughtBalls.length;
                    if (emptySlotIndex < 6) {
                        ball.inSlot = true;
                        ball.slotIndex = emptySlotIndex;
                        player.caughtBalls.push(ball);
                        player.heldBall = null;
                        slots[emptySlotIndex].filled = true;
                        playSlotSound();

                        if (player.caughtBalls.length === 6) {
                            updateLuckyNumbers();
                        }
                        break;
                    }
                }
            }

            continue;
        }

        // 중력 & 이동
        if (!ball.onGround) {
            ball.vy += gravity;
            ball.x += ball.vx;
            ball.y += ball.vy;

            // 바닥
            if (ball.y + ball.radius >= canvas.height) {
                ball.y = canvas.height - ball.radius;
                ball.vy *= -bounce;
                ball.vx *= 0.95;

                if (Math.abs(ball.vy) < 1) {
                    ball.onGround = true;
                    ball.vy = 0;
                }
            }

            // 좌우 벽
            if (ball.x - ball.radius < 0 || ball.x + ball.radius > canvas.width) {
                ball.vx *= -1;
                ball.x =
                    ball.x < canvas.width / 2
                        ? ball.radius
                        : canvas.width - ball.radius;
            }
        }

        // 훅에 잡히는 조건
        const hookDist = Math.sqrt(
            (ball.x - player.hookX) ** 2 + (ball.y - player.hookY) ** 2
        );
        if (
            hookDist < ball.radius + 25 &&
            !player.heldBall &&
            ball.isNumberBall &&
            ball.onGround
        ) {
            player.heldBall = ball;
            playGrabSound();
        }

        // 우산 반사
        const umbrellaTop = player.y;
        const umbrellaBottom = player.y + 35;
        const umbrellaLeft = player.x + 5;
        const umbrellaRight = player.x + player.width - 5;

        if (
            ball.y - ball.radius < umbrellaBottom &&
            ball.y + ball.radius > umbrellaTop &&
            ball.x + ball.radius > umbrellaLeft &&
            ball.x - ball.radius < umbrellaRight &&
            player.heldBall !== ball
        ) {
            const bounceAngle =
                ((ball.x - player.x) / player.width - 0.5) * Math.PI * 0.8;
            ball.vx = Math.sin(bounceAngle) * 20;
            ball.vy = -Math.abs(Math.cos(bounceAngle)) * 20;
            ball.color = randomColor();
            ball.onGround = false;
            ball.y = umbrellaBottom + ball.radius;
        }
    }

    // 공-공 충돌
    const activeBalls = balls.filter(b => !b.inSlot);
    for (let i = 0; i < activeBalls.length; i++) {
        for (let j = i + 1; j < activeBalls.length; j++) {
            const ball1 = activeBalls[i];
            const ball2 = activeBalls[j];

            const dx = ball2.x - ball1.x;
            const dy = ball2.y - ball1.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const minDist = ball1.radius + ball2.radius;

            if (distance < minDist && distance > 0) {
                const angle = Math.atan2(dy, dx);
                const sin = Math.sin(angle);
                const cos = Math.cos(angle);

                const overlap = minDist - distance;
                const moveX = (overlap / 2) * cos;
                const moveY = (overlap / 2) * sin;

                ball1.x -= moveX;
                ball1.y -= moveY;
                ball2.x += moveX;
                ball2.y += moveY;

                const vx1 = ball1.vx * cos + ball1.vy * sin;
                const vy1 = ball1.vy * cos - ball1.vx * sin;
                const vx2 = ball2.vx * cos + ball2.vy * sin;
                const vy2 = ball2.vy * cos - ball2.vx * sin;

                ball1.vx = vx2 * cos - vy1 * sin;
                ball1.vy = vy1 * cos + vx2 * sin;
                ball2.vx = vx1 * cos - vy2 * sin;
                ball2.vy = vy2 * cos + vx1 * sin;

                if (Math.abs(ball1.vy) > 0.5) ball1.onGround = false;
                if (Math.abs(ball2.vy) > 0.5) ball2.onGround = false;
            }
        }
    }

    // 잔해 업데이트
    for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i];
        d.vy += gravity * 0.3;
        d.x += d.vx;
        d.y += d.vy;
        d.life--;
        d.alpha = d.life / 60;

        if (d.life <= 0 || d.y > canvas.height) {
            debris.splice(i, 1);
        }
    }

    // 화면이 공으로 너무 꽉 찼으면 자동 폭발
    const screenArea = canvas.width * canvas.height;
    const ballsArea = activeBalls.length * Math.PI * ballRadius * ballRadius;
    const fillRatio = ballsArea / screenArea;
    if (fillRatio > 0.7) {
        explodeAllBalls();
    }

    if (cooldownTimer > 0) {
        cooldownTimer--;
        if (cooldownTimer === 0) {
            isSpawning = true;
        }
    }

    checkBombZone();

    bombZone.pulseSize += bombZone.pulseDirection * 0.5;
    if (bombZone.pulseSize > 10 || bombZone.pulseSize < 0) {
        bombZone.pulseDirection *= -1;
    }
}

// =====================
// 8. 렌더링
// =====================
function render() {
    ctx.fillStyle = 'rgba(26, 26, 46, 0.15)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 배경 격자
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 50) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 50) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
    }

    // 우산 (플레이어)
    const centerX = player.x + player.width / 2;
    const topY = player.y;
    const umbrellaRadius = player.width / 2;

    const colors = ['#FF6B6B', '#FFA07A', '#FFD93D', '#6BCB77', '#4D96FF', '#9D84B7', '#FF8AAE', '#FFB347'];
    for (let i = 0; i < 8; i++) {
        const startAngle = Math.PI + (Math.PI * i) / 8;
        const endAngle = Math.PI + (Math.PI * (i + 1)) / 8;

        ctx.fillStyle = colors[i];
        ctx.beginPath();
        ctx.moveTo(centerX, topY);
        ctx.arc(centerX, topY, umbrellaRadius, startAngle, endAngle);
        ctx.closePath();
        ctx.fill();
    }

    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, topY, umbrellaRadius, Math.PI, 0, false);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
        const angle = Math.PI + (Math.PI * i) / 8;
        const x = centerX + Math.cos(angle) * umbrellaRadius;
        const y = topY + Math.sin(angle) * umbrellaRadius;
        ctx.beginPath();
        ctx.moveTo(centerX, topY);
        ctx.lineTo(x, y);
        ctx.stroke();
    }

    // 손잡이
    ctx.strokeStyle = '#6B4423';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(centerX, topY);
    ctx.lineTo(centerX, player.y + player.height);
    ctx.stroke();

    // 훅
    const hookStartY = player.y + player.height;
    ctx.beginPath();
    ctx.moveTo(centerX, hookStartY);
    ctx.lineTo(centerX, hookStartY + 5);
    ctx.lineTo(centerX + 18, hookStartY + 5);
    ctx.lineTo(centerX + 18, hookStartY - 5);
    ctx.stroke();

    // 슬롯
    for (let i = 0; i < 6; i++) {
        const slotX = slots[i].x;
        const slotY = slots[i].y;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(slotX, slotY, slotSize, 0, Math.PI * 2);
        ctx.stroke();

        if (i < player.caughtBalls.length) {
            const slotBall = player.caughtBalls[i];
            ctx.fillStyle = slotBall.color;
            ctx.beginPath();
            ctx.arc(slotX, slotY, slotSize - 2, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'white';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeText(slotBall.number, slotX, slotY);
            ctx.fillText(slotBall.number, slotX, slotY);
        }
    }

    // 공
    balls.forEach(ball => {
        if (ball.inSlot) return;

        if (player.heldBall !== ball) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.beginPath();
            ctx.arc(ball.x + 3, ball.y + 3, ball.radius, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = ball.color;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(ball.x - ball.radius * 0.3, ball.y - ball.radius * 0.3, ball.radius * 0.4, 0, Math.PI * 2);
        ctx.fill();

        if (ball.isNumberBall) {
            ctx.fillStyle = 'white';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeText(ball.number, ball.x, ball.y);
            ctx.fillText(ball.number, ball.x, ball.y);
        }
    });

    // 잔해
    debris.forEach(d => {
        ctx.globalAlpha = d.alpha;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;

    // 폭탄
    const bx = bombZone.x + bombZone.size / 2;
    const by = bombZone.y + bombZone.size / 2;

    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(bx, by + 5, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, by - 20);
    ctx.lineTo(bx - 5, by - 32);
    ctx.stroke();

    ctx.fillStyle = '#ff4400';
    ctx.beginPath();
    ctx.arc(bx - 5, by - 32, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffaa00';
    ctx.beginPath();
    ctx.arc(bx - 5, by - 32, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(bx, by + 5, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(bx, by + 5, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#000';
    for (let i = 0; i < 3; i++) {
        const angle = (Math.PI * 2 / 3) * i - Math.PI / 2;
        ctx.save();
        ctx.translate(bx, by + 5);
        ctx.rotate(angle);

        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(-7, -16);
        ctx.arc(0, -16, 7, Math.PI, 0, false);
        ctx.lineTo(7, -16);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    ctx.strokeStyle = `rgba(255, 50, 50, ${0.5 - bombZone.pulseSize / 30})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(bx, by + 5, 30 + bombZone.pulseSize, 0, Math.PI * 2);
    ctx.stroke();

    // 쿨다운 타이머
    if (cooldownTimer > 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.ceil(cooldownTimer / 60)}`, canvas.width / 2, canvas.height / 2);
        ctx.font = '20px Arial';
        ctx.fillText('초 후 재시작...', canvas.width / 2, canvas.height / 2 + 40);
    }
}

// =====================
// 9. 로또 번호 / 공유
// =====================
function updateLuckyNumbers() {
    const numbers = player.caughtBalls
        .map(ball => ball.number)
        .sort((a, b) => a - b)
        .join(', ');
    luckyNumbersEl.textContent = numbers;
    if (player.caughtBalls.length === 6) {
        document.getElementById('shareButtons').classList.add('visible');
    }
}

function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            alert('✅ 복사되었습니다!\n친구들에게 공유해보세요!');
        });
    } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        alert('✅ 복사되었습니다!\n친구들에게 공유해보세요!');
    }
}

window.shareKakao = function () {
    if (player.caughtBalls.length < 6) {
        alert('6개의 번호를 모두 모아주세요!');
        return;
    }

    const numbers = player.caughtBalls
        .map(ball => ball.number)
        .sort((a, b) => a - b)
        .join(', ');
    const text =
        `🍀 행운수집기로 뽑은 내 행운 번호!\n${numbers}\n\n당신도 행운을 만들어보세요!`;

    if (navigator.share) {
        navigator
            .share({
                title: '🎮 행운수집기',
                text: text,
                url: window.location.href
            })
            .catch(() => {
                copyToClipboard(text + '\n' + window.location.href);
            });
    } else {
        copyToClipboard(text + '\n' + window.location.href);
    }
};

window.shareTwitter = function () {
    if (player.caughtBalls.length < 6) {
        alert('6개의 번호를 모두 모아주세요!');
        return;
    }

    const numbers = player.caughtBalls
        .map(ball => ball.number)
        .sort((a, b) => a - b)
        .join(', ');
    const text =
        `🍀 행운수집기로 뽑은 내 행운 번호!\n${numbers}\n당신도 행운을 만들어보세요!`;
    const url =
        `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.href)}`;
    window.open(url, '_blank');
};

window.shareFacebook = function () {
    if (player.caughtBalls.length < 6) {
        alert('6개의 번호를 모두 모아주세요!');
        return;
    }
    const url =
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`;
    window.open(url, '_blank');
};

window.copyLink = function () {
    if (player.caughtBalls.length < 6) {
        alert('6개의 번호를 모두 모아주세요!');
        return;
    }

    const numbers = player.caughtBalls
        .map(ball => ball.number)
        .sort((a, b) => a - b)
        .join(', ');
    const text =
        `🍀 행운수집기로 뽑은 내 행운 번호!\n${numbers}\n\n${window.location.href}`;
    copyToClipboard(text);
};

// =====================
// 10. 오디오 해제 + BGM 시작 트리거
// =====================
["touchstart", "touchend", "mousedown", "click", "pointerdown"].forEach(evt => {
    window.addEventListener(
        evt,
        () => {
            unlockAudio();
            ensureAudioStarted();
        },
        { once: true, passive: true }
    );
});

// =====================
// 11. 메인 루프
// =====================
function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

// 뮤트 버튼 초기화 + 모바일 터치 직접 처리
(function () {
    updateMuteBtn();
    const btn = document.getElementById('muteBtn');
    if (!btn) return;
    btn.addEventListener('touchend', function (e) {
        e.preventDefault();
        toggleMute();
    }, { passive: false });
})();

gameLoop();
