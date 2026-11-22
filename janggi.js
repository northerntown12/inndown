window.T = window.T || function (ko) { return ko; };   /* lang.js가 없어도 한국어로 동작 */
/* =========================================================
   장기 — 컴퓨터와 두기 (janggi.html / janggi-en.html) — 2026-11-18
   - 규칙·컴퓨터는 janggi-engine.js (웹 워커로 따로 계산해서 화면이 안 멈춰요)
   - 내 편: 초(먼저 둠) / 한(나중에 둠). 내 말은 늘 아래쪽에 보여요
   - 난이도 쉬움/보통/어려움, 상차림 4가지, 글자 한자/한글
   - 판 위의 [▶ 시작]을 눌러야 대국이 시작돼요. 컴퓨터는 한 수에 1초쯤 뜸을 들이고 둬요
   - 무르기, 한 수 쉬기(장군이 아닐 때), 기권. 수 제한 없음 — 궁을 더 지킬 수 없으면(외통) 짐 (2026-11-19, 예전 200수 점수 승부는 뺌)
   - 기기에 기억: 하던 판 janggiState.v1, 설정 janggiSettings.v1, 기록 janggiRecord.v1, 소리 janggiMuted.v1
   ========================================================= */
(function () {
    "use strict";
    var J = window.Janggi;
    var $ = function (id) { return document.getElementById(id); };
    if (!J || !$("jBoard")) return;
    var EN = !!window.SITE_EN;

    function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
    function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 무시 */ } }

    var MAX_PLY = 200;
    var LEVELS = { easy: T("쉬움", "Easy"), normal: T("보통", "Normal"), hard: T("어려움", "Hard") };
    var HANJA = { 1: ["楚", "漢"], 2: ["士", "士"], 3: ["象", "象"], 4: ["馬", "馬"], 5: ["車", "車"], 6: ["包", "包"], 7: ["卒", "兵"] };
    var HANGUL = EN ? { 1: ["K", "K"], 2: ["G", "G"], 3: ["E", "E"], 4: ["H", "H"], 5: ["R", "R"], 6: ["C", "C"], 7: ["S", "S"] }
                    : { 1: ["초", "한"], 2: ["사", "사"], 3: ["상", "상"], 4: ["마", "마"], 5: ["차", "차"], 6: ["포", "포"], 7: ["졸", "병"] };
    var NAME = EN ? { 1: "General", 2: "Guard", 3: "Elephant", 4: "Horse", 5: "Chariot", 6: "Cannon", 7: "Soldier" }
                  : { 1: "궁", 2: "사", 3: "상", 4: "마", 5: "차", 6: "포", 7: "졸" };
    var SIZE = { 1: 0.92, 2: 0.62, 3: 0.76, 4: 0.76, 5: 0.78, 6: 0.76, 7: 0.62 };

    /* ---------- 설정 · 기록 ---------- */
    var settings = load("janggiSettings.v1", null) || {};
    settings = {
        side: settings.side === -1 ? -1 : 1,
        level: LEVELS[settings.level] ? settings.level : "normal",
        setup: J.SETUPS[settings.setup] ? settings.setup : "HEHE",
        hangul: !!settings.hangul
    };
    var record = load("janggiRecord.v1", null) || {};
    var muted = !!load("janggiMuted.v1", false);

    /* ---------- 소리 (Web Audio) ---------- */
    var actx = null, noiseBuf = null;
    function audio() {
        if (muted) return null;
        try {
            if (!actx) {
                var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
                actx = new AC();
                noiseBuf = actx.createBuffer(1, Math.floor(actx.sampleRate * 0.25), actx.sampleRate);
                var d = noiseBuf.getChannelData(0);
                for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 6);
            }
            if (actx.state === "suspended") actx.resume();
            return actx;
        } catch (e) { return null; }
    }
    function marimba(freq, at, vol, len) {
        var a = audio(); if (!a) return;
        var t = a.currentTime + 0.02 + (at || 0), v = vol || 0.24;
        [[1, v, len || 0.28], [4, v * 0.22, 0.06]].forEach(function (h) {
            var o = a.createOscillator(); o.type = "sine"; o.frequency.value = freq * h[0];
            var g = a.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(h[1], t + 0.006);
            g.gain.exponentialRampToValueAtTime(0.0001, t + h[2]);
            o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + h[2] + 0.03);
        });
    }
    /* 나무 말을 판에 "딱" 놓는 소리 */
    function sndPlace(cap) {
        var a = audio(); if (!a) return;
        var t = a.currentTime + 0.01;
        var src = a.createBufferSource(); src.buffer = noiseBuf;
        var bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = cap ? 1500 : 1900; bp.Q.value = 2.2;
        var g = a.createGain(); g.gain.setValueAtTime(cap ? 1.4 : 1.0, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        src.connect(bp); bp.connect(g); g.connect(a.destination); src.start(t);
        var o = a.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(cap ? 220 : 300, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.08);
        var g2 = a.createGain(); g2.gain.setValueAtTime(cap ? 0.35 : 0.22, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.connect(g2); g2.connect(a.destination); o.start(t); o.stop(t + 0.12);
    }
    function sndPick() { marimba(784, 0, 0.12, 0.08); }
    function sndCheck() { marimba(659, 0.05, 0.26, 0.2); marimba(988, 0.17, 0.28, 0.35); }
    function sndWin() { [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) { marimba(f, i * 0.08, 0.24, 0.4); }); }
    function sndLose() { [494, 440, 392, 330].forEach(function (f, i) { marimba(f, i * 0.16, 0.22, 0.4); }); }
    function sndBtn() { marimba(523, 0, 0.18, 0.12); marimba(784, 0.07, 0.18, 0.16); }

    /* ---------- 판 상태 ---------- */
    var board, turn, hist, over, selected, legalCache, thinking, lastMove, hanSetup, gameSide, gameLevel, undoCount, started = false;
    var elBoard = $("jBoard"), elPieces = $("jPieces"), elMarks = $("jMarks");
    var cell = 48, margin = 30;

    function sideName(s) { return s > 0 ? T("초", "Cho") : T("한", "Han"); }
    function isMine(p) { return p && (p > 0) === (gameSide > 0); }
    /* 내 말이 늘 아래: 한을 고르면 판을 180도 돌려 보여요 */
    function view(i) { var x = J.X(i), y = J.Y(i); return gameSide > 0 ? [x, y] : [8 - x, 9 - y]; }
    function fromView(vx, vy) { return gameSide > 0 ? J.I(vx, vy) : J.I(8 - vx, 9 - vy); }

    function newGame() {
        stopThinking();
        gameSide = settings.side; gameLevel = settings.level;
        var keys = Object.keys(J.SETUPS);
        hanSetup = keys[Math.floor(Math.random() * keys.length)];
        var cho = gameSide > 0 ? settings.setup : hanSetup, han = gameSide > 0 ? hanSetup : settings.setup;
        board = J.initialBoard(cho, han);
        turn = 1; hist = []; over = null; selected = -1; lastMove = null; undoCount = 0;
        $("jResult").hidden = true;
        refreshLegal(); draw(); persist();
        showStart(false);
    }
    /* [▶ 시작] 판: 새 판이면 "준비됐어요", 하던 판이면 "이어서 두기" */
    function showStart(resume) {
        started = false;
        $("jStartTitle").textContent = resume ? T("하던 판이 있어요", "Game in progress") : T("준비됐어요", "Ready");
        $("jStartSub").textContent = T("내 편 ", "You: ") + sideName(gameSide) + (gameSide > 0 ? T(" (먼저)", " (first)") : T(" (나중)", " (second)")) +
            " · " + T("난이도 ", "Level: ") + LEVELS[gameLevel] + (resume ? "\n" + hist.length + T("수까지 뒀어요", " moves played") : "");
        $("jStartBtn").textContent = resume ? T("▶ 이어서 두기", "▶ Continue") : T("▶ 시작", "▶ Start");
        $("jStart").hidden = false;
        paintStatus();
    }
    function startGame() {
        if (started) return;
        started = true; $("jStart").hidden = true;
        sndBtn(); paintStatus();
        if (!over && turn !== gameSide) computerTurn();
    }
    function persist() {
        save("janggiState.v1", {
            board: Array.prototype.slice.call(board), turn: turn, hist: hist, over: over, lastMove: lastMove,
            side: gameSide, level: gameLevel, undo: undoCount
        });
    }
    function restore() {
        var s = load("janggiState.v1", null);
        if (!s || !s.board || s.board.length !== 90 || s.over) return false;
        board = new Int8Array(s.board); turn = s.turn === -1 ? -1 : 1; hist = s.hist || []; over = null;
        lastMove = s.lastMove || null; gameSide = s.side === -1 ? -1 : 1; gameLevel = LEVELS[s.level] ? s.level : "normal";
        undoCount = s.undo || 0; selected = -1;
        return true;
    }

    /* ---------- 그리기 ---------- */
    function layout() {
        var wrap = $("jWrap");
        var w = Math.min(wrap.clientWidth || 560, 600);
        var vh = window.innerHeight || 800;
        cell = Math.max(30, Math.min(Math.floor((w - 8) / 9.3), Math.floor((vh - 245) / 10.3), 62));
        margin = Math.round(cell * 0.65);
        elBoard.style.setProperty("--cell", cell + "px");
        elBoard.style.width = (cell * 8 + margin * 2) + "px";
        elBoard.style.height = (cell * 9 + margin * 2) + "px";
        drawLines();
    }
    function drawLines() {
        var W = cell * 8, H = cell * 9, m = margin, s = "";
        for (var y = 0; y < 10; y++) s += '<line x1="' + m + '" y1="' + (m + y * cell) + '" x2="' + (m + W) + '" y2="' + (m + y * cell) + '"/>';
        for (var x = 0; x < 9; x++) s += '<line x1="' + (m + x * cell) + '" y1="' + m + '" x2="' + (m + x * cell) + '" y2="' + (m + H) + '"/>';
        [[0, 2], [7, 9]].forEach(function (r) {   // 궁성 대각선
            var y0 = m + r[0] * cell, y1 = m + r[1] * cell, x0 = m + 3 * cell, x1 = m + 5 * cell;
            s += '<line x1="' + x0 + '" y1="' + y0 + '" x2="' + x1 + '" y2="' + y1 + '"/><line x1="' + x1 + '" y1="' + y0 + '" x2="' + x0 + '" y2="' + y1 + '"/>';
        });
        $("jLines").setAttribute("viewBox", "0 0 " + (W + 2 * m) + " " + (H + 2 * m));
        $("jLines").innerHTML = '<rect x="' + (m - 0.5) + '" y="' + (m - 0.5) + '" width="' + (W + 1) + '" height="' + (H + 1) + '" class="j-frame"/>' + s;
    }
    function pos(vx, vy) { return [margin + vx * cell, margin + vy * cell]; }
    function draw() {
        layout();
        var html = "", labels = settings.hangul ? HANGUL : HANJA;
        var checkK = (!over && J.inCheck(board, turn)) ? kingOf(turn) : -1;
        for (var i = 0; i < 90; i++) {
            var p = board[i]; if (!p) continue;
            var t = Math.abs(p), side = p > 0 ? 0 : 1, v = view(i), xy = pos(v[0], v[1]);
            var sz = Math.round(cell * SIZE[t]);
            var cls = "j-pc " + (p > 0 ? "cho" : "han") + " t" + t + (i === selected ? " sel" : "") + (i === checkK ? " checked" : "") +
                      (lastMove && lastMove[1] === i ? " last" : "") + (settings.hangul ? " kor" : "");
            html += '<button type="button" class="' + cls + '" data-i="' + i + '" style="left:' + xy[0] + 'px;top:' + xy[1] + 'px;width:' + sz + 'px;height:' + sz + 'px;font-size:' + Math.round(sz * (settings.hangul ? 0.5 : 0.56)) + 'px"' +
                    ' aria-label="' + sideName(p) + " " + NAME[t] + '"><span>' + labels[t][side] + '</span></button>';
        }
        elPieces.innerHTML = html;
        var marks = "";
        if (lastMove) {
            var f = view(lastMove[0]), fx = pos(f[0], f[1]);
            marks += '<span class="j-from" style="left:' + fx[0] + 'px;top:' + fx[1] + 'px"></span>';
        }
        if (selected >= 0) {
            legalCache.filter(function (m) { return ((m / 100) | 0) === selected; }).forEach(function (m) {
                var to = m % 100, v = view(to), xy = pos(v[0], v[1]);
                marks += '<span class="j-dot' + (board[to] ? " cap" : "") + '" data-i="' + to + '" style="left:' + xy[0] + 'px;top:' + xy[1] + 'px"></span>';
            });
        }
        elMarks.innerHTML = marks;
        paintStatus();
    }
    function kingOf(side) { for (var i = 0; i < 90; i++) if (board[i] === side) return i; return -1; }
    function paintStatus() {
        var st = $("jStatus"), cho = J.material(board, 1), han = J.material(board, -1) + 1.5;
        /* 2026-11-19: 판 위 점수 줄(초 n · 한 n · 수 n/200)은 사용자 요청으로 뺐어요 — html에 #jScore가 있으면 그때만 그림 */
        if ($("jScore")) $("jScore").innerHTML = '<span class="cho">' + T("초", "Cho") + ' <b>' + cho + '</b></span> · <span class="han">' + T("한", "Han") + ' <b>' + han + '</b></span>' +
            '<small>' + T("수", "Moves") + ' ' + hist.length + '/' + MAX_PLY + '</small>';
        var txt;
        if (over) txt = over.text;
        else if (!started) txt = T("[▶ 시작]을 누르면 시작해요", "Press [▶ Start] to begin");
        else if (thinking) txt = T("컴퓨터가 생각하는 중…", "Computer is thinking…");
        else if (turn === gameSide) txt = (J.inCheck(board, turn) ? T("장군! 궁을 지키세요 · ", "Check! Protect your General · ") : "") + T("내 차례예요", "Your move") + " (" + sideName(gameSide) + ")";
        else txt = T("컴퓨터 차례", "Computer's move");
        st.textContent = txt;
        st.className = "j-status" + (thinking ? " think" : "") + (!over && turn === gameSide && J.inCheck(board, turn) ? " danger" : "");
        $("jUndo").disabled = !started || !!thinking || !hist.length;
        $("jPass").disabled = !started || !!thinking || !!over || turn !== gameSide || J.inCheck(board, turn);
        $("jResign").disabled = !started || !!thinking || !!over || !hist.length;
    }

    /* ---------- 두기 ---------- */
    function refreshLegal() { legalCache = over ? [] : J.legalMoves(board, turn); }
    function doMove(m) {
        var cap = J.makeMove(board, m);
        hist.push([m, cap]);
        lastMove = [(m / 100) | 0, m % 100];
        turn = -turn; selected = -1;
        sndPlace(!!cap);
        afterMove();
    }
    function doPass() {
        hist.push([-1, 0]);
        lastMove = null; turn = -turn; selected = -1;
        toast(T("한 수 쉼", "Pass"));
        afterMove();
    }
    function afterMove() {
        refreshLegal();
        var check = J.inCheck(board, turn);
        if (!legalCache.length && check) {
            finish(turn === gameSide ? "lose" : "win", turn === gameSide ? T("외통수예요. 졌어요 😢", "Checkmate. You lost 😢") : T("외통수! 이겼어요 🎉", "Checkmate! You won 🎉"));
        } else if (check) {
            sndCheck(); toast(T("장군!", "Check!"));
        }
        draw(); persist();
        if (!over && turn !== gameSide) computerTurn();
    }
    function finish(kind, text) {
        over = { kind: kind, text: text };
        var r = record[gameLevel] || (record[gameLevel] = { w: 0, l: 0, d: 0 });
        if (kind === "win") r.w++; else if (kind === "lose") r.l++; else r.d++;
        save("janggiRecord.v1", record); paintRecord();
        if (kind === "win") sndWin(); else sndLose();
        save("janggiState.v1", null);
        setTimeout(function () {
            $("jResultTitle").textContent = kind === "win" ? T("이겼어요! 🎉", "You won! 🎉") : kind === "lose" ? T("졌어요", "You lost") : T("비겼어요", "Draw");
            $("jResultSub").textContent = text + "\n" + T("난이도 ", "Level: ") + LEVELS[gameLevel] + " · " + hist.length + T("수", " moves");
            $("jResult").hidden = false;
        }, 500);
    }

    /* ---------- 컴퓨터 ---------- */
    var worker = null, reqId = 0;
    try { worker = new Worker("janggi-engine.js?v=2");   /* ?v= 번호: 엔진을 고치면 같이 올리기 (html도) */ } catch (e) { worker = null; }
    function stopThinking() { reqId++; thinking = false; }
    function computerTurn() {
        if (over) return;
        thinking = true; paintStatus();
        var id = ++reqId, t0 = Date.now();
        function apply(m) {
            if (id !== reqId || over) return;
            /* 너무 빨리 두면 눈으로 따라가기 어려워서, 생각한 시간까지 합쳐 1.1~1.6초쯤 뒤에 둬요 */
            var wait = Math.max(0, 1100 + Math.random() * 500 - (Date.now() - t0));
            setTimeout(function () {
                if (id !== reqId || over) return;
                thinking = false;
                if (m == null) { doPass(); return; }
                doMove(m);
            }, wait);
        }
        if (worker) {
            worker.onmessage = function (e) { if (e.data && e.data.id === id) apply(e.data.move); };
            worker.onerror = function () { worker = null; setTimeout(function () { apply(J.bestMove(board, turn, gameLevel)); }, 30); };
            worker.postMessage({ id: id, board: Array.prototype.slice.call(board), side: turn, level: gameLevel });
        } else {
            setTimeout(function () { apply(J.bestMove(board, turn, gameLevel)); }, 60);
        }
    }

    /* ---------- 누르기 ---------- */
    elBoard.addEventListener("click", function (e) {
        if (!started || over || thinking || turn !== gameSide) return;
        var dot = e.target.closest(".j-dot"), pc = e.target.closest(".j-pc");
        var target = dot ? +dot.dataset.i : pc ? +pc.dataset.i : pointAt(e);
        if (target < 0) return;
        if (selected >= 0) {
            var m = selected * 100 + target;
            if (legalCache.indexOf(m) >= 0) { doMove(m); return; }
        }
        if (isMine(board[target])) {
            if (selected === target) { selected = -1; draw(); return; }
            selected = target; sndPick();
            var any = legalCache.some(function (mm) { return ((mm / 100) | 0) === target; });
            if (!any) toast(J.inCheck(board, turn) ? T("장군을 막아야 해요", "You must answer the check") : T("이 말은 지금 갈 곳이 없어요", "This piece can't move now"));
            draw();
        } else if (selected >= 0) { selected = -1; draw(); }
    });
    function pointAt(e) {
        var r = elBoard.getBoundingClientRect();
        var vx = Math.round((e.clientX - r.left - margin) / cell), vy = Math.round((e.clientY - r.top - margin) / cell);
        if (vx < 0 || vx > 8 || vy < 0 || vy > 9) return -1;
        return fromView(vx, vy);
    }

    var toastTimer = null;
    function toast(t) {
        var el = $("jToast"); el.textContent = t; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
        clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.remove("show"); }, 1300);
    }

    /* ---------- 버튼 ---------- */
    $("jUndo").addEventListener("click", function () {
        if (!started || thinking || !hist.length) return;
        stopThinking();
        if (over) { over = null; $("jResult").hidden = true; }
        /* 내 차례가 될 때까지 (보통 컴퓨터 수 + 내 수) 되돌리기 */
        do {
            var h = hist.pop();
            if (h[0] >= 0) J.undoMove(board, h[0], h[1]);
            turn = -turn;
        } while (hist.length && turn !== gameSide);
        var lastReal = null;
        for (var k = hist.length - 1; k >= 0; k--) if (hist[k][0] >= 0) { lastReal = [(hist[k][0] / 100) | 0, hist[k][0] % 100]; break; }
        lastMove = lastReal; selected = -1; undoCount++;
        sndBtn(); refreshLegal(); draw(); persist();
        if (turn !== gameSide) computerTurn();
    });
    $("jPass").addEventListener("click", function () {
        if (!started || thinking || over || turn !== gameSide || J.inCheck(board, turn)) return;
        sndBtn(); doPass();
    });
    var resignArm = 0;
    $("jResign").addEventListener("click", function () {
        if (!started || thinking || over || !hist.length) return;
        if (Date.now() - resignArm > 2500) { resignArm = Date.now(); toast(T("한 번 더 누르면 기권해요", "Tap again to resign")); return; }
        stopThinking(); finish("lose", T("기권했어요", "You resigned")); draw();
    });
    $("jNew").addEventListener("click", function () { sndBtn(); readSettings(); newGame(); });
    $("jAgain").addEventListener("click", function () { sndBtn(); readSettings(); newGame(); });
    $("jStartBtn").addEventListener("click", startGame);
    $("jLook").addEventListener("click", function () { $("jResult").hidden = true; });
    $("jExit").addEventListener("click", function () {
        sndBtn();
        setTimeout(function () {
            window.close();
            setTimeout(function () { if (!window.closed) location.href = T("index.html", "index-en.html"); }, 250);
        }, 300);
    });

    /* 설정 */
    function readSettings() {
        settings.side = $("jSideHan").checked ? -1 : 1;
        settings.level = $("jLevel").value;
        settings.setup = $("jSetup").value;
        save("janggiSettings.v1", settings);
    }
    function paintSettings() {
        $("jSideCho").checked = settings.side > 0; $("jSideHan").checked = settings.side < 0;
        $("jLevel").value = settings.level; $("jSetup").value = settings.setup;
        $("jHangul").checked = settings.hangul;
    }
    ["jSideCho", "jSideHan", "jLevel", "jSetup"].forEach(function (id) {
        $(id).addEventListener("change", function () {
            readSettings();
            /* 아직 한 수도 안 둔 새 판이면 바로 바꿔서 보여주고, 두는 중이면 [새 게임]부터 */
            if (!started && !hist.length) newGame();
            else toast(T("[새 게임]을 누르면 적용돼요", "Applies when you start a new game"));
        });
    });
    $("jHangul").addEventListener("change", function () { settings.hangul = $("jHangul").checked; save("janggiSettings.v1", settings); draw(); });

    function paintRecord() {
        $("jRecord").innerHTML = "<b>" + T("내 기록", "My record") + "</b><br>" + Object.keys(LEVELS).map(function (k) {
            var r = record[k] || { w: 0, l: 0, d: 0 };
            return LEVELS[k] + " · " + T(r.w + "승 " + r.l + "패" + (r.d ? " " + r.d + "무" : ""), r.w + "W " + r.l + "L" + (r.d ? " " + r.d + "D" : ""));
        }).join("<br>");
    }

    /* 소리 버튼 */
    var btnSound = $("jSound");
    function syncSound() {
        btnSound.classList.toggle("muted", muted);
        var l = muted ? T("소리 켜기", "Sound on") : T("소리 끄기", "Sound off");
        btnSound.setAttribute("aria-label", l); btnSound.title = l;
    }
    btnSound.addEventListener("click", function () { muted = !muted; save("janggiMuted.v1", muted); syncSound(); if (!muted) sndBtn(); });
    syncSound();

    /* 마우스로 누른 버튼은 바로 초점 빼기 */
    document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("button"); if (b && e.detail > 0) b.blur(); });
    var rz = null;
    window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(draw, 120); });

    /* 시작 */
    paintSettings(); paintRecord();
    if (restore()) {
        refreshLegal(); draw();
        if (hist.length) showStart(true); else { save("janggiState.v1", null); newGame(); }
    } else newGame();
    if (!legalCache) refreshLegal();
})();
