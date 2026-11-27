// 실행: node --test tests/stories.test.js
// 읽을거리 글이 빠짐없이 연결되어 있는지, 글에 적은 자체 통계가 실제 데이터와 맞는지 확인한다.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const storyFiles = fs.readdirSync(root).filter(file => /^story-.*\.html$/.test(file));
const sitePages = ['index.html', 'guide.html', 'odds.html', 'tax.html', 'faq.html', 'about.html', 'privacy.html', 'stories.html', 'check.html', ...storyFiles];

test('글이 13편 있고 목록과 sitemap에 모두 올라가 있다', () => {
    assert.strictEqual(storyFiles.length, 13);
    const hub = read('stories.html');
    const sitemap = read('sitemap.xml');
    storyFiles.forEach(file => {
        assert.ok(hub.includes(`href="${file}"`), `목록에 ${file} 없음`);
        assert.ok(sitemap.includes(`/${file}<`), `sitemap에 ${file} 없음`);
    });
    assert.ok(sitemap.includes('/stories.html<'));
});

test('모든 페이지에서 읽을거리로 갈 수 있다', () => {
    sitePages.filter(file => file !== 'stories.html').forEach(file => {
        assert.ok(read(file).includes('href="stories.html"'), `${file}에 읽을거리 링크 없음`);
    });
});

test('글마다 제목·설명·canonical이 고유하고 출처가 있다', () => {
    const titles = new Set();
    const descriptions = new Set();
    storyFiles.forEach(file => {
        const html = read(file);
        const title = html.match(/<title>(.+?)<\/title>/)[1];
        const description = html.match(/name="description" content="(.+?)"/)[1];
        assert.ok(!titles.has(title), `제목 중복 ${title}`);
        assert.ok(!descriptions.has(description), `설명 중복 ${description}`);
        titles.add(title);
        descriptions.add(description);
        assert.ok(html.includes(`https://lucky-collector.com/${file}"`), `${file} canonical`);
        assert.ok(html.includes('class="story-sources"'), `${file} 출처 없음`);
        assert.ok(/<li><a href="http/.test(html), `${file} 출처 링크 없음`);
    });
});

test('내부 링크가 모두 실제 파일을 가리킨다', () => {
    [...storyFiles, 'stories.html', 'index.html'].forEach(file => {
        for (const match of read(file).matchAll(/href="([^"#:]+\.(?:html|svg|css))(?:#[^"]*)?"/g)) {
            assert.ok(fs.existsSync(path.join(root, match[1].split('?')[0])), `${file} → ${match[1]}`);
        }
    });
});

test('분석 글의 통계가 1~1,248회 데이터와 일치한다', () => {
    const draws = JSON.parse(read('data/draws.json')).filter(r => r.round <= 1248);
    assert.strictEqual(draws.length, 1248);

    const countIn = list => {
        const counts = Array(46).fill(0);
        list.forEach(r => r.nums.forEach(n => counts[n]++));
        return counts;
    };
    const top10 = counts => Array.from({ length: 45 }, (_, i) => i + 1)
        .sort((a, b) => counts[b] - counts[a] || a - b)
        .slice(0, 10);

    const firstHalf = top10(countIn(draws.slice(0, 624)));
    const secondHalf = top10(countIn(draws.slice(624)));
    assert.strictEqual(firstHalf.filter(n => secondHalf.includes(n)).length, 0);

    const bias = read('story-bias.html');
    assert.ok(bias.includes(firstHalf.join(', ')));
    assert.ok(bias.includes(secondHalf.join(', ')));

    const all = countIn(draws);
    assert.strictEqual(all[34], 187);
    assert.strictEqual(all[9], 137);
    assert.ok(bias.includes('34번(187)'));
    assert.ok(bias.includes('9번(137)'));

    const records = read('story-records.html');
    const byRound = n => draws.find(r => r.round === n);
    assert.strictEqual(byRound(1128).winners, 63);
    assert.strictEqual(byRound(546).winners, 30);
    assert.strictEqual(Math.max(...draws.map(r => r.amount)), byRound(19).amount);
    assert.strictEqual(byRound(18).winners, 0);
    assert.ok(records.includes('63명'));
});

test('1,249회 분석과 보강한 글의 통계가 1~1,249회 데이터와 일치한다', () => {
    const draws = JSON.parse(read('data/draws.json')).filter(r => r.round <= 1249);
    assert.strictEqual(draws.length, 1249);
    const byRound = n => draws.find(r => r.round === n);
    const cur = byRound(1249);
    assert.deepStrictEqual(cur.nums, [2, 11, 16, 25, 34, 35]);
    assert.strictEqual(cur.bonus, 14);
    assert.strictEqual(cur.winners, 14);
    const before = draws.filter(r => r.round < 1249);
    const overlap = (a, b) => a.filter(n => b.includes(n)).length;

    // 번호별 출현 횟수와 직전 출현 회차
    const article = read('story-round-1249.html');
    const expected = { 2: [157, 1242], 11: [168, 1240], 16: [172, 1248], 25: [154, 1245], 34: [187, 1244], 35: [163, 1234], 14: [173, 1247] };
    Object.entries(expected).forEach(([n, [count, last]]) => {
        const num = Number(n);
        assert.strictEqual(before.filter(r => r.nums.includes(num)).length, count, `${n}번 횟수`);
        assert.strictEqual(Math.max(...before.filter(r => r.nums.includes(num)).map(r => r.round)), last, `${n}번 직전 회차`);
        assert.ok(article.includes(`<td>${count}번</td>`), `${n}번 횟수 표기`);
    });

    // 지난 1,248회에 대 본 결과: 4등 4번, 5등 24번
    const matches = before.map(r => overlap(cur.nums, r.nums));
    assert.strictEqual(matches.filter(m => m === 4).length, 4);
    assert.strictEqual(matches.filter(m => m === 3).length, 24);
    assert.strictEqual(Math.max(...matches), 4);
    assert.deepStrictEqual(before.filter((r, i) => matches[i] === 4).map(r => r.round), [171, 601, 878, 1086]);
    assert.ok(article.includes('<td>4번</td>') && article.includes('<td>24번</td>'));

    // 합계 비율과 연속번호 비율
    const sums = draws.map(r => r.nums.reduce((a, b) => a + b, 0));
    assert.strictEqual(sums.reduce((a, b) => a + b, 0) / sums.length > 138.25 && sums.reduce((a, b) => a + b, 0) / sums.length < 138.35, true);
    assert.strictEqual((sums.filter(s => s <= 123).length / sums.length * 100).toFixed(1), '31.2');
    const hasRun = r => { const s = [...r.nums].sort((a, b) => a - b); return s.some((n, i) => i > 0 && n - s[i - 1] === 1); };
    assert.strictEqual((draws.filter(hasRun).length / draws.length * 100).toFixed(1), '51.8');
    assert.strictEqual((draws.filter(r => r.nums.every(n => n <= 40)).length / draws.length * 100).toFixed(1), '48.0');

    // 확률 글: 회차 쌍별 겹침 수
    const pairCounts = Array(7).fill(0);
    for (let i = 0; i < draws.length; i++) for (let j = 0; j < i; j++) pairCounts[overlap(draws[i].nums, draws[j].nums)]++;
    assert.deepStrictEqual(pairCounts, [312940, 329693, 118281, 17434, 1007, 21, 0]);
    const math = read('story-math.html');
    ['312,940', '329,693', '118,281', '17,434', '1,007', '779,376'].forEach(v => assert.ok(math.includes(v), v));

    // 기록 글: 합계 극값, 홀짝 회차 수, 1등 1명 회차
    const sumOf = n => byRound(n).nums.reduce((a, b) => a + b, 0);
    assert.strictEqual(Math.min(...sums), sumOf(312));
    assert.strictEqual(Math.max(...sums), sumOf(196));
    assert.strictEqual(draws.filter(r => r.nums.every(n => n % 2)).length, 19);
    assert.strictEqual(draws.filter(r => r.nums.every(n => n % 2 === 0)).length, 17);
    const single = draws.filter(r => r.winners === 1).map(r => r.round);
    assert.strictEqual(single.length, 28);
    assert.deepStrictEqual(single.filter(n => n >= 500), [515, 534, 551]);

    // 번호 선택 글: 1등 30명 이상 회차
    assert.deepStrictEqual(draws.filter(r => r.winners >= 30).map(r => r.round), [546, 1019, 1128, 1152, 1162, 1233]);
    assert.ok(read('story-choice.html').includes('30, 31, 32, 35, 36, 37'));

    // 한국 복권 글: 연도별 1등 평균
    const yearMean = y => { const list = draws.filter(r => r.date.startsWith(y)); return (list.reduce((a, r) => a + r.winners, 0) / list.length).toFixed(1); };
    assert.strictEqual(yearMean('2003'), '4.0');
    assert.strictEqual(yearMean('2010'), '5.6');
    assert.strictEqual(yearMean('2025'), '15.6');
    assert.strictEqual(Math.max(...draws.filter(r => r.winners === 0).map(r => r.round)), 463);
});

test('1,250회 분석의 통계가 1~1,250회 데이터와 일치한다', () => {
    const draws = JSON.parse(read('data/draws.json')).filter(r => r.round <= 1250);
    assert.strictEqual(draws.length, 1250);
    const byRound = n => draws.find(r => r.round === n);
    const cur = byRound(1250);
    assert.deepStrictEqual(cur.nums, [1, 5, 18, 23, 27, 28]);
    assert.strictEqual(cur.bonus, 8);
    assert.strictEqual(cur.winners, 9);
    assert.strictEqual(cur.amount, 3103164459);
    const before = draws.filter(r => r.round < 1250);
    const overlap = (a, b) => a.filter(n => b.includes(n)).length;
    const article = read('story-round-1250.html');

    // 번호별 출현 횟수와 직전 출현 회차
    const expected = { 1: [171, 1244], 5: [154, 1245], 18: [181, 1248], 23: [150, 1246], 27: [183, 1248], 28: [159, 1246], 8: [159, 1247] };
    Object.entries(expected).forEach(([n, [count, last]]) => {
        const list = before.filter(r => r.nums.includes(Number(n)));
        assert.strictEqual(list.length, count, `${n}번 횟수`);
        assert.strictEqual(Math.max(...list.map(r => r.round)), last, `${n}번 직전 회차`);
        assert.ok(article.includes(`<td>${count}번</td>`), `${n}번 횟수 표기`);
    });

    // 여섯 번호가 모두 최근 6회 안에 나온 회차: 11~1,250회 중 30번, 직전은 1,184회
    const gapMax = r => Math.max(...r.nums.map(n => { for (let k = r.round - 1; k >= 1; k--) if (byRound(k).nums.includes(n)) return r.round - k; return Infinity; }));
    const recent = draws.filter(r => r.round > 10 && gapMax(r) <= 6).map(r => r.round);
    assert.strictEqual(recent.length, 30);
    assert.deepStrictEqual(recent.slice(-2), [1184, 1250]);
    const recentSet = new Set(); draws.filter(r => r.round >= 1244 && r.round <= 1249).forEach(r => r.nums.forEach(n => recentSet.add(n)));
    assert.strictEqual(recentSet.size, 25);

    // 모양: 합계, 30 이하, 홀수 4개, 직전 회차 겹침
    const sums = draws.map(r => r.nums.reduce((a, b) => a + b, 0));
    assert.strictEqual((sums.filter(s => s <= 102).length / sums.length * 100).toFixed(1), '13.0');
    assert.strictEqual(draws.filter(r => r.nums.every(n => n <= 30)).length, 90);
    assert.strictEqual(draws.filter(r => r.nums.filter(n => n % 2).length === 4).length, 331);
    assert.strictEqual(overlap(cur.nums, byRound(1249).nums), 0);

    // 지난 1,249회에 대 본 결과
    const matches = before.map(r => overlap(cur.nums, r.nums));
    assert.strictEqual(Math.max(...matches), 4);
    assert.deepStrictEqual(before.filter((r, i) => matches[i] === 4).map(r => r.round), [178, 456]);
    assert.strictEqual(matches.filter(m => m === 3).length, 37);
    assert.ok(article.includes('<td>2번</td>') && article.includes('<td>37번</td>') && article.includes('<td>1,210번</td>'));

    // 앞 50회와 1등 비교
    const last50 = draws.filter(r => r.round >= 1200 && r.round <= 1249);
    assert.strictEqual((last50.reduce((a, r) => a + r.winners, 0) / 50).toFixed(1), '15.0');
    assert.strictEqual(last50.filter(r => r.winners <= 9).length, 5);
    assert.strictEqual(last50.filter(r => r.amount > cur.amount).length, 5);
});

test('1,251회 분석의 통계가 1~1,251회 데이터와 일치한다', () => {
    const draws = JSON.parse(read('data/draws.json')).filter(r => r.round <= 1251);
    assert.strictEqual(draws.length, 1251);
    const byRound = n => draws.find(r => r.round === n);
    const cur = byRound(1251);
    assert.deepStrictEqual(cur.nums, [14, 18, 19, 29, 40, 45]);
    assert.strictEqual(cur.bonus, 1);
    assert.strictEqual(cur.winners, 14);
    assert.strictEqual(cur.amount, 2068843286);
    const before = draws.filter(r => r.round < 1251);
    const overlap = (a, b) => a.filter(n => b.includes(n)).length;
    const article = read('story-round-1251.html');

    // 번호별 출현 횟수와 직전 출현 회차
    const expected = { 14: [173, 1247], 18: [182, 1250], 19: [171, 1240], 29: [156, 1236], 40: [174, 1237], 45: [176, 1247], 1: [172, 1250] };
    Object.entries(expected).forEach(([n, [count, last]]) => {
        const list = before.filter(r => r.nums.includes(Number(n)));
        assert.strictEqual(list.length, count, `${n}번 횟수`);
        assert.strictEqual(Math.max(...list.map(r => r.round)), last, `${n}번 직전 회차`);
        assert.ok(article.includes(`<td>${count}번</td>`), `${n}번 횟수 표기`);
    });
    assert.deepStrictEqual(draws.filter(r => r.round >= 1243 && r.nums.includes(18)).map(r => r.round), [1243, 1244, 1248, 1250, 1251]);
    const counts = Array.from({ length: 45 }, (_, i) => [i + 1, draws.filter(r => r.nums.includes(i + 1)).length]).sort((a, b) => b[1] - a[1]);
    assert.deepStrictEqual(counts.slice(0, 4).map(c => c[1]), [188, 184, 184, 183]);
    assert.strictEqual(counts[3][0], 18);

    // 1~10 없음, 30번대 없음, 둘 다
    const no10 = r => r.nums[0] >= 11;
    const no30s = r => !r.nums.some(n => n >= 30 && n <= 39);
    assert.strictEqual(draws.filter(no10).length, 273);
    assert.strictEqual(draws.filter(no30s).length, 266);
    const both = draws.filter(r => no10(r) && no30s(r)).map(r => r.round);
    assert.strictEqual(both.length, 31);
    assert.deepStrictEqual(both.slice(-2), [1246, 1251]);

    // 모양: 합계, 홀짝, 연속번호, 직전 회차 겹침
    const sums = draws.map(r => r.nums.reduce((a, b) => a + b, 0));
    assert.strictEqual((sums.filter(s => s >= 165).length / sums.length * 100).toFixed(1), '20.9');
    assert.strictEqual(draws.filter(r => r.nums.filter(n => n % 2).length === 3).length, 416);
    const consec = r => r.nums.some((n, i) => i > 0 && n - r.nums[i - 1] === 1);
    assert.strictEqual((draws.filter(consec).length / draws.length * 100).toFixed(1), '51.9');
    assert.strictEqual(overlap(cur.nums, byRound(1250).nums), 1);
    let one = 0; for (let k = 2; k <= 1251; k++) if (overlap(byRound(k).nums, byRound(k - 1).nums) === 1) one++;
    assert.strictEqual(one, 531);

    // 지난 1,250회에 대 본 결과
    const matches = before.map(r => overlap(cur.nums, r.nums));
    assert.strictEqual(Math.max(...matches), 4);
    assert.deepStrictEqual(before.filter((r, i) => matches[i] === 4).map(r => r.round), [1090]);
    assert.strictEqual(byRound(1090).bonus, 1);
    assert.strictEqual(matches.filter(m => m === 3).length, 30);
    assert.ok(article.includes('<td>1번</td>') && article.includes('<td>30번</td>') && article.includes('<td>1,219번</td>'));

    // 앞 50회와 1등 비교
    const last50 = draws.filter(r => r.round >= 1201 && r.round <= 1250);
    assert.strictEqual((last50.reduce((a, r) => a + r.winners, 0) / 50).toFixed(1), '15.0');
    const w = last50.map(r => r.winners).sort((a, b) => a - b);
    assert.strictEqual((w[24] + w[25]) / 2, 14);
    const amt = last50.map(r => r.amount).sort((a, b) => a - b);
    assert.strictEqual(((amt[24] + amt[25]) / 2 / 1e8).toFixed(1), '20.1');
});

test('홈 첫 화면에 소개 문장과 최신 회차 분석 링크가 있다', () => {
    const home = read('index.html');
    assert.ok(home.includes('id="siteTagline"'));
    const latestStory = storyFiles.filter(file => /^story-round-\d+\.html$/.test(file)).sort().pop();
    assert.ok(home.includes(`href="${latestStory}"`), `홈에 ${latestStory} 링크 없음`);
});
