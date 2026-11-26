window.T = window.T || function (ko) { return ko; };   /* lang.js가 없어도 한국어로 동작 */
/* =========================================================
   로드 트립 (road.html / road-en.html) — 2026-11-26
   차 뒤에서 보는 3D 느낌 도로(가짜 3D: 도로를 짧은 조각으로 나눠 멀수록 작게 그림)
   - 내 차는 화면 아래. 가속할수록 풍경이 멀리서 다가옴
   - 구간: 가로수길 → 상점가 → 사막 → 숲길 → 도시(도착). 낮 → 노을 → 밤 → 새벽
   - 차 4종(스포츠카·세단·지프·픽업트럭), 엔진음(Web Audio, 녹음 파일 없음)
   - 2026-11-26 19:1x: 왕복 4차선으로 바꿈. 오른쪽 2차선 = 가는 차선(느린 차, 뒷모습), 왼쪽 2차선 = 오는 차선(마주 오는 차, 앞모습)
     느린 차가 두 차선을 막으면 중앙선을 넘어 오는 차선으로 추월 → 마주 오는 차를 피해야 함. 오는 차선에 있으면 점수 2배
   - 차는 시간이 갈수록 많아지고 차선도 바꿈. 생명(♥)을 다 잃으면 끝, 목적지(12km)에 닿으면 도착
   - 그림은 모두 코드로 직접 그림 (다른 게임 그림·소리 안 씀)
   - 기기에 기억: 기록 roadRecord.v1, 고른 차 roadCar.v1, 소리 roadMuted.v1
   ========================================================= */
(function () {
    "use strict";
    var $ = function (id) { return document.getElementById(id); };
    var canvas = $("rCanvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var EN = !!window.SITE_EN;

    function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
    function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

    /* ---------------- 설정 ---------------- */
    var SEG = 200;              // 도로 조각 길이
    var RUMBLE = 3;             // 몇 조각마다 색 바꿈
    var ROAD_W = 2000;          // 도로 반폭 (가운데~가장자리), 왕복 4차선
    var CAM_H = 1500;           // 카메라 높이
    var CAM_DEPTH = 1 / Math.tan((100 / 2) * Math.PI / 180);
    var PLAYER_Z = CAM_H * CAM_DEPTH;
    var TOTAL = 7000;           // 도로 조각 수 (목적지까지)
    var GOAL_KM = 12;           // 화면에 보이는 전체 거리
    var FINISH_SEG = TOTAL - 120;
    var STEP = 1 / 60;
    var BASE_MAX = SEG / STEP;  // 기준 최고 속도 (= 화면 260km/h)
    var CAR_W = 640;            // 차 폭 (세계 단위)
    var LANES = [-0.75, -0.25, 0.25, 0.75];   // 0·1 = 오는 차선(왼쪽), 2·3 = 가는 차선(오른쪽)
    var ONCOMING = [0, 1], GOING = [2, 3];
    var DRAW = 200;

    var CARS = [
        { id: "sport", name: T("스포츠카", "Sports car"), color: "#e0322b", max: 1.0, accel: 1.18, grip: 0.92, lives: 3, eng: [62, 250], desc: T("가장 빨라요", "Fastest") },
        { id: "sedan", name: T("세단", "Sedan"), color: "#2f6fd6", max: 0.93, accel: 1.0, grip: 1.0, lives: 3, eng: [55, 200], desc: T("무난하게 잘 달려요", "Well balanced") },
        { id: "jeep", name: T("지프", "Jeep"), color: "#3f8f4a", max: 0.86, accel: 0.96, grip: 1.18, lives: 3, eng: [46, 170], offroad: true, desc: T("핸들이 잘 꺾이고 흙길도 OK", "Nimble, fine off-road") },
        { id: "truck", name: T("픽업트럭", "Pickup truck"), color: "#f0a020", max: 0.82, accel: 0.86, grip: 0.95, lives: 4, eng: [38, 140], desc: T("튼튼해서 생명 ♥ 4개", "Sturdy: 4 lives") }
    ];
    var ZONES = [   // [끝 비율, 이름, 땅 밝은색, 땅 어두운색]
        [0.20, "trees", "#6cb24e", "#61a645"],
        [0.38, "shops", "#bdb7a8", "#b2ac9c"],
        [0.60, "desert", "#e9cb8c", "#dfbe7b"],
        [0.82, "forest", "#4f9a45", "#468d3d"],
        [1.01, "city", "#bdb7a8", "#b2ac9c"]
    ];
    var ZONE_NAME = {
        trees: T("가로수길", "Tree-lined road"), shops: T("상점가", "Shopping street"), desert: T("사막", "Desert"),
        forest: T("숲길", "Forest road"), city: T("도시", "City")
    };

    /* ---------------- 작은 도구 ---------------- */
    var seed = 20261126;
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    function rr(a, b) { return a + (b - a) * rnd(); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
    function easeIn(a, b, t) { return a + (b - a) * t * t; }
    function easeInOut(a, b, t) { return a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5); }
    function hex(c) { c = c.replace("#", ""); return [parseInt(c.substr(0, 2), 16), parseInt(c.substr(2, 2), 16), parseInt(c.substr(4, 2), 16)]; }
    function mix(c1, c2, t) { var a = hex(c1), b = hex(c2); return "rgb(" + Math.round(lerp(a[0], b[0], t)) + "," + Math.round(lerp(a[1], b[1], t)) + "," + Math.round(lerp(a[2], b[2], t)) + ")"; }
    function fmt(n) { return Math.round(n).toLocaleString(EN ? "en-US" : "ko-KR"); }

    /* ---------------- 하늘·시간 (진행 비율 → 낮/노을/밤/새벽) ---------------- */
    var SKY = [ // [비율, 위, 아래(지평선), 어둠]
        [0.00, "#3d8fe8", "#bfe4ff", 0],
        [0.40, "#3d8fe8", "#bfe4ff", 0],
        [0.50, "#4a4f9a", "#ff9a5a", 0.22],
        [0.58, "#1c2763", "#7a5a8a", 0.6],
        [0.64, "#141d52", "#2c3a78", 0.78],
        [0.84, "#141d52", "#2c3a78", 0.78],
        [0.92, "#5b6cb6", "#ffc196", 0.3],
        [1.00, "#4a9cec", "#cfeaff", 0.02]
    ];
    function skyAt(f) {
        for (var i = 1; i < SKY.length; i++) {
            if (f <= SKY[i][0]) {
                var a = SKY[i - 1], b = SKY[i], t = (f - a[0]) / (b[0] - a[0] || 1);
                return { top: mix(a[1], b[1], t), bot: mix(a[2], b[2], t), botHex: t < 0.5 ? a[2] : b[2], dark: lerp(a[3], b[3], t), sunset: f > 0.42 && f < 0.6 ? 1 - Math.abs(f - 0.51) / 0.09 : 0, dawn: f > 0.86 && f < 0.98 ? 1 - Math.abs(f - 0.92) / 0.06 : 0 };
            }
        }
        var z = SKY[SKY.length - 1]; return { top: z[1], bot: z[2], dark: z[3], sunset: 0, dawn: 0 };
    }
    function zoneAt(f) { for (var i = 0; i < ZONES.length; i++) if (f < ZONES[i][0]) return ZONES[i]; return ZONES[ZONES.length - 1]; }

    /* =========================================================
       그림 (처음에 한 번 그려 두고 크기만 바꿔 씀)
       ========================================================= */
    function mk(w, h, fn) { var c = document.createElement("canvas"); c.width = w; c.height = h; fn(c.getContext("2d"), w, h); return c; }
    function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    function shade(c, k) { var a = hex(c); return "rgb(" + a.map(function (v) { return clamp(Math.round(v * k), 0, 255); }).join(",") + ")"; }

    /* 차 뒷모습: type = sport|sedan|jeep|truck|van|bus|taxi */
    function drawCarRear(g, W, H, type, color) {
        var bodyTop = { sport: 0.42, sedan: 0.34, jeep: 0.2, truck: 0.3, van: 0.1, bus: 0.04, taxi: 0.34 }[type];
        var roofW = { sport: 0.56, sedan: 0.62, jeep: 0.8, truck: 0.74, van: 0.86, bus: 0.94, taxi: 0.62 }[type];
        var tireH = H * 0.16;
        // 그림자
        g.fillStyle = "rgba(0,0,0,0.35)"; g.beginPath(); g.ellipse(W / 2, H * 0.95, W * 0.5, H * 0.06, 0, 0, Math.PI * 2); g.fill();
        // 바퀴
        g.fillStyle = "#1a1a1a"; rrect(g, W * 0.06, H - tireH - H * 0.03, W * 0.16, tireH, 4); g.fill(); rrect(g, W * 0.78, H - tireH - H * 0.03, W * 0.16, tireH, 4); g.fill();
        var low = H * 0.86;
        // 지붕·유리
        var cabTop = H * bodyTop, cabBot = H * (bodyTop + (type === "bus" ? 0.42 : type === "van" ? 0.32 : 0.24));
        g.fillStyle = shade(color, 0.82);
        g.beginPath();
        var rw = W * roofW;
        g.moveTo(W / 2 - rw / 2, cabTop); g.lineTo(W / 2 + rw / 2, cabTop);
        g.lineTo(W * 0.95, cabBot); g.lineTo(W * 0.05, cabBot); g.closePath(); g.fill();
        var glassG = g.createLinearGradient(0, cabTop, 0, cabBot);
        glassG.addColorStop(0, "#9fc4e4"); glassG.addColorStop(1, "#33506e");
        g.fillStyle = glassG;
        var gi = W * 0.05;
        g.beginPath();
        g.moveTo(W / 2 - rw / 2 + gi, cabTop + H * 0.03); g.lineTo(W / 2 + rw / 2 - gi, cabTop + H * 0.03);
        g.lineTo(W * 0.9 - gi * 0.3, cabBot - H * 0.02); g.lineTo(W * 0.1 + gi * 0.3, cabBot - H * 0.02); g.closePath(); g.fill();
        if (type === "bus") { g.fillStyle = shade(color, 0.7); g.fillRect(W * 0.49, cabTop + H * 0.03, W * 0.02, cabBot - cabTop - H * 0.05); }
        // 몸통
        var bodyG = g.createLinearGradient(0, cabBot, 0, low);
        bodyG.addColorStop(0, shade(color, 1.12)); bodyG.addColorStop(1, shade(color, 0.78));
        g.fillStyle = bodyG; rrect(g, W * 0.02, cabBot - 2, W * 0.96, low - cabBot + 2, W * 0.05); g.fill();
        // 트렁크 선
        g.strokeStyle = shade(color, 0.6); g.lineWidth = Math.max(1, W * 0.012);
        g.beginPath(); g.moveTo(W * 0.1, cabBot + (low - cabBot) * 0.28); g.lineTo(W * 0.9, cabBot + (low - cabBot) * 0.28); g.stroke();
        // 미등
        var ly = cabBot + (low - cabBot) * 0.36, lh = (low - cabBot) * 0.24;
        g.fillStyle = "#ff2d2d"; rrect(g, W * 0.06, ly, W * 0.2, lh, 3); g.fill(); rrect(g, W * 0.74, ly, W * 0.2, lh, 3); g.fill();
        g.fillStyle = "#ffb3a8"; g.fillRect(W * 0.08, ly + lh * 0.2, W * 0.07, lh * 0.35); g.fillRect(W * 0.85, ly + lh * 0.2, W * 0.07, lh * 0.35);
        // 번호판
        g.fillStyle = "#f4f4ee"; rrect(g, W * 0.38, ly + lh * 0.1, W * 0.24, lh * 0.85, 2); g.fill();
        g.fillStyle = "#333"; g.fillRect(W * 0.42, ly + lh * 0.42, W * 0.16, Math.max(1, lh * 0.12));
        // 범퍼
        g.fillStyle = "#2a2a2a"; rrect(g, W * 0.03, low - H * 0.07, W * 0.94, H * 0.08, 4); g.fill();
        // 차종별 장식
        if (type === "sport") { g.fillStyle = shade(color, 0.55); g.fillRect(W * 0.08, cabBot - H * 0.07, W * 0.84, H * 0.04); g.fillRect(W * 0.14, cabBot - H * 0.04, W * 0.03, H * 0.05); g.fillRect(W * 0.83, cabBot - H * 0.04, W * 0.03, H * 0.05);
            g.fillStyle = "#555"; g.beginPath(); g.arc(W * 0.4, low - H * 0.03, W * 0.025, 0, 7); g.arc(W * 0.6, low - H * 0.03, W * 0.025, 0, 7); g.fill(); }
        if (type === "jeep") { g.fillStyle = "#222"; g.beginPath(); g.arc(W / 2, cabBot + (low - cabBot) * 0.5, W * 0.13, 0, 7); g.fill(); g.fillStyle = "#555"; g.beginPath(); g.arc(W / 2, cabBot + (low - cabBot) * 0.5, W * 0.06, 0, 7); g.fill(); }
        if (type === "truck") { g.fillStyle = shade(color, 0.6); g.fillRect(W * 0.04, cabBot + 1, W * 0.92, H * 0.05); g.fillStyle = "#6b4a2a"; g.fillRect(W * 0.12, cabBot - H * 0.06, W * 0.2, H * 0.06); g.fillRect(W * 0.6, cabBot - H * 0.08, W * 0.26, H * 0.08); }
        if (type === "taxi") { g.fillStyle = "#fff7d6"; rrect(g, W * 0.38, cabTop - H * 0.07, W * 0.24, H * 0.07, 3); g.fill(); g.fillStyle = "#333"; g.font = "bold " + Math.round(H * 0.055) + "px sans-serif"; g.textAlign = "center"; g.fillText("TAXI", W / 2, cabTop - H * 0.015); }
        if (type === "bus") { g.fillStyle = "#fff"; g.font = "bold " + Math.round(H * 0.07) + "px sans-serif"; g.textAlign = "center"; g.fillText(EN ? "BUS" : "버스", W / 2, cabBot + (low - cabBot) * 0.2); }
    }

    /* 차 앞모습 (마주 오는 차) */
    function drawCarFront(g, W, H, type, color) {
        var bodyTop = { sport: 0.42, sedan: 0.34, jeep: 0.2, truck: 0.26, van: 0.1, bus: 0.04, taxi: 0.34 }[type];
        var roofW = { sport: 0.56, sedan: 0.62, jeep: 0.8, truck: 0.74, van: 0.86, bus: 0.94, taxi: 0.62 }[type];
        var tireH = H * 0.16, low = H * 0.86;
        g.fillStyle = "rgba(0,0,0,0.35)"; g.beginPath(); g.ellipse(W / 2, H * 0.95, W * 0.5, H * 0.06, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#1a1a1a"; rrect(g, W * 0.06, H - tireH - H * 0.03, W * 0.16, tireH, 4); g.fill(); rrect(g, W * 0.78, H - tireH - H * 0.03, W * 0.16, tireH, 4); g.fill();
        var cabTop = H * bodyTop, cabBot = H * (bodyTop + (type === "bus" ? 0.42 : type === "van" ? 0.32 : 0.26));
        var rw = W * roofW;
        g.fillStyle = shade(color, 0.85);
        g.beginPath(); g.moveTo(W / 2 - rw / 2, cabTop); g.lineTo(W / 2 + rw / 2, cabTop); g.lineTo(W * 0.95, cabBot); g.lineTo(W * 0.05, cabBot); g.closePath(); g.fill();
        // 앞유리 + 운전자 실루엣
        var gl = g.createLinearGradient(0, cabTop, 0, cabBot); gl.addColorStop(0, "#c6def2"); gl.addColorStop(1, "#4a6a8c");
        g.fillStyle = gl; var gi = W * 0.05;
        g.beginPath(); g.moveTo(W / 2 - rw / 2 + gi, cabTop + H * 0.03); g.lineTo(W / 2 + rw / 2 - gi, cabTop + H * 0.03); g.lineTo(W * 0.9, cabBot - H * 0.02); g.lineTo(W * 0.1, cabBot - H * 0.02); g.closePath(); g.fill();
        g.fillStyle = "rgba(30,40,60,0.55)"; g.beginPath(); g.arc(W * (type === "bus" ? 0.3 : 0.64), cabBot - (cabBot - cabTop) * 0.42, W * 0.06, 0, 7); g.fill();
        g.fillRect(W * (type === "bus" ? 0.22 : 0.56), cabBot - (cabBot - cabTop) * 0.3, W * 0.16, (cabBot - cabTop) * 0.28);
        // 몸통
        var bg = g.createLinearGradient(0, cabBot, 0, low); bg.addColorStop(0, shade(color, 1.15)); bg.addColorStop(1, shade(color, 0.8));
        g.fillStyle = bg; rrect(g, W * 0.02, cabBot - 2, W * 0.96, low - cabBot + 2, W * 0.05); g.fill();
        // 그릴
        var gy = cabBot + (low - cabBot) * 0.38, gh = (low - cabBot) * 0.3;
        g.fillStyle = "#26292e"; rrect(g, W * 0.3, gy, W * 0.4, gh, 4); g.fill();
        g.strokeStyle = "#555b63"; g.lineWidth = Math.max(1, W * 0.01);
        for (var k = 1; k < 4; k++) { g.beginPath(); g.moveTo(W * 0.31, gy + gh * k / 4); g.lineTo(W * 0.69, gy + gh * k / 4); g.stroke(); }
        // 헤드라이트
        g.fillStyle = "#fffbe6"; rrect(g, W * 0.06, gy - gh * 0.1, W * 0.2, gh * 0.9, 4); g.fill(); rrect(g, W * 0.74, gy - gh * 0.1, W * 0.2, gh * 0.9, 4); g.fill();
        g.fillStyle = "#ffd27a"; g.fillRect(W * 0.07, gy + gh * 0.55, W * 0.07, gh * 0.22); g.fillRect(W * 0.86, gy + gh * 0.55, W * 0.07, gh * 0.22);
        // 번호판·범퍼
        g.fillStyle = "#f4f4ee"; rrect(g, W * 0.39, low - H * 0.1, W * 0.22, H * 0.05, 2); g.fill();
        g.fillStyle = "#2a2a2a"; rrect(g, W * 0.03, low - H * 0.05, W * 0.94, H * 0.07, 4); g.fill();
        if (type === "taxi") { g.fillStyle = "#fff7d6"; rrect(g, W * 0.38, cabTop - H * 0.07, W * 0.24, H * 0.07, 3); g.fill(); g.fillStyle = "#333"; g.font = "bold " + Math.round(H * 0.055) + "px sans-serif"; g.textAlign = "center"; g.fillText("TAXI", W / 2, cabTop - H * 0.015); }
        if (type === "bus") { g.fillStyle = "#222"; g.fillRect(W * 0.2, cabTop + H * 0.02, W * 0.6, H * 0.06); g.fillStyle = "#ffb020"; g.font = "bold " + Math.round(H * 0.045) + "px sans-serif"; g.textAlign = "center"; g.fillText(EN ? "CITY BUS" : "시내버스", W / 2, cabTop + H * 0.065); }
    }

    var IMG = {};
    var CAR_IMG_W = 300;
    function carImg(type, color, front) {
        var aspect = { sport: 0.58, sedan: 0.66, jeep: 0.8, truck: 0.76, van: 0.9, bus: 1.05, taxi: 0.66 }[type];
        return mk(CAR_IMG_W, Math.round(CAR_IMG_W * aspect), function (g, w, h) { (front ? drawCarFront : drawCarRear)(g, w, h, type, color); });
    }
    function buildImages() {
        IMG.player = {};
        CARS.forEach(function (c) { IMG.player[c.id] = carImg(c.id, c.color); });
        IMG.traffic = [
            ["sedan", "#c8ccd2"], ["sedan", "#2b2b2b"], ["sedan", "#7a1f2b"], ["sedan", "#f4f4f0"], ["taxi", "#f08a24"],
            ["van", "#e9e9e4"], ["van", "#3b5f8a"], ["jeep", "#5b6b3a"], ["truck", "#b0b4b8"], ["bus", "#2f9a62"], ["bus", "#2f6fbf"], ["sport", "#ffd23c"]
        ].map(function (t) { var im = carImg(t[0], t[1]); im.kind = t[0]; var fr = carImg(t[0], t[1], true); fr.kind = t[0]; im.front = fr; return im; });

        // 가로수
        IMG.tree = mk(180, 260, function (g, w, h) {
            g.fillStyle = "#6b4626"; g.fillRect(w * 0.45, h * 0.6, w * 0.1, h * 0.4);
            [[0.5, 0.36, 0.42, "#3f8f3a"], [0.32, 0.5, 0.28, "#378334"], [0.68, 0.5, 0.28, "#378334"], [0.5, 0.24, 0.3, "#4fa346"], [0.42, 0.3, 0.16, "#62b958"]].forEach(function (b) {
                g.fillStyle = b[3]; g.beginPath(); g.arc(w * b[0], h * b[1], w * b[2], 0, 7); g.fill();
            });
        });
        IMG.tree2 = mk(180, 260, function (g, w, h) {   // 단풍 느낌
            g.fillStyle = "#6b4626"; g.fillRect(w * 0.45, h * 0.6, w * 0.1, h * 0.4);
            [[0.5, 0.36, 0.42, "#d9822b"], [0.32, 0.5, 0.26, "#c96d22"], [0.68, 0.48, 0.27, "#e0952f"], [0.48, 0.24, 0.26, "#f0ad3c"]].forEach(function (b) {
                g.fillStyle = b[3]; g.beginPath(); g.arc(w * b[0], h * b[1], w * b[2], 0, 7); g.fill();
            });
        });
        IMG.pine = mk(150, 300, function (g, w, h) {
            g.fillStyle = "#5a3a1f"; g.fillRect(w * 0.45, h * 0.82, w * 0.1, h * 0.18);
            for (var i = 0; i < 4; i++) {
                g.fillStyle = i % 2 ? "#245f33" : "#2c7040";
                var top = h * (0.02 + i * 0.18), bot = h * (0.36 + i * 0.16), hw = w * (0.24 + i * 0.08);
                g.beginPath(); g.moveTo(w / 2, top); g.lineTo(w / 2 + hw, bot); g.lineTo(w / 2 - hw, bot); g.closePath(); g.fill();
            }
        });
        IMG.cactus = mk(120, 200, function (g, w, h) {
            g.fillStyle = "#3f8a4a"; g.strokeStyle = "#2d6a37"; g.lineWidth = 3;
            rrect(g, w * 0.4, h * 0.08, w * 0.2, h * 0.92, w * 0.1); g.fill(); g.stroke();
            rrect(g, w * 0.12, h * 0.34, w * 0.16, h * 0.32, w * 0.08); g.fill(); g.stroke();
            g.fillRect(w * 0.2, h * 0.56, w * 0.24, h * 0.08);
            rrect(g, w * 0.72, h * 0.22, w * 0.16, h * 0.34, w * 0.08); g.fill(); g.stroke();
            g.fillRect(w * 0.56, h * 0.48, w * 0.24, h * 0.08);
        });
        IMG.rock = mk(200, 110, function (g, w, h) {
            g.fillStyle = "#b07a4a"; g.beginPath(); g.moveTo(0, h); g.lineTo(w * 0.12, h * 0.4); g.lineTo(w * 0.4, h * 0.12); g.lineTo(w * 0.7, h * 0.2); g.lineTo(w * 0.92, h * 0.55); g.lineTo(w, h); g.closePath(); g.fill();
            g.fillStyle = "#8f5f36"; g.beginPath(); g.moveTo(w * 0.4, h * 0.12); g.lineTo(w * 0.7, h * 0.2); g.lineTo(w * 0.92, h * 0.55); g.lineTo(w, h); g.lineTo(w * 0.55, h); g.closePath(); g.fill();
        });
        IMG.bush = mk(160, 80, function (g, w, h) {
            [[0.3, 0.6, 0.3, "#5a9a3e"], [0.7, 0.6, 0.3, "#4f8f36"], [0.5, 0.45, 0.32, "#66a948"]].forEach(function (b) { g.fillStyle = b[3]; g.beginPath(); g.arc(w * b[0], h * b[1], w * b[2] * 0.6, 0, 7); g.fill(); });
        });
        // 가로등 (L: 왼쪽 길가, 팔이 오른쪽으로 / R: 반대)
        IMG.lampL = mk(120, 300, function (g, w, h) { g.fillStyle = "#4b5563"; g.fillRect(w * 0.1, h * 0.06, w * 0.06, h * 0.94); g.fillRect(w * 0.1, h * 0.06, w * 0.75, h * 0.025); g.fillStyle = "#fff4c2"; rrect(g, w * 0.66, h * 0.07, w * 0.26, h * 0.03, 3); g.fill(); });
        IMG.lampR = mk(120, 300, function (g, w, h) { g.translate(w, 0); g.scale(-1, 1); g.fillStyle = "#4b5563"; g.fillRect(w * 0.1, h * 0.06, w * 0.06, h * 0.94); g.fillRect(w * 0.1, h * 0.06, w * 0.75, h * 0.025); g.fillStyle = "#fff4c2"; rrect(g, w * 0.66, h * 0.07, w * 0.26, h * 0.03, 3); g.fill(); });

        // 상점 (간판 글씨는 직접 지은 일반 이름)
        var shopNames = EN ? ["CAFE", "BAKERY", "BOOKS", "FLOWERS", "PIZZA", "MART", "NOODLES", "DINER", "TOYS", "MUSIC"]
                           : ["카페", "빵집", "서점", "꽃집", "분식", "편의점", "국숫집", "치킨", "문구점", "음반가게"];
        var walls = ["#f2d7b6", "#cfe3f0", "#f4c7c3", "#e3e0b8", "#d9cbe8", "#c9e4c5", "#f6e2a8", "#e8d3c0"];
        var signs = ["#c0392b", "#2e6db4", "#2f8f5b", "#8e44ad", "#d35400", "#16808a", "#b8860b", "#a83262"];
        IMG.shops = shopNames.map(function (name, i) {
            var c = mk(320, 300, function (g, w, h) {
                var tall = i % 3 === 0;
                var top = tall ? 0 : h * 0.22;
                g.fillStyle = walls[i % walls.length]; g.fillRect(0, top, w, h - top);
                g.fillStyle = shade(walls[i % walls.length], 0.8); g.fillRect(0, top, w, h * 0.03);
                // 위층 창문
                g.fillStyle = "#7aa6c8";
                for (var r = 0; r < (tall ? 3 : 2); r++) for (var k = 0; k < 4; k++) g.fillRect(w * (0.08 + k * 0.23), top + h * (0.08 + r * 0.14), w * 0.15, h * 0.08);
                // 간판
                g.fillStyle = signs[i % signs.length]; g.fillRect(w * 0.04, h * 0.5, w * 0.92, h * 0.13);
                g.fillStyle = "#fff"; g.font = "bold " + Math.round(h * 0.09) + "px 'Noto Sans KR', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(name, w / 2, h * 0.567);
                // 차양
                for (var s = 0; s < 8; s++) { g.fillStyle = s % 2 ? "#fff" : signs[i % signs.length]; g.fillRect(w * (0.04 + s * 0.115), h * 0.64, w * 0.115, h * 0.05); }
                // 쇼윈도·문
                g.fillStyle = "#3d5a73"; g.fillRect(w * 0.06, h * 0.71, w * 0.56, h * 0.27);
                g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(w * 0.08, h * 0.72, w * 0.18, h * 0.24);
                g.fillStyle = "#5a3a22"; g.fillRect(w * 0.68, h * 0.71, w * 0.24, h * 0.29);
                g.fillStyle = "#e8c35a"; g.fillRect(w * 0.87, h * 0.84, w * 0.02, h * 0.04);
            });
            c.signY = 0.567; return c;
        });
        // 도시 빌딩
        IMG.towers = [0, 1, 2, 3, 4].map(function (i) {
            var cols = ["#8aa0b8", "#a7a39a", "#6f87a6", "#b6aa94", "#7d8f9e"];
            return mk(260, 520, function (g, w, h) {
                g.fillStyle = cols[i]; g.fillRect(0, h * 0.04 * (i % 3), w, h);
                g.fillStyle = shade(cols[i], 0.75); g.fillRect(w * 0.82, h * 0.04 * (i % 3), w * 0.18, h);
                for (var r = 0; r < 14; r++) for (var k = 0; k < 4; k++) {
                    g.fillStyle = (r * 7 + k * 3 + i) % 5 === 0 ? "#ffe9a0" : "#d8e7f2";
                    g.fillRect(w * (0.08 + k * 0.18), h * (0.08 + r * 0.062), w * 0.11, h * 0.035);
                }
                g.fillStyle = "#3c4650"; g.fillRect(w * 0.3, h * 0.92, w * 0.3, h * 0.08);
            });
        });
        // 도로 표지판 (남은 km)
        IMG.kmSign = {};
        for (var km = 1; km < GOAL_KM; km++) {
            (function (left) {
                IMG.kmSign[left] = mk(300, 280, function (g, w, h) {
                    g.fillStyle = "#6b7280"; g.fillRect(w * 0.2, h * 0.45, w * 0.05, h * 0.55); g.fillRect(w * 0.75, h * 0.45, w * 0.05, h * 0.55);
                    g.fillStyle = "#1f7a46"; rrect(g, 0, 0, w, h * 0.5, 12); g.fill();
                    g.strokeStyle = "#fff"; g.lineWidth = 5; rrect(g, 8, 8, w - 16, h * 0.5 - 16, 8); g.stroke();
                    g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
                    g.font = "bold 34px 'Noto Sans KR', sans-serif"; g.fillText(T("목적지", "Destination"), w / 2, h * 0.15);
                    g.font = "bold 52px Arial, sans-serif"; g.fillText(left + " km", w / 2, h * 0.34);
                });
            })(GOAL_KM - km);
        }
        IMG.billboard = mk(420, 300, function (g, w, h) {
            g.fillStyle = "#555"; g.fillRect(w * 0.2, h * 0.5, w * 0.04, h * 0.5); g.fillRect(w * 0.76, h * 0.5, w * 0.04, h * 0.5);
            var bg = g.createLinearGradient(0, 0, w, 0); bg.addColorStop(0, "#5a57b5"); bg.addColorStop(1, "#ff5e8a");
            g.fillStyle = bg; rrect(g, 0, 0, w, h * 0.55, 10); g.fill();
            g.fillStyle = "#fff3c4"; g.textAlign = "center"; g.textBaseline = "middle";
            g.font = "bold 64px Chewy, 'Comic Sans MS', cursive"; g.fillText("WowEzBox", w / 2, h * 0.22);
            g.font = "bold 26px 'Noto Sans KR', sans-serif"; g.fillText(T("즐거운 드라이브 되세요!", "Have a nice drive!"), w / 2, h * 0.43);
        });
        // 출발·도착 문
        function gate(text, c1, c2) {
            return mk(900, 420, function (g, w, h) {
                g.fillStyle = "#4b5563"; g.fillRect(w * 0.02, h * 0.1, w * 0.03, h * 0.9); g.fillRect(w * 0.95, h * 0.1, w * 0.03, h * 0.9);
                for (var i = 0; i < 18; i++) { g.fillStyle = i % 2 ? c1 : c2; g.fillRect(w * 0.02 + i * (w * 0.96 / 18), h * 0.04, w * 0.96 / 18 + 1, h * 0.06); g.fillStyle = i % 2 ? c2 : c1; g.fillRect(w * 0.02 + i * (w * 0.96 / 18), h * 0.1, w * 0.96 / 18 + 1, h * 0.06); }
                g.fillStyle = "#fff"; g.font = "bold 90px 'Noto Sans KR', Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
                g.strokeStyle = "rgba(0,0,0,0.45)"; g.lineWidth = 8; g.strokeText(text, w / 2, h * 0.32); g.fillText(text, w / 2, h * 0.32);
            });
        }
        IMG.startGate = gate(T("출발", "START"), "#111", "#fff");
        IMG.finishGate = gate(T("도착 🏁", "FINISH 🏁"), "#111", "#fff");
        // 세계에서의 폭 (도로 반폭 1600 기준)
        IMG.tree.worldW = IMG.tree2.worldW = 1000; IMG.pine.worldW = 760; IMG.cactus.worldW = 480; IMG.rock.worldW = 900; IMG.bush.worldW = 650;
        IMG.lampL.worldW = IMG.lampR.worldW = 520; IMG.billboard.worldW = 1800;
        IMG.shops.forEach(function (c) { c.worldW = 2300; });
        IMG.towers.forEach(function (c) { c.worldW = 1900; });
        Object.keys(IMG.kmSign).forEach(function (k) { IMG.kmSign[k].worldW = 1100; });
        IMG.startGate.worldW = IMG.finishGate.worldW = 5300;
    }

    /* =========================================================
       도로 만들기 (같은 길이 매번 같게 → 기록 비교 가능)
       ========================================================= */
    var segs = [];
    function lastY() { return segs.length ? segs[segs.length - 1].p2.world.y : 0; }
    function addSeg(curve, y) {
        var n = segs.length;
        segs.push({
            index: n,
            p1: { world: { y: lastY(), z: n * SEG }, camera: {}, screen: {} },
            p2: { world: { y: y, z: (n + 1) * SEG }, camera: {}, screen: {} },
            curve: curve, sprites: [], cars: [], light: Math.floor(n / RUMBLE) % 2 === 0
        });
    }
    function addRoad(enter, hold, leave, curve, height) {
        var sy = lastY(), ey = sy + height * SEG, total = enter + hold + leave, n;
        for (n = 0; n < enter; n++) addSeg(easeIn(0, curve, n / enter), easeInOut(sy, ey, n / total));
        for (n = 0; n < hold; n++) addSeg(curve, easeInOut(sy, ey, (enter + n) / total));
        for (n = 0; n < leave; n++) addSeg(easeInOut(curve, 0, n / leave), easeInOut(sy, ey, (enter + hold + n) / total));
    }
    function buildRoad() {
        segs = []; seed = 20261126;
        addRoad(10, 60, 10, 0, 0);
        while (segs.length < FINISH_SEG - 160) {
            var k = rnd(), len = Math.round(rr(25, 55)), dir = rnd() < 0.5 ? -1 : 1;
            var f = segs.length / TOTAL;
            var bend = rr(2, 4.5 + f * 2.5);
            var hill = (zoneAt(f)[1] === "desert" ? rr(10, 45) : rr(8, 35)) * (rnd() < 0.5 ? -1 : 1);
            if (k < 0.22) addRoad(15, len, 15, 0, 0);
            else if (k < 0.5) addRoad(len, len, len, dir * bend, 0);
            else if (k < 0.68) addRoad(len, len, len, 0, hill);
            else if (k < 0.85) addRoad(len, len, len, dir * bend, hill);
            else { addRoad(20, 25, 20, dir * bend, 0); addRoad(20, 25, 20, -dir * bend, 0); }
        }
        addRoad(40, 40, 40, 0, -lastY() / SEG);   // 도착 전에 평지로
        while (segs.length < TOTAL) addSeg(0, lastY());

        // 풍경 놓기
        function put(i, img, offset, extra) { if (i >= 0 && i < segs.length) segs[i].sprites.push({ img: img, offset: offset, kind: extra || "" }); }
        for (var i = 20; i < TOTAL; i++) {
            var z = zoneAt(i / TOTAL)[1];
            if (z === "trees") {
                if (i % 8 === 0) { put(i, IMG.tree, -rr(1.2, 1.5)); put(i + 4, IMG.tree, rr(1.2, 1.5)); }
                if (i % 13 === 0) put(i, rnd() < 0.5 ? IMG.tree2 : IMG.tree, (rnd() < 0.5 ? -1 : 1) * rr(2.2, 4));
                if (i % 9 === 0) put(i, IMG.bush, (rnd() < 0.5 ? -1 : 1) * rr(1.7, 3.5));
                if (i % 30 === 0) { put(i, IMG.lampL, -1.08, "lamp"); put(i + 15, IMG.lampR, 1.08, "lamp"); }
            } else if (z === "shops") {
                if (i % 10 === 0) { put(i, IMG.shops[Math.floor(rnd() * IMG.shops.length)], -1.25, "shop"); put(i + 5, IMG.shops[Math.floor(rnd() * IMG.shops.length)], 1.25, "shop"); }
                if (i % 20 === 0) { put(i + 2, IMG.lampL, -1.08, "lamp"); put(i + 12, IMG.lampR, 1.08, "lamp"); }
            } else if (z === "desert") {
                if (i % 11 === 0) put(i, IMG.cactus, (rnd() < 0.5 ? -1 : 1) * rr(1.2, 3.5));
                if (i % 17 === 0) put(i, IMG.rock, (rnd() < 0.5 ? -1 : 1) * rr(1.3, 4));
                if (i % 5 === 0 && rnd() < 0.3) put(i, IMG.cactus, (rnd() < 0.5 ? -1 : 1) * rr(3, 6));
            } else if (z === "forest") {
                if (i % 4 === 0) put(i, IMG.pine, -rr(1.15, 1.6));
                if (i % 4 === 2) put(i, IMG.pine, rr(1.15, 1.6));
                if (i % 7 === 0) put(i, IMG.pine, (rnd() < 0.5 ? -1 : 1) * rr(2, 4.5));
                if (i % 40 === 0) { put(i, IMG.lampL, -1.08, "lamp"); put(i + 20, IMG.lampR, 1.08, "lamp"); }
            } else {
                if (i % 12 === 0) { put(i, IMG.towers[Math.floor(rnd() * 5)], -rr(1.3, 1.6)); put(i + 6, IMG.towers[Math.floor(rnd() * 5)], rr(1.3, 1.6)); }
                if (i % 16 === 0) { put(i + 2, IMG.lampL, -1.08, "lamp"); put(i + 10, IMG.lampR, 1.08, "lamp"); }
            }
            if (i % 900 === 450) put(i, IMG.billboard, i % 1800 === 450 ? -1.3 : 1.3);
        }
        // km 표지판
        for (var km = 1; km < GOAL_KM; km++) { var si = Math.round(FINISH_SEG * km / GOAL_KM); put(si, IMG.kmSign[GOAL_KM - km], 1.3); }
        put(8, IMG.startGate, 0, "gate");
        put(FINISH_SEG, IMG.finishGate, 0, "gate");
    }

    /* =========================================================
       소리 (Web Audio)
       ========================================================= */
    var muted = !!load("roadMuted.v1", false);
    var AC = null, master = null, eng = null, noiseBuf = null;
    function audio() {
        if (!AC) {
            try {
                AC = new (window.AudioContext || window.webkitAudioContext)();
                master = AC.createGain(); master.gain.value = muted ? 0 : 1; master.connect(AC.destination);
                var len = AC.sampleRate * 1, buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
                for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
                noiseBuf = buf;
            } catch (e) { AC = null; }
        }
        if (AC && AC.state === "suspended") AC.resume();
        return AC;
    }
    function engineStart() {
        var a = audio(); if (!a || eng) return;
        var o1 = a.createOscillator(), o2 = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
        o1.type = "sawtooth"; o2.type = "square"; f.type = "lowpass"; f.frequency.value = 600; f.Q.value = 2;
        g.gain.value = 0;
        o1.connect(f); o2.connect(f); f.connect(g); g.connect(master);
        o1.start(); o2.start();
        eng = { o1: o1, o2: o2, f: f, g: g };
    }
    function engineSet(pct, on) {
        if (!eng) return;
        var c = car(), t = AC.currentTime;
        var fr = c.eng[0] + (c.eng[1] - c.eng[0]) * pct;
        // 기어 느낌: 속도 구간마다 살짝 떨어졌다 다시 오름
        var gear = pct * 4, gf = gear - Math.floor(gear);
        fr *= 0.82 + gf * 0.3;
        eng.o1.frequency.setTargetAtTime(fr, t, 0.05);
        eng.o2.frequency.setTargetAtTime(fr * 0.5, t, 0.05);
        eng.f.frequency.setTargetAtTime(380 + pct * 1500, t, 0.08);
        eng.g.gain.setTargetAtTime(on ? 0.045 + pct * 0.04 : 0, t, 0.1);
    }
    function engineStop() { if (!eng) return; var e = eng; eng = null; try { e.g.gain.setTargetAtTime(0, AC.currentTime, 0.05); setTimeout(function () { e.o1.stop(); e.o2.stop(); }, 300); } catch (x) {} }
    function noise(dur, type, f1, f2, vol, pan) {
        var a = audio(); if (!a || muted) return;
        var s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime;
        s.buffer = noiseBuf; f.type = type; f.frequency.setValueAtTime(f1, t); f.frequency.exponentialRampToValueAtTime(f2, t + dur); f.Q.value = 1.2;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        s.connect(f); f.connect(g);
        if (a.createStereoPanner && pan) { var p = a.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(master); } else g.connect(master);
        s.start(t); s.stop(t + dur + 0.05);
    }
    function tone(freq, dur, type, vol, when) {
        var a = audio(); if (!a || muted) return;
        var o = a.createOscillator(), g = a.createGain(), t = a.currentTime + (when || 0);
        o.type = type || "square"; o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
    }
    function sWhoosh(side) { noise(0.35, "bandpass", 2400, 380, 0.35, side); }
    function sCrash() { noise(0.6, "lowpass", 3000, 120, 0.6, 0); tone(70, 0.4, "sine", 0.4); tone(110, 0.15, "square", 0.12); }
    function sClick() { tone(900, 0.05, "square", 0.06); }
    function sBeep(hi) { tone(hi ? 880 : 440, hi ? 0.45 : 0.18, "square", 0.12); }
    function sFanfare() { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.35, "triangle", 0.16, i * 0.14); }); tone(1047, 0.8, "triangle", 0.14, 0.62); tone(1319, 0.8, "triangle", 0.1, 0.62); }
    function sOver() { [392, 330, 262, 196].forEach(function (f, i) { tone(f, 0.3, "triangle", 0.14, i * 0.18); }); }

    /* =========================================================
       상태
       ========================================================= */
    var W = 0, H = 0, HZ = 0, FX = 0, FY = 0, DPR = 1;
    var carIdx = clamp(load("roadCar.v1", 0) | 0, 0, CARS.length - 1);
    function car() { return CARS[carIdx]; }
    var S = null;   // 한 판 상태
    var keys = { left: false, right: false, up: false, down: false };
    var mode = "menu";   // menu | count | play | pause | end
    var rec = load("roadRecord.v1", { best: 0, bestTime: 0, finishes: 0, plays: 0, farthest: 0 });

    function newRun() {
        var c = car();
        S = {
            pos: 0, speed: 0, x: LANES[2], lives: c.lives, maxLives: c.lives, score: 0, time: 0,
            maxSpeed: BASE_MAX * c.max, accel: BASE_MAX * c.max / 4.2 * c.accel,
            traffic: [], touched: [], inv: 0, shake: 0, popups: [], skyOff: 0, hillOff: 0,
            passes: 0, dodged: 0, nearMiss: 0, crashes: 0, wrongT: 0, wasWrong: false, count: 3.5, ended: false, finished: false, offroad: 0, lastHud: 0
        };
        // 처음 차들 (드문드문)
        for (var i = 0; i < 3; i++) spawnGoing(PLAYER_Z + 4000 + i * 6000, false);
        for (var j = 0; j < 2; j++) spawnOncoming(PLAYER_Z + 14000 + j * 12000);
    }

    /* ---------------- 상대 차 ----------------
       가는 차(dir 1): 오른쪽 2차선, 나보다 느림 → 따라잡아 추월. 갈수록 두 차선을 나란히 막는 경우가 많아짐
       오는 차(dir -1): 왼쪽 2차선, 마주 달려옴 → 중앙선을 넘어 추월할 때 피해야 함 */
    function rr2(a, b) { return a + (b - a) * Math.random(); }
    function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
    function laneBusy(lane, z, gap) { return S.traffic.some(function (c) { return c.lane === lane && Math.abs(c.z - z) < gap; }); }
    function makeCar(z, lane, dir, sp) {
        var base = pick(IMG.traffic);
        return { z: z, lane: lane, offset: LANES[lane], target: LANES[lane], dir: dir, speed: sp, img: dir < 0 ? base.front : base, kind: base.kind,
                 prevDz: null, signal: 0, changeT: 2 + Math.random() * 6, passed: false };
    }
    function spawnGoing(z, convoy) {
        var f = z / (TOTAL * SEG);
        var lanes = convoy ? GOING.slice() : [pick(GOING)];
        if (lanes.some(function (l) { return laneBusy(l, z, 2200); })) return false;
        var sp = BASE_MAX * rr2(0.2, 0.36) * (1 + f * 0.2);
        lanes.forEach(function (l, k) {
            var c = makeCar(z + (convoy ? k * rr2(-150, 150) : 0), l, 1, convoy ? sp * rr2(0.97, 1.03) : sp);
            if (!convoy && (c.kind === "bus" || c.kind === "truck" || c.kind === "van")) c.speed *= 0.85;
            S.traffic.push(c);
        });
        return true;
    }
    function spawnOncoming(z) {
        var f = z / (TOTAL * SEG);
        var lane = pick(ONCOMING);
        if (laneBusy(lane, z, 2600)) { lane = lane === 0 ? 1 : 0; if (laneBusy(lane, z, 2600)) return false; }
        // 두 오는 차선이 같은 곳에서 동시에 막히지 않게 (피할 틈 남기기)
        var other = lane === 0 ? 1 : 0;
        if (laneBusy(other, z, 900)) return false;
        S.traffic.push(makeCar(z, lane, -1, -BASE_MAX * rr2(0.28, 0.48) * (1 + f * 0.3)));
        return true;
    }
    function updateTraffic(dt) {
        var pz = S.pos + PLAYER_Z, f = S.pos / (TOTAL * SEG);
        var going = 0, oncoming = 0;
        for (var i = S.traffic.length - 1; i >= 0; i--) {
            var c = S.traffic[i];
            c.z += c.speed * dt;
            // 같은 방향 두 차선 안에서만 차선 바꾸기 (조금 지나서부터)
            if (f > 0.15) {
                c.changeT -= dt;
                if (c.changeT <= 0 && c.signal <= 0 && c.offset === c.target) {
                    c.changeT = rr2(3, 8) - f * 2;
                    if (Math.random() < 0.2 + f * 0.45) {
                        var pair = c.dir > 0 ? GOING : ONCOMING;
                        var nl = c.lane === pair[0] ? pair[1] : pair[0];
                        if (!laneBusy(nl, c.z, 1600)) { c.signal = 1.1; c.newLane = nl; }
                    }
                }
                if (c.signal > 0) { c.signal -= dt; if (c.signal <= 0) { c.lane = c.newLane; c.target = LANES[c.lane]; } }
            }
            if (c.offset !== c.target) { var d = c.target - c.offset, st = dt * 0.45; c.offset = Math.abs(d) < st ? c.target : c.offset + Math.sign(d) * st; }
            var dz = c.z - pz;
            // 지나감: 추월(가는 차) / 스쳐 지나감(오는 차)
            if (c.prevDz !== null && c.prevDz > 0 && dz <= 0 && !c.passed) {
                c.passed = true;
                var gap = Math.abs(S.x - c.offset), side = c.offset < S.x ? -0.6 : 0.6;
                if (c.dir > 0) {
                    S.passes++;
                    if (gap < 0.5) { S.nearMiss++; addScore(50, T("아슬아슬! +50", "Close call! +50"), "#ffd23c"); sWhoosh(side); }
                    else { addScore(20, T("추월 +20", "Pass +20"), "#9fe39f"); if (S.speed > BASE_MAX * 0.45) sWhoosh(side * 0.6); }
                } else {
                    S.dodged++;
                    sWhoosh(side);
                    if (gap < 0.5) { S.nearMiss++; addScore(50, T("휙! 아슬아슬 +50", "Whoosh! Close +50"), "#ffd23c"); }
                    else S.score += 10;
                }
            }
            c.prevDz = dz;
            // 부딪힘
            if (S.inv <= 0 && dz > -300 && dz < 300 && Math.abs(S.x - c.offset) < (CAR_W / ROAD_W) * 0.85) crash(c);
            if (dz < -3000 || c.z > TOTAL * SEG || c.z < 0) S.traffic.splice(i, 1);
            else if (dz > 0) { if (c.dir > 0) going++; else oncoming++; }
        }
        if (S.pos / SEG > FINISH_SEG - 250) return;
        var far = pz + DRAW * SEG * rr2(0.6, 0.95);
        // 가는 차: 2 → 7대, 나란히 막는 차 확률 10% → 45%
        if (going < 2 + Math.round(f * 5)) spawnGoing(far, Math.random() < 0.1 + f * 0.35);
        // 오는 차: 1 → 9대
        if (oncoming < 1 + Math.round(f * 8)) spawnOncoming(far + rr2(0, 4000));
    }
    function crash(c) {
        S.lives--; S.crashes++; S.inv = 2.2; S.shake = 0.45;
        S.speed = c.dir > 0 ? Math.min(S.speed, c.speed * 0.55) : S.speed * 0.15;
        c.z += c.dir > 0 ? 500 : -600; c.passed = true;
        sCrash();
        addPop(T("쾅! ♥ -1", "Crash! ♥ -1"), "#ff6b6b");
        if (navigator.vibrate) try { navigator.vibrate(160); } catch (e) {}
        if (S.lives <= 0) endGame(false);
    }
    function addScore(n, text, color) { S.score += n; addPop(text, color); }
    function addPop(text, color) { S.popups.push({ text: text, color: color, t: 1.3 }); if (S.popups.length > 3) S.popups.shift(); }

    /* ---------------- 한 프레임 계산 ---------------- */
    function findSeg(z) { return segs[clamp(Math.floor(z / SEG), 0, segs.length - 1)]; }
    function update(dt) {
        var c = car();
        if (mode === "count") {
            S.count -= dt;
            var n = Math.ceil(S.count - 0.5);
            if (n !== S.lastCount) { S.lastCount = n; if (n > 0) { sBeep(false); addPop(String(n), "#fff"); } else { sBeep(true); addPop(T("출발!", "GO!"), "#ffd23c"); mode = "play"; } }
            engineSet(0, true);
            return;
        }
        if (mode !== "play") return;
        S.time += dt;
        var seg = findSeg(S.pos + PLAYER_Z);
        var pct = S.speed / BASE_MAX;
        var steer = dt * 2.1 * Math.min(1, pct * 1.6 + 0.15) * c.grip;
        if (keys.left) S.x -= steer; else if (keys.right) S.x += steer;
        S.x -= steer * pct * seg.curve * 0.3 / c.grip * 0.9;   // 굽은 길에서 바깥으로 밀림
        if (keys.up) S.speed += S.accel * dt * (1 - 0.55 * S.speed / S.maxSpeed);
        else if (keys.down) S.speed -= BASE_MAX * 0.9 * dt;
        else S.speed -= BASE_MAX / 5 * dt;
        var off = Math.abs(S.x) > 1.0;
        if (off) {
            var lim = BASE_MAX * (c.offroad ? 0.45 : 0.28);
            if (S.speed > lim) S.speed -= BASE_MAX * (c.offroad ? 0.6 : 1.1) * dt;
            S.offroad += dt;
        }
        S.x = clamp(S.x, -2.4, 2.4);
        S.speed = clamp(S.speed, 0, S.maxSpeed);
        S.pos += S.speed * dt;
        S.skyOff += 0.0012 * seg.curve * pct;
        S.hillOff += 0.0026 * seg.curve * pct;
        var wrong = S.x < -0.05 && Math.abs(S.x) <= 1;   // 오는 차선을 달리는 중
        S.score += S.speed * dt / SEG * 0.5 * (wrong ? 2 : 1);   // 달린 거리 점수 (오는 차선이면 2배)
        if (wrong && !S.wasWrong && pct > 0.2) addPop(T("반대 차선! 점수 ×2", "Wrong lane! Score ×2"), "#ff9ad5");
        S.wasWrong = wrong;
        if (wrong) S.wrongT += dt;
        if (S.inv > 0) S.inv -= dt;
        if (S.shake > 0) S.shake -= dt;
        S.popups.forEach(function (p) { p.t -= dt; });
        S.popups = S.popups.filter(function (p) { return p.t > 0; });
        updateTraffic(dt);
        engineSet(pct, true);
        if (S.pos + PLAYER_Z >= FINISH_SEG * SEG && !S.ended) endGame(true);
    }

    /* =========================================================
       그리기
       ========================================================= */
    function project(p, cx, cy, cz) {
        p.camera.x = -cx; p.camera.y = (p.world.y || 0) - cy; p.camera.z = (p.world.z || 0) - cz;
        p.screen.scale = CAM_DEPTH / p.camera.z;
        p.screen.x = Math.round(W / 2 + p.screen.scale * p.camera.x * FX);
        p.screen.y = Math.round(HZ - p.screen.scale * p.camera.y * FY);
        p.screen.w = Math.round(p.screen.scale * ROAD_W * FX);
    }
    function poly(x1, y1, x2, y2, x3, y3, x4, y4, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath(); ctx.fill(); }

    var stars = [];
    for (var si = 0; si < 90; si++) stars.push([Math.random(), Math.random() * 0.9, Math.random() * 1.4 + 0.4, Math.random() * 6]);

    function drawBackground(sky, f, zone) {
        var g = ctx.createLinearGradient(0, 0, 0, HZ);
        g.addColorStop(0, sky.top); g.addColorStop(1, sky.bot);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, HZ + 2);
        // 해 (낮·노을·새벽)
        var sunVis = 1 - sky.dark * 1.4;
        if (sunVis > 0.02) {
            var sunY = sky.sunset ? HZ * (0.55 + 0.4 * sky.sunset) : sky.dawn ? HZ * (0.95 - 0.35 * sky.dawn) : HZ * 0.18;
            var sx = W * 0.72 - S.skyOff * W * 0.5 % W;
            sx = ((sx % W) + W) % W;
            var sg = ctx.createRadialGradient(sx, sunY, 0, sx, sunY, W * 0.12);
            var warm = sky.sunset || sky.dawn ? "255,170,90" : "255,250,215";
            sg.addColorStop(0, "rgba(" + warm + "," + (0.95 * sunVis) + ")"); sg.addColorStop(0.25, "rgba(" + warm + "," + (0.6 * sunVis) + ")"); sg.addColorStop(1, "rgba(" + warm + ",0)");
            ctx.fillStyle = sg; ctx.fillRect(sx - W * 0.12, sunY - W * 0.12, W * 0.24, W * 0.24);
        }
        // 먼 산·언덕 (구간마다 모양·색 다름)
        var desert = zone === "desert", cityish = zone === "city" || zone === "shops";
        var far = desert ? "#c98a5a" : cityish ? "#8ea0b8" : "#7fa6c4";
        var near = desert ? "#b5693d" : cityish ? "#6f84a0" : "#5e9a6a";
        drawHills(S.hillOff * 0.5, far, HZ * 0.32, 0.0045, desert);
        if (cityish) drawSkyline(S.hillOff, near); else drawHills(S.hillOff, near, HZ * 0.2, 0.008, desert);
    }
    function drawHills(off, color, amp, freq, mesa) {
        ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, HZ + 2);
        var o = off * 2000;
        for (var x = 0; x <= W + 8; x += 8) {
            var t = (x / W) * 900 + o;
            var v = Math.sin(t * freq) * 0.5 + Math.sin(t * freq * 2.3 + 1.7) * 0.3 + Math.sin(t * freq * 5.1 + 0.4) * 0.12;
            if (mesa) v = Math.max(-0.2, Math.min(0.55, v * 1.6));
            ctx.lineTo(x, HZ - amp * (0.55 + v * 0.6));
        }
        ctx.lineTo(W, HZ + 2); ctx.closePath(); ctx.fill();
    }
    function drawSkyline(off, color) {
        ctx.fillStyle = color;
        var o = off * 2000, bw = Math.max(18, W / 26);
        var start = -((o % (bw * 40)) + bw * 40) % (bw * 40);
        for (var x = start - bw * 40; x < W + bw; x += bw) {
            var k = Math.floor((x - start) / bw);
            var hh = HZ * (0.08 + ((k * 37 + 11) % 17) / 17 * 0.2);
            ctx.fillRect(x, HZ - hh, bw - 2, hh + 2);
        }
    }

    var lights = [];
    function renderSprite(img, scale, x, y, align, clipY, extra) {
        var w = scale * FX * (img.worldW || 900);
        var h = w * img.height / img.width;
        var dx = align < 0 ? x - w : align > 0 ? x : x - w / 2;
        var dy = y - h;
        var clipH = clipY ? Math.max(0, dy + h - clipY) : 0;
        if (clipH >= h || w < 1) return;
        ctx.drawImage(img, 0, 0, img.width, img.height - img.height * clipH / h, dx, dy, w, h - clipH);
        if (extra) extra(dx, dy, w, h, clipH);
    }
    function render() {
        var f = clamp(S.pos / (FINISH_SEG * SEG), 0, 1);
        var sky = skyAt(f), zone = zoneAt(f)[1];
        ctx.save();
        if (S.shake > 0) ctx.translate((Math.random() - 0.5) * 14 * S.shake, (Math.random() - 0.5) * 10 * S.shake);
        drawBackground(sky, f, zone);
        lights = [];

        var base = findSeg(S.pos), basePct = (S.pos % SEG) / SEG;
        var pSeg = findSeg(S.pos + PLAYER_Z), pPct = ((S.pos + PLAYER_Z) % SEG) / SEG;
        var playerY = lerp(pSeg.p1.world.y, pSeg.p2.world.y, pPct);
        var maxy = H, x = 0, dx = -(base.curve * basePct);
        var fogC = sky.bot;
        var n, seg, end = Math.min(DRAW, segs.length - base.index - 1);
        for (n = 0; n < end; n++) {
            seg = segs[base.index + n];
            seg.fog = 1 - 1 / Math.exp(Math.pow(n / DRAW, 2) * 4);
            seg.clip = maxy;
            project(seg.p1, S.x * ROAD_W - x, playerY + CAM_H, S.pos);
            project(seg.p2, S.x * ROAD_W - x - dx, playerY + CAM_H, S.pos);
            x += dx; dx += seg.curve;
            seg.vis = !(seg.p1.camera.z <= CAM_DEPTH || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy);
            if (!seg.vis) continue;
            drawSegment(seg, fogC);
            maxy = seg.p1.screen.y;
        }
        // 차를 조각에 나눠 담기
        S.touched.forEach(function (s) { s.cars.length = 0; }); S.touched = [];
        S.traffic.forEach(function (c) { var s = findSeg(c.z); s.cars.push(c); S.touched.push(s); });
        var dark = sky.dark;
        for (n = end - 1; n > 0; n--) {
            seg = segs[base.index + n];
            if (seg.p1.camera.z <= CAM_DEPTH) continue;
            var i, sp;
            for (i = 0; i < seg.sprites.length; i++) {
                sp = seg.sprites[i];
                var sc = seg.p1.screen.scale;
                var sx = seg.p1.screen.x + sc * sp.offset * ROAD_W * FX;
                var align = sp.kind === "gate" ? 0 : sp.offset < 0 ? -1 : 1;
                var extra = null;
                if (dark > 0.05 && sp.kind === "lamp") extra = (function (left) { return function (ddx, ddy, w, h, clipH) { if (clipH < h * 0.9) lights.push([ddx + w * (left ? 0.79 : 0.21), ddy + h * 0.1, w * 0.9, "255,226,150"]); }; })(sp.offset < 0);
                else if (dark > 0.05 && sp.kind === "shop") extra = function (ddx, ddy, w, h, clipH) { if (clipH < h * 0.4) lights.push([ddx + w / 2, ddy + h * 0.57, w * 0.55, "255,240,200"]); };
                renderSprite(sp.img, sc, sx, seg.p1.screen.y, align, seg.clip, extra);
            }
            for (i = 0; i < seg.cars.length; i++) {
                var c = seg.cars[i], cp = (c.z % SEG) / SEG;
                var cs = lerp(seg.p1.screen.scale, seg.p2.screen.scale, cp);
                var cx = lerp(seg.p1.screen.x, seg.p2.screen.x, cp) + cs * c.offset * ROAD_W * FX;
                var cy = lerp(seg.p1.screen.y, seg.p2.screen.y, cp);
                drawTrafficCar(c, cs, cx, cy, seg.clip, dark);
            }
        }
        drawPlayer(dark);
        // 밤: 전체를 어둡게 + 불빛
        if (dark > 0.01) {
            ctx.fillStyle = "rgba(6,10,36," + (dark * 0.72) + ")"; ctx.fillRect(-20, -20, W + 40, H + 40);
            ctx.globalCompositeOperation = "lighter";
            stars.forEach(function (s) { var a = (dark - 0.3) * (0.6 + 0.4 * Math.sin(S.time * 2 + s[3])); if (a > 0 && s[1] * HZ < HZ * 0.85) { ctx.fillStyle = "rgba(255,255,240," + a + ")"; ctx.fillRect(s[0] * W, s[1] * HZ, s[2], s[2]); } });
            if (dark > 0.5) { var mx = W * 0.2, my = HZ * 0.22; ctx.fillStyle = "rgba(255,250,220," + (dark - 0.3) + ")"; ctx.beginPath(); ctx.arc(mx, my, W * 0.025, 0, 7); ctx.fill(); }
            drawHeadlights(dark);
            ctx.globalCompositeOperation = "source-over";
        }
        if (lights.length) {
            ctx.globalCompositeOperation = "lighter";
            lights.forEach(function (l) {
                var al = l[4] != null ? l[4] : 0.85 * dark;
                if (al < 0.02) return;
                var g = ctx.createRadialGradient(l[0], l[1], 0, l[0], l[1], l[2] * 0.5);
                g.addColorStop(0, "rgba(" + l[3] + "," + al + ")"); g.addColorStop(1, "rgba(" + l[3] + ",0)");
                ctx.fillStyle = g; ctx.fillRect(l[0] - l[2] / 2, l[1] - l[2] / 2, l[2], l[2]);
            });
            ctx.globalCompositeOperation = "source-over";
        }
        if (sky.sunset > 0) { ctx.fillStyle = "rgba(255,120,60," + (0.12 * sky.sunset) + ")"; ctx.fillRect(0, 0, W, H); }
        ctx.restore();
        drawPopups();
    }
    function drawSegment(seg, fogC) {
        var p1 = seg.p1.screen, p2 = seg.p2.screen;
        var zone = zoneAt(seg.index / TOTAL);
        var grass = seg.light ? zone[2] : zone[3];
        ctx.fillStyle = grass; ctx.fillRect(0, p2.y, W, p1.y - p2.y);
        var r1 = p1.w / 10, r2 = p2.w / 10;
        poly(p1.x - p1.w - r1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - r2, p2.y, seg.light ? "#f2f2f2" : "#d23a32");
        poly(p1.x + p1.w + r1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x + p2.w + r2, p2.y, seg.light ? "#f2f2f2" : "#d23a32");
        poly(p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, seg.light ? "#6e6e72" : "#68686c");
        // 차선: 가운데 노란 겹선(항상) + 같은 방향 차선 사이 흰 점선
        var y1w = p1.w / 70, y2w = p2.w / 70, gap1 = p1.w / 45, gap2 = p2.w / 45;
        poly(p1.x - gap1 - y1w, p1.y, p1.x - gap1 + y1w, p1.y, p2.x - gap2 + y2w, p2.y, p2.x - gap2 - y2w, p2.y, "#f2c230");
        poly(p1.x + gap1 - y1w, p1.y, p1.x + gap1 + y1w, p1.y, p2.x + gap2 + y2w, p2.y, p2.x + gap2 - y2w, p2.y, "#f2c230");
        if (seg.light) {
            var l1 = p1.w / 50, l2 = p2.w / 50;
            [-0.5, 0.5].forEach(function (k) {
                var a = p1.x + p1.w * k, b = p2.x + p2.w * k;
                poly(a - l1, p1.y, a + l1, p1.y, b + l2, p2.y, b - l2, p2.y, "#f4f4ee");
            });
        }
        if (seg.index >= FINISH_SEG && seg.index < FINISH_SEG + 2) {   // 결승선 체크무늬
            var cells = 12;
            for (var k = 0; k < cells; k++) {
                var t1 = -1 + 2 * k / cells, t2 = -1 + 2 * (k + 1) / cells;
                poly(p1.x + p1.w * t1, p1.y, p1.x + p1.w * t2, p1.y, p2.x + p2.w * t2, p2.y, p2.x + p2.w * t1, p2.y, (k + seg.index) % 2 ? "#111" : "#fff");
            }
        }
        if (seg.fog > 0.02) { ctx.globalAlpha = seg.fog; ctx.fillStyle = fogC; ctx.fillRect(0, p2.y, W, p1.y - p2.y); ctx.globalAlpha = 1; }
    }
    function drawTrafficCar(c, scale, x, y, clipY, dark) {
        var img = c.img;
        var w = scale * CAR_W * FX * (img.kind === "bus" ? 1.15 : img.kind === "van" ? 1.05 : 1);
        var h = w * img.height / img.width;
        var dx = x - w / 2, dy = y - h;
        var clipH = clipY ? Math.max(0, dy + h - clipY) : 0;
        if (clipH >= h || w < 1) return;
        ctx.drawImage(img, 0, 0, img.width, img.height - img.height * clipH / h, dx, dy, w, h - clipH);
        // 방향 지시등
        if (c.signal > 0 && Math.floor(c.signal * 4) % 2 === 0) {
            var left = LANES[c.newLane] < c.offset;   // 화면에서 왼쪽으로 가면 왼쪽 등
            ctx.fillStyle = "#ffb020"; ctx.beginPath(); ctx.arc(dx + w * (left ? 0.1 : 0.9), dy + h * 0.62, Math.max(2, w * 0.06), 0, 7); ctx.fill();
            lights.push([dx + w * (left ? 0.1 : 0.9), dy + h * 0.62, w * 0.5, "255,170,40"]);
        }
        if (c.dir < 0) {   // 마주 오는 차 헤드라이트 (밤에는 크게, 낮에도 살짝)
            if (clipH < h * 0.5) {
                var a = 0.25 + dark * 0.75, r = w * (0.5 + dark * 0.9);
                lights.push([dx + w * 0.16, dy + h * 0.62, r, "255,250,220", a]); lights.push([dx + w * 0.84, dy + h * 0.62, r, "255,250,220", a]);
            }
        } else if (dark > 0.05 && clipH < h * 0.4) { lights.push([dx + w * 0.16, dy + h * 0.62, w * 0.45, "255,40,40"]); lights.push([dx + w * 0.84, dy + h * 0.62, w * 0.45, "255,40,40"]); }
    }
    function drawPlayer(dark) {
        var img = IMG.player[car().id];
        var w = CAR_W / CAM_H * FX * 1.05, h = w * img.height / img.width;
        var pct = S.speed / BASE_MAX;
        var bounce = (Math.random() - 0.5) * pct * 2.2 * (Math.abs(S.x) > 1 ? 3 : 1);
        var y = HZ + FY - h * 0.08 + bounce;
        var tilt = (keys.left ? -1 : keys.right ? 1 : 0) * Math.min(1, pct * 2);
        if (S.inv > 0 && Math.floor(S.inv * 10) % 2 === 0) return;   // 부딪힌 뒤 깜빡임
        ctx.save();
        ctx.translate(W / 2, y);
        ctx.transform(1, 0, tilt * 0.06, 1, 0, 0);
        ctx.drawImage(img, -w / 2, -h, w, h);
        // 브레이크 등
        if (keys.down) { ctx.fillStyle = "rgba(255,60,60,0.85)"; ctx.fillRect(-w * 0.44, -h * 0.47, w * 0.2, h * 0.08); ctx.fillRect(w * 0.24, -h * 0.47, w * 0.2, h * 0.08); }
        ctx.restore();
        if (dark > 0.05) { lights.push([W / 2 - w * 0.34, y - h * 0.43, w * (keys.down ? 0.7 : 0.4), "255,40,40"]); lights.push([W / 2 + w * 0.34, y - h * 0.43, w * (keys.down ? 0.7 : 0.4), "255,40,40"]); }
        // 흙먼지 (길 밖)
        if (Math.abs(S.x) > 1 && pct > 0.05) {
            ctx.fillStyle = zoneAt(S.pos / (TOTAL * SEG))[1] === "desert" ? "rgba(225,190,130,0.55)" : "rgba(160,140,100,0.45)";
            for (var i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(W / 2 + (Math.random() - 0.5) * w, y - Math.random() * h * 0.2, w * (0.05 + Math.random() * 0.08), 0, 7); ctx.fill(); }
        }
    }
    function drawHeadlights(dark) {
        var img = IMG.player[car().id];
        var w = CAR_W / CAM_H * FX * 1.05, h = w * img.height / img.width;
        var y = HZ + FY - h * 0.9, top = HZ + (FY) * 0.08;
        var g = ctx.createLinearGradient(0, y, 0, top);
        g.addColorStop(0, "rgba(255,245,200," + (0.32 * dark) + ")"); g.addColorStop(1, "rgba(255,245,200,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(W / 2 - w * 0.4, y); ctx.lineTo(W / 2 + w * 0.4, y); ctx.lineTo(W / 2 + w * 1.9, top); ctx.lineTo(W / 2 - w * 1.9, top); ctx.closePath(); ctx.fill();
    }
    function drawPopups() {
        var fs = Math.max(16, Math.round(W * 0.034));
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        S.popups.forEach(function (p, i) {
            var big = /^\d$|GO|출발/.test(p.text);
            var a = Math.min(1, p.t * 2);
            ctx.font = "bold " + (big ? fs * 3 : fs) + "px 'Noto Sans KR', sans-serif";
            var y = big ? H * 0.36 : H * 0.2 + i * fs * 1.4 - (1.3 - p.t) * 18;
            ctx.globalAlpha = a; ctx.lineWidth = big ? 8 : 5; ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.strokeText(p.text, W / 2, y);
            ctx.fillStyle = p.color; ctx.fillText(p.text, W / 2, y); ctx.globalAlpha = 1;
        });
    }

    /* =========================================================
       화면 크기
       ========================================================= */
    var stage = $("rStage");
    function resize() {
        var cw = stage.clientWidth;
        var portrait = window.innerWidth < 700;
        var ch = portrait ? Math.round(Math.min(cw * 1.2, window.innerHeight * 0.62)) : Math.round(Math.min(cw * 0.6, window.innerHeight * 0.68));
        stage.style.height = ch + "px";
        DPR = Math.min(window.devicePixelRatio || 1, portrait ? 2 : 1.5);
        canvas.width = Math.round(cw * DPR); canvas.height = Math.round(ch * DPR);
        canvas.style.width = cw + "px"; canvas.style.height = ch + "px";
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        W = cw; H = ch;
        HZ = Math.round(H * (portrait ? 0.4 : 0.4));
        FY = H * 0.95 - HZ;
        FX = Math.min(W / 2, FY);
        DRAW = portrait ? 170 : 220;
        if (S) render();
    }

    /* =========================================================
       화면 글씨 (점수판)
       ========================================================= */
    var hud = { score: $("rScore"), left: $("rLeft"), speed: $("rSpeed"), lives: $("rLives"), best: $("rBest"), prog: $("rProg"), zone: $("rZone") };
    function updateHud(force) {
        if (!S) return;
        var now = performance.now();
        if (!force && now - S.lastHud < 90) return;
        S.lastHud = now;
        var f = clamp((S.pos + PLAYER_Z) / (FINISH_SEG * SEG), 0, 1);
        hud.score.textContent = fmt(S.score);
        hud.left.textContent = (GOAL_KM * (1 - f)).toFixed(1);
        hud.speed.textContent = Math.round(S.speed / BASE_MAX * 260);
        var hearts = "";
        for (var i = 0; i < S.maxLives; i++) hearts += i < S.lives ? "♥" : "♡";
        hud.lives.textContent = hearts;
        hud.best.textContent = fmt(rec.best || 0);
        hud.prog.style.width = (f * 100) + "%";
        hud.zone.textContent = ZONE_NAME[zoneAt(f)[1]];
    }

    /* =========================================================
       흐름: 메뉴 → 카운트 → 달리기 → 끝
       ========================================================= */
    var startBox = $("rStart"), endBox = $("rEnd"), pauseBox = $("rPause");
    function show(el, on) { el.hidden = !on; }
    function buildCarPicker() {
        var box = $("rCars"); box.innerHTML = "";
        CARS.forEach(function (c, i) {
            var b = document.createElement("button");
            b.type = "button"; b.className = "r-car" + (i === carIdx ? " on" : "");
            b.setAttribute("aria-pressed", i === carIdx ? "true" : "false");
            var im = document.createElement("img"); im.src = IMG.player[c.id].toDataURL(); im.alt = "";
            var stats = "<span class='r-stat'><i>" + T("속도", "Speed") + "</i><s style='width:" + Math.round(c.max * 100) + "%'></s></span>" +
                        "<span class='r-stat'><i>" + T("가속", "Accel") + "</i><s style='width:" + Math.round(c.accel / 1.2 * 100) + "%'></s></span>" +
                        "<span class='r-stat'><i>" + T("핸들", "Grip") + "</i><s style='width:" + Math.round(c.grip / 1.2 * 100) + "%'></s></span>";
            b.innerHTML = "<b>" + c.name + "</b><small>" + c.desc + "</small>" + stats;
            b.insertBefore(im, b.firstChild);
            b.addEventListener("click", function () { carIdx = i; save("roadCar.v1", i); sClick(); buildCarPicker(); });
            box.appendChild(b);
        });
    }
    function goMenu() {
        mode = "menu"; engineStop();
        newRun();
        buildCarPicker();
        show(startBox, true); show(endBox, false); show(pauseBox, false);
        $("rStartBest").textContent = rec.best ? T("최고 점수 ", "Best ") + fmt(rec.best) : "";
        updateHud(true);
    }
    function startRun() {
        audio(); sClick();
        newRun();
        show(startBox, false); show(endBox, false); show(pauseBox, false);
        mode = "count"; S.lastCount = null;
        engineStart();
        rec.plays++; save("roadRecord.v1", rec);
        canvas.focus && canvas.focus();
    }
    function endGame(finished) {
        if (S.ended) return;
        S.ended = true; S.finished = finished; mode = "end";
        var f = clamp((S.pos + PLAYER_Z) / (FINISH_SEG * SEG), 0, 1);
        var bonusLives = 0, bonusTime = 0;
        if (finished) {
            bonusLives = S.lives * 1000;
            bonusTime = Math.max(0, Math.round((200 - S.time) * 20));
            S.score += bonusLives + bonusTime;
            sFanfare();
        } else sOver();
        engineSet(0, false);
        setTimeout(engineStop, 400);
        var newBest = S.score > rec.best;
        if (newBest) rec.best = Math.round(S.score);
        if (finished) { rec.finishes++; if (!rec.bestTime || S.time < rec.bestTime) rec.bestTime = Math.round(S.time * 10) / 10; }
        rec.farthest = Math.max(rec.farthest || 0, Math.round(f * GOAL_KM * 10) / 10);
        save("roadRecord.v1", rec);
        $("rEndTitle").textContent = finished ? T("도착했어요! 🏁", "You made it! 🏁") : T("게임 오버", "Game over");
        var lines = [];
        lines.push(T("점수", "Score") + " <b>" + fmt(S.score) + "</b>" + (newBest ? " <em>" + T("최고 기록!", "New best!") + "</em>" : ""));
        if (finished) {
            lines.push(T("걸린 시간", "Time") + " <b>" + fmtTime(S.time) + "</b>");
            lines.push(T("남은 생명 보너스", "Lives bonus") + " +" + fmt(bonusLives) + " · " + T("시간 보너스", "Time bonus") + " +" + fmt(bonusTime));
        } else lines.push(T("달린 거리", "Distance") + " <b>" + (f * GOAL_KM).toFixed(1) + " km</b> / " + GOAL_KM + " km");
        lines.push(T("추월", "Passed") + " " + S.passes + T("대", "") + " · " + T("마주 온 차 피함", "Dodged") + " " + S.dodged + T("대", "") + " · " + T("아슬아슬", "Close calls") + " " + S.nearMiss + T("번", ""));
        $("rEndSub").innerHTML = lines.join("<br>");
        show(endBox, true);
        renderRecord();
        updateHud(true);
    }
    function fmtTime(t) { var m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1); }
    function pause(on) {
        if (on && (mode === "play" || mode === "count")) { S.resume = mode; mode = "pause"; show(pauseBox, true); engineSet(0, false); }
        else if (!on && mode === "pause") { mode = S.resume || "play"; show(pauseBox, false); audio(); last = performance.now(); }
    }
    function renderRecord() {
        $("rRecord").innerHTML =
            T("최고 점수", "Best score") + ": <b>" + fmt(rec.best || 0) + "</b><br>" +
            T("가장 빨리 도착", "Fastest finish") + ": <b>" + (rec.bestTime ? fmtTime(rec.bestTime) : "–") + "</b><br>" +
            T("가장 멀리", "Farthest") + ": <b>" + (rec.farthest || 0) + " km</b><br>" +
            T("도착 횟수", "Finishes") + ": <b>" + (rec.finishes || 0) + "</b> / " + T("한 판 수", "Runs") + ": <b>" + (rec.plays || 0) + "</b>";
    }

    /* =========================================================
       조작: 키보드 + 폰 버튼
       ========================================================= */
    var KEYMAP = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", a: "left", d: "right", w: "up", s: "down", A: "left", D: "right", W: "up", S: "down", " ": "up" };
    document.addEventListener("keydown", function (e) {
        if (e.key === "p" || e.key === "P" || e.key === "Escape") { pause(mode !== "pause"); return; }
        if (e.key === "Enter" && (mode === "menu" || mode === "end") && !(e.target && e.target.tagName === "BUTTON")) { startRun(); e.preventDefault(); return; }
        var k = KEYMAP[e.key]; if (!k) return;
        if (mode === "play" || mode === "count" || mode === "pause") e.preventDefault();
        keys[k] = true;
    });
    document.addEventListener("keyup", function (e) { var k = KEYMAP[e.key]; if (k) keys[k] = false; });
    window.addEventListener("blur", function () { keys.left = keys.right = keys.up = keys.down = false; });
    document.querySelectorAll("[data-key]").forEach(function (b) {
        var k = b.getAttribute("data-key");
        function on(e) { e.preventDefault(); keys[k] = true; b.classList.add("down"); audio(); try { b.setPointerCapture(e.pointerId); } catch (x) {} }
        function off() { keys[k] = false; b.classList.remove("down"); }
        b.addEventListener("pointerdown", on);
        b.addEventListener("pointerup", off); b.addEventListener("pointercancel", off); b.addEventListener("lostpointercapture", off);
        b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    });

    $("rGo").addEventListener("click", startRun);
    $("rAgain").addEventListener("click", startRun);
    $("rChange").addEventListener("click", function () { sClick(); goMenu(); });
    $("rResume").addEventListener("click", function () { sClick(); pause(false); });
    $("rQuit").addEventListener("click", function () { sClick(); goMenu(); });
    $("rPauseBtn").addEventListener("click", function () { sClick(); pause(mode !== "pause"); });
    $("rNew").addEventListener("click", function () { sClick(); goMenu(); });
    $("rExit").addEventListener("click", function () {
        sClick(); engineStop();
        window.close();
        setTimeout(function () { if (!window.closed) location.href = T("index.html", "index-en.html"); }, 250);
    });
    var btnSound = $("rSound");
    function syncSound() {
        btnSound.classList.toggle("muted", muted);
        btnSound.setAttribute("aria-label", muted ? T("소리 켜기", "Sound on") : T("소리 끄기", "Sound off"));
        btnSound.title = btnSound.getAttribute("aria-label");
        if (master) master.gain.value = muted ? 0 : 1;
    }
    btnSound.addEventListener("click", function () { muted = !muted; save("roadMuted.v1", muted); audio(); syncSound(); if (!muted) sClick(); });
    document.addEventListener("visibilitychange", function () { if (document.hidden) pause(true); });
    document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("button"); if (b && e.detail > 0) b.blur(); });

    /* =========================================================
       돌리기
       ========================================================= */
    var last = performance.now(), acc = 0;
    function frame(now) {
        var dt = Math.min(0.1, (now - last) / 1000); last = now;
        if (mode === "play" || mode === "count") {
            acc += dt;
            while (acc >= STEP) { update(STEP); acc -= STEP; }
        } else acc = 0;
        if (mode === "menu") { S.pos += BASE_MAX * 0.18 * dt; S.time += dt; if (S.pos > SEG * 900) S.pos = 0; }  // 메뉴 뒤로 천천히 달리는 화면
        render();
        updateHud(false);
        requestAnimationFrame(frame);
    }

    function boot() {
        if (boot.done) return; boot.done = true;
        buildImages();
        buildRoad();
        syncSound();
        resize();
        window.addEventListener("resize", resize);
        goMenu();
        renderRecord();
        requestAnimationFrame(frame);
    }
    /* 간판 글씨가 바른 글꼴로 그려지게, 글꼴을 받은 뒤 시작 (최대 1.5초 기다림) */
    if (document.fonts && document.fonts.load) {
        Promise.all([document.fonts.load("bold 20px 'Noto Sans KR'"), document.fonts.load("20px Chewy")]).then(boot, boot);
        setTimeout(boot, 1500);
    } else boot();

    /* 시험용 (개발자 도구에서만 씀) */
    window.__road = { put: function (dz, lane, sp) { var c = makeCar(S.pos + PLAYER_Z + dz, lane, lane < 2 ? -1 : 1, sp || 0); c.changeT = 99; S.traffic.push(c); }, state: function () { return S; }, mode: function () { return mode; }, keys: keys, jump: function (f) { S.pos = f * FINISH_SEG * SEG; }, start: startRun, end: endGame };
})();
