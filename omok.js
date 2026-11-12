/* =========================================================
   오목 화면 (omok.html) — 판 그리기, 누르기, 소리, 기록
   규칙·컴퓨터 생각은 omok-engine.js (OmokEngine)
   기기에 기억: 설정 omokSettings.v1, 소리 omokMuted.v1, 전적 omokRecord.v1
   ========================================================= */
(function () {
    "use strict";
    var E = window.OmokEngine, N = E.N;

    /* ---------- 저장 (브라우저가 막으면 그냥 넘어감) ---------- */
    function load(k, def) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }
    function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

    var LEVEL_NAME = { easy: "쉬움", normal: "보통", hard: "어려움" };
    var settings = load("omokSettings.v1", { level: "normal", color: 1 });
    if (!LEVEL_NAME[settings.level]) settings.level = "normal";
    if (settings.color !== 1 && settings.color !== 2) settings.color = 1;
    var muted = !!load("omokMuted.v1", false);
    var record = load("omokRecord.v1", {});

    /* ---------- 상태 ---------- */
    var board, history, human, ai, level, over, thinking, winCells, forbid, hover, preview, aiTimer;
    var pendingSettings = false;
    var started = false;                       // 시작 버튼을 눌렀나
    var TIME_LIMIT = 15;                       // 한 수 제한 시간(초). 넘기면 시간 초과 패배
    var timerId = 0, turnEnd = 0, lastTick = 0;

    /* ---------- 화면 요소 ---------- */
    var $ = function (id) { return document.getElementById(id); };
    var canvas = $("omBoard"), ctx = canvas.getContext("2d"), box = $("omBoardBox");
    var elStatus = $("omStatus"), elHint = $("omHint"), elNote = $("omNote");
    var elResult = $("omResult"), elResultTitle = $("omResultTitle"), elResultSub = $("omResultSub");
    var btnUndo = $("omUndo"), btnSound = $("omSound"), chkForbid = $("omShowForbid"), btnStart = $("omStart");
    var elTimer = $("omTimer"), elTimerNum = $("omTimerNum"), elTimerRing = $("omTimerRing");
    var RING = 2 * Math.PI * 19;
    var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

    /* ======================= 소리 (Web Audio로 직접 만듦) ======================= */
    var actx = null, noiseBuf = null;
    function audio() {
        if (muted) return null;
        try {
            if (!actx) {
                var AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return null;
                actx = new AC();
                noiseBuf = actx.createBuffer(1, Math.floor(actx.sampleRate * 0.08), actx.sampleRate);
                var d = noiseBuf.getChannelData(0);
                for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
            }
            if (actx.state === "suspended") actx.resume();
            return actx;
        } catch (e) { return null; }
    }
    /* 나무판에 돌 놓는 "딱" 소리 */
    function sndStone(isAi) {
        var a = audio(); if (!a) return;
        var t = a.currentTime;
        var src = a.createBufferSource(); src.buffer = noiseBuf;
        var bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = isAi ? 1500 : 1900; bp.Q.value = 1.6;
        var g = a.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        src.connect(bp); bp.connect(g); g.connect(a.destination); src.start(t);
        var o = a.createOscillator(); o.type = "sine";
        o.frequency.setValueAtTime(isAi ? 260 : 300, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.09);
        var g2 = a.createGain(); g2.gain.setValueAtTime(0.35, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
        o.connect(g2); g2.connect(a.destination); o.start(t); o.stop(t + 0.12);
    }
    function tones(list, type, vol) {
        var a = audio(); if (!a) return;
        var t = a.currentTime + 0.05;
        list.forEach(function (n) {
            var o = a.createOscillator(); o.type = type || "triangle"; o.frequency.value = n[0];
            var g = a.createGain();
            g.gain.setValueAtTime(0.0001, t + n[1]);
            g.gain.exponentialRampToValueAtTime(vol || 0.22, t + n[1] + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t + n[1] + n[2]);
            o.connect(g); g.connect(a.destination); o.start(t + n[1]); o.stop(t + n[1] + n[2] + 0.05);
        });
    }
    function sndWin()  { tones([[523, 0, 0.18], [659, 0.13, 0.18], [784, 0.26, 0.18], [1047, 0.39, 0.45]]); }
    function sndLose() { tones([[392, 0, 0.25], [330, 0.2, 0.25], [262, 0.4, 0.5]], "sine", 0.2); }
    function sndBuzz() { tones([[140, 0, 0.16]], "square", 0.06); }
    /* 버튼 누를 때 "톡" (소리 꺼져 있으면 audio()가 null이라 안 남) */
    function sndClick() {
        var a = audio(); if (!a) return;
        var t = a.currentTime;
        var o = a.createOscillator(); o.type = "triangle";
        o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(520, t + 0.05);
        var g = a.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.08);
    }
    function sndTick(last) { tones([[last ? 1320 : 990, 0, 0.07]], "sine", 0.12); }

    /* ======================= 그리기 ======================= */
    var size = 0, dpr = 1, margin = 0, cell = 0, woodCanvas = null;

    /* 나무결 바탕 (크기가 바뀔 때만 새로 만듦) */
    function makeWood(px) {
        var c = document.createElement("canvas"); c.width = c.height = px;
        var g = c.getContext("2d");
        var grd = g.createLinearGradient(0, 0, px, px);
        grd.addColorStop(0, "#e7bd78"); grd.addColorStop(0.5, "#ddae63"); grd.addColorStop(1, "#d3a155");
        g.fillStyle = grd; g.fillRect(0, 0, px, px);
        var seed = 7;
        function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
        /* 결: 살짝 휘는 가로 줄 */
        for (var k = 0; k < 70; k++) {
            var y0 = rnd() * px, amp = 2 + rnd() * px * 0.012, freq = 0.5 + rnd() * 1.6, ph = rnd() * 6.28;
            g.beginPath();
            for (var x = 0; x <= px; x += px / 60) {
                var y = y0 + Math.sin(x / px * Math.PI * 2 * freq + ph) * amp;
                if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
            }
            g.strokeStyle = rnd() < 0.5 ? "rgba(140, 86, 30, " + (0.05 + rnd() * 0.08) + ")" : "rgba(255, 236, 190, " + (0.05 + rnd() * 0.07) + ")";
            g.lineWidth = (0.5 + rnd() * 2.2) * (px / 600);
            g.stroke();
        }
        /* 가장자리 살짝 어둡게 */
        var vg = g.createRadialGradient(px / 2, px / 2, px * 0.3, px / 2, px / 2, px * 0.75);
        vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(90, 50, 10, 0.22)");
        g.fillStyle = vg; g.fillRect(0, 0, px, px);
        return c;
    }

    function resize() {
        var r = box.getBoundingClientRect();
        var s = Math.round(r.width);
        if (!s) return;
        dpr = Math.min(window.devicePixelRatio || 1, 3);
        if (s !== size || canvas.width !== Math.round(s * dpr)) {
            size = s;
            canvas.width = canvas.height = Math.round(s * dpr);
            woodCanvas = makeWood(canvas.width);
        }
        margin = size / 15.5 * 0.75;
        cell = (size - margin * 2) / (N - 1);
        draw();
    }

    function px(i) { return margin + i * cell; }

    function drawStone(x, y, c, alpha) {
        var cx = px(x), cy = px(y), r = cell * 0.46;
        ctx.save();
        ctx.globalAlpha = alpha == null ? 1 : alpha;
        if (alpha == null) {
            ctx.shadowColor = "rgba(40, 20, 0, 0.45)";
            ctx.shadowBlur = cell * 0.18; ctx.shadowOffsetX = cell * 0.05; ctx.shadowOffsetY = cell * 0.08;
        }
        var g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
        if (c === 1) { g.addColorStop(0, "#6a6a6a"); g.addColorStop(0.45, "#222"); g.addColorStop(1, "#050505"); }
        else { g.addColorStop(0, "#ffffff"); g.addColorStop(0.6, "#f1eee8"); g.addColorStop(1, "#c9c3b6"); }
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        ctx.restore();
    }

    function draw() {
        if (!size) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(woodCanvas, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        /* 줄 */
        ctx.strokeStyle = "rgba(55, 32, 10, 0.85)";
        ctx.lineWidth = Math.max(1, size / 600);
        ctx.beginPath();
        for (var i = 0; i < N; i++) {
            ctx.moveTo(px(0), px(i)); ctx.lineTo(px(N - 1), px(i));
            ctx.moveTo(px(i), px(0)); ctx.lineTo(px(i), px(N - 1));
        }
        ctx.stroke();
        ctx.lineWidth = Math.max(1.5, size / 300);
        ctx.strokeRect(px(0), px(0), cell * (N - 1), cell * (N - 1));
        /* 화점 */
        [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]].forEach(function (p) {
            ctx.beginPath(); ctx.arc(px(p[0]), px(p[1]), Math.max(2.2, cell * 0.11), 0, Math.PI * 2);
            ctx.fillStyle = "rgba(55, 32, 10, 0.9)"; ctx.fill();
        });

        /* 금수 표시 (사람이 흑이고 사람 차례일 때) */
        if (forbid && forbid.length && chkForbid.checked) {
            ctx.strokeStyle = "rgba(200, 40, 30, 0.85)"; ctx.lineWidth = Math.max(1.5, cell * 0.08);
            var d = cell * 0.18;
            forbid.forEach(function (p) {
                var cx = px(p[0]), cy = px(p[1]);
                ctx.beginPath(); ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d);
                ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d); ctx.stroke();
            });
        }

        /* 돌 */
        for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
            var v = board[y * N + x];
            if (v) drawStone(x, y, v);
        }

        /* 마지막 수 표시 */
        if (history.length) {
            var last = history[history.length - 1];
            ctx.beginPath(); ctx.arc(px(last[0]), px(last[1]), cell * 0.12, 0, Math.PI * 2);
            ctx.fillStyle = "#e0402e"; ctx.fill();
        }

        /* 이긴 줄 */
        if (winCells) {
            ctx.strokeStyle = "#ffcc33"; ctx.lineWidth = Math.max(2, cell * 0.1);
            winCells.forEach(function (p) {
                ctx.beginPath(); ctx.arc(px(p[0]), px(p[1]), cell * 0.47, 0, Math.PI * 2); ctx.stroke();
            });
        }

        /* 미리보기 돌 (마우스 올림 / 폰에서 첫 번째 누름) */
        var g = preview || hover;
        if (g && canPlay() && !board[g[1] * N + g[0]]) {
            drawStone(g[0], g[1], human, preview ? 0.75 : 0.45);
            if (preview) {
                ctx.strokeStyle = "rgba(224, 64, 46, 0.9)"; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(px(g[0]), px(g[1]), cell * 0.5, 0, Math.PI * 2); ctx.stroke();
            }
        }
    }

    /* ======================= 게임 진행 ======================= */
    function canPlay() { return started && !over && !thinking && turn() === human; }
    function turn() { return history.length % 2 === 0 ? 1 : 2; }

    function setStatus(text, cls) {
        elStatus.textContent = text;
        elStatus.className = "om-status" + (cls ? " " + cls : "");
    }
    function stoneName(c) { return c === 1 ? "흑" : "백"; }

    function refreshForbid() {
        forbid = (human === 1 && !over && turn() === 1) ? E.forbiddenPoints(board) : [];
    }

    function newGame() {
        clearTimeout(aiTimer);
        board = new Int8Array(N * N);
        history = []; over = false; thinking = false; winCells = null; hover = null; preview = null; forbid = [];
        human = settings.color; ai = 3 - human; level = settings.level;
        pendingSettings = false; elNote.hidden = true;
        elResult.hidden = true;
        started = false;
        stopTimer(); timerShow("idle");
        btnStart.textContent = "시작";
        syncButtons();
        setStatus("시작 버튼을 누르세요 · " + LEVEL_NAME[level] + " · 내 돌 " + stoneName(human));
        updateUndo();
        draw();
    }

    /* 시작 버튼: 처음이면 시작, 두는 중이면 판을 비우고 다시 시작 */
    function startGame() {
        if (started) newGame();
        started = true;
        btnStart.textContent = "다시 시작";
        /* 폰에서는 시작 버튼이 판 아래에 있어서, 판이 보이게 위로 올려 줌 */
        if (window.matchMedia && window.matchMedia("(max-width: 760px)").matches) {
            var row = document.querySelector(".om-statusrow");
            if (row && row.getBoundingClientRect().top < 0) row.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        if (ai === 1) aiMove(); else humanTurn("");
    }

    function humanTurn(prefix) {
        refreshForbid();
        setStatus((prefix || "") + "내 차례예요 (" + stoneName(human) + ") · " + TIME_LIMIT + "초 안에 두세요");
        startTimer();
        updateUndo();
        draw();
    }

    /* ---------- 제한 시간 ---------- */
    function startTimer() {
        stopTimer();
        turnEnd = Date.now() + TIME_LIMIT * 1000;
        lastTick = TIME_LIMIT + 1;
        timerShow("run");
        timerId = setInterval(timerStep, 100);
        timerStep();
    }
    function stopTimer() { if (timerId) { clearInterval(timerId); timerId = 0; } }
    function timerStep() {
        var rem = Math.max(0, (turnEnd - Date.now()) / 1000);
        var sec = Math.ceil(rem);
        elTimerNum.textContent = sec;
        elTimerRing.style.strokeDashoffset = (RING * (1 - rem / TIME_LIMIT)).toFixed(2);
        elTimer.classList.toggle("warn", sec <= 5);
        if (sec <= 5 && sec >= 1 && sec < lastTick) sndTick(sec === 1);
        lastTick = sec;
        if (rem <= 0) { stopTimer(); finish("timeout", null); }
    }
    /* idle: 시작 전 / run: 내 차례 / ai: 컴퓨터 차례 / end: 끝 */
    function timerShow(mode) {
        elTimer.className = "om-timer " + mode;
        elTimerRing.style.strokeDashoffset = mode === "run" ? "0" : (mode === "end" ? elTimerRing.style.strokeDashoffset : "0");
        if (mode === "idle") elTimerNum.textContent = TIME_LIMIT;
        if (mode === "ai") elTimerNum.textContent = "…";
    }

    function place(x, y, c) {
        board[y * N + x] = c;
        history.push([x, y, c]);
        sndStone(c === ai);
        var line = E.winLine(board, x, y);
        if (line) { finish(c === human ? "win" : "lose", line); return true; }
        if (history.length === N * N) { finish("draw", null); return true; }
        return false;
    }

    function humanMove(x, y) {
        if (!canPlay() || board[y * N + x]) return;
        if (human === 1 && E.isForbidden(board, x, y)) {
            sndBuzz();
            setStatus("금수 자리예요 (" + E.forbiddenReason(board, x, y) + "). 다른 곳에 두세요.", "warn");
            preview = null; draw();
            return;
        }
        preview = null; hover = null; forbid = [];
        stopTimer();
        if (place(x, y, human)) return;
        aiMove();
    }

    function aiMove() {
        thinking = true;
        stopTimer(); timerShow("ai");
        setStatus("컴퓨터 차례예요 (" + stoneName(ai) + ") · 생각 중", "thinking");
        updateUndo();
        draw();
        var start = Date.now();
        aiTimer = setTimeout(function () {
            var m = E.chooseMove(board, ai, level);
            var wait = Math.max(0, (level === "easy" ? 450 : 350) - (Date.now() - start));
            aiTimer = setTimeout(function () {
                thinking = false;
                if (!m) { finish("draw", null); return; }
                if (place(m[0], m[1], ai)) { updateUndo(); return; }
                humanTurn("");
            }, wait);
        }, 30);
    }

    function finish(kind, line) {
        over = true; thinking = false; winCells = line; forbid = []; preview = null; hover = null;
        stopTimer(); timerShow("end");
        if (kind === "timeout") elTimerNum.textContent = "0";
        btnStart.textContent = "시작";
        var r = record[level] || (record[level] = { w: 0, l: 0, d: 0 });
        if (kind === "win") { r.w++; setStatus("이겼어요! 🎉", "win"); sndWin(); }
        else if (kind === "lose") { r.l++; setStatus("컴퓨터가 이겼어요", "lose"); sndLose(); }
        else if (kind === "timeout") { r.l++; setStatus("시간 초과! " + TIME_LIMIT + "초가 지나 졌어요", "lose"); sndLose(); }
        else { r.d++; setStatus("무승부예요"); }
        save("omokRecord.v1", record);
        showRecord();
        updateUndo();
        draw();
        setTimeout(function () {
            if (!over) return;
            elResultTitle.textContent = kind === "win" ? "승리! 🎉" : kind === "lose" ? "패배" : kind === "timeout" ? "시간 초과 ⏰" : "무승부";
            elResultSub.textContent = LEVEL_NAME[level] + " · " + stoneName(human) + " · " + history.length + "수";
            elResult.hidden = false;
        }, 900);
    }

    function undo() {
        if (thinking || over) return;
        /* 컴퓨터의 마지막 수와 내 마지막 수를 함께 무름 */
        var removed = false;
        while (history.length) {
            var h = history.pop(); board[h[1] * N + h[0]] = 0;
            if (h[2] === human) { removed = true; break; }
        }
        if (!removed) return;
        preview = null; hover = null;
        refreshForbid();
        humanTurn("한 수 물렀어요 · ");
    }
    function updateUndo() {
        var mine = history.some(function (h) { return h[2] === human; });
        btnUndo.disabled = thinking || over || !mine;
    }

    function showRecord() {
        var rows = ["easy", "normal", "hard"].map(function (k) {
            var r = record[k] || { w: 0, l: 0, d: 0 };
            return "<span class=\"om-rec\"><b>" + LEVEL_NAME[k] + "</b> " + r.w + "승 " + r.l + "패" + (r.d ? " " + r.d + "무" : "") + "</span>";
        });
        $("omRecord").innerHTML = "내 전적 (이 기기)<br>" + rows.join(" · ");
    }

    /* ======================= 입력 ======================= */
    function cellAt(ev) {
        var r = canvas.getBoundingClientRect();
        var x = Math.round((ev.clientX - r.left - margin) / cell);
        var y = Math.round((ev.clientY - r.top - margin) / cell);
        if (x < 0 || y < 0 || x >= N || y >= N) return null;
        return [x, y];
    }
    canvas.addEventListener("pointermove", function (ev) {
        if (ev.pointerType !== "mouse") return;
        var c = cellAt(ev);
        var same = (c && hover && c[0] === hover[0] && c[1] === hover[1]) || (!c && !hover);
        if (!same) { hover = c; draw(); }
    });
    canvas.addEventListener("pointerleave", function () { if (hover) { hover = null; draw(); } });
    canvas.addEventListener("pointerup", function (ev) {
        audio();                                     // 첫 누름에 소리 준비 (브라우저 정책)
        var c = cellAt(ev);
        if (!c || !canPlay() || board[c[1] * N + c[0]]) { if (preview) { preview = null; draw(); } return; }
        if (ev.pointerType === "mouse") { humanMove(c[0], c[1]); return; }
        /* 손가락: 첫 번째 누름 = 미리보기, 같은 자리 한 번 더 = 두기 */
        if (preview && preview[0] === c[0] && preview[1] === c[1]) { humanMove(c[0], c[1]); return; }
        preview = c;
        draw();
    });

    /* 설정 버튼 */
    function syncButtons() {
        [].forEach.call($("omLevel").children, function (b) { b.classList.toggle("on", b.dataset.v === settings.level); });
        [].forEach.call($("omColor").children, function (b) { b.classList.toggle("on", +b.dataset.v === settings.color); });
    }
    function changeSetting() {
        save("omokSettings.v1", settings);
        syncButtons();
        /* 아직 안 뒀거나 끝난 판이면 바로 새 게임, 두는 중이면 다음 판부터 */
        if (!started || over) newGame();
        else { pendingSettings = true; elNote.hidden = false; }
    }
    $("omLevel").addEventListener("click", function (ev) {
        var b = ev.target.closest("button"); if (!b) return;
        sndClick(); settings.level = b.dataset.v; changeSetting();
    });
    $("omColor").addEventListener("click", function (ev) {
        var b = ev.target.closest("button"); if (!b) return;
        sndClick(); settings.color = +b.dataset.v; changeSetting();
    });
    btnStart.addEventListener("click", function () { sndClick(); startGame(); });
    $("omAgain").addEventListener("click", function () { sndClick(); newGame(); startGame(); });
    btnUndo.addEventListener("click", function () { sndClick(); undo(); });
    function syncSound() {
        btnSound.classList.toggle("muted", muted);
        btnSound.setAttribute("aria-label", muted ? "소리 켜기" : "소리 끄기");
        btnSound.title = muted ? "소리 켜기" : "소리 끄기";
    }
    btnSound.addEventListener("click", function () {
        muted = !muted; save("omokMuted.v1", muted); syncSound();
        if (!muted) sndStone(false);
    });
    chkForbid.addEventListener("change", draw);

    elHint.textContent = coarse
        ? "한 번 누르면 미리보기, 같은 자리를 한 번 더 누르면 돌이 놓여요."
        : "놓고 싶은 자리를 누르세요.";

    window.addEventListener("resize", resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(box);

    syncSound();
    showRecord();
    newGame();
    resize();
})();
