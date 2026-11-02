// 실행: node --test tests/domain.test.js
// 커스텀 도메인 이전 후 옛 주소가 남지 않았는지, 도메인 연결과 광고 파일이 제자리에 있는지 확인한다.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const DOMAIN = 'lucky-collector.com';
const htmlFiles = fs.readdirSync(root).filter(file => file.endsWith('.html'));

test('공개 파일에 옛 주소가 남아 있지 않다', () => {
    [...htmlFiles, 'sitemap.xml', 'robots.txt'].forEach(file => {
        assert.ok(!read(file).includes('github.io'), `${file}에 옛 주소가 남아 있음`);
    });
});

test('페이지마다 canonical과 og:url이 자기 주소를 가리킨다', () => {
    htmlFiles.forEach(file => {
        const html = read(file);
        const expected = `https://${DOMAIN}/${file === 'index.html' ? '' : file}`;
        assert.ok(html.includes(`rel="canonical" href="${expected}"`), `${file} canonical`);
        assert.ok(html.includes(`property="og:url" content="${expected}"`), `${file} og:url`);
    });
});

test('sitemap의 모든 주소가 새 도메인의 실제 파일이다', () => {
    const urls = [...read('sitemap.xml').matchAll(/<loc>(.+?)<\/loc>/g)].map(match => match[1]);
    assert.ok(urls.length > 0);
    urls.forEach(url => {
        assert.ok(url.startsWith(`https://${DOMAIN}/`), url);
        const file = url.slice(`https://${DOMAIN}/`.length) || 'index.html';
        assert.ok(fs.existsSync(path.join(root, file)), `${url} 파일 없음`);
    });
});

test('CNAME, robots.txt, ads.txt가 새 도메인에 맞다', () => {
    assert.strictEqual(read('CNAME').trim(), DOMAIN);
    assert.ok(read('robots.txt').includes(`Sitemap: https://${DOMAIN}/sitemap.xml`));
    assert.strictEqual(read('ads.txt').trim(), 'google.com, pub-6481527875589889, DIRECT, f08c47fec0942fa0');
});

test('ads.txt의 게시자 ID가 페이지의 애드센스 스크립트와 같다', () => {
    assert.ok(read('index.html').includes('ca-pub-6481527875589889'));
});
