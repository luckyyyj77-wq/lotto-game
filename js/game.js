// =========================
// 1. 캔버스 / 기본 DOM 셋업
// =========================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const luckyNumbersEl = document.getElementById('luckyNumbers');
const { gravity, bounce, ballRadius, collideBalls } = LottoPhysics;

// 모바일에서 window.innerWidth는 넘치는 콘텐츠만큼 커지므로 레이아웃 폭(clientWidth)을 쓴다
const viewportWidth = () => document.documentElement.clientWidth || window.innerWidth;
const viewportHeight = () => document.documentElement.clientHeight || window.innerHeight;

let isMobile = viewportWidth() <= 768;
let displayScale = 1; // 화면 표시 폭 / 캔버스 내부 폭(600)

// 캔버스 리사이즈 — UI 높이 빼고 캔버스 맞춤
function resizeCanvas() {
    const vw = viewportWidth();
    const vh = viewportHeight();
    isMobile = vw <= 768;

    // 모바일: 헤더(44)+번호(32)+공유버튼(44)+스크롤힌트(28)+여유(12) = 160
    // PC:     헤더(52)+번호(40)+공유버튼(52)+스크롤힌트(28)+여유(12) = 184
    const uiH = isMobile ? 160 : 184;
    const available = vh - uiH;

    // 게임마다 캔버스 비율이 다르다 (수집 게임 가로 600x400, 핀볼 세로 400x600)
    const ratio = canvas.width / canvas.height;
    const minH = ratio < 1 ? 360 : 160;
    const maxW = isMobile ? vw : Math.min(600, vw - 32);
    const aspectH = Math.round(maxW / ratio);
    const finalH = Math.max(minH, Math.min(aspectH, available));
    const finalW = Math.round(finalH * ratio);

    canvas.style.width = finalW + 'px';
    canvas.style.height = finalH + 'px';
    displayScale = finalW / canvas.width;
}

// 게임 화면이 보이는 동안에만 방향키 조작·BGM을 적용한다 (아래 콘텐츠를 읽는 중에는 방해하지 않도록)
function isCanvasInView() {
    const rect = canvas.getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    return center > 0 && center < window.innerHeight;
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
let isMuted = false;
try {
    isMuted = localStorage.getItem('lotto_muted') === 'true';
} catch { /* 저장소를 쓸 수 없는 브라우저 — 기본값 사용 */ }

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

        if (!isMuted && !document.hidden && isCanvasInView()) {
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
    try {
        localStorage.setItem('lotto_muted', isMuted);
    } catch { /* 저장소를 쓸 수 없는 브라우저 — 이번 방문에만 적용 */ }
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
const slotCatchRadius = 30; // 맨 위에서 훅과 슬롯 높이 차가 16이므로, 좌우로 약 ±25 안에서 들어간다

for (let i = 0; i < 6; i++) {
    slots.push({
        x: slotStartX + (i * slotSpacing),
        y: slotStartY,
        radius: slotCatchRadius,
        filled: false
    });
}

const balls = [];
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
const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
let hasGrabbedBall = false; // 첫 공을 잡기 전까지 조작 안내 표시
let bombArmed = true;       // 폭탄에서 벗어나야 다시 터진다

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
    if (isSpawning && currentGame === games.collector) {
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
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (ARROW_KEYS.has(e.key)) {
        if (!isCanvasInView()) return; // 콘텐츠를 읽는 중에는 원래대로 스크롤
        e.preventDefault();
    }
    keys[e.key] = true;
    // 버튼·링크에 초점이 있으면 스페이스·엔터는 그 요소의 동작으로 둔다
    const onControl = e.target.closest && e.target.closest('button, a, input, select, textarea');
    if (currentGame.onKey && !onControl && isCanvasInView() && !e.repeat) {
        if (currentGame.onKey(e.key)) e.preventDefault();
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

// 터치 / 마우스 입력은 현재 게임으로 넘긴다
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    currentGame.pointerDown(getCanvasCoordinates(e));
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    currentGame.pointerMove(getCanvasCoordinates(e));
});

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    currentGame.pointerUp();
});

canvas.addEventListener('mousedown', (e) => {
    currentGame.pointerDown(getCanvasCoordinates(e));
});

canvas.addEventListener('mousemove', (e) => {
    if (e.buttons === 1) {
        currentGame.pointerMove(getCanvasCoordinates(e));
    }
});

// 캔버스 밖에서 버튼을 놓아도 드래그가 끝나도록 window에서 받는다
window.addEventListener('mouseup', () => {
    currentGame.pointerUp();
});

// =====================
// 6. 폭발 / 폭탄 처리
// =====================
function explodeAllBalls() {
    playExplodeSound();

    balls.forEach(ball => {
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

    balls.length = 0;
    player.caughtBalls.length = 0;
    player.heldBall = null;
    slots.forEach(slot => (slot.filled = false));
    usedNumbers.clear();
    syncResultUI();

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
    const onBomb = distance < bombZone.size / 2;
    if (onBomb && bombArmed) {
        explodeAllBalls();
    }
    bombArmed = !onBomb;
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
                            announceNumbers();
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
            hasGrabbedBall = true;
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

            if (collideBalls(ball1, ball2)) {
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
// 작은 화면에서도 읽히도록 표시 크기에 맞춘 글꼴 (캔버스 내부 좌표 기준 px)
function scaledFont(displayPx, maxPx) {
    return `bold ${Math.round(Math.min(maxPx, displayPx / displayScale))}px Arial`;
}

function renderHint() {
    let lines = null;
    if (!hasGrabbedBall) {
        lines = ['바닥의 번호 공에 우산 갈고리를 대고', '왼쪽 위 칸으로 옮기세요 · 폭탄은 다시 시작'];
    } else if (player.caughtBalls.length === player.maxBalls) {
        lines = ['번호 완성! 아래에 저장됐어요', '폭탄에 닿으면 새 번호를 뽑을 수 있어요'];
    }
    if (!lines || cooldownTimer > 0) return;

    ctx.font = scaledFont(12, 20);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    lines.forEach((line, i) => {
        const y = canvas.height / 2 + (i - 0.5) * 28;
        ctx.strokeText(line, canvas.width / 2, y);
        ctx.fillText(line, canvas.width / 2, y);
    });
}

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
            ctx.font = scaledFont(11, 15);
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
            ctx.font = scaledFont(11, 15);
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

    renderHint();
}

// =====================
// 9. 로또 번호 / 공유
// =====================
// 현재 게임의 완성 번호를 화면에 반영한다 (게임을 바꿀 때도 호출)
function syncResultUI() {
    const numbers = currentGame.getNumbers();
    luckyNumbersEl.textContent = numbers ? numbers.join(', ') : '';
    document.getElementById('shareButtons').classList.toggle('visible', !!numbers);
}

// 6개 완성 시 호출 — 표시를 갱신하고 기록으로 넘긴다
function announceNumbers() {
    syncResultUI();
    window.dispatchEvent(new CustomEvent('lottoComplete', {
        detail: { numbers: currentGame.getNumbers() }
    }));
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

// 공유할 번호 문자열. 아직 6개가 안 됐으면 안내 후 null
function numbersForShare() {
    const numbers = currentGame.getNumbers();
    if (!numbers) {
        alert('6개의 번호를 모두 모아주세요!');
        return null;
    }
    return numbers.join(', ');
}

window.shareNumbers = function () {
    const numbers = numbersForShare();
    if (!numbers) return;
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
    const numbers = numbersForShare();
    if (!numbers) return;
    const text =
        `🍀 행운수집기로 뽑은 내 행운 번호!\n${numbers}\n당신도 행운을 만들어보세요!`;
    const url =
        `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.href)}`;
    window.open(url, '_blank');
};

window.copyLink = function () {
    const numbers = numbersForShare();
    if (!numbers) return;
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
// 11. 게임 목록 / 전환
// =====================
// 각 게임은 width·height(캔버스 크기), update·render, 입력 처리, getNumbers를 제공한다.
// 다른 게임은 js/pinball.js처럼 스크립트에서 games에 추가한다.
const games = {
    collector: {
        name: '공 수집',
        width: 600,
        height: 400,
        update,
        render,
        pointerDown(coords) {
            player.targetX = coords.x;
            player.targetY = coords.y;
        },
        pointerMove(coords) {
            player.targetX = coords.x;
            player.targetY = coords.y;
        },
        pointerUp() {
            player.targetX = null;
            player.targetY = null;
        },
        onKey(key) {
            if (key === 'r' || key === 'R') resetPlayerPosition();
            return false;
        },
        getNumbers() {
            if (player.caughtBalls.length < player.maxBalls) return null;
            return player.caughtBalls.map(ball => ball.number).sort((a, b) => a - b);
        }
    }
};
let currentGame = games.collector;

window.switchGame = function () {
    const list = Object.values(games);
    currentGame.pointerUp();
    Object.keys(keys).forEach(key => { keys[key] = false; });

    currentGame = list[(list.indexOf(currentGame) + 1) % list.length];
    canvas.width = currentGame.width;
    canvas.height = currentGame.height;
    resizeCanvas();
    syncResultUI();
    updateSwitchBtn();

    // 버튼에 초점이 남으면 스페이스가 게임 대신 버튼을 다시 누른다
    const btn = document.getElementById('gameSwitchBtn');
    if (btn) btn.blur();
};

function updateSwitchBtn() {
    const btn = document.getElementById('gameSwitchBtn');
    if (!btn) return;
    const list = Object.values(games);
    const next = list[(list.indexOf(currentGame) + 1) % list.length];
    btn.setAttribute('aria-label', `게임 바꾸기: ${next.name} 게임으로`);
    btn.title = `${next.name} 게임으로 바꾸기`;
}

// =====================
// 12. 메인 루프
// =====================
// 물리는 초당 60회 고정 — 화면 주사율(120Hz 등)과 무관하게 같은 속도로 동작
const STEP_MS = 1000 / 60;
const MAX_FRAME_MS = 100; // 탭 복귀 등 긴 공백을 한꺼번에 처리하지 않도록 제한
let lastFrameTime = null;
let stepBacklog = 0;

function gameLoop(time) {
    if (lastFrameTime === null) lastFrameTime = time;
    stepBacklog += Math.min(time - lastFrameTime, MAX_FRAME_MS);
    lastFrameTime = time;

    while (stepBacklog >= STEP_MS) {
        currentGame.update();
        stepBacklog -= STEP_MS;
    }
    currentGame.render();
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

requestAnimationFrame(gameLoop);
