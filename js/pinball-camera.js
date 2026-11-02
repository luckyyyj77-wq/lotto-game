// 핀볼 카메라 — 선두 번호 공 무리를 따라간다. 화면에만 영향을 주고 물리에는 관여하지 않는다.
(function (root) {
    const MIN_ZOOM_LIMIT = 0.55;   // 다음 무리로 넘어갈 때 잠깐 물러나는 한계
    const FOLLOW_ZOOM_MIN = 0.85;
    const FOLLOW_ZOOM_MAX = 1.45;
    const GOAL_ZOOM = 1.6;         // 결승선 근처와 안착 순간에 당겨 보는 배율
    const GOAL_NEAR = 340;         // 결승선까지 이 거리 안이면 점점 줌인

    // 위치는 임계 감쇠 스프링으로 움직여, 대상이 바뀌어도 갑자기 튀지 않고 서서히 가속·감속한다.
    // 스프링은 속도의 2/SPRING 스텝만큼 뒤처지므로 LEAD_STEPS로 앞을 비춰 상쇄한다
    const SPRING = 0.15;
    const ZOOM_EASE = 0.05;
    const TRANSIT_STEPS = 50;      // 안착 후 다음 무리로 넘어갈 때 넓게 보는 시간
    const TRANSIT_ZOOM = 0.9;
    const TRANSIT_MIN_DISTANCE = 150; // 다음 무리가 이보다 가까우면 물러나지 않는다
    const SWITCH_DELAY = 20;       // 새 선두가 이만큼 유지돼야 대상을 바꾼다 (화면 흔들림 방지)
    const HOLD_STEPS = 45;         // 안착 후 결승선을 보여 주는 시간
    const GROUP_RANGE = 170;       // 선두에서 이 거리 안의 공을 한 무리로 본다
    const GROUP_SIZE = 4;
    const FRAME_MARGIN = 150;
    const LEAD_STEPS = 12;         // 공이 향하는 쪽을 앞서 비춘다

    function createCamera({ viewW, viewH, worldW, worldH }) {
        const cam = {
            x: worldW / 2,
            y: viewH / 2,
            vx: 0,
            vy: 0,
            zoom: 1,
            target: null,    // 따라가는 공
            pending: null,
            pendingSteps: 0,
            holdSteps: 0,
            transitSteps: 0
        };

        const clampToWorld = () => {
            const halfW = viewW / 2 / cam.zoom;
            const halfH = viewH / 2 / cam.zoom;
            cam.x = halfW * 2 >= worldW ? worldW / 2 : Math.max(halfW, Math.min(worldW - halfW, cam.x));
            cam.y = halfH * 2 >= worldH ? worldH / 2 : Math.max(halfH, Math.min(worldH - halfH, cam.y));
        };

        function chooseTarget(numberBalls) {
            const leader = numberBalls[0];
            if (!cam.target || !numberBalls.includes(cam.target)) {
                cam.target = leader;
                cam.pending = null;
                cam.pendingSteps = 0;
                return;
            }
            if (leader === cam.target) {
                cam.pending = null;
                cam.pendingSteps = 0;
                return;
            }
            if (cam.pending === leader) {
                cam.pendingSteps++;
                if (cam.pendingSteps >= SWITCH_DELAY) {
                    cam.target = leader;
                    cam.pending = null;
                    cam.pendingSteps = 0;
                }
            } else {
                cam.pending = leader;
                cam.pendingSteps = 0;
            }
        }

        // 따라갈 무리가 화면에 다 들어오는 지점과 배율
        function frameGroup(numberBalls, goal) {
            const anchor = cam.target;
            const group = numberBalls
                .filter(b => Math.abs(b.y - anchor.y) < GROUP_RANGE && Math.abs(b.x - anchor.x) < GROUP_RANGE * 1.5)
                .slice(0, GROUP_SIZE);

            let left = anchor.x;
            let right = anchor.x;
            let top = anchor.y;
            let bottom = anchor.y;
            group.forEach(b => {
                left = Math.min(left, b.x);
                right = Math.max(right, b.x);
                top = Math.min(top, b.y);
                bottom = Math.max(bottom, b.y);
            });

            const fit = Math.min(
                viewW / (right - left + FRAME_MARGIN),
                viewH / (bottom - top + FRAME_MARGIN * 1.5)
            );
            const near = Math.max(0, 1 - (goal.y - anchor.y) / GOAL_NEAR);
            const zoom = Math.max(FOLLOW_ZOOM_MIN, Math.min(FOLLOW_ZOOM_MAX, fit));
            return {
                x: (left + right) / 2 + anchor.vx * LEAD_STEPS,
                y: (top + bottom) / 2 + anchor.vy * LEAD_STEPS,
                zoom: zoom + (GOAL_ZOOM - zoom) * near
            };
        }

        cam.notePick = () => {
            cam.holdSteps = HOLD_STEPS;
            cam.transitSteps = TRANSIT_STEPS;
        };

        // sim: pinball-core 게임 객체. 스텝마다 호출한다
        cam.update = sim => {
            let view;
            if (sim.state === 'ready') {
                view = { x: sim.drum.x, y: sim.drum.y + 70, zoom: viewW / (sim.drum.radius * 2 + 60) };
            } else {
                const numberBalls = sim.balls
                    .filter(b => b.number !== null)
                    .sort((a, b) => b.y - a.y);
                const hold = cam.holdSteps > 0 || sim.state === 'done' || numberBalls.length === 0;
                if (cam.holdSteps > 0) cam.holdSteps--;

                if (hold) {
                    view = { x: sim.goal.x, y: sim.goal.y - 90, zoom: GOAL_ZOOM };
                } else {
                    chooseTarget(numberBalls);
                    view = frameGroup(numberBalls, sim.goal);

                    // 안착 뒤 다음 무리가 떨어져 있으면 넓게 물러났다가, 도착하면서 다시 당긴다
                    const distance = Math.hypot(view.x - cam.x, view.y - cam.y);
                    if (cam.transitSteps > 0) {
                        cam.transitSteps--;
                        if (distance > TRANSIT_MIN_DISTANCE) view.zoom = Math.min(view.zoom, TRANSIT_ZOOM);
                    }
                    if (distance > viewH / 2 / cam.zoom) {
                        const overview = viewH / (distance * 2 + FRAME_MARGIN);
                        view.zoom = Math.min(view.zoom, Math.max(MIN_ZOOM_LIMIT, overview));
                    }
                }
            }

            cam.vx += (view.x - cam.x) * SPRING * SPRING - cam.vx * 2 * SPRING;
            cam.vy += (view.y - cam.y) * SPRING * SPRING - cam.vy * 2 * SPRING;
            cam.x += cam.vx;
            cam.y += cam.vy;
            cam.zoom += (view.zoom - cam.zoom) * ZOOM_EASE;
            clampToWorld();
        };

        cam.apply = ctx => {
            ctx.translate(viewW / 2, viewH / 2);
            ctx.scale(cam.zoom, cam.zoom);
            ctx.translate(-cam.x, -cam.y);
        };

        cam.toWorld = point => ({
            x: cam.x + (point.x - viewW / 2) / cam.zoom,
            y: cam.y + (point.y - viewH / 2) / cam.zoom
        });

        cam.toScreen = point => ({
            x: viewW / 2 + (point.x - cam.x) * cam.zoom,
            y: viewH / 2 + (point.y - cam.y) * cam.zoom
        });

        cam.visibleTop = () => cam.y - viewH / 2 / cam.zoom;
        cam.visibleBottom = () => cam.y + viewH / 2 / cam.zoom;

        clampToWorld();
        return cam;
    }

    const api = { createCamera };
    if (typeof module !== 'undefined') module.exports = api;
    else root.LottoCamera = api;
})(typeof window !== 'undefined' ? window : globalThis);
