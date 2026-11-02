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

function loadHistory() {
    try {
        const history = JSON.parse(localStorage.getItem('lotto_history') || '[]');
        return Array.isArray(history) ? history : [];
    } catch {
        return [];
    }
}

function saveHistory(numbers) {
    const history = loadHistory();
    const now = new Date();
    history.unshift({
        date: now.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }),
        round: purchaseRound(now.getTime()),
        numbers: [...numbers].sort((a, b) => a - b)
    });
    if (history.length > 20) history.pop();
    try {
        localStorage.setItem('lotto_history', JSON.stringify(history));
    } catch { /* 저장소를 쓸 수 없는 브라우저 — 기록 없이 게임만 진행 */ }
    renderHistory();
    updateCompare();
}

let historyExpanded = false;

function renderHistory() {
    const el = document.getElementById('historyList');
    if (!el) return;
    const history = loadHistory();

    if (history.length === 0) {
        el.innerHTML = '<p class="empty-msg">아직 뽑은 번호가 없어요.<br>게임을 플레이해보세요!</p>';
        document.getElementById('historyToggle').style.display = 'none';
        return;
    }

    const showCount = historyExpanded ? history.length : Math.min(5, history.length);
    const toggleBtn = document.getElementById('historyToggle');

    el.innerHTML = history.slice(0, showCount).map(item => `
        <div class="history-item">
            <span class="history-date">${item.date}${item.round ? ` · 제 ${item.round}회 대상` : ''}</span>
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
    try {
        localStorage.removeItem('lotto_history');
    } catch { /* 저장소를 쓸 수 없는 브라우저 */ }
    renderHistory();
    document.getElementById('myNumberCompare').style.display = 'none';
}

// ===========================
// 번호 통계 (data/stats.json — 전 회차 본번호 집계)
// ===========================

let lottoStats = null;
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
    if (!el || !lottoStats) return;

    const all = Object.entries(lottoStats.counts).map(([n, c]) => ({ n: +n, c }));
    const max = Math.max(...all.map(item => item.c));
    const sorted = all
        .sort((a, b) => type === 'hot' ? b.c - a.c : a.c - b.c)
        .slice(0, 10);

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

async function fetchStats() {
    const el = document.getElementById('statsChart');
    const note = document.getElementById('statsNote');
    if (!el) return;
    try {
        const res = await fetch('./data/stats.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error(res.status);
        lottoStats = await res.json();
    } catch {
        el.innerHTML = '<p class="loading-msg">통계를 불러올 수 없어요.<br>잠시 후 다시 확인해주세요.</p>';
        return;
    }
    renderStats(currentTab);
    if (note) {
        note.textContent = `* 1회 ~ ${lottoStats.lastRound}회(${lottoStats.lastDate}) 본번호 기준, 보너스 번호 제외`;
    }
}

// ===========================
// 최신 당첨번호 (data/latest.json — GitHub Actions가 갱신)
// ===========================

async function fetchLatestLotto() {
    const el = document.getElementById('latestResult');
    if (!el) return;

    let data = null;
    try {
        const res = await fetch('./data/latest.json', { cache: 'no-cache' });
        if (res.ok) {
            const json = await res.json();
            if (json.returnValue === 'success') data = json;
        }
    } catch { /* 아래에서 안내 문구 표시 */ }

    if (!data) {
        el.innerHTML = `<p class="loading-msg">당첨번호를 불러올 수 없어요.<br>잠시 후 다시 확인해주세요.</p>`;
        return;
    }

    const nums = [data.drwtNo1, data.drwtNo2, data.drwtNo3, data.drwtNo4, data.drwtNo5, data.drwtNo6];
    const bonus = data.bnusNo;
    const prize = Math.round(data.firstWinamnt / 100000000 * 10) / 10;
    // 당첨자가 0이면 1등 정보를 수집하지 못한 경우로 본다
    const hasPrize = data.firstPrzwnerCo > 0;
    const expected = latestDrawnRound(Date.now());

    el.innerHTML = `
        <p class="latest-round">제 ${data.drwNo}회 (${data.drwNoDate})</p>
        <div class="latest-balls">
            ${nums.map(n => renderBall(n)).join('')}
            <span style="color:#555;font-size:18px;margin:0 4px">+</span>
            ${renderBall(bonus, 'ball-bonus')}
        </div>
        <div class="latest-prize">
            <div class="prize-item">1등 당첨자<strong>${hasPrize ? `${data.firstPrzwnerCo}명` : '—'}</strong></div>
            <div class="prize-item">1등 당첨금<strong>${hasPrize ? `${prize}억 원` : '—'}</strong></div>
        </div>
        ${data.drwNo < expected ? `<p class="stale-note">제 ${expected}회 결과는 아직 반영되지 않았어요. 잠시 후 다시 확인해주세요.</p>` : ''}
    `;

    window._latestRound = data.drwNo;
    window._latestNums = nums;
    window._latestBonus = bonus;
    updateCompare();
}

function getRank(matchCount, bonusMatch) {
    if (matchCount === 6) return '🎉 1등!';
    if (matchCount === 5 && bonusMatch) return '🥈 2등!';
    if (matchCount === 5) return '🥉 3등!';
    if (matchCount === 4) return '4등 (5만원)';
    if (matchCount === 3) return '5등 (5천원)';
    return '낙첨';
}

function updateCompare() {
    const compareArea = document.getElementById('myNumberCompare');
    const compareResult = document.getElementById('compareResult');
    if (!compareArea || !compareResult) return;

    const history = loadHistory();
    if (!history.length || !window._latestNums) return;

    const countMatches = item => item.numbers.filter(n => window._latestNums.includes(n)).length;
    // 이번 회차 추첨 전에 뽑은 번호만 등수를 매긴다. 없으면 최근 기록들을 참고용으로 비교한다.
    const eligible = history.filter(item => item.round === window._latestRound);
    const pool = eligible.length ? eligible : history;
    const best = pool.reduce((a, b) => countMatches(b) > countMatches(a) ? b : a);

    const myNums = best.numbers;
    const matchCount = countMatches(best);
    const bonusMatch = myNums.includes(window._latestBonus);

    const resultText = eligible.length
        ? `${getRank(matchCount, bonusMatch)} · ${matchCount}개 일치`
        : `${matchCount}개 일치`;
    const noteText = eligible.length
        ? `제 ${window._latestRound}회 추첨 전에 뽑은 기록 ${eligible.length}개 중 가장 많이 일치한 번호입니다.`
        : `제 ${window._latestRound}회 추첨 전에 뽑은 기록이 없어 참고용으로만 비교합니다. 실제 당첨과는 무관합니다.`;

    compareArea.style.display = 'block';
    compareResult.innerHTML = `
        <div class="history-balls" style="justify-content:center;margin-bottom:8px">
            ${myNums.map(n => `<span class="ball ${getBallClass(n)}" style="${window._latestNums.includes(n) ? 'outline:2px solid #fff' : 'opacity:0.35'}">${n}</span>`).join('')}
        </div>
        <p style="margin:0;color:${eligible.length && matchCount >= 3 ? '#f0ad00' : '#666'};font-size:15px">${resultText}</p>
        <p class="compare-note">${noteText}</p>
    `;
}

// ===========================
// D-day 카운트다운
// ===========================

function renderDday() {
    const el = document.getElementById('ddayCount');
    const dateEl = document.getElementById('ddayDate');
    if (!el) return;

    const now = Date.now();
    const next = nextDrawTimeMs(now);

    const diff = next - now;
    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    el.textContent = d > 0 ? `D-${d}` : `${h}시간 ${m}분`;

    const dateStr = new Date(next).toLocaleDateString('ko-KR', {
        month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul'
    });
    if (dateEl) dateEl.textContent = `추첨일: ${dateStr} 오후 8시 35분경 (한국 시간)`;
}

// ===========================
// game.js 연동 — 번호 완성 시 저장
// ===========================

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
    fetchStats();
    fetchLatestLotto();
    renderDday();
    setInterval(renderDday, 60000);
});
