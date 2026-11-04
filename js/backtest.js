// 내 번호 돌려보기: 고른 번호 6개를 지난 회차 전부와 비교한다.
// 계산 함수는 tests/backtest.test.js가 직접 검사한다.
(function (root) {
    const TOTAL_COMBINATIONS = 8145060;
    // 등수별 해당 조합 수 (45개 중 6개, 보너스 1개 기준)
    const WAYS = { 1: 1, 2: 6, 3: 228, 4: 11115, 5: 182780 };

    function rankOf(picks, draw) {
        const matches = draw.nums.filter(n => picks.includes(n)).length;
        if (matches === 6) return 1;
        if (matches === 5) return picks.includes(draw.bonus) ? 2 : 3;
        if (matches === 4) return 4;
        if (matches === 3) return 5;
        return 0;
    }

    function backtest(picks, draws) {
        const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        const wins = [];
        draws.forEach(draw => {
            const rank = rankOf(picks, draw);
            if (!rank) return;
            counts[rank]++;
            wins.push({ rank, draw });
        });
        // 높은 등수 먼저, 같은 등수는 최근 회차 먼저
        wins.sort((a, b) => a.rank - b.rank || b.draw.round - a.draw.round);
        const expected = {};
        Object.keys(WAYS).forEach(rank => {
            expected[rank] = draws.length * WAYS[rank] / TOTAL_COMBINATIONS;
        });
        return { counts, expected, wins, total: draws.length };
    }

    const api = { rankOf, backtest, WAYS, TOTAL_COMBINATIONS };
    if (typeof module !== 'undefined') module.exports = api;
    else root.LottoBacktest = api;

    if (typeof document === 'undefined') return;

    // ===== 화면 =====
    const PICK_COUNT = 6;
    const picks = [];
    let draws = [];

    const ballClass = n => n <= 10 ? 'b1' : n <= 20 ? 'b2' : n <= 30 ? 'b3' : n <= 40 ? 'b4' : 'b5';
    const ball = (n, dim) => `<span class="ball ${ballClass(n)}"${dim ? ' style="opacity:.35"' : ''}>${n}</span>`;
    const formatExpected = v => v >= 0.1 ? `${v.toFixed(1)}번` : v >= 0.01 ? `${v.toFixed(2)}번` : '0.01번 미만';
    const $ = id => document.getElementById(id);

    function renderGrid() {
        $('pickGrid').querySelectorAll('button').forEach(btn => {
            const on = picks.includes(+btn.dataset.n);
            btn.classList.toggle('on', on);
            btn.setAttribute('aria-pressed', on);
        });
        $('pickCount').textContent = `${picks.length} / ${PICK_COUNT}개 선택`;
        $('runBtn').disabled = picks.length !== PICK_COUNT || !draws.length;
    }

    function togglePick(n) {
        const i = picks.indexOf(n);
        if (i >= 0) picks.splice(i, 1);
        else if (picks.length < PICK_COUNT) picks.push(n);
        renderGrid();
    }

    function setPicks(list) {
        picks.length = 0;
        picks.push(...list);
        renderGrid();
    }

    function randomPicks() {
        const pool = Array.from({ length: 45 }, (_, i) => i + 1);
        const chosen = [];
        while (chosen.length < PICK_COUNT) {
            chosen.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
        }
        setPicks(chosen);
    }

    function savedPicks() {
        try {
            const history = JSON.parse(localStorage.getItem('lotto_history') || '[]');
            const numbers = Array.isArray(history) && history[0] && history[0].numbers;
            if (!Array.isArray(numbers) || numbers.length !== PICK_COUNT) return null;
            return numbers.every(n => Number.isInteger(n) && n >= 1 && n <= 45) ? numbers : null;
        } catch {
            return null;
        }
    }

    function run() {
        const sorted = [...picks].sort((a, b) => a - b);
        const result = backtest(sorted, draws);
        const rows = [1, 2, 3, 4, 5].map(rank => `
            <tr><td>${rank}등</td><td><strong>${result.counts[rank]}번</strong></td><td>${formatExpected(result.expected[rank])}</td></tr>
        `).join('');
        const shown = result.wins.slice(0, 5).map(({ rank, draw }) => `
            <div class="history-item">
                <span class="history-date">제 ${draw.round}회 (${draw.date}) · ${rank}등</span>
                <div class="history-balls">${draw.nums.map(n => ball(n, !sorted.includes(n))).join('')}</div>
            </div>
        `).join('');
        $('checkResult').innerHTML = `
            <h3>결과</h3>
            <div class="history-balls">${sorted.map(n => ball(n)).join('')}</div>
            <table>
                <thead><tr><th>등수</th><th>내 번호</th><th>평균 기대치</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <p class="stats-note">제 1회 ~ ${draws[draws.length - 1].round}회, 모두 ${result.total}회와 비교했습니다. 평균 기대치는 무작위 조합 하나가 받을 평균 횟수입니다.</p>
            ${shown ? `<p><strong>당첨됐을 회차</strong>${result.wins.length > 5 ? ` (${result.wins.length}번 중 등수가 높은 5번)` : ''}</p>${shown}` : '<p>5등 이상에 해당하는 회차가 없습니다.</p>'}
        `;
        $('checkResult').focus();
    }

    function lookupRound(event) {
        event.preventDefault();
        const round = +$('roundInput').value;
        const draw = draws.find(item => item.round === round);
        const el = $('roundResult');
        if (!draw) {
            el.textContent = draws.length ? `1부터 ${draws[draws.length - 1].round} 사이의 회차를 입력해 주세요.` : '당첨번호 자료를 불러오지 못했습니다.';
            return;
        }
        el.innerHTML = `
            <p><strong>제 ${draw.round}회</strong> (${draw.date})</p>
            <div class="history-balls">${draw.nums.map(n => ball(n)).join('')}<span>+</span>${ball(draw.bonus)}</div>
            <p class="stats-note">1등 ${draw.winners}명${draw.winners ? ` · 1인당 ${draw.amount.toLocaleString('ko-KR')}원` : ''}</p>
        `;
    }

    document.addEventListener('DOMContentLoaded', async () => {
        const grid = $('pickGrid');
        for (let n = 1; n <= 45; n++) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.n = n;
            btn.textContent = n;
            btn.addEventListener('click', () => togglePick(n));
            grid.appendChild(btn);
        }
        const saved = savedPicks();
        $('savedBtn').hidden = !saved;
        $('savedBtn').addEventListener('click', () => setPicks(saved));
        $('randomBtn').addEventListener('click', randomPicks);
        $('clearBtn').addEventListener('click', () => setPicks([]));
        $('runBtn').addEventListener('click', run);
        $('roundForm').addEventListener('submit', lookupRound);
        renderGrid();

        try {
            const res = await fetch('./data/draws.json', { cache: 'no-cache' });
            if (!res.ok) throw new Error(res.status);
            draws = await res.json();
            $('roundInput').max = draws[draws.length - 1].round;
            $('checkStatus').textContent = `제 ${draws[draws.length - 1].round}회(${draws[draws.length - 1].date})까지 비교할 수 있습니다.`;
        } catch {
            $('checkStatus').textContent = '당첨번호 자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
        }
        renderGrid();
    });
})(typeof window !== 'undefined' ? window : globalThis);
