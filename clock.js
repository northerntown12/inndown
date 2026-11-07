
(function () {
    "use strict";

    var panel = document.querySelector(".tree-panel");
    if (!panel) return;

    var CLOCK_WIDTH = 150;          // 홈페이지 안 시계 너비(px)
    var POPUP_W = 240, POPUP_H = 311; // 떠 있는 창 크기(px) - 시계 비율과 같게
    var VB_W = 618, VB_H = 801;      // 시계 그림 기준 크기 (비율 유지용)

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

    /* ---------- 시계 그리기 (watchsample 이미지 위에 바늘·숫자를 얹어요) ---------- */
    var FACE_URL = new URL("clock-face.webp", document.baseURI).href;
    var svg = el("svg", { viewBox: "0 0 " + VB_W + " " + VB_H, class: "dc-svg", role: "img", "aria-label": "시계" });
    var defs = el("defs", {}, svg);
    grad(defs, "dcSilver", "linearGradient", [["0", "#ffffff"], ["0.5", "#cfd5dd"], ["1", "#8a93a0"]], { x1: "0", y1: "0", x2: "1", y2: "0" });
    var glow = el("filter", { id: "dcGlow", x: "-20%", y: "-20%", width: "140%", height: "140%" }, defs);
    el("feGaussianBlur", { stdDeviation: "1.8", result: "b" }, glow);
    var merge = el("feMerge", {}, glow);
    el("feMergeNode", { in: "b" }, merge);
    el("feMergeNode", { in: "SourceGraphic" }, merge);
    var hshadow = el("filter", { id: "dcHandShadow", x: "-30%", y: "-30%", width: "160%", height: "160%" }, defs);
    el("feDropShadow", { dx: "2", dy: "3", stdDeviation: "2", "flood-opacity": "0.5" }, hshadow);

    el("image", { href: FACE_URL, x: 0, y: 0, width: VB_W, height: VB_H }, svg);

    var CX = 309, CY = 320.07, HS = 1.05;   // 다이얼 중심, 바늘 배율

    // 날짜 창
    el("rect", { x: 432.3, y: 305, width: 38.9, height: 34.6, rx: 2, fill: "#f2f2ef" }, svg);
    var dateWin = el("text", { x: 451.7, y: 322.3, "font-size": 24, "font-weight": "bold", fill: "#1d1d1d", "text-anchor": "middle", "dominant-baseline": "central", "font-family": "Arial, sans-serif" }, svg);

    // 바늘
    function hand(points) {
        var g = el("g", { filter: "url(#dcHandShadow)" }, svg);
        el("polygon", { points: points, fill: "url(#dcSilver)", stroke: "#6c7582", "stroke-width": 1, transform: "translate(" + CX + " " + CY + ") scale(" + HS + ")" }, g);
        return g;
    }
    var hourHand = hand("0,-130 11,-26 6,28 -6,28 -11,-26");
    var minHand = hand("0,-190 9,-26 5,34 -5,34 -9,-26");
    var secHand = el("g", { filter: "url(#dcHandShadow)" }, svg);
    el("line", { x1: CX, y1: CY + 48, x2: CX, y2: CY - 193, stroke: "#2f7cf0", "stroke-width": 3.2, "stroke-linecap": "round" }, secHand);
    el("circle", { cx: CX, cy: CY + 36, r: 6.3, fill: "#2f7cf0" }, secHand);
    el("circle", { cx: CX, cy: CY, r: 11.5, fill: "#2f7cf0", stroke: "#173f86", "stroke-width": 1.5 }, svg);
    el("circle", { cx: CX, cy: CY, r: 4, fill: "#cfe0ff" }, svg);

    // 7-세그먼트 숫자
    var SEG = { 0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcdfg" };
    var DW = 28, DH = 50, TH = 6, DY = 637;
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
        var g = 1.5, ht = TH / 2, xl = x + ht, xr = x + DW - ht, yt = DY + ht, ym = DY + DH / 2, yb = DY + DH - ht;
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
        el("circle", { cx: x, cy: DY + 15, r: 3.2, fill: CYAN }, digitsG);
        el("circle", { cx: x, cy: DY + 35, r: 3.2, fill: CYAN }, digitsG);
    }
    var digits = [], x = 184;
    for (var d = 0; d < 6; d++) {
        digits.push(makeDigit(x));
        x += DW + 5;
        if (d === 1 || d === 3) { colon(x + 3); x += 12; }
    }
    var ampm = el("text", { x: x + 1, y: DY + DH - 1, "font-size": 20, "font-weight": "bold", fill: CYAN, "font-family": "Montserrat, Arial, sans-serif", filter: "url(#dcGlow)" }, svg);
    var dateLine = el("text", { x: 309, y: 721, "font-size": 22, "font-weight": "bold", fill: CYAN, "text-anchor": "middle", "letter-spacing": 1.2, "font-family": "Montserrat, Arial, sans-serif", filter: "url(#dcGlow)" }, svg);

    // 아주 작은 안내 문구
    var hint = el("text", { x: 309, y: 762, "font-size": 12, fill: "rgba(255,255,255,0.5)", "text-anchor": "middle", "font-family": "'Malgun Gothic', sans-serif" }, svg);
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

        hourHand.setAttribute("transform", "rotate(" + ((h24 % 12) * 30 + m * 0.5) + " " + CX + " " + CY + ")");
        minHand.setAttribute("transform", "rotate(" + (m * 6 + s * 0.1) + " " + CX + " " + CY + ")");
        secHand.setAttribute("transform", "rotate(" + s * 6 + " " + CX + " " + CY + ")");
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

    /* 떠 있는 창 크기를 바꾸면 시계 비율대로 가로·세로를 같이 맞춰요.
       (브라우저가 막으면, 크기를 바꾼 뒤 시계를 한 번 클릭하면 맞춰져요) */
    function keepRatio(w) {
        var ratio = VB_W / VB_H, lastW = w.innerWidth, lastH = w.innerHeight, t = null;
        function fit() {
            var iw = w.innerWidth, ih = w.innerHeight;
            if (Math.abs(iw / ih - ratio) < 0.02) { lastW = iw; lastH = ih; return; }
            var tw, th;
            if (Math.abs(ih - lastH) / lastH > Math.abs(iw - lastW) / lastW) { th = ih; tw = Math.round(ih * ratio); }
            else { tw = iw; th = Math.round(iw / ratio); }
            try { w.resizeTo(tw + (w.outerWidth - iw), th + (w.outerHeight - ih)); } catch (e) {}
            lastW = tw; lastH = th;
        }
        w.addEventListener("resize", function () { w.clearTimeout(t); t = w.setTimeout(fit, 250); });
        w.document.addEventListener("click", fit);
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
                    "body{display:block}" +
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
                keepRatio(w);
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
