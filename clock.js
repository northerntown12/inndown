/* =====================================================================
   왼쪽 사진 아래 시계 (아날로그 + 디지털)
   - 왼쪽 사진 높이를 줄이고, 생긴 공간의 왼쪽 구석에 시계를 넣어요.
   - 시계를 더블클릭하면 시계만 작은 창으로 떠요 (크롬·엣지 PC: 다른 프로그램 위에 항상 떠 있음).
     그 밖의 브라우저에서는 홈페이지 화면 오른쪽 아래에 떠 있어요.
     떠 있는 시계를 다시 더블클릭하거나 창을 닫으면 원래 자리로 돌아와요.
   - 크기 조절: 아래 CLOCK_WIDTH 값을 바꾸면 돼요 (사진 높이도 자동으로 맞춰져요).
   ===================================================================== */
(function () {
    "use strict";

    var panel = document.querySelector(".tree-panel");
    if (!panel) return;

    var CLOCK_WIDTH = 140;          // 홈페이지 안 시계 너비(px)
    var POPUP_W = 240, POPUP_H = 360; // 떠 있는 창 크기(px)
    var VB_W = 300, VB_H = 450;      // 시계 그림 기준 크기 (비율 유지용)

    var NS = "http://www.w3.org/2000/svg";
    var CYAN = "#3fd4ff";
    var DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    var MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    /* ---------- 스타일 ---------- */
    var style = document.createElement("style");
    style.textContent = [
        ".tree-panel { --dc-w: " + CLOCK_WIDTH + "px; }",
        ".tree-panel img { height: calc(100% - var(--dc-w) * " + (VB_H / VB_W) + " - 12px) !important; }",
        ".dc-home { position: absolute; left: 0; bottom: 0; width: var(--dc-w); }",
        ".dc-wrap { width: 100%; cursor: pointer; user-select: none; -webkit-user-select: none; }",
        ".dc-svg { display: block; width: 100%; height: auto; filter: drop-shadow(0 3px 6px rgba(0,0,0,.35)); }",
        ".dc-wrap.dc-float { position: fixed; right: 16px; bottom: 16px; width: 170px; z-index: 2147483000; }",
        ".dc-ph { display: none; padding: 6px 2px; font-size: 10px; line-height: 1.4; color: #888; cursor: pointer; }",
        ".dc-home.dc-away .dc-ph { display: block; }"
    ].join("\n");
    document.head.appendChild(style);

    /* ---------- SVG 도우미 ---------- */
    function el(name, attrs, parent) {
        var n = document.createElementNS(NS, name);
        for (var k in attrs) n.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(n);
        return n;
    }
    function grad(defs, id, type, stops, attrs) {
        var g = el(type, Object.assign({ id: id }, attrs || {}), defs);
        stops.forEach(function (s) { el("stop", { offset: s[0], "stop-color": s[1] }, g); });
        return g;
    }

    /* ---------- 시계 그리기 ---------- */
    var svg = el("svg", { viewBox: "0 0 " + VB_W + " " + VB_H, class: "dc-svg", role: "img", "aria-label": "시계" });
    var defs = el("defs", {}, svg);

    grad(defs, "dcPlate", "linearGradient", [["0", "#6a6e75"], ["0.35", "#3c3f45"], ["0.65", "#4b4f56"], ["1", "#2a2c31"]], { x1: "0", y1: "0", x2: "1", y2: "1" });
    grad(defs, "dcRose", "linearGradient", [["0", "#f7d3b8"], ["0.3", "#c07b58"], ["0.55", "#f2c4a3"], ["0.8", "#93533a"], ["1", "#e9b494"]], { x1: "0", y1: "0", x2: "1", y2: "1" });
    grad(defs, "dcRoseIn", "linearGradient", [["0", "#7d432d"], ["1", "#d99a78"]], { x1: "0", y1: "0", x2: "1", y2: "1" });
    grad(defs, "dcDial", "radialGradient", [["0", "#3a5fa8"], ["0.55", "#1d3a7a"], ["1", "#0b1a42"]], { cx: "0.45", cy: "0.4", r: "0.7" });
    grad(defs, "dcSilver", "linearGradient", [["0", "#ffffff"], ["0.5", "#c9d0d9"], ["1", "#8d96a3"]], { x1: "0", y1: "0", x2: "1", y2: "0" });
    grad(defs, "dcBrown", "linearGradient", [["0", "#3b231a"], ["1", "#1b0e0a"]], { x1: "0", y1: "0", x2: "0", y2: "1" });
    grad(defs, "dcCopper", "linearGradient", [["0", "#e7a982"], ["0.5", "#8a4e35"], ["1", "#d89670"]], { x1: "0", y1: "0", x2: "1", y2: "1" });

    // 가는 세로 결 (금속판 / 다이얼)
    var brush = el("filter", { id: "dcBrush", x: "0", y: "0", width: "100%", height: "100%" }, defs);
    el("feTurbulence", { type: "fractalNoise", baseFrequency: "0.9 0.006", numOctaves: "2", result: "n" }, brush);
    el("feColorMatrix", { type: "saturate", values: "0" }, brush);
    var stripes = el("pattern", { id: "dcStripes", width: "3", height: "10", patternUnits: "userSpaceOnUse" }, defs);
    el("rect", { width: "1", height: "10", fill: "rgba(255,255,255,0.06)" }, stripes);
    var glow = el("filter", { id: "dcGlow", x: "-20%", y: "-20%", width: "140%", height: "140%" }, defs);
    el("feGaussianBlur", { stdDeviation: "1.6", result: "b" }, glow);
    var merge = el("feMerge", {}, glow);
    el("feMergeNode", { in: "b" }, merge);
    el("feMergeNode", { in: "SourceGraphic" }, merge);
    var shadow = el("filter", { id: "dcShadow", x: "-10%", y: "-10%", width: "120%", height: "120%" }, defs);
    el("feDropShadow", { dx: "0", dy: "3", stdDeviation: "3", "flood-opacity": "0.55" }, shadow);
    var dialClip = el("clipPath", { id: "dcDialClip" }, defs);
    el("circle", { cx: 150, cy: 150, r: 100 }, dialClip);

    // 금속판
    el("rect", { x: 4, y: 4, width: 292, height: 442, rx: 18, fill: "url(#dcPlate)", stroke: "#15171b", "stroke-width": 2 }, svg);
    el("rect", { x: 4, y: 4, width: 292, height: 442, rx: 18, fill: "#fff", filter: "url(#dcBrush)", opacity: "0.13" }, svg);
    el("rect", { x: 12, y: 12, width: 276, height: 426, rx: 12, fill: "none", stroke: "rgba(255,255,255,0.22)", "stroke-width": 1.2 }, svg);

    // 테두리(로즈골드) + 다이얼
    var face = el("g", { filter: "url(#dcShadow)" }, svg);
    el("circle", { cx: 150, cy: 150, r: 128, fill: "url(#dcRose)" }, face);
    el("circle", { cx: 150, cy: 150, r: 119, fill: "url(#dcRoseIn)" }, svg);
    el("circle", { cx: 150, cy: 150, r: 116, fill: "#0c1430" }, svg);
    el("circle", { cx: 150, cy: 150, r: 100, fill: "url(#dcDial)" }, svg);
    el("rect", { x: 50, y: 50, width: 200, height: 200, fill: "url(#dcStripes)", "clip-path": "url(#dcDialClip)" }, svg);
    el("circle", { cx: 150, cy: 150, r: 100, fill: "none", stroke: "rgba(255,255,255,0.25)", "stroke-width": 0.8 }, svg);

    // 바깥 눈금과 작은 숫자
    for (var i = 0; i < 60; i++) {
        var a = i * 6 * Math.PI / 180, big = i % 5 === 0;
        var r1 = big ? 108 : 110, r2 = 114;
        el("line", {
            x1: 150 + r1 * Math.sin(a), y1: 150 - r1 * Math.cos(a),
            x2: 150 + r2 * Math.sin(a), y2: 150 - r2 * Math.cos(a),
            stroke: big ? "#e8edf3" : "rgba(220,228,240,0.6)", "stroke-width": big ? 1.4 : 0.7
        }, svg);
        if (big) {
            var t = el("text", {
                x: 150 + 104 * Math.sin(a), y: 150 - 104 * Math.cos(a),
                "font-size": 5, fill: "rgba(230,236,245,0.75)", "text-anchor": "middle",
                "dominant-baseline": "central", "font-family": "Arial, sans-serif"
            }, svg);
            t.textContent = i === 0 ? "60" : String(i);
        }
    }

    // 로마 숫자
    var ROMAN = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
    ROMAN.forEach(function (txt, h) {
        var a = h * 30 * Math.PI / 180;
        var t = el("text", {
            x: 150 + 82 * Math.sin(a), y: 151 - 82 * Math.cos(a),
            "font-size": h % 3 === 0 ? 19 : 16, "font-weight": "bold", fill: "url(#dcSilver)",
            "text-anchor": "middle", "dominant-baseline": "central",
            "font-family": "'Times New Roman', Georgia, serif",
            stroke: "rgba(0,0,0,0.35)", "stroke-width": 0.4
        }, svg);
        t.textContent = txt;
    });

    // 날짜 창
    el("rect", { x: 187, y: 141, width: 22, height: 18, rx: 1.5, fill: "#f4f4f2", stroke: "#9aa3ae", "stroke-width": 1.2 }, svg);
    var dateWin = el("text", { x: 198, y: 150.5, "font-size": 12, "font-weight": "bold", fill: "#222", "text-anchor": "middle", "dominant-baseline": "central", "font-family": "Arial, sans-serif" }, svg);

    // 바늘
    function hand(points) {
        var g = el("g", {}, svg);
        el("polygon", { points: points, fill: "url(#dcSilver)", stroke: "#6c7582", "stroke-width": 0.6, transform: "translate(150 150)" }, g);
        return g;
    }
    var hourHand = hand("0,-56 5.5,-12 3,16 -3,16 -5.5,-12");
    var minHand = hand("0,-90 4.2,-12 2.4,18 -2.4,18 -4.2,-12");
    var secHand = el("g", {}, svg);
    el("line", { x1: 150, y1: 172, x2: 150, y2: 56, stroke: "#2f7cf0", "stroke-width": 1.6, "stroke-linecap": "round" }, secHand);
    el("circle", { cx: 150, cy: 166, r: 3.2, fill: "#2f7cf0" }, secHand);
    el("circle", { cx: 150, cy: 150, r: 5.5, fill: "#2f7cf0", stroke: "#173f86", "stroke-width": 0.8 }, svg);
    el("circle", { cx: 150, cy: 150, r: 2, fill: "#cfe0ff" }, svg);

    // 디지털 창
    el("rect", { x: 24, y: 298, width: 252, height: 122, rx: 9, fill: "url(#dcBrown)", stroke: "url(#dcCopper)", "stroke-width": 4 }, svg);
    el("rect", { x: 31, y: 305, width: 238, height: 108, rx: 5, fill: "none", stroke: "rgba(0,0,0,0.55)", "stroke-width": 1.5 }, svg);

    // 7-세그먼트 숫자
    var SEG = { 0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcdfg" };
    var DW = 25, DH = 46, TH = 5, DY = 318;
    var digitsG = el("g", { transform: "translate(" + (Math.tan(6 * Math.PI / 180) * (DY + DH / 2)).toFixed(2) + " 0) skewX(-6)", filter: "url(#dcGlow)" }, svg);
    function hSeg(x0, x1, y) {
        var h = TH / 2;
        return [[x0, y], [x0 + h, y - h], [x1 - h, y - h], [x1, y], [x1 - h, y + h], [x0 + h, y + h]];
    }
    function vSeg(x, y0, y1) {
        var h = TH / 2;
        return [[x, y0], [x + h, y0 + h], [x + h, y1 - h], [x, y1], [x - h, y1 - h], [x - h, y0 + h]];
    }
    function makeDigit(x) {
        var g = 1, ht = TH / 2, xl = x + ht, xr = x + DW - ht, yt = DY + ht, ym = DY + DH / 2, yb = DY + DH - ht;
        var shapes = {
            a: hSeg(xl + g, xr - g, yt), g: hSeg(xl + g, xr - g, ym), d: hSeg(xl + g, xr - g, yb),
            f: vSeg(xl, yt + g, ym - g), b: vSeg(xr, yt + g, ym - g),
            e: vSeg(xl, ym + g, yb - g), c: vSeg(xr, ym + g, yb - g)
        };
        var segs = {};
        Object.keys(shapes).forEach(function (k) {
            segs[k] = el("polygon", { points: shapes[k].map(function (p) { return p.join(","); }).join(" ") }, digitsG);
        });
        return segs;
    }
    function colon(x) {
        el("circle", { cx: x, cy: DY + 14, r: 2.8, fill: CYAN }, digitsG);
        el("circle", { cx: x, cy: DY + 32, r: 2.8, fill: CYAN }, digitsG);
    }
    var digits = [], x = 36;
    for (var d = 0; d < 6; d++) {
        digits.push(makeDigit(x));
        x += DW + 5;
        if (d === 1 || d === 3) { colon(x + 3); x += 11; }
    }
    var ampm = el("text", { x: x + 2, y: DY + DH - 1, "font-size": 15, "font-weight": "bold", fill: CYAN, "font-family": "Montserrat, Arial, sans-serif", filter: "url(#dcGlow)" }, svg);
    var dateLine = el("text", { x: 150, y: 395, "font-size": 15.5, "font-weight": "bold", fill: CYAN, "text-anchor": "middle", "letter-spacing": 1.2, "font-family": "Montserrat, Arial, sans-serif", filter: "url(#dcGlow)" }, svg);

    // 아주 작은 안내 문구
    var hint = el("text", { x: 150, y: 435, "font-size": 8, fill: "rgba(255,255,255,0.45)", "text-anchor": "middle", "font-family": "'Malgun Gothic', sans-serif" }, svg);
    hint.textContent = "더블클릭: 최소화";

    /* ---------- 화면에 넣기 ---------- */
    var home = document.createElement("div");
    home.className = "dc-home";
    var wrap = document.createElement("div");
    wrap.className = "dc-wrap";
    wrap.title = "더블클릭하면 시계만 작게 떠요";
    wrap.appendChild(svg);
    var ph = document.createElement("div");
    ph.className = "dc-ph";
    ph.textContent = "시계가 작은 창으로 떠 있어요. 여기를 클릭하면 돌아와요.";
    home.appendChild(wrap);
    home.appendChild(ph);
    panel.appendChild(home);

    /* ---------- 시간 갱신 ---------- */
    var timerWin = window, timer = null;
    function setDigit(segs, n) {
        var on = n == null ? "" : SEG[n];
        Object.keys(segs).forEach(function (k) {
            segs[k].setAttribute("fill", on.indexOf(k) >= 0 ? CYAN : "rgba(63,212,255,0.07)");
        });
    }
    function update() {
        var now = new Date();
        var h24 = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
        var h12 = h24 % 12 || 12;

        hourHand.setAttribute("transform", "rotate(" + ((h24 % 12) * 30 + m * 0.5) + " 150 150)");
        minHand.setAttribute("transform", "rotate(" + (m * 6 + s * 0.1) + " 150 150)");
        secHand.setAttribute("transform", "rotate(" + s * 6 + " 150 150)");
        dateWin.textContent = now.getDate();

        setDigit(digits[0], h12 >= 10 ? 1 : null);
        setDigit(digits[1], h12 % 10);
        setDigit(digits[2], Math.floor(m / 10));
        setDigit(digits[3], m % 10);
        setDigit(digits[4], Math.floor(s / 10));
        setDigit(digits[5], s % 10);
        ampm.textContent = h24 < 12 ? "AM" : "PM";
        dateLine.textContent = DAYS[now.getDay()] + ", " + MONTHS[now.getMonth()] + " " + now.getDate() + ", " + now.getFullYear();
    }
    function tick() {
        update();
        timer = timerWin.setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    }
    function restartTimer(win) {
        if (timer) { try { timerWin.clearTimeout(timer); } catch (e) {} }
        timerWin = win;
        tick();
    }
    document.addEventListener("visibilitychange", update);
    tick();

    /* ---------- 더블클릭: 작게 띄우기 ---------- */
    var pipWin = null;

    function backHome() {
        wrap.classList.remove("dc-float");
        if (wrap.parentNode !== home) home.insertBefore(wrap, ph);
        home.classList.remove("dc-away");
        hint.textContent = "더블클릭: 최소화";
        pipWin = null;
        restartTimer(window);
    }

    async function popOut() {
        if (pipWin) { pipWin.close(); return; }                       // 떠 있는 창 → 원래대로
        if (wrap.classList.contains("dc-float")) { backHome(); return; }

        if ("documentPictureInPicture" in window) {
            try {
                var w = await window.documentPictureInPicture.requestWindow({ width: POPUP_W, height: POPUP_H });
                var font = document.querySelector('link[href*="fonts.googleapis.com/css2"]');
                if (font) w.document.head.appendChild(font.cloneNode());
                var st = w.document.createElement("style");
                st.textContent = "html,body{margin:0;height:100%;background:#16181d;overflow:hidden}" +
                    "body{display:flex;align-items:center;justify-content:center}" +
                    ".dc-wrap{width:100%;height:100%;cursor:pointer;user-select:none;-webkit-user-select:none}" +
                    ".dc-svg{display:block;width:100%;height:100%}";
                w.document.head.appendChild(st);
                w.document.title = "시계";
                w.document.body.appendChild(wrap);
                home.classList.add("dc-away");
                hint.textContent = "더블클릭: 원래대로";
                pipWin = w;
                restartTimer(w);   // 떠 있는 창 기준으로 갱신 (탭이 가려져도 멈추지 않게)
                w.addEventListener("pagehide", backHome);
                return;
            } catch (e) { /* 실패하면 아래 방식으로 */ }
        }
        // 지원하지 않는 브라우저: 홈페이지 화면 위에 떠 있게
        document.body.appendChild(wrap);
        wrap.classList.add("dc-float");
        home.classList.add("dc-away");
        hint.textContent = "더블클릭: 원래대로";
    }

    wrap.addEventListener("dblclick", function (e) { e.preventDefault(); popOut(); });
    ph.addEventListener("click", function () {
        if (pipWin) pipWin.close(); else backHome();
    });
})();
