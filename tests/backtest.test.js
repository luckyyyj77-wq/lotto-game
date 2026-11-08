// 실행: node --test tests/backtest.test.js
// 내 번호 돌려보기의 등수 계산과, 페이지와 글에 적은 수치가 실제 데이터와 맞는지 확인한다.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { rankOf, backtest, WAYS, TOTAL_COMBINATIONS } = require('../js/backtest.js');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const draws = JSON.parse(read('data/draws.json')).filter(r => r.round <= 1248);

test('등수를 일치 개수와 보너스로 정한다', () => {
    const draw = { nums: [1, 2, 3, 4, 5, 6], bonus: 7 };
    assert.strictEqual(rankOf([1, 2, 3, 4, 5, 6], draw), 1);
    assert.strictEqual(rankOf([1, 2, 3, 4, 5, 7], draw), 2);
    assert.strictEqual(rankOf([1, 2, 3, 4, 5, 8], draw), 3);
    assert.strictEqual(rankOf([1, 2, 3, 4, 7, 8], draw), 4);
    assert.strictEqual(rankOf([1, 2, 3, 7, 8, 9], draw), 5);
    assert.strictEqual(rankOf([1, 2, 7, 8, 9, 10], draw), 0);
});

test('등수별 조합 수가 전체 경우의 수와 맞는다', () => {
    const c = (n, k) => { let v = 1; for (let i = 0; i < k; i++) v = v * (n - i) / (i + 1); return Math.round(v); };
    assert.strictEqual(TOTAL_COMBINATIONS, c(45, 6));
    assert.strictEqual(WAYS[2] + WAYS[3], c(6, 5) * 39);
    assert.strictEqual(WAYS[4], c(6, 4) * c(39, 2));
    assert.strictEqual(WAYS[5], c(6, 3) * c(39, 3));
});

test('당첨 회차는 높은 등수, 최근 회차 순으로 나온다', () => {
    const list = [
        { round: 1, nums: [1, 2, 3, 20, 21, 22], bonus: 30 },
        { round: 2, nums: [1, 2, 3, 4, 21, 22], bonus: 30 },
        { round: 3, nums: [1, 2, 3, 20, 21, 22], bonus: 30 }
    ];
    const result = backtest([1, 2, 3, 4, 5, 6], list);
    assert.deepStrictEqual(result.wins.map(w => w.draw.round), [2, 3, 1]);
    assert.deepStrictEqual(result.counts, { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 });
});

test('check.html의 예시가 1~1,248회 데이터와 일치한다', () => {
    const html = read('check.html');
    const result = backtest([1, 2, 3, 4, 5, 6], draws);
    assert.strictEqual(result.counts[4], 4);
    assert.strictEqual(result.counts[5], 24);
    assert.strictEqual(result.expected[5].toFixed(1), '28.0');
    assert.strictEqual(result.expected[4].toFixed(1), '1.7');
    assert.ok(html.includes('4등 4번, 5등 24번'));
    assert.ok(html.includes('4등 1.7번, 5등 28.0번'));
});

test('최근 100회 상위·하위 번호 분석이 글과 일치한다', () => {
    let hot = 0, cold = 0, rounds = 0;
    for (let i = 100; i < draws.length; i++) {
        const counts = Array(46).fill(0);
        for (let j = i - 100; j < i; j++) draws[j].nums.forEach(n => counts[n]++);
        const order = Array.from({ length: 45 }, (_, k) => k + 1).sort((a, b) => counts[b] - counts[a] || a - b);
        hot += draws[i].nums.filter(n => order.slice(0, 10).includes(n)).length;
        cold += draws[i].nums.filter(n => order.slice(-10).includes(n)).length;
        rounds++;
    }
    assert.strictEqual(rounds, 1148);
    assert.strictEqual((hot / rounds).toFixed(2), '1.33');
    assert.strictEqual((cold / rounds).toFixed(2), '1.34');
    const html = read('story-bias.html');
    assert.ok(html.includes('1,148회'));
    assert.ok(html.includes('1.33개'));
    assert.ok(html.includes('1.34개'));
});

test('공백 기간별 재출현율과 합계 분석이 글과 일치한다', () => {
    const last = Array(46).fill(-1);
    const buckets = { '0-4': [0, 0], '5-9': [0, 0], '10-19': [0, 0], '20+': [0, 0] };
    let longest = { gap: 0, n: 0, round: 0 };
    draws.forEach((draw, i) => {
        for (let n = 1; n <= 45; n++) {
            if (last[n] < 0) continue;
            const absent = i - last[n] - 1;
            const key = absent >= 20 ? '20+' : absent >= 10 ? '10-19' : absent >= 5 ? '5-9' : '0-4';
            buckets[key][0]++;
            if (draw.nums.includes(n)) {
                buckets[key][1]++;
                if (i - last[n] > longest.gap) longest = { gap: i - last[n], n, round: draw.round };
            }
        }
        draw.nums.forEach(n => { last[n] = i; });
    });
    const rate = key => (buckets[key][1] / buckets[key][0] * 100).toFixed(1);
    const html = read('story-luck.html');
    ['0-4', '5-9', '10-19', '20+'].forEach(key => {
        assert.ok(html.includes(`<td>${rate(key)}%</td>`), `${key} ${rate(key)}%`);
    });
    assert.deepStrictEqual(longest, { gap: 74, n: 5, round: 1126 });
    assert.ok(html.includes('5번'));
    assert.ok(html.includes('1,126회'));
    assert.ok(html.includes('74회'));

    const sums = draws.map(d => d.nums.reduce((a, b) => a + b, 0));
    assert.strictEqual((sums.reduce((a, b) => a + b, 0) / sums.length).toFixed(1), '138.3');
    assert.strictEqual(Math.min(...sums), 48);
    assert.strictEqual(Math.max(...sums), 238);
    assert.ok(html.includes('138.3'));
});

test('Vercel 주소는 새 도메인으로 영구 이동한다', () => {
    // 루트(/)는 /(.*)에 걸리지 않아 따로 둔다
    const rules = JSON.parse(read('vercel.json')).redirects;
    const bySource = Object.fromEntries(rules.map(rule => [rule.source, rule]));
    assert.strictEqual(bySource['/'].destination, 'https://lucky-collector.com/');
    assert.strictEqual(bySource['/(.*)'].destination, 'https://lucky-collector.com/$1');
    rules.forEach(rule => assert.strictEqual(rule.permanent, true));
});
