// 두 미니게임이 함께 쓰는 물리 규칙 (값은 1/60초 고정 스텝 기준)
(function (root) {
    const gravity = 0.5;
    const bounce = 0.6;
    const ballRadius = 10;

    // 같은 질량의 두 공 충돌. 겹침을 풀고, 서로 다가오는 중일 때만 속도를 교환한다.
    // restitution 1은 완전 탄성, 낮을수록 충돌 후 빨리 잦아든다.
    function collideBalls(a, b, restitution = 1) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDist = a.radius + b.radius;
        if (distance >= minDist || distance === 0) return false;

        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = (minDist - distance) / 2;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;

        const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (closing < 0) {
            const impulse = (-(1 + restitution) * closing) / 2;
            a.vx -= impulse * nx;
            a.vy -= impulse * ny;
            b.vx += impulse * nx;
            b.vy += impulse * ny;
        }
        return true;
    }

    const api = { gravity, bounce, ballRadius, collideBalls };
    if (typeof module !== 'undefined') module.exports = api;
    else root.LottoPhysics = api;
})(typeof window !== 'undefined' ? window : globalThis);
