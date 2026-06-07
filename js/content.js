// ===========================
// 내 번호 기록 (localStorage)
// ===========================

function getBallClass(n) {
    if (n <= 10) return 'b1';
    if (n <= 20) return 'b2';
    if (n <= 30) return 'b3';
    if (n <= 40) return 'b4';
    return 'b5';
}

function renderBall(n, extra) {
    const cls = extra || '';
    return `<span class="ball ${getBallClass(n)} ${cls}">${n}</span>`;
}

function saveHistory(numbers) {
    const history = JSON.parse(localStorage.getItem('lotto_history') || '[]');
    const today = new Date().toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
    history.unshift({ date: today, numbers: [...numbers].sort((a, b) => a - b) });
    if (history.length > 20) history.pop();
    localStorage.setItem('lotto_history', JSON.stringify(history));
    renderHistory();
    updateCompare();
}

let historyExpanded = false;

function renderHistory() {
    const el = document.getElementById('historyList');
    if (!el) return;
    const history = JSON.parse(localStorage.getItem('lotto_history') || '[]');

    if (history.length === 0) {
        el.innerHTML = '<p class="empty-msg">아직 뽑은 번호가 없어요.<br>게임을 플레이해보세요!</p>';
        document.getElementById('historyToggle').style.display = 'none';
        return;
    }

    const showCount = historyExpanded ? history.length : Math.min(5, history.length);
    const toggleBtn = document.getElementById('historyToggle');

    el.innerHTML = history.slice(0, showCount).map(item => `
        <div class="history-item">
            <span class="history-date">${item.date}</span>
            <div class="history-balls">
                ${item.numbers.map(n => renderBall(n)).join('')}
            </div>
        </div>
    `).join('');

    if (history.length > 5) {
        toggleBtn.style.display = 'block';
        toggleBtn.textContent = historyExpanded ? '접기 ▲' : `더 보기 (${history.length - 5}개) ▼`;
    } else {
        toggleBtn.style.display = 'none';
    }
}

function toggleHistory() {
    historyExpanded = !historyExpanded;
    renderHistory();
}

function clearHistory() {
    if (!confirm('기록을 모두 삭제할까요?')) return;
    localStorage.removeItem('lotto_history');
    renderHistory();
    document.getElementById('myNumberCompare').style.display = 'none';
}

// ===========================
// 번호 통계 (역대 출현 빈도)
// ===========================

// 역대 로또 당첨번호 출현 횟수 (1~1149회 집계, 2024년 기준 근사값)
const FREQ = {
    1:156,2:165,3:163,4:157,5:160,6:166,7:175,8:162,9:155,10:174,
    11:176,12:172,13:168,14:170,15:178,16:164,17:171,18:180,19:159,20:173,
    21:177,22:169,23:183,24:158,25:185,26:167,27:174,28:179,29:161,30:176,
    31:182,32:170,33:188,34:163,35:175,36:184,37:166,38:178,39:160,40:172,
    41:186,42:165,43:179,44:158,45:162
};

let currentTab = 'hot';

function showStats(type) {
    currentTab = type;
    document.querySelectorAll('.tab-btn').forEach((btn, i) => {
        btn.classList.toggle('active', (i === 0 && type === 'hot') || (i === 1 && type === 'cold'));
    });
    renderStats(type);
}

function renderStats(type) {
    const el = document.getElementById('statsChart');
    if (!el) return;

    const sorted = Object.entries(FREQ)
        .map(([n, c]) => ({ n: +n, c }))
        .sort((a, b) => type === 'hot' ? b.c - a.c : a.c - b.c)
        .slice(0, 10);

    const max = sorted[0].c;

    el.innerHTML = sorted.map(({ n, c }) => `
        <div class="stat-row">
            <div class="stat-num ball ${getBallClass(n)}">${n}</div>
            <div class="stat-bar-wrap">
                <div class="stat-bar ${type === 'cold' ? 'cold' : ''}"
                     style="width:${Math.round(c / max * 100)}%"></div>
            </div>
            <span class="stat-count">${c}회</span>
        </div>
    `).join('');
}

// ===========================
// 최신 당첨번호 (동행복권 API)
// ===========================

async function fetchLatestLotto() {
    const el = document.getElementById('latestResult');
    if (!el) return;

    // 현재 회차 추정 (2002-12-07 1회차 기준, 토요일 추첨 후 반영)
    const start = new Date('2002-12-07');
    const now = new Date();
    let round = Math.floor((now - start) / (7 * 24 * 60 * 60 * 1000)) + 1;
    // 토요일 20:45 이전이면 아직 이번 주 미추첨 → 전 회차
    const day = now.getDay();
    const hour = now.getHours();
    if (day < 6 || (day === 6 && hour < 21)) round -= 1;

    // CORS 우회: 공개 프록시 사용
    const apiUrl = `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${round}`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}`;

    try {
        const res = await fetch(proxyUrl);
        const wrapper = await res.json();
        const data = JSON.parse(wrapper.contents);

        if (data.returnValue !== 'success') throw new Error();

        const nums = [data.drwtNo1, data.drwtNo2, data.drwtNo3, data.drwtNo4, data.drwtNo5, data.drwtNo6];
        const bonus = data.bnusNo;
        const prize = Math.round(data.firstWinamnt / 100000000 * 10) / 10;

        el.innerHTML = `
            <p class="latest-round">제 ${data.drwNo}회 (${data.drwNoDate})</p>
            <div class="latest-balls">
                ${nums.map(n => renderBall(n)).join('')}
                <span style="color:#555;font-size:18px;margin:0 4px">+</span>
                ${renderBall(bonus, 'ball-bonus')}
            </div>
            <div class="latest-prize">
                <div class="prize-item">1등 당첨자<strong>${data.firstPrzwnerCo}명</strong></div>
                <div class="prize-item">1등 당첨금<strong>${prize}억 원</strong></div>
            </div>
        `;

        window._latestNums = nums;
        window._latestBonus = bonus;
        updateCompare();

    } catch {
        el.innerHTML = `<p class="loading-msg">당첨번호를 불러올 수 없어요.<br>잠시 후 다시 확인해주세요.</p>`;
    }
}

function updateCompare() {
    const compareArea = document.getElementById('myNumberCompare');
    const compareResult = document.getElementById('compareResult');
    if (!compareArea || !compareResult) return;

    const history = JSON.parse(localStorage.getItem('lotto_history') || '[]');
    if (!history.length || !window._latestNums) return;

    const myNums = history[0].numbers;
    const matched = myNums.filter(n => window._latestNums.includes(n));
    const bonusMatch = myNums.includes(window._latestBonus);

    let rank = '낙첨';
    if (matched.length === 6) rank = '🎉 1등!';
    else if (matched.length === 5 && bonusMatch) rank = '🥈 2등!';
    else if (matched.length === 5) rank = '🥉 3등!';
    else if (matched.length === 4) rank = '4등 (5만원)';
    else if (matched.length === 3) rank = '5등 (5천원)';

    compareArea.style.display = 'block';
    compareResult.innerHTML = `
        <div class="history-balls" style="justify-content:center;margin-bottom:8px">
            ${myNums.map(n => `<span class="ball ${getBallClass(n)}" style="${window._latestNums.includes(n) ? 'outline:2px solid #fff' : 'opacity:0.35'}">${n}</span>`).join('')}
        </div>
        <p style="margin:0;color:${matched.length >= 3 ? '#f0ad00' : '#666'};font-size:15px">${rank} · ${matched.length}개 일치</p>
    `;
}

// ===========================
// D-day 카운트다운
// ===========================

function renderDday() {
    const el = document.getElementById('ddayCount');
    const dateEl = document.getElementById('ddayDate');
    if (!el) return;

    const now = new Date();
    const day = now.getDay(); // 0=일, 6=토
    const daysUntilSat = day === 6 ? 7 : (6 - day);
    const next = new Date(now);
    next.setDate(now.getDate() + daysUntilSat);
    next.setHours(20, 45, 0, 0);

    const diff = next - now;
    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    el.textContent = d > 0 ? `D-${d}` : `${h}시간 ${m}분`;

    const dateStr = next.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
    if (dateEl) dateEl.textContent = `추첨일: ${dateStr} 오후 8시 45분`;
}

// ===========================
// game.js 연동 — 번호 완성 시 저장
// ===========================

// game.js의 슬롯 완성 이벤트를 감지해 기록 저장
const _origDispatch = EventTarget.prototype.dispatchEvent;
window.addEventListener('lottoComplete', e => {
    if (e.detail && e.detail.numbers) {
        saveHistory(e.detail.numbers);
    }
});

// ===========================
// 초기화
// ===========================

document.addEventListener('DOMContentLoaded', () => {
    renderHistory();
    renderStats('hot');
    fetchLatestLotto();
    renderDday();
    setInterval(renderDday, 60000);
});
