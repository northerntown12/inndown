window.T = window.T || function (ko) { return ko; };   /* lang.js가 없어도 한국어로 동작 */
/* =========================================================
   지뢰찾기 (mines.html, mines-en.html) — 2026-11-17
   - 초급 9×9(10) · 중급 16×16(40) · 고급 30×16(99, 폰에서는 16×30 세로)
   - 처음 연 칸과 그 주변 8칸에는 지뢰 없음
   - PC: 왼쪽 클릭 열기 · 오른쪽 클릭 깃발 · 숫자 두 번 클릭(또는 가운데 클릭) 주변 한꺼번에 열기
   - 폰: 누르면 열기 · 길게 누르면 깃발 · [⛏️/🚩] 버튼으로 깃발 모드 · 열린 숫자를 누르면 주변 열기
   - 기기에 기억: 난이도 minesLevel.v1, 기록 minesRecord.v1, 소리 minesMuted.v1
   ========================================================= */
(function () {
    "use strict";

    var LEVELS = {
        easy: { w: 9, h: 9, n: 10, ko: "초급", en: "Beginner" },
        mid:  { w: 16, h: 16, n: 40, ko: "중급", en: "Intermediate" },
        hard: { w: 30, h: 16, n: 99, ko: "고급", en: "Expert" }
    };
    var LONG_PRESS = 380;    // 폰에서 이만큼(ms) 누르고 있으면 깃발

    function $(id) { return document.getElementById(id); }
    function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
    function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 무시 */ } }
    var EN = !!window.SITE_EN;
    var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    function isPhone() { return window.matchMedia && window.matchMedia("(max-width: 760px)").matches; }

    var levelKey = load("minesLevel.v1", "easy"); if (!LEVELS[levelKey]) levelKey = "easy";
    var record = load("minesRecord.v1", null) || {};
    var muted = !!load("minesMuted.v1", false);

    /* ======================= 소리 ======================= */
    var actx = null, noiseBuf = null;
    function audio() {
        if (muted) return null;
        try {
            if (!actx) {
                var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
                actx = new AC();
                noiseBuf = actx.createBuffer(1, Math.floor(actx.sampleRate * 0.6), actx.sampleRate);
                var d = noiseBuf.getChannelData(0);
                for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
            }
            if (actx.state === "suspended") actx.resume();
            return actx;
        } catch (e) { return null; }
    }
    function marimba(freq, at, vol, len) {
        var a = audio(); if (!a) return;
        var t = a.currentTime + 0.02 + (at || 0), v = vol || 0.26;
        [[1, v, len || 0.28], [4, v * 0.25, 0.06]].forEach(function (h) {
            var o = a.createOscillator(); o.type = "sine"; o.frequency.value = freq * h[0];
            var g = a.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(h[1], t + 0.006);
            g.gain.exponentialRampToValueAtTime(0.0001, t + h[2]);
            o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + h[2] + 0.03);
        });
    }
    function sndOpen(many) { if (many) { marimba(523, 0, 0.2, 0.2); marimba(659, 0.05, 0.2, 0.2); marimba(784, 0.1, 0.22, 0.3); } else marimba(587, 0, 0.16, 0.12); }
    function sndFlag(on) { if (on) { marimba(880, 0, 0.18, 0.1); marimba(1175, 0.05, 0.16, 0.14); } else marimba(494, 0, 0.14, 0.1); }
    function sndBoom() {
        var a = audio(); if (!a) return;
        var t = a.currentTime + 0.02;
        var src = a.createBufferSource(); src.buffer = noiseBuf;
        var lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(120, t + 0.5);
        var g = a.createGain(); g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        src.connect(lp); lp.connect(g); g.connect(a.destination); src.start(t);
        [392, 330, 262].forEach(function (f, i) { marimba(f, 0.45 + i * 0.16, 0.2, 0.35); });
    }
    function sndWin() { [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) { marimba(f, i * 0.08, 0.24, 0.4); }); }
    function sndBtn() { marimba(523, 0, 0.18, 0.12); marimba(784, 0.07, 0.18, 0.16); }

    /* ======================= 상태 ======================= */
    var elBoard = $("mBoard"), elLeft = $("mLeft"), elTime = $("mTime"), elFace = $("mFace");
    var elResult = $("mResult");
    var W, H, N, cells, mine, open, flag, cnt, els;
    var started, over, opened, flags, t0, timer, flagMode = false;

    function idx(x, y) { return y * W + x; }
    function around(i, fn) {
        var x = i % W, y = (i - x) / W;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            var nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < W && ny < H) fn(idx(nx, ny));
        }
    }

    function newGame() {
        var L = LEVELS[levelKey];
        /* 폰에서 고급은 세로로 길게 (16칸 × 30줄) */
        if (L.w > L.h && isPhone()) { W = L.h; H = L.w; } else { W = L.w; H = L.h; }
        N = L.n; cells = W * H;
        mine = new Uint8Array(cells); open = new Uint8Array(cells); flag = new Uint8Array(cells); cnt = new Uint8Array(cells);
        started = false; over = false; opened = 0; flags = 0;
        clearInterval(timer); elTime.textContent = "0";
        elResult.hidden = true; elFace.textContent = "🙂";
        document.body.classList.toggle("lv-hard", levelKey === "hard");
        document.querySelectorAll(".m-level").forEach(function (b) { b.classList.toggle("on", b.dataset.lv === levelKey); b.setAttribute("aria-selected", b.dataset.lv === levelKey); });
        build(); fitCells(); paintLeft();
    }

    function build() {
        elBoard.innerHTML = "";
        elBoard.style.gridTemplateColumns = "repeat(" + W + ", var(--m-cell))";
        els = new Array(cells);
        var frag = document.createDocumentFragment();
        for (var i = 0; i < cells; i++) {
            var d = document.createElement("div");
            d.className = "m-cell"; d.dataset.i = i; d.setAttribute("role", "gridcell");
            frag.appendChild(d); els[i] = d;
        }
        elBoard.appendChild(frag);
    }

    /* 칸 크기: 화면 폭에 맞게 (PC 최대 34px, 폰은 꽉 차게) */
    function fitCells() {
        var avail = Math.min(document.documentElement.clientWidth, window.innerWidth) - (isPhone() ? 12 : 40);
        if (!isPhone() && levelKey !== "hard") avail = Math.min(avail, 860 - 260 - 22 - 32);
        var gap = isPhone() ? 1.5 : 2, pad = isPhone() ? 10 : 16;
        var size = Math.floor((avail - pad - gap * (W - 1)) / W);
        var max = levelKey === "easy" ? 40 : 34;
        size = Math.max(isPhone() ? 18 : 22, Math.min(max, size));
        document.documentElement.style.setProperty("--m-cell", size + "px");
    }
    window.addEventListener("resize", function () {
        var L = LEVELS[levelKey];
        var wantPortrait = L.w > L.h && isPhone();
        if (wantPortrait !== (W < H) && L.w !== L.h && !started) { newGame(); return; }
        fitCells();
    });

    function plant(safe) {
        var ban = {}; ban[safe] = 1; around(safe, function (j) { ban[j] = 1; });
        var pool = [];
        for (var i = 0; i < cells; i++) if (!ban[i]) pool.push(i);
        for (var k = 0; k < N && pool.length; k++) {
            var r = k + Math.floor(Math.random() * (pool.length - k));
            var t = pool[k]; pool[k] = pool[r]; pool[r] = t;
            mine[pool[k]] = 1;
        }
        for (i = 0; i < cells; i++) { var c = 0; around(i, function (j) { c += mine[j]; }); cnt[i] = c; }
    }

    function startClock() {
        started = true; t0 = Date.now();
        timer = setInterval(function () { elTime.textContent = Math.min(999, Math.floor((Date.now() - t0) / 1000)); }, 250);
    }
    function paintLeft() { elLeft.textContent = N - flags; }

    /* 열기 (빈칸이면 주변까지 퍼짐) — 연 칸 수를 돌려줌 */
    function reveal(i) {
        if (open[i] || flag[i]) return 0;
        if (mine[i]) { lose(i); return -1; }
        var stack = [i], n = 0;
        while (stack.length) {
            var j = stack.pop();
            if (open[j] || flag[j]) continue;
            open[j] = 1; opened++; n++;
            var el = els[j];
            el.className = "m-cell open pop" + (cnt[j] ? " n" + cnt[j] : "");
            el.textContent = cnt[j] || "";
            if (!cnt[j]) around(j, function (k) { if (!open[k] && !flag[k] && !mine[k]) stack.push(k); });
        }
        return n;
    }

    function act(i, how) {
        if (over) return;
        audio();
        if (how === "flag") { toggleFlag(i); return; }
        if (open[i]) { chord(i); return; }
        if (flag[i]) return;
        if (!started) { plant(i); startClock(); }
        var n = reveal(i);
        if (n > 0) { sndOpen(n > 1); checkWin(); }
    }

    function toggleFlag(i) {
        if (open[i]) { chord(i); return; }
        if (!started) { /* 시작 전에도 깃발은 꽂을 수 있게 */ }
        flag[i] = flag[i] ? 0 : 1;
        flags += flag[i] ? 1 : -1;
        els[i].className = "m-cell" + (flag[i] ? " flag plant" : "");
        sndFlag(!!flag[i]); paintLeft();
        if (navigator.vibrate && coarse) try { navigator.vibrate(18); } catch (e) {}
    }

    /* 숫자 칸: 둘레 깃발 수 = 숫자면 나머지 한꺼번에 열기 */
    function chord(i) {
        if (!open[i] || !cnt[i]) return;
        var f = 0; around(i, function (j) { f += flag[j]; });
        if (f !== cnt[i]) {
            around(i, function (j) { if (!open[j] && !flag[j]) { els[j].classList.add("press"); } });
            setTimeout(function () { around(i, function (j) { els[j] && els[j].classList.remove("press"); }); }, 140);
            return;
        }
        var total = 0, dead = false;
        around(i, function (j) { if (dead) return; var n = reveal(j); if (n < 0) dead = true; else total += n; });
        if (!dead && total) { sndOpen(total > 1); checkWin(); }
    }

    function stopClock() { clearInterval(timer); return started ? Math.max(1, Math.round((Date.now() - t0) / 100) / 10) : 0; }

    function lose(i) {
        over = true; var sec = stopClock();
        elFace.textContent = "😵";
        for (var j = 0; j < cells; j++) {
            if (mine[j] && !flag[j]) els[j].className = "m-cell open mine" + (j === i ? " boom" : "");
            else if (!mine[j] && flag[j]) els[j].className = "m-cell open wrong";
        }
        sndBoom();
        var r = rec(); r.played++; save("minesRecord.v1", record); paintRecord();
        setTimeout(function () {
            $("mResultTitle").textContent = T("펑! 💥", "Boom! 💥");
            $("mResultSub").textContent = T("지뢰를 밟았어요. 다시 도전해 보세요!", "You hit a mine. Try again!") +
                "\n" + T("연 칸 ", "Opened ") + opened + " / " + (cells - N);
            elResult.hidden = false;
        }, 900);
        void sec;
    }

    function checkWin() {
        if (over || opened !== cells - N) return;
        over = true;
        var sec = stopClock();
        elTime.textContent = Math.min(999, Math.floor(sec));
        for (var j = 0; j < cells; j++) if (mine[j] && !flag[j]) { flag[j] = 1; els[j].className = "m-cell flag plant"; }
        flags = N; paintLeft();
        elFace.textContent = "😎";
        sndWin();
        var r = rec(); r.played++; r.wins++;
        var newBest = !r.best || sec < r.best;
        if (newBest) r.best = sec;
        save("minesRecord.v1", record); paintRecord();
        setTimeout(function () {
            $("mResultTitle").textContent = T("성공! 🎉", "Cleared! 🎉");
            $("mResultSub").textContent = T(LEVELS[levelKey].ko + " · " + sec + "초", LEVELS[levelKey].en + " · " + sec + "s") +
                (newBest ? T(" · 최고 기록! 🏆", " · New best! 🏆") : T(" (최고 " + r.best + "초)", " (best " + r.best + "s)"));
            elResult.hidden = false;
        }, 700);
    }

    function rec() { return record[levelKey] || (record[levelKey] = { played: 0, wins: 0, best: 0 }); }
    function paintRecord() {
        $("mRecord").innerHTML = Object.keys(LEVELS).map(function (k) {
            var r = record[k] || { played: 0, wins: 0, best: 0 };
            var name = EN ? LEVELS[k].en : LEVELS[k].ko;
            return (k === levelKey ? "<b>" + name + "</b>" : name) + " · " +
                T("최고 ", "best ") + "<b>" + (r.best ? r.best + T("초", "s") : "-") + "</b> · " +
                r.wins + "/" + r.played + T(" 성공", " won");
        }).join("<br>");
    }

    /* ======================= 마우스·손가락 ======================= */
    var press = null;   // { i, timer, long }
    function cellOf(e) { var t = e.target.closest && e.target.closest(".m-cell"); return t ? +t.dataset.i : -1; }

    elBoard.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    elBoard.addEventListener("pointerdown", function (e) {
        var i = cellOf(e); if (i < 0 || over) return;
        if (e.pointerType === "mouse") {
            if (e.button === 2) { act(i, "flag"); return; }
            if (e.button === 1) { e.preventDefault(); act(i, "open"); return; }
            if (e.button !== 0) return;
            if (!open[i] && !flag[i]) els[i].classList.add("press");
            elFace.textContent = "😮";
            press = { i: i, mouse: true };
            return;
        }
        /* 손가락: 길게 누르면 깃발 */
        if (!open[i] && !flag[i]) els[i].classList.add("press");
        press = { i: i, x: e.clientX, y: e.clientY, long: false };
        press.timer = setTimeout(function () {
            if (!press || press.i !== i) return;
            press.long = true; els[i].classList.remove("press");
            act(i, flagMode ? "open" : "flag");
        }, LONG_PRESS);
    });
    elBoard.addEventListener("pointermove", function (e) {
        if (!press || press.mouse) return;
        if (Math.abs(e.clientX - press.x) > 10 || Math.abs(e.clientY - press.y) > 10) { clearTimeout(press.timer); els[press.i].classList.remove("press"); press = null; }
    });
    function endPress(e, cancel) {
        if (!press) return;
        var p = press; press = null;
        clearTimeout(p.timer);
        els[p.i] && els[p.i].classList.remove("press");
        if (!over) elFace.textContent = "🙂";
        if (cancel || p.long) return;
        var i = cellOf(e);
        if (i !== p.i) return;
        if (p.mouse) act(i, "open");
        else act(i, flagMode ? "flag" : "open");
    }
    elBoard.addEventListener("pointerup", function (e) { endPress(e, false); });
    elBoard.addEventListener("pointercancel", function (e) { endPress(e, true); });
    elBoard.addEventListener("pointerleave", function (e) { if (press && press.mouse) endPress(e, true); });
    elBoard.addEventListener("dblclick", function (e) { var i = cellOf(e); if (i >= 0 && open[i]) chord(i); });

    /* 폰: 여는 중 ↔ 깃발 모드 */
    var btnMode = $("mMode");
    function syncMode() {
        btnMode.setAttribute("aria-pressed", flagMode);
        $("mModeIcon").textContent = flagMode ? "🚩" : "⛏️";
        $("mModeText").textContent = flagMode ? T("깃발 꽂는 중", "Flag mode") : T("여는 중", "Dig mode");
    }
    btnMode.addEventListener("click", function () { flagMode = !flagMode; syncMode(); sndFlag(flagMode); });
    syncMode();
    if (coarse) $("mHint").textContent = T("누르기: 열기 · 길게 누르기: 깃발 · 열린 숫자 누르기: 주변 열기", "Tap: dig · Long-press: flag · Tap a number: open around it");

    /* ======================= 버튼 ======================= */
    document.querySelectorAll(".m-level").forEach(function (b) {
        b.addEventListener("click", function () {
            if (b.dataset.lv === levelKey && !started) return;
            levelKey = b.dataset.lv; save("minesLevel.v1", levelKey); sndBtn(); newGame(); paintRecord();
        });
    });
    elFace.addEventListener("click", function () { sndBtn(); newGame(); });
    $("mNew").addEventListener("click", function () { sndBtn(); newGame(); });
    $("mAgain").addEventListener("click", function () { sndBtn(); newGame(); });
    $("mLook").addEventListener("click", function () { elResult.hidden = true; });
    elResult.addEventListener("click", function (e) { if (e.target === elResult) elResult.hidden = true; });
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") elResult.hidden = true;
        if ((e.key === "F2" || e.key === "n" || e.key === "N") && !e.ctrlKey && !e.metaKey) { e.preventDefault(); newGame(); }
    });
    /* 마우스로 누른 버튼은 초점 빼기 */
    document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("button"); if (b && e.detail > 0) b.blur(); });

    var btnSound = $("mSound");
    function syncSound() {
        btnSound.classList.toggle("muted", muted);
        var l = muted ? T("소리 켜기", "Sound on") : T("소리 끄기", "Sound off");
        btnSound.setAttribute("aria-label", l); btnSound.title = l;
    }
    btnSound.addEventListener("click", function () { muted = !muted; save("minesMuted.v1", muted); syncSound(); if (!muted) sndBtn(); });
    syncSound();

    $("mExit").addEventListener("click", function () {
        sndBtn();
        setTimeout(function () {
            window.close();
            setTimeout(function () { if (!window.closed) location.href = T("index.html", "index-en.html"); }, 250);
        }, 300);
    });

    newGame(); paintRecord();
})();
