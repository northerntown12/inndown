
(function () {
    "use strict";

    var box = document.getElementById("spare-widget");
    if (!box) return;

    var NS = "http://www.w3.org/2000/svg";
    var LOOP = 10;                       // 한 바퀴 길이(초)

    /* 몸 치수 (SVG 좌표 기준, 화면 120 x 80) */
    var TORSO = 19, TH = 11, SH = 11, UA = 9, FA = 9, HR = 5.5;
    var GROUND = 70;

    function mk(tag, attrs, parent) {
        var e = document.createElementNS(NS, tag);
        for (var k in attrs) e.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(e);
        return e;
    }

    /* ---------- 그림 틀 만들기 ---------- */
    var wrap = document.createElement("div");
    wrap.className = "spare-scene";
    var svg = mk("svg", { viewBox: "0 0 120 80", preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true" }, wrap);
    var root = mk("g", { fill: "none", stroke: "#fff", "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);

    // 밖 풍경: 땅, 해
    var outside = mk("g", { "stroke-width": 1.4 }, root);
    mk("path", { d: "M4 70 H116" }, outside);
    mk("circle", { cx: 18, cy: 15, r: 4 }, outside);
    // 집 (걷는 중에 서서히 나타나요)
    var house = mk("g", { "stroke-width": 1.4 }, root);
    mk("path", { d: "M90 48 V70 M114 48 V70 M86 48 L102 33 L118 48" }, house);
    mk("path", { d: "M98 70 V58 H106 V70" }, house);

    // 안 풍경: 바닥, 의자, 책상, 모니터
    var inside = mk("g", { "stroke-width": 1.4 }, root);
    mk("path", { d: "M4 70 H116" }, inside);
    mk("path", { d: "M37 59 H54 M38 59 V45 M40 59 V70 M52 59 V70" }, inside);          // 의자
    mk("path", { d: "M60 52 H106 M64 52 V70 M102 52 V70" }, inside);                     // 책상
    mk("path", { d: "M80 36 H98 V50 H80 Z M89 50 V52" }, inside);                        // 모니터

    // 졸라맨
    var fig = mk("g", {}, root);
    var bodyEl = mk("path", { d: "" }, fig);
    var headEl = mk("circle", { r: HR, cx: 0, cy: 0 }, fig);

    var faceEl = mk("g", { "stroke-width": 1.2 }, fig);                                  // 웃는 얼굴
    mk("path", { d: "M-3.6 -1 l1.6 -1.7 l1.6 1.7 M2 -1 l1.6 -1.7 l1.6 1.7" }, faceEl);
    mk("path", { d: "M-3.2 1 Q0 7.5 3.2 1 Z", fill: "#fff" }, faceEl);

    var phoneEl = mk("g", { "stroke-width": 1.2 }, fig);                                 // 폰
    mk("rect", { x: -1, y: -9, width: 6, height: 10, rx: 1.3 }, phoneEl);
    var scrollA = mk("path", { d: "", "stroke-width": 0.8 }, phoneEl);
    var wifi = [];
    [2.5, 5, 7.5].forEach(function (r) {
        var k = r * 0.707;
        wifi.push(mk("path", { d: "M" + (2 - k) + " " + (-10.5 - k) + " A" + r + " " + r + " 0 0 1 " + (2 + k) + " " + (-10.5 - k), "stroke-width": 1.1 }, phoneEl));
    });

    var laughA = mk("text", { x: 70, y: 30, "font-size": 10, "font-weight": 700, "font-family": "Gaegu, 'Malgun Gothic', sans-serif", fill: "#fff", stroke: "none" }, root);
    laughA.textContent = "ㅋㅋㅋ";
    var laughB = mk("text", { x: 20, y: 40, "font-size": 8, "font-weight": 700, "font-family": "Gaegu, 'Malgun Gothic', sans-serif", fill: "#fff", stroke: "none" }, root);
    laughB.textContent = "ㅋㅋ";

    box.appendChild(wrap);

    /* ---------- 수학 도우미 ---------- */
    function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    function smooth(v) { v = clamp(v); return v * v * (3 - 2 * v); }
    function rad(a) { return a * Math.PI / 180; }
    function P(x, y) { return x.toFixed(1) + " " + y.toFixed(1); }

    // 어깨/엉덩이에서 시작해 위 마디(각도 a1, 길이 l1)와 아래 마디(각도 a2, 길이 l2)의 끝점을 구해요.
    // 각도는 "아래쪽 = 0°, 오른쪽 = +" 기준이에요.
    function limb(x, y, a1, l1, a2, l2) {
        var mx = x + Math.sin(rad(a1)) * l1, my = y + Math.cos(rad(a1)) * l1;
        return { mx: mx, my: my, ex: mx + Math.sin(rad(a2)) * l2, ey: my + Math.cos(rad(a2)) * l2 };
    }

    /* ---------- 동작(포즈) ----------
       포즈 = [엉덩이x, 엉덩이y, 몸기울기, 머리dx, 머리dy,
               팔A위, 팔A아래, 팔B위, 팔B아래, 다리A위, 다리A아래, 다리B위, 다리B아래,
               웃음(0~1), 폰(0~1)] */
    function standLegs() { return [-6, -6, 6, 6]; }

    function poseWave(t) {
        var l = standLegs();
        var w = 160 + 24 * Math.sin(t * 2 * Math.PI * 2.2);
        return [14, 48, 0, 0, 0,  130, w,  -14, -10,  l[0], l[1], l[2], l[3],  0, 0];
    }

    function walkX(t) { return 14 + 88 * clamp((t - 1.6) / 3.4); }

    function poseWalk(t) {
        var ph = t * 2 * Math.PI * 2;
        var s = Math.sin(ph), c = Math.cos(ph);
        var th1 = 32 * s, th2 = -32 * s;
        var bend1 = 28 * Math.max(0, c), bend2 = 28 * Math.max(0, -c);
        var ar1 = -26 * s, ar2 = 26 * s;
        return [walkX(t), 48 - 1.2 * Math.abs(s), 5, 0, 0,
                ar1, ar1 + 22,  ar2, ar2 + 22,
                th1, th1 - bend1,  th2, th2 - bend2,  0, 0];
    }

    function poseType(t) {
        var k = Math.sin(t * 20);
        return [48, 59, 0, 0, 0,  40, 82 + 4 * k,  34, 78 - 4 * k,  90, 2,  88, 8,  0, 0];
    }

    function posePhone(t) {
        return [48, 59, 0, 1, 1,  15, 145,  10, 60,  90, 2,  88, 8,  0, 1];
    }

    function poseLaugh(t) {
        var k = Math.sin(t * 28);
        return [48, 59 + 0.8 * Math.sin(t * 40), 0, -2, -1.5,  30, 60 + 10 * k,  26, 56 - 10 * k,  90, 2,  88, 8,  1, 0];
    }

    var SCENES = [
        { t0: 0,   fn: poseWave,  blend: false },
        { t0: 1.6, fn: poseWalk,  blend: true  },
        { t0: 5.0, fn: poseType,  blend: false },
        { t0: 6.7, fn: posePhone, blend: true  },
        { t0: 8.4, fn: poseLaugh, blend: true  }
    ];

    function getPose(t) {
        var i = SCENES.length - 1;
        while (i > 0 && t < SCENES[i].t0) i--;
        var sc = SCENES[i];
        var p = sc.fn(t);
        var since = t - sc.t0;
        if (sc.blend && i > 0 && since < 0.3) {
            var q = SCENES[i - 1].fn(t), w = smooth(since / 0.3);
            p = p.map(function (v, n) { return q[n] + (v - q[n]) * w; });
        }
        return p;
    }

    /* 졸라맨 투명도: 시작·끝에서 서서히, 집에 들어갈 때 사라졌다가 책상에서 다시 나타나요 */
    function figAlpha(t) {
        if (t < 0.3) return t / 0.3;
        if (t > 9.7) return (LOOP - t) / 0.3;
        if (t > 4.6 && t < 4.95) return (4.95 - t) / 0.35;
        if (t >= 4.95 && t < 5.05) return 0;
        if (t >= 5.05 && t < 5.35) return (t - 5.05) / 0.3;
        return 1;
    }

    function sceneryAlpha(t) {          // 밖 풍경 투명도 (안 풍경은 반대)
        if (t >= 9.7) return (t - 9.7) / 0.3;
        if (t < 4.9) return 1;
        if (t < 5.2) return (5.2 - t) / 0.3;
        return 0;
    }

    /* ---------- 그리기 ---------- */
    function render(t) {
        var p = getPose(t);
        var hx = p[0], hy = p[1], lean = rad(p[2]);
        var ux = Math.sin(lean), uy = -Math.cos(lean);

        var neckX = hx + ux * TORSO, neckY = hy + uy * TORSO;
        var shX = hx + ux * (TORSO - 2.5), shY = hy + uy * (TORSO - 2.5);

        var A = limb(shX, shY, p[5], UA, p[6], FA);
        var B = limb(shX, shY, p[7], UA, p[8], FA);
        var L = limb(hx, hy, p[9], TH, p[10], SH);
        var M = limb(hx, hy, p[11], TH, p[12], SH);

        bodyEl.setAttribute("d",
            "M" + P(neckX, neckY) + "L" + P(hx, hy) +
            "M" + P(shX, shY) + "L" + P(A.mx, A.my) + "L" + P(A.ex, A.ey) +
            "M" + P(shX, shY) + "L" + P(B.mx, B.my) + "L" + P(B.ex, B.ey) +
            "M" + P(hx, hy) + "L" + P(L.mx, L.my) + "L" + P(L.ex, L.ey) +
            "M" + P(hx, hy) + "L" + P(M.mx, M.my) + "L" + P(M.ex, M.ey));

        var hcx = neckX + ux * HR + p[3], hcy = neckY + uy * HR + p[4];
        headEl.setAttribute("cx", hcx.toFixed(1));
        headEl.setAttribute("cy", hcy.toFixed(1));

        // 웃는 얼굴
        faceEl.setAttribute("transform", "translate(" + hcx.toFixed(1) + " " + hcy.toFixed(1) + ")");
        faceEl.setAttribute("opacity", clamp((p[13] - 0.3) / 0.5).toFixed(2));

        // 폰 + 와이파이 + 스크롤 줄
        var ph = p[14];
        phoneEl.setAttribute("transform", "translate(" + A.ex.toFixed(1) + " " + A.ey.toFixed(1) + ")");
        phoneEl.setAttribute("opacity", ph.toFixed(2));
        if (ph > 0.01) {
            var d = "";
            for (var k = 0; k < 2; k++) {
                var yy = -8 + ((t * 5 + k * 4) % 8);
                d += "M0.4 " + yy.toFixed(1) + " H3.6 ";
            }
            scrollA.setAttribute("d", d);
            for (var n = 0; n < wifi.length; n++) {
                var a = 0.25 + 0.75 * Math.max(0, Math.sin(t * 6 - n * 0.9));
                wifi[n].setAttribute("opacity", a.toFixed(2));
            }
        }

        // 웃음 글자 (통통 튀어요)
        var lo = clamp(p[13]).toFixed(2);
        laughA.setAttribute("opacity", lo);
        laughB.setAttribute("opacity", lo);
        laughA.setAttribute("y", (30 + 2.5 * Math.sin(t * 14)).toFixed(1));
        laughB.setAttribute("y", (40 + 2.5 * Math.sin(t * 14 + 1.5)).toFixed(1));

        // 풍경과 졸라맨 투명도
        var so = sceneryAlpha(t);
        outside.setAttribute("opacity", so.toFixed(2));
        inside.setAttribute("opacity", (1 - so).toFixed(2));
        house.setAttribute("opacity", (so * smooth((t - 2.4) / 1.0)).toFixed(2));
        fig.setAttribute("opacity", figAlpha(t).toFixed(2));
    }

    /* ---------- 시작 ---------- */
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
        render(0.9);
        return;
    }

    var start = null, last = 0;
    function frame(now) {
        if (start === null) start = now;
        if (now - last >= 33) {                // 약 30프레임
            last = now;
            render(((now - start) / 1000) % LOOP);
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
})();
