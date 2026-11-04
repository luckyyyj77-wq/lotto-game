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

test('글이 10편 있고 목록과 sitemap에 모두 올라가 있다', () => {
    assert.strictEqual(storyFiles.length, 10);
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
