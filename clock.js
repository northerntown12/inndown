window.T = window.T || function (ko) { return ko; };   /* lang.js가 없어도 한국어로 동작 */

(function () {
    "use strict";

    var panel = document.querySelector(".tree-panel");
    if (!panel) return;

    var MOBILE_CLOCK_WIDTH = 104;   // 폰에서 시계 너비(px)
    var MOBILE_QUERY = "screen and (max-width: 768px), screen and (hover: none) and (pointer: coarse) and (max-width: 1000px)";
    var CLOCK_WIDTH = 150;          // 홈페이지 안 시계 너비(px)
    var POPUP_W = 240, POPUP_H = 311; // 떠 있는 창 크기(px) - 시계 비율과 같게
    var VB_W = 618, VB_H = 801;      // 시계 그림 기준 크기 (비율 유지용)

    var NOTE_TEXT = "Everything will be fine...";  // 시계 옆 종이 칸 글씨 (fine 뒤에 바로 이어서 마침표 세 개)
    var NOTE_HOLD = 5;                          // 다 쓴 뒤 다시 쓰기까지 기다리는 시간(초) - PC
    var NOTE_HOLD_MOBILE = 5;                   // 같은 시간 - 폰

    var NS = "http://www.w3.org/2000/svg";
    var CYAN = "#3fd4ff";
    var DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    var MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    var NOTE_PAPER = new URL("note-paper.webp?v=3", document.baseURI).href;   // 종이 칸 바탕 그림

    /* 2026-11-28: 시계를 아날로그(동그란 시계)와 디지털(숫자 판) 두 조각으로 나눔
       - 둘 사이에 틈(DC_GAP)을 두고, 디지털 숫자를 크게
       - 각각 따로 끌어서 옮기기 / 브라우저 창 밖으로 끌면 따로 떠 있는 창으로 (다른 모니터까지)
       - 둘 사이 틈의 작은 손잡이(⋯)를 끌면 둘이 같이 움직이고, 더블클릭하면 같이 떠요 */
    var DIG_VB_H = 250;                      // 디지털 판 그림 기준 높이 (가로 VB_W = 618)
    var DC_GAP = 10, DC_GAP_MOBILE = 6;      // 아날로그와 디지털 사이 틈(px)

    /* ---------- 스타일 ---------- */
    var style = document.createElement("style");
    style.textContent = [
        ".tree-panel { --dc-w: " + CLOCK_WIDTH + "px; --dc-h: calc(var(--dc-w) * " + (VB_H / VB_W) + "); --dc-gap: " + DC_GAP + "px; --dc-dig-h: calc(var(--dc-w) * " + (DIG_VB_H / VB_W) + "); }",
        /* 시계 줄이 위, 사진이 아래 */
        ".tree-panel img { top: calc(var(--dc-h) + 12px) !important; height: calc(100% - var(--dc-h) - 12px) !important; }",
        ".dc-home { position: absolute; top: 0; left: 0; right: 24px; height: var(--dc-h); display: flex; gap: 10px; }",
        ".dc-slot { flex: none; width: var(--dc-w); height: var(--dc-h); display: flex; flex-direction: column; align-items: center; }",
        ".dc-box { position: relative; flex: none; display: flex; justify-content: center; }",
        ".dc-box-ana { width: 100%; height: calc(var(--dc-h) - var(--dc-dig-h) - var(--dc-gap)); }",
        ".dc-box-dig { width: 100%; height: var(--dc-dig-h); }",
        ".dc-wrap { cursor: pointer; user-select: none; -webkit-user-select: none; touch-action: none; }",
        ".dc-box-ana > .dc-ana { height: 100%; aspect-ratio: " + VB_W + " / 661; }",
        ".dc-box-dig > .dc-dig { width: 100%; }",
        ".dc-svg { display: block; width: 100%; height: auto; filter: drop-shadow(0 3px 6px rgba(0,0,0,.35)); }",
        ".dc-wrap.dc-float { position: fixed; z-index: 2147483000; }",
        ".dc-wrap.dc-float.dc-ana:not(.dc-moved) { right: 16px; bottom: 140px; width: 150px; }",
        ".dc-wrap.dc-float.dc-dig:not(.dc-moved) { right: 16px; bottom: 16px; width: 220px; }",
        /* 둘 사이 손잡이: 끌면 같이 옮기기, 더블클릭하면 같이 띄우기 */
        ".dc-grip { flex: none; width: 100%; height: var(--dc-gap); display: flex; align-items: center; justify-content: center; cursor: grab; touch-action: none; }",
        ".dc-grip::before { content: ''; width: 34px; height: 4px; border-radius: 2px; background: rgba(120,120,120,.35); transition: background .2s, width .2s; }",
        ".dc-slot:hover .dc-grip::before, .dc-grip:hover::before { background: rgba(90,87,181,.8); width: 46px; }",
        ".dc-home.dc-split .dc-grip { visibility: hidden; }",
        /* 떠나간 자리: 점선 칸 + 작은 안내 (누르면 돌아와요) */
        ".dc-ph { display: none; position: absolute; inset: 0; box-sizing: border-box; border: 1px dashed #bbb; border-radius: 8px; padding: 4px; align-items: center; justify-content: center; text-align: center; font-size: 10px; line-height: 1.35; color: #888; cursor: pointer; overflow: hidden; }",
        ".dc-box-ana .dc-ph { left: 50%; right: auto; width: calc(var(--dc-h) - var(--dc-dig-h) - var(--dc-gap)); transform: translateX(-50%); }",
        ".dc-box.dc-away .dc-ph { display: flex; }",
        /* 2026-11-23: 마우스로 끌어서 옮기기 — 끄는 동안 주먹 커서, 글자 선택 막기 */
        "html.dc-dragging, html.dc-dragging * { cursor: grabbing !important; user-select: none !important; -webkit-user-select: none !important; }",
        /* 시계 옆 종이 칸: 낡은 종이(note-paper.webp, 원본 paper.webp) 위에 깃털 펜으로 쓰는 필기체 글씨 */
        ".dc-note { position: relative; flex: 1 1 auto; min-width: 0; background: #3a2617 url('" + NOTE_PAPER + "') center / cover no-repeat; overflow: hidden; container-type: inline-size; }",
        ".dc-note-text { position: absolute; left: 0; right: 0; top: 0; margin: 0; padding: 13% 6px 0 13%;",
        "    color: #2a1a0c; text-shadow: 0 0 1px rgba(42,26,12,.35); font: 400 min(28px, 17cqw)/1.05 'Great Vibes', 'Segoe Script', 'Brush Script MT', cursive; }",
        ".dc-line { font: inherit; display: block; width: max-content; padding: 0 8px 4px 2px; margin-left: -2px; clip-path: inset(0 100% 0 0); }",
        ".dc-quill { position: absolute; left: 0; top: 0; width: 34px; height: 48px; pointer-events: none; opacity: 0;",
        "    transform-origin: 0 100%; filter: drop-shadow(1px 2px 1.5px rgba(0,0,0,.35)); transition: opacity .4s; }",
        ".dc-note-text.dc-fade { transition: opacity .3s; opacity: 0; }",
        ".dc-dot { opacity: 0; transition: opacity .1s; }",
        /* 펜을 잉크병에서 들어 올릴 때 떨어지는 잉크 한 방울 */
        ".dc-ink-drop { position: absolute; left: 0; top: 0; width: 3px; height: 4px; margin: -1px 0 0 -1.5px; border-radius: 50% 50% 50% 50% / 40% 40% 60% 60%;",
        "    background: #1a120a; pointer-events: none; opacity: 0; }",
        ".dc-ink-drop.fall { animation: dcDrop .42s ease-in forwards; }",
        "@keyframes dcDrop { 0% { opacity: 1; transform: translateY(0) scaleY(1); } 80% { opacity: 1; transform: translateY(var(--fall, 12px)) scaleY(1.5); } 100% { opacity: 0; transform: translateY(var(--fall, 12px)) scaleY(1.5); } }",
        ".dc-dot.on { opacity: 1; }",
        /* 폰: 제목(밑줄) 아래에 시계와 종이 칸을 작게 나란히 (다른 위젯에는 영향 없음) */
        ".dc-mobile { --dc-w: " + MOBILE_CLOCK_WIDTH + "px; --dc-h: calc(var(--dc-w) * " + (VB_H / VB_W) + "); --dc-gap: " + DC_GAP_MOBILE + "px; --dc-dig-h: calc(var(--dc-w) * " + (DIG_VB_H / VB_W) + "); margin: 0 0 20px; position: relative; z-index: 1; }",
        ".dc-mobile .dc-home { position: relative; right: auto; width: 100%; gap: 8px; }",
        ".dc-mobile .dc-grip { visibility: hidden; }",
        ".dc-mobile .dc-note-text { font-size: min(21px, 13cqw); padding: 8% 5px 0 12%; }"
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
    function glowFilter(defs, id) {
        var f = el("filter", { id: id, x: "-20%", y: "-20%", width: "140%", height: "140%" }, defs);
        el("feGaussianBlur", { stdDeviation: "1.8", result: "b" }, f);
        var m = el("feMerge", {}, f);
        el("feMergeNode", { in: "b" }, m);
        el("feMergeNode", { in: "SourceGraphic" }, m);
    }

    /* ---------- 아날로그 시계 (clock-face.webp의 금속 판 + 다이얼, 그 위에 바늘·날짜 창) ----------
       2026-11-28 저녁: 금속 판 배경 복구. 그림 위쪽(다이얼까지, y 0~612)과 맨 아래 테두리(y 752~801)를 이어 붙여
       가운데 디지털 칸 자리만 빼요 (디지털은 아래 따로 그린 판) 
       각 SVG는 자기 안에 defs를 따로 가져요 (따로 떠 있는 창으로 옮겨 가도 그림이 깨지지 않게) */
    var FACE_URL = new URL("clock-face.webp", document.baseURI).href;
    var CX = 309, CY = 320.07, HS = 1.05;   // 다이얼 중심, 바늘 배율
    var ANA_CUT = 612, ANA_BOT = 752;       // 위쪽 그림을 자르는 줄, 이어 붙일 아래 테두리 시작 줄
    var ANA_H = ANA_CUT + (VB_H - ANA_BOT);  // = 661
    var anaSvg = el("svg", { viewBox: "0 0 " + VB_W + " " + ANA_H, class: "dc-svg", role: "img", "aria-label": T("아날로그 시계", "Analog clock") });
    var aDefs = el("defs", {}, anaSvg);
    grad(aDefs, "dcSilver", "linearGradient", [["0", "#ffffff"], ["0.5", "#cfd5dd"], ["1", "#8a93a0"]], { x1: "0", y1: "0", x2: "1", y2: "0" });
    var hshadow = el("filter", { id: "dcHandShadow", x: "-30%", y: "-30%", width: "160%", height: "160%" }, aDefs);
    el("feDropShadow", { dx: "2", dy: "3", stdDeviation: "2", "flood-opacity": "0.5" }, hshadow);
    var topClip = el("clipPath", { id: "dcFaceTop" }, aDefs);
    el("rect", { x: 0, y: 0, width: VB_W, height: ANA_CUT }, topClip);
    var botClip = el("clipPath", { id: "dcFaceBot" }, aDefs);
    el("rect", { x: 0, y: ANA_CUT, width: VB_W, height: VB_H - ANA_BOT }, botClip);
    el("image", { href: FACE_URL, x: 0, y: 0, width: VB_W, height: VB_H, "clip-path": "url(#dcFaceTop)" }, anaSvg);
    el("image", { href: FACE_URL, x: 0, y: ANA_CUT - ANA_BOT, width: VB_W, height: VB_H, "clip-path": "url(#dcFaceBot)" }, anaSvg);

    // 날짜 창: 남색 바탕 + 로즈골드 테두리 + 샴페인골드 숫자 (다이얼·테두리 색과 맞춤)
    grad(aDefs, "dcDateBg", "linearGradient", [["0", "#06112b"], ["1", "#14295a"]], { x1: "0", y1: "0", x2: "0", y2: "1" });
    grad(aDefs, "dcDateGold", "linearGradient", [["0", "#fbe7bf"], ["0.5", "#e2b87c"], ["1", "#b9834f"]], { x1: "0", y1: "0", x2: "0", y2: "1" });
    grad(aDefs, "dcDateRim", "linearGradient", [["0", "#f4cdb0"], ["0.5", "#b9714f"], ["1", "#f0bf9c"]], { x1: "0", y1: "0", x2: "1", y2: "1" });
    el("rect", { x: 417, y: 298.5, width: 58, height: 45, rx: 4, fill: "url(#dcDateBg)", stroke: "url(#dcDateRim)", "stroke-width": 3 }, anaSvg);
    el("rect", { x: 421, y: 302.5, width: 50, height: 37, rx: 2.5, fill: "none", stroke: "rgba(0,0,0,0.55)", "stroke-width": 1.5 }, anaSvg);
    var dateWin = el("text", { x: 446, y: 322.5, "font-size": 34, "font-weight": "bold", fill: "url(#dcDateGold)", "text-anchor": "middle", "dominant-baseline": "central", "font-family": "'Times New Roman', Georgia, serif", stroke: "rgba(0,0,0,0.35)", "stroke-width": 0.6 }, anaSvg);

    // 바늘
    function hand(points) {
        var g = el("g", { filter: "url(#dcHandShadow)" }, anaSvg);
        el("polygon", { points: points, fill: "url(#dcSilver)", stroke: "#6c7582", "stroke-width": 1, transform: "translate(" + CX + " " + CY + ") scale(" + HS + ")" }, g);
        return g;
    }
    var hourHand = hand("0,-130 11,-26 6,28 -6,28 -11,-26");
    var minHand = hand("0,-190 9,-26 5,34 -5,34 -9,-26");
    var secHand = el("g", { filter: "url(#dcHandShadow)" }, anaSvg);
    el("line", { x1: CX, y1: CY + 48, x2: CX, y2: CY - 193, stroke: "#2f7cf0", "stroke-width": 3.2, "stroke-linecap": "round" }, secHand);
    el("circle", { cx: CX, cy: CY + 36, r: 6.3, fill: "#2f7cf0" }, secHand);
    el("circle", { cx: CX, cy: CY, r: 11.5, fill: "#2f7cf0", stroke: "#173f86", "stroke-width": 1.5 }, anaSvg);
    el("circle", { cx: CX, cy: CY, r: 4, fill: "#cfe0ff" }, anaSvg);

    /* ---------- 디지털 판 (따로 그린 판, 숫자는 예전보다 약 2배) ---------- */
    var digSvg = el("svg", { viewBox: "0 0 " + VB_W + " " + DIG_VB_H, class: "dc-svg", role: "img", "aria-label": T("디지털 시계", "Digital clock") });
    var dDefs = el("defs", {}, digSvg);
    glowFilter(dDefs, "dcGlow");
    grad(dDefs, "dcDigFrame", "linearGradient", [["0", "#3a3e46"], ["0.5", "#1f2227"], ["1", "#2c2f36"]], { x1: "0", y1: "0", x2: "0", y2: "1" });
    grad(dDefs, "dcDigPlate", "linearGradient", [["0", "#3b2a24"], ["1", "#1f140e"]], { x1: "0", y1: "0", x2: "0", y2: "1" });
    grad(dDefs, "dcDigRim", "linearGradient", [["0", "#f4cdb0"], ["0.5", "#b9714f"], ["1", "#f0bf9c"]], { x1: "0", y1: "0", x2: "1", y2: "1" });
    el("rect", { x: 4, y: 4, width: VB_W - 8, height: DIG_VB_H - 8, rx: 28, fill: "url(#dcDigFrame)", stroke: "#5a5f69", "stroke-width": 3 }, digSvg);
    el("rect", { x: 28, y: 22, width: VB_W - 56, height: DIG_VB_H - 52, rx: 14, fill: "url(#dcDigPlate)", stroke: "url(#dcDigRim)", "stroke-width": 3 }, digSvg);

    // 7-세그먼트 숫자
    var SEG = { 0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcdfg" };
    var DW = 52, DH = 92, TH = 11, DY = 42, DGAP = 8, CGAP = 18;
    var DIG_TOTAL = 6 * DW + 5 * DGAP + 2 * CGAP + 78;   // 숫자 6개 + 콜론 2개 + AM/PM (2026-11-28 AM/PM 50% 크게 → 자리 52→78)
    var digitsG = el("g", { transform: "translate(" + (Math.tan(6 * Math.PI / 180) * (DY + DH / 2)).toFixed(2) + " 0) skewX(-6)", filter: "url(#dcGlow)" }, digSvg);
    function hSeg(x0, x1, y) {
        var h = TH / 2;
        return [[x0, y], [x0 + h, y - h], [x1 - h, y - h], [x1, y], [x1 - h, y + h], [x0 + h, y + h]];
    }
    function vSeg(x, y0, y1) {
        var h = TH / 2;
        return [[x, y0], [x + h, y0 + h], [x + h, y1 - h], [x, y1], [x - h, y1 - h], [x - h, y0 + h]];
    }
    function makeDigit(x) {
        var g = 2.2, ht = TH / 2, xl = x + ht, xr = x + DW - ht, yt = DY + ht, ym = DY + DH / 2, yb = DY + DH - ht;
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
        el("circle", { cx: x, cy: DY + DH * 0.3, r: 5.5, fill: CYAN }, digitsG);
        el("circle", { cx: x, cy: DY + DH * 0.7, r: 5.5, fill: CYAN }, digitsG);
    }
    var digits = [], x = Math.round((VB_W - DIG_TOTAL) / 2);
    for (var d = 0; d < 6; d++) {
        digits.push(makeDigit(x));
        x += DW + DGAP;
        if (d === 1 || d === 3) { colon(x + CGAP / 2 - DGAP / 2); x += CGAP; }
    }
    var ampm = el("text", { x: x + 2, y: DY + DH - 2, "font-size": 51, "font-weight": "bold", fill: CYAN, "font-family": "Montserrat, Arial, sans-serif", filter: "url(#dcGlow)" }, digSvg);   // AM/PM 34 → 51 (50% 크게)
    var dateLine = el("text", { x: VB_W / 2, y: 182, "font-size": 30, "font-weight": "bold", fill: CYAN, "text-anchor": "middle", "letter-spacing": 1.5, "font-family": "Montserrat, Arial, sans-serif", filter: "url(#dcGlow)" }, digSvg);

    // 아주 작은 안내 문구 (디지털 판 맨 아래)
    var CAN_PIP = "documentPictureInPicture" in window;
    var HINT_HOME = CAN_PIP ? T("끌어서 옮기기 · 창 밖으로 끌면 따로 떠요", "Drag to move · drag outside to pop out")
                            : T("끌어서 옮기기 · 더블클릭: 따로 띄우기", "Drag to move · Double-click: pop out");
    var HINT_AWAY = T("끌어서 옮기기 · 더블클릭: 원래대로", "Drag to move · Double-click: restore");
    var HINT_WIN = T("더블클릭: 원래대로", "Double-click: restore");
    var hint = el("text", { x: VB_W / 2, y: 236, "font-size": 15, fill: "rgba(255,255,255,0.5)", "text-anchor": "middle", "font-family": "'Malgun Gothic', sans-serif" }, digSvg);
    hint.textContent = HINT_HOME;

    /* ---------- 화면에 넣기 ---------- */
    var home = document.createElement("div");
    home.className = "dc-home";
    var slot = document.createElement("div");
    slot.className = "dc-slot";
    function makePiece(key, svgEl, title, phText) {
        var box = document.createElement("div");
        box.className = "dc-box dc-box-" + key;
        var wrap = document.createElement("div");
        wrap.className = "dc-wrap dc-" + key;
        wrap.title = title;
        wrap.appendChild(svgEl);
        var ph = document.createElement("div");
        ph.className = "dc-ph";
        ph.textContent = phText;
        box.appendChild(wrap);
        box.appendChild(ph);
        return { key: key, box: box, wrap: wrap, ph: ph, phText: phText, win: null };
    }
    var ANA = makePiece("ana", anaSvg,
        T("끌어서 옮기기 · 더블클릭: 따로 띄우기", "Drag to move · Double-click: pop out"),
        T("시계가 다른 곳에 있어요. 누르면 돌아와요", "The clock is elsewhere. Click to bring it back"));
    var DIG = makePiece("dig", digSvg,
        T("끌어서 옮기기 · 더블클릭: 따로 띄우기", "Drag to move · Double-click: pop out"),
        T("숫자 시계가 다른 곳에 있어요. 누르면 돌아와요", "The digital clock is elsewhere. Click to bring it back"));
    var PIECES = [ANA, DIG];
    var grip = document.createElement("div");
    grip.className = "dc-grip";
    grip.title = T("끌면 둘 다 같이 옮겨요 · 더블클릭: 같이 띄우기", "Drag to move both · Double-click: pop out both");
    slot.appendChild(ANA.box);
    slot.appendChild(grip);
    slot.appendChild(DIG.box);
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

    /* ---------- 종이 칸 글씨: 깃털 펜으로 위에서부터 한 줄씩 ---------- */
    (function writeNote() {
        if (!document.querySelector('link[href*="Great+Vibes"]')) {
            var fl = document.createElement("link");
            fl.rel = "stylesheet";
            fl.href = "https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap";
            document.head.appendChild(fl);
        }
        /* 한 단어씩 한 줄. 끝에 점이 여러 개 있으면(fine...) 점은 따로 하나씩 찍어요 */
        var lines = NOTE_TEXT.split(" ").map(function (w) {
            var sp = document.createElement("span");
            sp.className = "dc-line";
            var m = /^(.*?)(\.{2,})$/.exec(w);
            var word = document.createTextNode(m ? m[1] : w);
            sp.appendChild(word);
            var dots = [];
            if (m) {
                for (var k = 0; k < m[2].length; k++) {
                    var dt = document.createElement("span");
                    dt.className = "dc-dot";
                    dt.textContent = ".";
                    sp.appendChild(dt);
                    dots.push(dt);
                }
            }
            noteText.appendChild(sp);
            return { el: sp, word: word, dots: dots };
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
        if (reduce) {
            lines.forEach(function (l) { l.el.style.clipPath = "none"; l.dots.forEach(function (d) { d.classList.add("on"); }); });
            return;
        }

        var SPEED = 55;                 // 글씨 쓰는 속도 (px/초)
        var DOT_WAIT = 1000;            // 마지막 글자(fine의 e)를 쓰고 첫 점까지 (ms)
        var DOT_GAP = 500;              // 점과 점 사이 (ms)
        var INK_DIP = true;             // 쓰기 전에 잉크병에 펜 적시기 (false면 바로 쓰기)
        var PAPER_W = 600, PAPER_H = 550;          // note-paper.webp 크기
        var INK_PX = 495, INK_PY = 410, INK_R = 22; // 그림 속 잉크병 입구 가운데·반지름 (그림 px)
        var pen = { x: 0, y: 0 };
        function penAt(x, y, t) {
            pen.x = x; pen.y = y;
            quill.style.transform = "translate(" + x + "px," + (y - 48) + "px) rotate(" + (Math.sin(t / 90) * 4) + "deg)";
        }
        function rel(r) { var nr = note.getBoundingClientRect(); return { left: r.left - nr.left, top: r.top - nr.top, width: r.width, height: r.height }; }
        // 단어(점 빼고)가 끝나는 위치 (줄 왼쪽 기준 px)
        function wordEnd(item) {
            var lr = item.el.getBoundingClientRect();
            if (!item.dots.length || !document.createRange) return lr.width;
            var r = document.createRange();
            r.selectNodeContents(item.word);
            return r.getBoundingClientRect().right - lr.left + 2;
        }
        function writeLine(i, done) {
            if (i >= lines.length) { done(); return; }
            var item = lines[i], line = item.el;
            var W = line.getBoundingClientRect().width || 60, end = wordEnd(item);
            var dur = Math.max(500, end / SPEED * 1000), start = null;
            function frame(t) {
                if (start === null) start = t;
                var p = Math.min(1, (t - start) / dur);
                line.style.clipPath = "inset(0 " + Math.max(0, W - p * end).toFixed(1) + "px 0 0)";
                var lr = rel(line.getBoundingClientRect());
                penAt(lr.left + 2 + p * (end - 10), lr.top + lr.height * 0.62 + Math.sin(t / 55) * 3.5, t);
                if (p < 1) { requestAnimationFrame(frame); return; }
                if (item.dots.length) {
                    line.style.clipPath = "none";        // 점은 아직 안 보여요 (투명)
                    writeDots(item, function () { setTimeout(function () { writeLine(i + 1, done); }, 260); });
                } else {
                    setTimeout(function () { writeLine(i + 1, done); }, 260);   // 다음 줄로
                }
            }
            requestAnimationFrame(frame);
        }
        // 펜을 점 자리로 살짝 옮겨서 콕 찍어요: e를 쓰고 1초, 1.5초, 2초 뒤에 점이 하나씩 생겨요
        function writeDots(item, done) {
            var MOVE = 180;
            item.dots.forEach(function (dot, k) {
                var at = DOT_WAIT + k * DOT_GAP;
                setTimeout(function () {
                    var dr = rel(dot.getBoundingClientRect()), lr = rel(item.el.getBoundingClientRect());
                    var fx = pen.x, fy = pen.y, tx = dr.left + dr.width * 0.3, ty = lr.top + lr.height * 0.74, s0 = null;
                    function glide(t) {
                        if (s0 === null) s0 = t;
                        var q = Math.min(1, (t - s0) / MOVE), e = q * (2 - q);
                        penAt(fx + (tx - fx) * e, fy + (ty - fy) * e - Math.sin(q * Math.PI) * 6, t);
                        if (q < 1) requestAnimationFrame(glide);
                        else {
                            dot.classList.add("on");
                            if (k === item.dots.length - 1) done();
                        }
                    }
                    requestAnimationFrame(glide);
                }, Math.max(0, at - MOVE));
            });
        }
        /* ---------- 쓰기 전에 잉크병(종이 오른쪽 아래 그림)에 펜 적시기 ---------- */
        var drop = document.createElement("span");
        drop.className = "dc-ink-drop";
        drop.setAttribute("aria-hidden", "true");
        note.appendChild(drop);
        // 종이 그림은 칸에 꽉 차게(cover) 깔려 있으므로, 칸 크기에 따라 잉크병 입구 자리를 계산해요
        function inkSpot() {
            var W = note.clientWidth, H = note.clientHeight;
            if (!W || !H) return null;
            var s = Math.max(W / PAPER_W, H / PAPER_H);
            var x = (W - PAPER_W * s) / 2 + INK_PX * s, y = (H - PAPER_H * s) / 2 + INK_PY * s;
            if (x < 8 || x > W - 8 || y < 30 || y > H - 4) return null;   // 잉크병이 칸 밖으로 잘리면 적시기 생략
            return { x: x, y: y, r: INK_R * s };
        }
        // 펜을 a → b 로 부드럽게 옮겨요 (arc: 가운데에서 위로 뜨는 높이)
        function move(a, b, ms, arc, cb) {
            var s0 = null;
            function f(t) {
                if (s0 === null) s0 = t;
                var q = Math.min(1, (t - s0) / ms), e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
                penAt(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e - Math.sin(q * Math.PI) * (arc || 0), t);
                if (q < 1) requestAnimationFrame(f); else cb();
            }
            requestAnimationFrame(f);
        }
        // 잉크 속에서 살짝 휘젓기
        function stir(c, ms, cb) {
            var s0 = null;
            function f(t) {
                if (s0 === null) s0 = t;
                var q = Math.min(1, (t - s0) / ms);
                penAt(c.x + Math.sin(q * Math.PI * 4) * 2.2, c.y + Math.sin(q * Math.PI * 2) * 1.2, t);
                if (q < 1) requestAnimationFrame(f); else cb();
            }
            requestAnimationFrame(f);
        }
        function dipInk(done) {
            var ink = INK_DIP && inkSpot();
            if (!ink) { quill.style.opacity = "1"; done(); return; }
            var above = { x: ink.x + 3, y: ink.y - 30 };          // 잉크병 위
            var inside = { x: ink.x, y: ink.y + ink.r * 0.25 };   // 잉크 속
            var lift = { x: ink.x + 1, y: ink.y - 12 };           // 살짝 들어 올림 (방울이 떨어지는 자리)
            var rim = { x: ink.x + ink.r * 0.8, y: ink.y - 3 };   // 병 입구 가장자리 (남은 잉크 털기)
            var first = lines[0].el, lr = rel(first.getBoundingClientRect());
            var start = { x: lr.left + 2, y: lr.top + lr.height * 0.62 };   // 첫 글자 쓰는 자리
            penAt(above.x, above.y, performance.now());
            quill.style.opacity = "1";                              // 잉크병 위에서 펜이 나타나요
            setTimeout(function () {
                move(above, inside, 420, 0, function () {           // 쑥 담그고
                    stir(inside, 520, function () {                 // 휘휘 적시고
                        move(inside, lift, 300, 0, function () {    // 들어 올리면
                            drop.style.left = lift.x + "px";        // 잉크 한 방울이 병으로 똑
                            drop.style.top = lift.y + "px";
                            drop.style.setProperty("--fall", (inside.y - lift.y) + "px");
                            drop.classList.remove("fall"); void drop.offsetWidth; drop.classList.add("fall");
                            setTimeout(function () {
                                move(lift, rim, 220, 3, function () {        // 가장자리에 톡 털고
                                    move(rim, { x: rim.x, y: rim.y - 8 }, 160, 0, function () {
                                        move({ x: rim.x, y: rim.y - 8 }, start, 750, 22, function () {   // 첫 줄로 날아가요
                                            setTimeout(done, 120);
                                        });
                                    });
                                });
                            }, 380);
                        });
                    });
                });
            }, 380);
        }

        function run() {
            noteText.classList.remove("dc-fade");
            lines.forEach(function (l) {
                l.el.style.clipPath = "inset(0 100% 0 0)";
                l.dots.forEach(function (d) { d.classList.remove("on"); });
            });
            dipInk(function () { writeLine(0, function () {
                quill.style.opacity = "0";                     // 다 쓰면 펜이 사라져요
                setTimeout(function () {
                    noteText.classList.add("dc-fade");        // 잠시 뒤 지우고 다시 쓰기
                    setTimeout(run, 350);
                }, (window.matchMedia(MOBILE_QUERY).matches ? NOTE_HOLD_MOBILE : NOTE_HOLD) * 1000);
            }); });
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
    /* 따로 떠 있는 창이 있으면 그 창의 시계로 갱신해요 (홈 탭이 가려져도 멈추지 않게) */
    function retime() {
        if (timer) { try { timerWin.clearTimeout(timer); } catch (e) {} }
        timerWin = window;
        PIECES.forEach(function (p) { if (p.win && !p.win.closed && timerWin === window) timerWin = p.win; });
        tick();
    }
    document.addEventListener("visibilitychange", update);
    tick();

    /* ---------- 2026-11-28: 조각마다 자리 옮기기 · 따로 띄우기 ----------
       상태: 홈 자리 / 홈페이지 위에 떠 있음(dc-float) / 따로 떠 있는 창(p.win)
       · 끌어서 브라우저 창 밖으로 내보내면: 그 자리에서 바로 작은 창(팝업)이 되고, 마우스를 계속 따라 움직여요.
         (멈칫하지 않게 "항상 위" 창 대신 팝업을 씀 — 팝업은 페이지가 직접 옮길 수 있어서)
         다른 모니터로 넘어가려면 크롬이 처음 한 번 "창 관리" 허락을 물어요(허용하면 그다음부터 쭉).
       · 더블클릭으로 띄우면: "항상 위" 작은 창(Document Picture-in-Picture, 크롬·엣지) 먼저, 안 되면 팝업 */
    function hintUpdate() {
        if (DIG.win) hint.textContent = HINT_WIN;
        else if (DIG.wrap.classList.contains("dc-float")) hint.textContent = HINT_AWAY;
        else hint.textContent = HINT_HOME;
        var split = PIECES.some(function (p) { return p.win || p.wrap.classList.contains("dc-float"); });
        home.classList.toggle("dc-split", split);
    }
    function clearFloat(p) {
        p.wrap.classList.remove("dc-float", "dc-moved");
        p.wrap.style.left = p.wrap.style.top = p.wrap.style.right = p.wrap.style.bottom = p.wrap.style.width = "";
    }
    function backHome(p) {
        var w = p.win;
        p.win = null;
        if (w && !w.closed) { try { w.close(); } catch (e) {} }
        clearFloat(p);
        if (p.wrap.parentNode !== p.box) p.box.insertBefore(p.wrap, p.ph);
        p.box.classList.remove("dc-away");
        hintUpdate();
        retime();
    }
    function sendAway(p) { p.box.classList.add("dc-away"); }

    // 따로 떠 있는 창 크기(안쪽) — 조각 하나 / 둘 같이
    var ANA_RATIO = VB_W / 661, DIG_RATIO = VB_W / DIG_VB_H;
    function winSize(list) {
        if (list.length === 2) return { w: 240, h: Math.round(240 / ANA_RATIO + 8 + 240 / DIG_RATIO) };
        return list[0] === ANA ? { w: 240, h: Math.round(240 / ANA_RATIO) } : { w: 340, h: Math.round(340 / DIG_RATIO) };
    }
    function windowCss(list) {
        var both = list.length === 2;
        return "html,body{margin:0;height:100%;background:#16181d;overflow:hidden}" +
            "body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px}" +
            ".dc-wrap{cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none}" +
            ".dc-svg{display:block;width:100%;height:auto}" +
            (both
                ? ".dc-dig{width:100vw}.dc-ana{width:min(100vw,calc((100vh - 100vw/" + DIG_RATIO.toFixed(4) + " - 8px)*" + ANA_RATIO.toFixed(4) + "))}"
                : ".dc-ana{width:min(100vw,calc(100vh*" + ANA_RATIO.toFixed(4) + "))}.dc-dig{width:min(100vw,calc(100vh*" + DIG_RATIO.toFixed(4) + "))}");
    }

    // 창의 테두리·제목줄 두께 (창 바깥 좌표 ↔ 안쪽 좌표)
    function chrome(w) {
        var cl = Math.max(0, Math.round((w.outerWidth - w.innerWidth) / 2));
        var ct = Math.max(0, w.outerHeight - w.innerHeight - cl);
        if (!w.outerWidth) { cl = 8; ct = 62; }   // 아직 크기를 모르면 어림값
        return { l: cl, t: ct };
    }

    // 창 안에 조각을 넣고, 닫히면 돌아오게
    function setupWindow(w, list, isPip) {
        var doc = w.document;
        var font = document.querySelector('link[href*="fonts.googleapis.com/css2"]');
        if (font) doc.head.appendChild(font.cloneNode());
        var st = doc.createElement("style");
        st.textContent = windowCss(list);
        doc.head.appendChild(st);
        doc.title = T("시계", "Clock");
        list.forEach(function (p) {
            clearFloat(p);
            p.win = w;
            doc.body.appendChild(p.wrap);
            sendAway(p);
        });
        var done = false;
        function closed() {
            if (done) return;
            done = true;
            list.forEach(function (p) { if (p.win === w) { p.win = null; backHome(p); } });
        }
        w.addEventListener("pagehide", closed);
        w.addEventListener("beforeunload", closed);
        if (!isPip) {
            var chk = setInterval(function () { if (w.closed) { clearInterval(chk); closed(); } }, 700);
            // 팝업 안에서 시계를 잡고 끌면 창이 통째로 따라와요 (창 제목줄을 안 잡아도 됨)
            doc.addEventListener("pointerdown", function (e) {
                if (e.button !== 0) return;
                drag = { id: e.pointerId, win: w, ax: e.clientX, ay: e.clientY, sx: e.screenX, sy: e.screenY, moved: false, inWin: true, cap: e.target };
                try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
            });
            doc.addEventListener("pointermove", onWinMove);
            doc.addEventListener("pointerup", endDrag);
            doc.addEventListener("pointercancel", endDrag);
        }
        hintUpdate();
        retime();
    }

    // 팝업 열기 (left/top: 창 바깥 기준 화면 좌표). 성공하면 창, 아니면 null
    function openPopup(list, left, top) {
        var size = winSize(list);
        var feat = "popup=yes,width=" + size.w + ",height=" + size.h;
        if (left != null) feat += ",left=" + Math.round(left) + ",top=" + Math.round(top);
        var w = null;
        try { w = window.open("", "dcClock_" + list.map(function (p) { return p.key; }).join("_"), feat); } catch (e) { w = null; }
        if (!w) return null;
        try { w.document.body.innerHTML = ""; } catch (e) { return null; }   // 같은 이름의 예전 창이면 비우고 다시 써요
        setupWindow(w, list, false);
        return w;
    }

    // 더블클릭용: "항상 위" 작은 창 먼저, 안 되면 팝업
    async function openWindow(list) {
        if (CAN_PIP && !window.documentPictureInPicture.window) {
            var size = winSize(list);
            try {
                var w = await window.documentPictureInPicture.requestWindow({ width: size.w, height: size.h });
                setupWindow(w, list, true);
                return true;
            } catch (e) {}
        }
        return !!openPopup(list);
    }

    // 다른 모니터까지 창을 옮기려면 크롬의 "창 관리" 허락이 필요해요 → 처음 한 번만 물어봐요
    var askedScreens = false;
    function askScreens() {
        if (askedScreens || !("getScreenDetails" in window)) return;
        askedScreens = true;
        try {
            navigator.permissions.query({ name: "window-management" }).then(function (s) {
                if (s.state === "prompt") window.getScreenDetails().catch(function () {});
            }).catch(function () {});
        } catch (e) {}
    }

    // 홈페이지 위에 떠 있게 (창을 못 띄울 때)
    function floatInPage(p) {
        document.body.appendChild(p.wrap);
        p.wrap.classList.add("dc-float");
        sendAway(p);
        hintUpdate();
    }

    // 더블클릭: 홈 자리 → 따로 띄우기, 떠 있으면 → 원래대로
    async function toggle(list) {
        var away = list.filter(function (p) { return p.win || p.wrap.classList.contains("dc-float"); });
        if (away.length) { away.forEach(backHome); return; }
        if (window.matchMedia(MOBILE_QUERY).matches) { list.forEach(floatInPage); return; }   // 폰: 작은 창 대신 화면 위에
        var ok = await openWindow(list);
        if (!ok) list.forEach(floatInPage);
    }

    /* ---------- 마우스로 끌어서 옮기기 (PC만) ----------
       시계(또는 숫자 판)를 누른 채 움직이면 홈 칸에서 떨어져 나와 마우스를 따라오고, 놓은 자리에 머물러요.
       끌다가 시계가 브라우저 창 가장자리를 3분의 1쯤 넘으면 → 바로 그 자리에서 작은 창이 되어 마우스를 계속 따라가요.
       둘 사이 손잡이를 끌면 두 조각이 같이 움직여요. */
    var drag = null;
    var OUT_AT = 0.33;   // 시계가 창 밖으로 이만큼(3분의 1) 넘어가면 작은 창으로
    function canDrag(e, list) {
        return e.button === 0 && e.pointerType === "mouse" && window.innerWidth > 768 &&
            list.every(function (p) { return !p.win && p.wrap.ownerDocument === document; });
    }
    function startDrag(e, list, captureEl) {
        if (!canDrag(e, list)) return;
        drag = {
            id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, win: null, list: list, cap: captureEl,
            parts: list.map(function (p) {
                var r = p.wrap.getBoundingClientRect();
                return { p: p, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height };
            })
        };
        try { captureEl.setPointerCapture(e.pointerId); } catch (err) {}   // 마우스가 브라우저 창 밖으로 나가도 계속 따라가게
    }
    function detach(part) {
        var p = part.p;
        if (p.wrap.classList.contains("dc-moved")) return;
        document.body.appendChild(p.wrap);
        p.wrap.classList.add("dc-float", "dc-moved");
        p.wrap.style.width = part.w + "px";
        sendAway(p);
    }
    // 묶음(조각 하나 또는 둘)이 놓일 자리
    function groupRect(cx, cy) {
        var L = Infinity, Tp = Infinity, R = -Infinity, B = -Infinity;
        drag.parts.forEach(function (q) {
            var x = cx - q.dx, y = cy - q.dy;
            L = Math.min(L, x); Tp = Math.min(Tp, y); R = Math.max(R, x + q.w); B = Math.max(B, y + q.h);
        });
        return { l: L, t: Tp, r: R, b: B, w: R - L, h: B - Tp };
    }
    function placeAll(cx, cy, sx, sy) {
        drag.parts.forEach(function (q) {
            var w = q.p.wrap;
            w.style.left = (cx - q.dx + (sx || 0)) + "px"; w.style.top = (cy - q.dy + (sy || 0)) + "px";
            w.style.right = "auto"; w.style.bottom = "auto";
        });
    }
    // 창 밖으로 넘어간 비율 (가로·세로 중 큰 쪽)
    function outRatio(g) {
        var ox = Math.max(0, -g.l, g.r - window.innerWidth) / g.w;
        var oy = Math.max(0, -g.t, g.b - window.innerHeight) / g.h;
        return Math.max(ox, oy);
    }
    // 작은 창으로 바꾸기: 마우스가 잡고 있던 시계의 같은 점이 계속 마우스 밑에 오게
    function popOutAt(e, g) {
        var size = winSize(drag.list);
        drag.ax = (e.clientX - g.l) / g.w * size.w;
        drag.ay = (e.clientY - g.t) / g.h * size.h;
        var w = openPopup(drag.list, e.screenX - 8 - drag.ax, e.screenY - 62 - drag.ay);
        if (!w) return false;
        drag.win = w;
        askScreens();
        moveWin(e.screenX, e.screenY);
        // 새 창은 화면에 막 나타나는 동안 옮기기를 무시할 때가 있어서, 잠깐 몇 번 더 맞춰 줘요
        var d = drag;
        [40, 120, 250, 450, 700, 1000].forEach(function (ms) {
            setTimeout(function () { if (drag === d && d.lastSX != null) moveWin(d.lastSX, d.lastSY); }, ms);
        });
        return true;
    }
    // 끄는 동안 작은 창 옮기기 (화면 좌표)
    function moveWin(sx, sy) {
        var w = drag && drag.win;
        if (!w || w.closed) return;
        drag.lastSX = sx; drag.lastSY = sy;
        var c = chrome(w);
        try { w.moveTo(Math.round(sx - c.l - drag.ax), Math.round(sy - c.t - drag.ay)); } catch (e) {}
    }
    function onWinMove(e) {
        if (!drag || !drag.win || !(e.buttons & 1)) return;
        if (drag.inWin && !drag.moved) {
            if (Math.abs(e.screenX - drag.sx) + Math.abs(e.screenY - drag.sy) < 4) return;
            drag.moved = true;
        }
        moveWin(e.screenX, e.screenY);
    }
    function endDrag() {
        if (!drag) return;
        var d = drag;
        drag = null;
        try { d.cap.releasePointerCapture(d.id); } catch (err) {}
        document.documentElement.classList.remove("dc-dragging");
        // 창 안에서 놓았는데 시계가 가장자리 밖으로 조금 걸쳐 있으면 안으로 들여요
        if (!d.win && d.moved) {
            d.parts.forEach(function (q) {
                var w = q.p.wrap, r = w.getBoundingClientRect();
                var x = Math.max(0, Math.min(r.left, window.innerWidth - r.width));
                var y = Math.max(0, Math.min(r.top, window.innerHeight - r.height));
                w.style.left = x + "px"; w.style.top = y + "px";
            });
        }
    }
    ANA.wrap.addEventListener("pointerdown", function (e) { startDrag(e, [ANA], ANA.wrap); });
    DIG.wrap.addEventListener("pointerdown", function (e) { startDrag(e, [DIG], DIG.wrap); });
    grip.addEventListener("pointerdown", function (e) {
        if (ANA.box.classList.contains("dc-away") || DIG.box.classList.contains("dc-away")) return;
        startDrag(e, [ANA, DIG], grip);
    });
    document.addEventListener("pointermove", function (e) {
        if (!drag || drag.inWin) return;
        if (e.pointerId !== drag.id) return;
        if (drag.win) { if (e.buttons & 1) moveWin(e.screenX, e.screenY); return; }   // 이미 작은 창이 됐으면 창을 따라 옮겨요 (버튼을 누른 채일 때만)
        if (!drag.moved) {
            if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 6) return;
            drag.moved = true;
            drag.parts.forEach(detach);
            hintUpdate();
            document.documentElement.classList.add("dc-dragging");
        }
        e.preventDefault();
        var g = groupRect(e.clientX, e.clientY);
        if (!drag.noPopup && outRatio(g) >= OUT_AT) {
            if (popOutAt(e, g)) return;
            drag.noPopup = true;   // 팝업이 막혔으면 다시 시도하지 않고 화면 안에서만
        }
        // 아직 창 안: 가장자리 밖으로 3분의 1까지는 그대로 걸쳐 보이게(창을 못 띄우는 브라우저는 안쪽으로 막아요)
        var sx = 0, sy = 0;
        if (drag.noPopup) {
            if (g.l < 0) sx = -g.l; else if (g.r > window.innerWidth) sx = window.innerWidth - g.r;
            if (g.t < 0) sy = -g.t; else if (g.b > window.innerHeight) sy = window.innerHeight - g.b;
        }
        placeAll(e.clientX, e.clientY, sx, sy);
    });
    document.addEventListener("pointerup", endDrag);
    document.addEventListener("pointercancel", function () { if (drag && !drag.win) endDrag(); });
    window.addEventListener("resize", function () {
        var moved = PIECES.filter(function (p) { return p.wrap.classList.contains("dc-moved"); });
        if (!moved.length) return;
        if (window.innerWidth <= 768) { moved.forEach(backHome); return; }
        moved.forEach(function (p) {
            var r = p.wrap.getBoundingClientRect();
            var x = Math.max(0, Math.min(r.left, window.innerWidth - r.width));
            var y = Math.max(0, Math.min(r.top, window.innerHeight - r.height));
            p.wrap.style.left = x + "px"; p.wrap.style.top = y + "px";
        });
    });
    // 홈페이지를 닫거나 다른 곳으로 가면 따로 떠 있는 창도 닫아요
    window.addEventListener("pagehide", function () {
        PIECES.forEach(function (p) { if (p.win && !p.win.closed) { try { p.win.close(); } catch (e) {} } });
    });

    ANA.wrap.addEventListener("dblclick", function (e) { e.preventDefault(); toggle(ANA.win && ANA.win === DIG.win ? [ANA, DIG] : [ANA]); });
    DIG.wrap.addEventListener("dblclick", function (e) { e.preventDefault(); toggle(ANA.win && ANA.win === DIG.win ? [ANA, DIG] : [DIG]); });
    grip.addEventListener("dblclick", function (e) { e.preventDefault(); toggle([ANA, DIG]); });
    ANA.ph.addEventListener("click", function () { backHome(ANA); });
    DIG.ph.addEventListener("click", function () { backHome(DIG); });
    hintUpdate();
})();
