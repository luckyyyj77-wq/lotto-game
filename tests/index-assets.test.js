// 실행: node --test tests/index-assets.test.js
// 브라우저 캐시 때문에 옛 파일과 새 파일이 섞이면 게임이 멈출 수 있어,
// index.html의 모든 JS·CSS는 같은 ?v= 값으로 불러온다.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const assets = [...html.matchAll(/(?:src|href)="((?:js\/[^"]+|style\.css)[^"]*)"/g)].map(m => m[1]);

test('index.html의 모든 JS·CSS에 같은 버전이 붙어 있다', () => {
    assert.ok(assets.length >= 8, `찾은 파일 ${assets.length}개`);
    const versions = new Set(assets.map(asset => {
        const match = asset.match(/\?v=(\w+)$/);
        assert.ok(match, `${asset}에 ?v= 가 없음`);
        return match[1];
    }));
    assert.strictEqual(versions.size, 1, `버전이 섞임: ${[...versions]}`);
});

test('js 폴더의 모든 스크립트를 index.html이 불러오고, 없는 파일을 가리키지 않는다', () => {
    const loaded = assets.map(asset => asset.split('?')[0]);
    loaded.forEach(file => assert.ok(fs.existsSync(path.join(root, file)), `${file} 없음`));
    fs.readdirSync(path.join(root, 'js')).forEach(file => {
        assert.ok(loaded.includes(`js/${file}`), `js/${file}을 불러오지 않음`);
    });
});
