
(function () {
    "use strict";

    var box = document.getElementById("spare-widget");
    if (!box) return;

    var NS = "http://www.w3.org/2000/svg";
    var TORSO = 19, TH = 11, SH = 11, UA = 9, FA = 9, HR = 5.5;   // 몸 치수 (화면 120 x 80 기준)
    var SL = [90, 2], SR = [88, 8];                               // 앉은 다리

    function mk(tag, attrs, parent) {
        var e = document.createElementNS(NS, tag);
        for (var k in attrs) e.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(e);
        return e;
    }

    /* ---------- 그림 틀 ---------- */
    var wrap = document.createElement("div");
    wrap.className = "spare-scene";
    var svg = mk("svg", { viewBox: "0 0 120 80", preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true" }, wrap);
    var root = mk("g", { fill: "none", stroke: "#fff", "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);

    function layer(paths) {
        var g = mk("g", { "stroke-width": 1.4 }, root);
        paths.forEach(function (d) { mk("path", { d: d }, g); });
        return g;
    }

    var FLOOR = "M4 70 H116";
    var bg = {
        office: layer([FLOOR,
            "M37 59 H54 M38 59 V45 M40 59 V70 M52 59 V70",                     // 의자
            "M60 52 H106 M64 52 V70 M102 52 V70",                              // 책상
            "M80 36 H98 V50 H80 Z M89 50 V52"]),                               // 모니터
        site: layer([FLOOR,
            "M6 70 V61 H15 V70 M15 70 V61 H24 V70 M6 61 V52 H15 V61",          // 왼쪽 상자 더미
            "M98 70 V28 M114 70 V28 M98 42 H114 M98 56 H114",                  // 선반
            "M100 56 V47 H108 V56"]),                                          // 아래 선반 상자
        street: layer([FLOOR]),
        hall: layer([FLOOR, "M96 70 V38 H112 V70 M109 55 H110"]),
        living: layer([FLOOR,
            "M44 60 V40 M44 60 H72 M46 60 V70 M70 60 V70 M72 60 V52",          // 소파
            "M75 55 H90 M77 55 V70 M88 55 V70",                                // 옆 탁자
            "M14 20 H30 V34 H14 Z"])                                           // 액자
    };
    mk("circle", { cx: 104, cy: 12, r: 4 }, bg.street);                          // 해
    var clockG = mk("g", {}, bg.office);                                         // 벽시계
    mk("circle", { cx: 20, cy: 16, r: 5.5 }, clockG);
    var clockHand = mk("path", { d: "" }, clockG);

    var house = layer(["M82 42 V70 M112 42 V70 M78 42 L97 24 L116 42", "M92 70 V52 H102 V70"]);

    var tablePhone = mk("rect", { x: 76, y: 53.4, width: 8, height: 1.6, "stroke-width": 1.1 }, root);   // 탁자 위 폰

    /* ---------- 머리카락 (2026-11-11) ----------
       머리 가운데를 (0,0)으로 놓고 그린 뒤, 그릴 때마다 머리 위치·기울기에 맞춰 옮겨요.
       man  : 꾸불꾸불한 머리카락 5개
       kid  : 곧은 머리카락 3개
       woman: 어깨까지 내려오는 긴 머리 + 옆으로 넘긴 앞머리 */
    function hairPath(type, k) {
        var r = HR * k, d = "", i, j;
        function f(v) { return v.toFixed(2); }
        if (type === "man") {
            [-62, -31, 0, 31, 62].forEach(function (deg, n) {
                var a = rad(deg), dx = Math.sin(a), dy = -Math.cos(a), px = -dy, py = dx;
                var L = 4.4 - Math.abs(deg) / 62 * 0.9, A = 0.85, flip = n % 2 ? -1 : 1;
                for (j = 0; j <= 10; j++) {
                    var t = j / 10, w = flip * A * Math.sin(t * Math.PI * 2.5) * (0.4 + 0.6 * t);
                    var x = dx * (r + L * t) + px * w, y = dy * (r + L * t) + py * w;
                    d += (j ? "L" : "M") + f(x) + " " + f(y);
                }
            });
        } else if (type === "kid") {
            [-38, 0, 38].forEach(function (deg) {
                var a = rad(deg), dx = Math.sin(a), dy = -Math.cos(a);
                d += "M" + f(dx * r) + " " + f(dy * r) + "L" + f(dx * (r + 2.6)) + " " + f(dy * (r + 2.6));
            });
        } else if (type === "woman") {
            var e = r + 4.4;                               // 머리끝 높이 (어깨 언저리)
            d += "M" + f(-r - 1.1) + " " + f(e) +
                 "C" + f(-r - 2.1) + " " + f(r * 0.4) + " " + f(-r - 2.0) + " " + f(-r * 1.05) + " " + f(0) + " " + f(-r - 1.5) +
                 "C" + f(r + 2.0) + " " + f(-r * 1.05) + " " + f(r + 2.1) + " " + f(r * 0.4) + " " + f(r + 1.1) + " " + f(e);
            d += "M" + f(-r - 1.1) + " " + f(e) + "q-0.7 0.7 -1.7 0.4";          // 머리끝이 바깥으로 살짝 말림
            d += "M" + f(r + 1.1) + " " + f(e) + "q0.7 0.7 1.7 0.4";
            d += "M" + f(-r * 0.9) + " " + f(-r * 0.35) + "Q" + f(-r * 0.15) + " " + f(-r * 0.2) + " " + f(r * 0.45) + " " + f(-r * 0.98);   // 옆으로 넘긴 앞머리
        }
        return d;
    }

    /* ---------- 졸라맨 ---------- */
    function makeFig(k, hairType) {
        var g = mk("g", { "stroke-width": (2.2 * (0.55 + 0.45 * k)).toFixed(2) }, root);
        var body = mk("path", { d: "" }, g);
        var head = mk("circle", { r: HR * k, cx: 0, cy: 0 }, g);
        var hair = mk("path", { d: hairPath(hairType, k),
            "stroke-width": hairType === "woman" ? 1.35 : hairType === "kid" ? 1.0 : 1.1 }, g);
        var face = mk("g", { "stroke-width": 1.2 }, g);
        mk("path", { d: "M-3.6 -1 l1.6 -1.7 l1.6 1.7 M2 -1 l1.6 -1.7 l1.6 1.7" }, face);
        mk("path", { d: "M-3.2 1 Q0 7.5 3.2 1 Z", fill: "#fff" }, face);
        face.setAttribute("opacity", 0);      // 얼굴은 주인공이 웃을 때만 보여요
        return { k: k, g: g, body: body, head: head, hair: hair, face: face };
    }
    var wife = makeFig(1, "woman"), col = makeFig(1, "none"), kid = makeFig(0.55, "kid"), main = makeFig(1, "none");   // 남자는 머리카락 없음 (곱슬 5가닥을 다시 쓰려면 "none" → "man")

    var boxEl = mk("rect", { x: 0, y: 0, width: 9, height: 9, "stroke-width": 1.5 }, root);   // 나르는 박스
    var phoneEl = mk("g", { "stroke-width": 1.2 }, root);                                       // 손에 든 폰
    mk("rect", { x: -1, y: -9, width: 6, height: 10, rx: 1.3 }, phoneEl);
    var scrollEl = mk("path", { d: "", "stroke-width": 0.8 }, phoneEl);
    var wifi = [];
    [2.5, 5, 7.5].forEach(function (r) {
        var q = r * 0.707;
        wifi.push(mk("path", { d: "M" + (2 - q) + " " + (-10.5 - q) + " A" + r + " " + r + " 0 0 1 " + (2 + q) + " " + (-10.5 - q), "stroke-width": 1.1 }, phoneEl));
    });

    /* 말풍선 글자: [글자, x, y, 크기, 시작초, 끝초, 튀는 정도] */
    var TEXTS = [
        ["안녕~",     41, 15,  7,  6.2,  8.2, 0],
        ["다녀왔어~", 38, 14,  7, 12.8, 14.2, 0],
        ["휴~",       80, 38,  8, 14.9, 16.9, 1],
        ["음~",       74, 30,  8, 22.4, 24.4, 1.5],
        ["?",         72, 26, 10, 24.8, 27.0, 2.5],
        ["ㅋㅋㅋ",    74, 28, 10, 27.4, 29.7, 2.5],
        ["ㅋㅋ",      14, 48,  8, 27.6, 29.7, 2.5]
    ].map(function (a) {
        var e = mk("text", { x: a[1], y: a[2], "font-size": a[3], "font-weight": 700,
            "font-family": "Gaegu, 'Malgun Gothic', sans-serif", fill: "#fff", stroke: "none" }, root);
        e.textContent = a[0];
        return { el: e, y: a[2], t0: a[4], t1: a[5], bounce: a[6] };
    });

    box.appendChild(wrap);

    /* ---------- 수학 도우미 ---------- */
    function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    function smooth(v) { v = clamp(v); return v * v * (3 - 2 * v); }
    function rad(a) { return a * Math.PI / 180; }
    function P(x, y) { return x.toFixed(1) + " " + y.toFixed(1); }
    function lerpArr(a, b, w) { return a.map(function (v, i) { return v + (b[i] - v) * w; }); }
    function win(t, a, b) { return clamp((t - a) / 0.25) * clamp((b - t) / 0.25); }

    // 각도: 아래쪽 = 0°, 오른쪽 = +
    function limb(x, y, a1, l1, a2, l2) {
        var mx = x + Math.sin(rad(a1)) * l1, my = y + Math.cos(rad(a1)) * l1;
        return { mx: mx, my: my, ex: mx + Math.sin(rad(a2)) * l2, ey: my + Math.cos(rad(a2)) * l2 };
    }

    // 손이 닿을 곳(tx,ty)을 정하면 팔 각도를 계산해 줘요. mode: 팔꿈치가 low(아래)/high(위)/left/right 쪽
    function ik(sx, sy, tx, ty, l1, l2, mode) {
        var dx = tx - sx, dy = ty - sy, dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        var d = Math.min(l1 + l2 - 0.05, Math.max(Math.abs(l1 - l2) + 0.05, dist));
        var kk = d / dist;
        tx = sx + dx * kk; ty = sy + dy * kk;
        var th = Math.atan2(dx, dy);
        var al = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
        var best = null;
        [-1, 1].forEach(function (sg) {
            var a1 = th + sg * al, ex = sx + Math.sin(a1) * l1, ey = sy + Math.cos(a1) * l1;
            var sc = mode === "low" ? ey : mode === "high" ? -ey : mode === "left" ? -ex : ex;
            if (!best || sc > best.sc) best = { sc: sc, a1: a1, ex: ex, ey: ey };
        });
        var a2 = Math.atan2(tx - best.ex, ty - best.ey);
        return [best.a1 * 180 / Math.PI, a2 * 180 / Math.PI];
    }

    /* 포즈 = [엉덩이x, 엉덩이y, 몸기울기, 머리dx, 머리dy, 팔A위·아래, 팔B위·아래, 다리A위·아래, 다리B위·아래, 웃음, 폰 쥠] */
    function mkPose(o) {
        var A = o.A || [-14, -10], B = o.B || [14, 10], L = o.L || [-6, -6], R = o.R || [6, 6];
        return [o.x || 0, o.y == null ? 48 : o.y, o.lean || 0, o.hdx || 0, o.hdy || 0,
                A[0], A[1], B[0], B[1], L[0], L[1], R[0], R[1], o.laugh || 0, o.hold || 0];
    }
    function shoulder(p) {
        var l = rad(p[2]);
        return [p[0] + Math.sin(l) * (TORSO - 2.5), p[1] - Math.cos(l) * (TORSO - 2.5)];
    }
    function headC(p) {
        var l = rad(p[2]), ux = Math.sin(l), uy = -Math.cos(l);
        return [p[0] + ux * (TORSO + HR) + p[3], p[1] + uy * (TORSO + HR) + p[4]];
    }
    function setArm(p, which, tx, ty, mode) {
        var s = shoulder(p), a = ik(s[0], s[1], tx, ty, UA, FA, mode);
        p[which === "A" ? 5 : 7] = a[0];
        p[which === "A" ? 6 : 8] = a[1];
    }
    function mixArm(p, which, rest, w) {
        var i = which === "A" ? 5 : 7;
        p[i] = rest[0] + (p[i] - rest[0]) * w;
        p[i + 1] = rest[1] + (p[i + 1] - rest[1]) * w;
    }

    // 걷기: dir = 1(오른쪽) / -1(왼쪽), amp = 걷는 정도(0~1)
    function walkP(t, dir, amp, freq) {
        var ph = t * 2 * Math.PI * freq, s = Math.sin(ph), c = Math.cos(ph), r = 1 - amp;
        var th1 = 32 * s * amp * dir, th2 = -32 * s * amp * dir;
        var ar1 = -26 * s * amp * dir, ar2 = 26 * s * amp * dir;
        return {
            L: [th1 - 6 * r, th1 - 28 * Math.max(0, c) * amp * dir - 6 * r],
            R: [th2 + 6 * r, th2 - 28 * Math.max(0, -c) * amp * dir + 6 * r],
            A: [ar1 - 14 * r, ar1 + 22 * dir * amp - 10 * r],
            B: [ar2 + 14 * r, ar2 + 22 * dir * amp + 10 * r],
            y: 48 - 1.2 * Math.abs(s) * amp,
            lean: 5 * dir * amp
        };
    }
    function waveArm(t, dir, off) {
        return [130 * dir, dir * (160 + 24 * Math.sin(t * 2 * Math.PI * 2.2 + (off || 0)))];
    }

    var V = [66, 45];   // 폰을 들여다보는 손 위치

    /* ---------- 장면들 ---------- */
    function sOffice(t, u) {
        var k = Math.sin(t * 20);
        return { m: mkPose({ x: 48, y: 59, hdy: 0.6 * Math.sin(u * 3), A: [40, 82 + 4 * k], B: [34, 78 - 4 * k], L: SL, R: SR }) };
    }

    function sSite(t, u) {
        var x = 36 + 54 * clamp((u - 0.1) / 1.9);
        var w = walkP(t, 1, 1 - smooth((u - 1.9) / 0.2), 2);
        var m = mkPose({ x: x, y: w.y, lean: -4, L: w.L, R: w.R });
        var place = smooth((u - 2.0) / 0.5);
        var cx = (x + 9) + (106 - (x + 9)) * place, cy = 36.5 + place;
        setArm(m, "A", cx - 4, cy + 2.5, "low");
        setArm(m, "B", cx - 4, cy - 1.5, "low");
        var rw = smooth((u - 2.55) / 0.25);
        if (rw > 0) {
            var a = [m[5], m[6]], b = [m[7], m[8]];
            var ra = lerpArr(a, [-14, -10], rw), rb = lerpArr(b, [14, 10], rw);
            m[5] = ra[0]; m[6] = ra[1]; m[7] = rb[0]; m[8] = rb[1];
        }
        m[2] = -4 * (1 - rw);
        return { m: m, box: { x: cx - 4.5, y: cy - 4.5 } };
    }

    function sBye(t, u) {
        var cu = clamp((u - 1.9) / 1.1), cx = 34 - 26 * cu;
        var amp = smooth((u - 1.85) / 0.1) * (1 - smooth((u - 2.95) / 0.05));
        var w = walkP(t, -1, amp, 2);
        return {
            m: mkPose({ x: 64, A: waveArm(t, 1) }),
            col: { p: mkPose({ x: cx, y: w.y, lean: w.lean, A: waveArm(t, -1, 1), B: w.B, L: w.L, R: w.R }),
                   a: clamp(u / 0.3) * (1 - smooth((u - 2.55) / 0.4)) }
        };
    }

    function sHome(t, u) {
        var x = 64 + 33 * clamp((u - 0.1) / 2.2), w = walkP(t, 1, 1, 2);
        return { m: mkPose({ x: x, y: w.y, lean: w.lean, A: w.A, B: w.B, L: w.L, R: w.R }) };
    }

    function sFamily(t, u) {
        var x = 104 - 32 * clamp((u - 0.1) / 1.2);
        var w = walkP(t, -1, 1 - smooth((u - 1.25) / 0.15), 2);
        var A = lerpArr(w.A, waveArm(t, -1), smooth((u - 1.3) / 0.3));
        var m = mkPose({ x: x, y: w.y, lean: w.lean, A: A, B: w.B, L: w.L, R: w.R });

        var wf = mkPose({ x: 32, A: waveArm(t, 1, 0.5) });

        var kx = 46 + 16 * clamp((u - 1.3) / 0.7);
        var kamp = smooth((u - 1.25) / 0.1) * (1 - smooth((u - 1.95) / 0.1));
        var kw = walkP(t, 1, kamp, 3.2), ku = smooth((u - 2.0) / 0.2);
        var ky = 57.9 + (kw.y - 48) * 0.55 - 3.5 * ku * Math.abs(Math.sin((u - 2.0) * 9));
        var kp = mkPose({ x: kx, y: ky, lean: kw.lean,
            A: lerpArr(kw.A, [160, 170], ku), B: lerpArr(kw.B, [-160, -170], ku), L: kw.L, R: kw.R });
        return { m: m, wife: { p: wf, a: 1 }, kid: { p: kp, a: 1 } };
    }

    function sSofa(t, u) {
        return { m: mkPose({ x: 56, y: 59 + 0.4 * Math.sin(u * 2), lean: -12 + 0.8 * Math.sin(u * 1.5), hdx: -1,
            A: [30, 60], B: [22, 70], L: [90, 2 + 10 * Math.max(0, Math.sin(u * 5))], R: SR }) };
    }

    function sGrab(t, u) {
        var w1 = smooth(u / 0.6), w2 = smooth((u - 0.95) / 0.9);
        var lean = u < 0.95 ? -12 + 37 * w1 : 25 - 25 * smooth((u - 0.95) / 0.8);
        var m = mkPose({ x: 56, y: 59, lean: lean, hdx: -1 + 2 * w2, hdy: w2, B: [20, 70], L: SL, R: SR,
            hold: smooth((u - 0.85) / 0.15) });
        setArm(m, "A", 77 + (V[0] - 77) * w2, 53.5 + (V[1] - 53.5) * w2, "low");
        mixArm(m, "A", [30, 60], w1);
        return { m: m };
    }

    function viewPose(lean, hdy) {
        var m = mkPose({ x: 56, y: 59, lean: lean, hdx: 1, hdy: hdy, B: [20, 70], L: SL, R: SR, hold: 1 });
        setArm(m, "A", V[0], V[1], "low");
        return m;
    }
    function sLook(t, u) { return { m: viewPose(4, 1) }; }
    function sNod(t, u) {
        var w = Math.sin(u * 8.8);
        return { m: viewPose(4 + 3 * w, 1 + 1.4 * w) };
    }
    function sScratch(t, u) {
        var m = viewPose(4, 1);
        m[3] = -1;
        var hc = headC(m), bw = smooth(u / 0.4);
        setArm(m, "B", hc[0] + 3 + 2 * Math.sin(u * 18), hc[1] - 4.8 + Math.cos(u * 18), "right");
        mixArm(m, "B", [20, 70], bw);
        return { m: m };
    }
    function sLaugh(t, u) {
        var k = Math.sin(t * 28);
        var m = mkPose({ x: 56, y: 59 + 0.9 * Math.sin(t * 40), lean: -4, hdx: -2, hdy: -1.5, L: SL, R: SR, laugh: 1, hold: 1 });
        setArm(m, "A", V[0] + 0.6 * Math.sin(t * 33), V[1] + 0.6 * Math.cos(t * 37), "low");
        setArm(m, "B", 67, 57 + 3 * k, "low");
        return { m: m };
    }

    var SCENES = [
        { dur: 2.8, bg: "office", fn: sOffice,  fi: true,  fo: true  },
        { dur: 2.8, bg: "site",   fn: sSite,    fi: true,  fo: true  },
        { dur: 3.0, bg: "street", fn: sBye,     fi: true,  fo: false },
        { dur: 2.8, bg: "street", fn: sHome,    fi: false, fo: true,  blend: true },
        { dur: 3.0, bg: "hall",   fn: sFamily,  fi: true,  fo: true  },
        { dur: 3.0, bg: "living", fn: sSofa,    fi: true,  fo: false },
        { dur: 2.2, bg: "living", fn: sGrab,    fi: false, fo: false, blend: true },
        { dur: 2.6, bg: "living", fn: sLook,    fi: false, fo: false, blend: true },
        { dur: 2.4, bg: "living", fn: sNod,     fi: false, fo: false, blend: true },
        { dur: 2.6, bg: "living", fn: sScratch, fi: false, fo: false, blend: true },
        { dur: 2.8, bg: "living", fn: sLaugh,   fi: false, fo: true,  blend: true }
    ];
    var LOOP = 0;
    SCENES.forEach(function (s) { s.t0 = LOOP; LOOP += s.dur; });

    function sceneAt(t) {
        var i = SCENES.length - 1;
        while (i > 0 && t < SCENES[i].t0) i--;
        return i;
    }

    function bgAlpha(name, i, u) {
        var sc = SCENES[i], pv = SCENES[(i + SCENES.length - 1) % SCENES.length];
        if (sc.bg === name) return pv.bg !== name && u < 0.3 ? smooth(u / 0.3) : 1;
        if (pv.bg === name && u < 0.3) return 1 - smooth(u / 0.3);
        return 0;
    }

    /* ---------- 그리기 ---------- */
    function drawFig(f, p, alpha, showFace) {
        if (!p || alpha < 0.01) { f.g.setAttribute("opacity", 0); return null; }
        var k = f.k, hx = p[0], hy = p[1], lean = rad(p[2]);
        var ux = Math.sin(lean), uy = -Math.cos(lean);
        var nx = hx + ux * TORSO * k, ny = hy + uy * TORSO * k;
        var sx = hx + ux * (TORSO - 2.5) * k, sy = hy + uy * (TORSO - 2.5) * k;
        var A = limb(sx, sy, p[5], UA * k, p[6], FA * k), B = limb(sx, sy, p[7], UA * k, p[8], FA * k);
        var L = limb(hx, hy, p[9], TH * k, p[10], SH * k), R = limb(hx, hy, p[11], TH * k, p[12], SH * k);
        f.body.setAttribute("d",
            "M" + P(nx, ny) + "L" + P(hx, hy) +
            "M" + P(sx, sy) + "L" + P(A.mx, A.my) + "L" + P(A.ex, A.ey) +
            "M" + P(sx, sy) + "L" + P(B.mx, B.my) + "L" + P(B.ex, B.ey) +
            "M" + P(hx, hy) + "L" + P(L.mx, L.my) + "L" + P(L.ex, L.ey) +
            "M" + P(hx, hy) + "L" + P(R.mx, R.my) + "L" + P(R.ex, R.ey));
        var hcx = nx + ux * HR * k + p[3], hcy = ny + uy * HR * k + p[4];
        f.head.setAttribute("cx", hcx.toFixed(1));
        f.head.setAttribute("cy", hcy.toFixed(1));
        f.hair.setAttribute("transform", "translate(" + hcx.toFixed(2) + " " + hcy.toFixed(2) + ") rotate(" + p[2].toFixed(1) + ")");
        f.g.setAttribute("opacity", alpha.toFixed(2));
        if (showFace) {
            f.face.setAttribute("transform", "translate(" + hcx.toFixed(1) + " " + hcy.toFixed(1) + ")");
            f.face.setAttribute("opacity", clamp((p[13] - 0.3) / 0.5).toFixed(2));
        }
        return { ax: A.ex, ay: A.ey };
    }

    function render(t) {
        var i = sceneAt(t), sc = SCENES[i], u = t - sc.t0;
        var S = sc.fn(t, u), m = S.m;
        if (sc.blend && i > 0 && u < 0.3) {
            var pv = SCENES[i - 1];
            m = lerpArr(pv.fn(t, t - pv.t0).m, m, smooth(u / 0.3));
        }
        var fade = (sc.fi ? smooth(u / 0.3) : 1) * (sc.fo ? smooth((sc.dur - u) / 0.3) : 1);

        // 배경
        var al = {};
        ["office", "site", "street", "hall", "living"].forEach(function (n) {
            al[n] = bgAlpha(n, i, u);
            bg[n].setAttribute("opacity", al[n].toFixed(2));
        });
        house.setAttribute("opacity", (al.street * smooth((t - 7.8) / 1.2)).toFixed(2));
        var ca = t * 2.4;
        clockHand.setAttribute("d", "M20 16 L" + P(20 + 4 * Math.sin(ca), 16 - 4 * Math.cos(ca)));

        // 인물
        drawFig(wife, S.wife && S.wife.p, S.wife ? S.wife.a * fade : 0);
        drawFig(kid, S.kid && S.kid.p, S.kid ? S.kid.a * fade : 0);
        drawFig(col, S.col && S.col.p, S.col ? S.col.a * fade : 0);
        var h = drawFig(main, m, fade, true);

        // 박스
        if (S.box) {
            boxEl.setAttribute("x", S.box.x.toFixed(1));
            boxEl.setAttribute("y", S.box.y.toFixed(1));
            boxEl.setAttribute("opacity", (al.site * fade).toFixed(2));
        } else {
            boxEl.setAttribute("opacity", 0);
        }

        // 폰: 탁자 위 / 손에
        var hold = m[14];
        tablePhone.setAttribute("opacity", (al.living * (1 - hold)).toFixed(2));
        phoneEl.setAttribute("opacity", (hold * fade).toFixed(2));
        if (h && hold > 0.01) {
            phoneEl.setAttribute("transform", "translate(" + h.ax.toFixed(1) + " " + h.ay.toFixed(1) + ")");
            var d = "";
            for (var k = 0; k < 2; k++) d += "M0.4 " + (-8 + ((t * 5 + k * 4) % 8)).toFixed(1) + " H3.6 ";
            scrollEl.setAttribute("d", d);
            for (var n = 0; n < wifi.length; n++) {
                wifi[n].setAttribute("opacity", (0.25 + 0.75 * Math.max(0, Math.sin(t * 6 - n * 0.9))).toFixed(2));
            }
        }

        // 글자
        TEXTS.forEach(function (x, n) {
            x.el.setAttribute("opacity", win(t, x.t0, x.t1).toFixed(2));
            if (x.bounce) x.el.setAttribute("y", (x.y + x.bounce * Math.sin(t * 14 + n)).toFixed(1));
        });
    }

    box._stick = render;   // (점검용)

    /* ---------- 시작 ---------- */
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
        render(1.2);
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
