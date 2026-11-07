
(function () {
    "use strict";

    var panel = document.querySelector(".tree-panel");
    if (!panel) return;

    var MOBILE_CLOCK_WIDTH = 104;   // 폰에서 시계 너비(px)
    var MOBILE_QUERY = "screen and (max-width: 768px), screen and (hover: none) and (pointer: coarse) and (max-width: 1000px)";
    var CLOCK_WIDTH = 150;          // 홈페이지 안 시계 너비(px)
    var POPUP_W = 240, POPUP_H = 311; // 떠 있는 창 크기(px) - 시계 비율과 같게
    var VB_W = 618, VB_H = 801;      // 시계 그림 기준 크기 (비율 유지용)

    var NOTE_TEXT = "Everything will be okay.";  // 시계 옆 파란 칸 글씨
    var NOTE_HOLD = 5;                          // 다 쓴 뒤 다시 쓰기까지 기다리는 시간(초) - PC
    var NOTE_HOLD_MOBILE = 5;                   // 같은 시간 - 폰

    var NS = "http://www.w3.org/2000/svg";
    var CYAN = "#3fd4ff";
    var DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    var MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    /* ---------- 스타일 ---------- */
    var style = document.createElement("style");
    style.textContent = [
        ".tree-panel { --dc-w: " + CLOCK_WIDTH + "px; --dc-h: calc(var(--dc-w) * " + (VB_H / VB_W) + "); }",
        /* 시계 줄이 위, 사진이 아래 */
        ".tree-panel img { top: calc(var(--dc-h) + 12px) !important; height: calc(100% - var(--dc-h) - 12px) !important; }",
        ".dc-home { position: absolute; top: 0; left: 0; right: 24px; height: var(--dc-h); display: flex; gap: 10px; }",
        ".dc-slot { flex: none; width: var(--dc-w); height: var(--dc-h); }",
        ".dc-wrap { width: 100%; cursor: pointer; user-select: none; -webkit-user-select: none; }",
        ".dc-svg { display: block; width: 100%; height: auto; filter: drop-shadow(0 3px 6px rgba(0,0,0,.35)); }",
        ".dc-wrap.dc-float { position: fixed; right: 16px; bottom: 16px; width: 170px; z-index: 2147483000; }",
        ".dc-ph { display: none; padding: 6px 2px; font-size: 10px; line-height: 1.4; color: #888; cursor: pointer; }",
        ".dc-home.dc-away .dc-ph { display: block; }",
        /* 시계 옆 파란 칸: 깃털 펜으로 쓰는 필기체 글씨 */
        ".dc-note { position: relative; flex: 1 1 auto; min-width: 0; background: #1f5fc4; border: 1px solid #164a9c; overflow: hidden; container-type: inline-size; }",
        ".dc-note-text { position: absolute; left: 0; right: 0; top: 0; margin: 0; padding: 10px 6px 0 10px;",
        "    color: #fff; font: 400 min(28px, 19cqw)/1.05 'Great Vibes', 'Segoe Script', 'Brush Script MT', cursive; }",
        ".dc-line { font: inherit; display: block; width: max-content; padding: 0 8px 4px 2px; margin-left: -2px; clip-path: inset(0 100% 0 0); }",
        ".dc-quill { position: absolute; left: 0; top: 0; width: 34px; height: 48px; pointer-events: none; opacity: 0;",
        "    transform-origin: 0 100%; filter: drop-shadow(1px 2px 1.5px rgba(0,0,0,.35)); transition: opacity .4s; }",
        ".dc-note-text.dc-fade { transition: opacity .3s; opacity: 0; }",
        /* 폰: 제목(밑줄) 아래에 시계와 파란 칸을 작게 나란히 (다른 위젯에는 영향 없음) */
        ".dc-mobile { --dc-w: " + MOBILE_CLOCK_WIDTH + "px; --dc-h: calc(var(--dc-w) * " + (VB_H / VB_W) + "); margin: 0 0 20px; position: relative; z-index: 1; }",
        ".dc-mobile .dc-home { position: relative; right: auto; width: 100%; gap: 8px; }",
        ".dc-mobile .dc-note-text { font-size: min(21px, 14cqw); padding: 7px 5px 0 8px; }"
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
    // 날짜 창: 남색 바탕 + 로즈골드 테두리 + 샴페인골드 숫자 (다이얼·테두리 색과 맞춤)
    grad(defs, "dcDateBg", "linearGradient", [["0", "#06112b"], ["1", "#14295a"]], { x1: "0", y1: "0", x2: "0", y2: "1" });
    grad(defs, "dcDateGold", "linearGradient", [["0", "#fbe7bf"], ["0.5", "#e2b87c"], ["1", "#b9834f"]], { x1: "0", y1: "0", x2: "0", y2: "1" });
    grad(defs, "dcDateRim", "linearGradient", [["0", "#f4cdb0"], ["0.5", "#b9714f"], ["1", "#f0bf9c"]], { x1: "0", y1: "0", x2: "1", y2: "1" });
    el("rect", { x: 417, y: 298.5, width: 58, height: 45, rx: 4, fill: "url(#dcDateBg)", stroke: "url(#dcDateRim)", "stroke-width": 3 }, svg);
    el("rect", { x: 421, y: 302.5, width: 50, height: 37, rx: 2.5, fill: "none", stroke: "rgba(0,0,0,0.55)", "stroke-width": 1.5 }, svg);
    var dateWin = el("text", { x: 446, y: 322.5, "font-size": 34, "font-weight": "bold", fill: "url(#dcDateGold)", "text-anchor": "middle", "dominant-baseline": "central", "font-family": "'Times New Roman', Georgia, serif", stroke: "rgba(0,0,0,0.35)", "stroke-width": 0.6 }, svg);

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
    var slot = document.createElement("div");
    slot.className = "dc-slot";
    slot.appendChild(wrap);
    slot.appendChild(ph);
    home.appendChild(slot);

    var note = document.createElement("div");
    note.className = "dc-note";
    var noteText = document.createElement("p");
    noteText.className = "dc-note-text";
    noteText.setAttribute("aria-label", NOTE_TEXT);
    noteText.setAttribute("role", "img");
    note.appendChild(noteText);
    home.appendChild(note);
    panel.appendChild(home);

    /* 폰에서는 왼쪽 칸이 숨겨지므로, 시계 줄을 제목(밑줄) 바로 아래로 옮겨요 */
    var mobileBox = document.createElement("div");
    mobileBox.className = "dc-mobile";
    var mq = window.matchMedia(MOBILE_QUERY);
    function placeHome() {
        if (mq.matches) {
            if (!mobileBox.parentNode) {
                var banner = document.querySelector(".site-header") || document.querySelector(".main-banner");   // "Testing..." 제목과 밑줄 바로 아래
                if (banner && banner.parentNode) banner.parentNode.insertBefore(mobileBox, banner.nextSibling);
                else document.body.insertBefore(mobileBox, document.body.firstChild);
            }
            mobileBox.appendChild(home);
        } else {
            panel.appendChild(home);
            if (mobileBox.parentNode) mobileBox.parentNode.removeChild(mobileBox);
        }
    }
    placeHome();
    if (mq.addEventListener) mq.addEventListener("change", placeHome); else mq.addListener(placeHome);

    /* ---------- 파란 칸 글씨: 깃털 펜으로 위에서부터 한 줄씩 ---------- */
    (function writeNote() {
        if (!document.querySelector('link[href*="Great+Vibes"]')) {
            var fl = document.createElement("link");
            fl.rel = "stylesheet";
            fl.href = "https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap";
            document.head.appendChild(fl);
        }
        var lines = NOTE_TEXT.split(" ").map(function (w) {      // 한 단어씩 한 줄
            var sp = document.createElement("span");
            sp.className = "dc-line";
            sp.textContent = w;
            noteText.appendChild(sp);
            return sp;
        });
        var quill = document.createElementNS(NS, "svg");
        quill.setAttribute("class", "dc-quill");
        quill.setAttribute("viewBox", "0 0 34 48");
        quill.setAttribute("aria-hidden", "true");
        quill.innerHTML =
            '<path d="M3 46 C 9 33, 18 17, 33 1 C 27 14, 22 26, 8 41 Z" fill="#fbf7ee"/>' +
            '<path d="M6 42 C 8 30, 16 15, 33 1 C 22 11, 13 24, 9 37 Z" fill="#e6dfcf"/>' +
            '<path d="M14 31 l-4 -2 M18 25 l-4 -2 M22 19 l-4 -2 M26 13 l-3 -2 M17 30 l2 -4 M21 24 l2 -4 M25 18 l2 -4" stroke="#cfc6b2" stroke-width=".7" stroke-linecap="round"/>' +
            '<path d="M1 47.5 L 33 1" stroke="#b9ab8e" stroke-width="1.1" stroke-linecap="round"/>' +
            '<path d="M0.5 48 L 2 43.5 L 5 45 Z" fill="#2a2a2a"/>';
        note.appendChild(quill);

        var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduce) { lines.forEach(function (l) { l.style.clipPath = "none"; }); return; }

        var SPEED = 55;                 // 글씨 쓰는 속도 (px/초)
        function place(line, p, t) {
            var nr = note.getBoundingClientRect(), lr = line.getBoundingClientRect();
            var x = lr.left - nr.left + 2 + p * (lr.width - 10);
            var y = lr.top - nr.top + lr.height * 0.62 + Math.sin(t / 55) * 3.5;
            quill.style.transform = "translate(" + x + "px," + (y - 48) + "px) rotate(" + (Math.sin(t / 90) * 4) + "deg)";
        }
        function writeLine(i, done) {
            if (i >= lines.length) { done(); return; }
            var line = lines[i], w = line.getBoundingClientRect().width || 60;
            var dur = Math.max(500, w / SPEED * 1000), start = null;
            function frame(t) {
                if (start === null) start = t;
                var p = Math.min(1, (t - start) / dur);
                line.style.clipPath = "inset(0 " + ((1 - p) * 100).toFixed(2) + "% 0 0)";
                place(line, p, t);
                if (p < 1) requestAnimationFrame(frame);
                else setTimeout(function () { writeLine(i + 1, done); }, 260);   // 다음 줄로
            }
            requestAnimationFrame(frame);
        }
        function run() {
            noteText.classList.remove("dc-fade");
            lines.forEach(function (l) { l.style.clipPath = "inset(0 100% 0 0)"; });
            quill.style.opacity = "1";
            writeLine(0, function () {
                quill.style.opacity = "0";                     // 다 쓰면 펜이 사라져요
                setTimeout(function () {
                    noteText.classList.add("dc-fade");        // 잠시 뒤 지우고 다시 쓰기
                    setTimeout(run, 350);
                }, (window.matchMedia(MOBILE_QUERY).matches ? NOTE_HOLD_MOBILE : NOTE_HOLD) * 1000);
            });
        }
        var ready = document.fonts && document.fonts.load ? document.fonts.load("28px 'Great Vibes'").catch(function () {}) : Promise.resolve();
        Promise.race([ready, new Promise(function (r) { setTimeout(r, 2500); })]).then(function () { setTimeout(run, 400); });
    })();

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
        if (wrap.parentNode !== slot) slot.insertBefore(wrap, ph);
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
