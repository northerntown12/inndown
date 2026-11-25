window.T = window.T || function (ko) { return ko; };   /* lang.js가 없어도 한국어로 동작 */
/* =========================================================
   장기 — 컴퓨터와 두기 (janggi.html / janggi-en.html) — 2026-11-18
   - 규칙·컴퓨터는 janggi-engine.js (웹 워커로 따로 계산해서 화면이 안 멈춰요)
   - 내 편: 초(먼저 둠) / 한(나중에 둠). 내 말은 늘 아래쪽에 보여요
   - 난이도 쉬움/보통/어려움, 상차림 4가지, 글자 한자/한글
   - 판 위의 [▶ 시작]을 눌러야 대국이 시작돼요. 컴퓨터는 한 수에 1초쯤 뜸을 들이고 둬요
   - 무르기, 한 수 쉬기(장군이 아닐 때), 기권. 수 제한 없음 — 궁을 더 지킬 수 없으면(외통) 짐 (2026-11-19, 예전 200수 점수 승부는 뺌)
   - 기기에 기억: 하던 판 janggiState.v1, 설정 janggiSettings.v1, 기록 janggiRecord.v1, 소리 janggiMuted.v1
   - 2026-11-25: 🌐 온라인 대결 + 대화 (오목과 같은 구조, 한 수 1분) — 아래 "온라인 대결" 부분
     서버 주소는 ONLINE_URL (오목과 같은 Worker, 주소 뒤에 /j/...)
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
    /* 온라인 대결 서버 (Cloudflare Worker "omok-online" — 오목과 같은 서버, 장기는 /j/... 주소) */
    var ONLINE_URL = window.JANGGI_ONLINE_URL || window.OMOK_ONLINE_URL || "https://omok-online.sumerboy.workers.dev";
    var mode = "ai", ON = null;                // "ai" 컴퓨터와 / "online" 온라인 대결
    /* 온라인 부분(아래)이 채워 넣는 함수들 — html이 예전 것이라 온라인 버튼이 없으면 빈 채로 둬요 */
    var onlineMove = null, onlineCanMove = null, onlinePaint = null, onlineAgain = null, onlinePass = null, onlineRecordText = null, autoOnline = null, onlineSetupChanged = null;
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
        if (mode === "online") { if (onlinePaint) onlinePaint(); return; }   // 온라인: 글은 온라인 부분이 씀
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
        if (mode === "online") { if (!onlineCanMove || !onlineCanMove()) return; }
        else if (!started || over || thinking || turn !== gameSide) return;
        var dot = e.target.closest(".j-dot"), pc = e.target.closest(".j-pc");
        var target = dot ? +dot.dataset.i : pc ? +pc.dataset.i : pointAt(e);
        if (target < 0) return;
        if (selected >= 0) {
            var m = selected * 100 + target;
            if (legalCache.indexOf(m) >= 0) { if (mode === "online") onlineMove(m); else doMove(m); return; }
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
        if (mode === "online") { if (onlinePass) onlinePass(); return; }
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
    $("jAgain").addEventListener("click", function () {
        sndBtn();
        if (mode === "online") { if (onlineAgain) onlineAgain(); return; }
        readSettings(); newGame();
    });
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
            if (mode === "online") {     /* 온라인: 상차림은 다음 판(방 만들기·한 판 더)부터 */
                toast(T("다음 판부터 이 상차림으로 둬요", "Used from your next online game"));
                if (onlineSetupChanged) onlineSetupChanged();
                return;
            }
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
        }).join("<br>") + (onlineRecordText ? "<br>" + onlineRecordText() : "");
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


    /* ======================= 온라인 대결 (2026-11-25) =======================
       오목 온라인과 같은 구조·같은 버튼. 서버: Cloudflare Worker "omok-online"의 /j/... 주소 (omok-online-worker.js 맨 아래)
       - 방 만들기(코드 4자리, 링크 공유) / 코드로 입장 / 빠른 매칭
       - 상대 수는 /j/state 로 기다렸다 받음 (서버가 최대 20초 붙잡고 있다가 바뀌면 바로 대답)
       - 한 수 1분(서버가 정함). 컴퓨터와 두기는 예전처럼 시간 제한 없음
       - 초·한은 들어올 때 무작위, 한 판 더는 서로 바꿔서. 상차림은 각자 설정의 "내 상차림"
       - 둘 수 있는 수·외통수·시간 초과는 서버가 최종 판정
       - 새로고침하거나 새 탭으로 다시 열어도 같은 방으로 돌아옴 (localStorage janggiOnline.v1, 30분)
       - 하던 컴퓨터 대국(janggiState.v1)은 그대로 남고, [← 컴퓨터와 두기]를 누르면 이어서 둘 수 있어요
       ========================================================= */
    var elOnBtn = $("joOnlineBtn");
    if (elOnBtn) (function () {
        var elBox = $("joBox"), elLobby = $("joLobby"), elWait = $("joWait"), elPlay = $("joPlay");
        var elErr = $("joErr"), elInfo = $("joInfo"), elWaitMsg = $("joWaitMsg"), elCodeBox = $("joCodeBox");
        var btnOnResign = $("joResign"), btnRematch = $("joRematch"), btnStop = $("joStop"), btnNewOpp = $("joNewOpp"), inCode = $("joCodeIn");
        var SESSION_KEY = "janggiOnline.v1";
        /* 2026-11-25: 두던 방을 이 기기에 기억해요 (localStorage). 폰에서 홈의 게임 카드를 다시 누르면 새 탭이 열려서,
           예전처럼 그 탭에만 기억하면(sessionStorage) 두던 방을 못 찾고 처음 화면이 나왔어요.
           30분 넘게 소식이 없던 방은 다시 들어가지 않아요 */
        var RESUME_MS = 30 * 60 * 1000;
        function sessSave(o) {
            o.t = Date.now();
            var v = JSON.stringify(o);
            try { localStorage.setItem(SESSION_KEY, v); } catch (e) {}
            try { sessionStorage.setItem(SESSION_KEY, v); } catch (e) {}
        }
        function sessLoad() {
            var v = null;
            try { v = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) {}
            if (!v) { try { v = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) {} }
            if (v && v.t && Date.now() - v.t > RESUME_MS) { sessDel(); return null; }
            return v;
        }
        function sessDel() {
            try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
            try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
        }
        function sessTouch(me) {                    // 두는 동안 20초마다 "아직 이 방에 있어요" 시각을 새로
            if (me.savedAt && Date.now() - me.savedAt < 20000) return;
            me.savedAt = Date.now();
            sessSave({ code: me.code, token: me.token, quick: me.quick });
        }
        var onlineRecord = load("janggiOnlineRecord.v1", { w: 0, l: 0, d: 0 });
        var LIMIT = 60;                                        // 한 수 1분 (서버가 보낸 limit로 다시 맞춤)
        var fanfareAt = 0;

        /* ---------- 소리 (온라인에서만 쓰는 것) ---------- */
        function sndTick(last) { marimba(last ? 1320 : 990, 0, 0.14, 0.07); }
        function sndBuzz() { marimba(196, 0, 0.22, 0.18); }
        function sndChat() { marimba(880, 0, 0.12, 0.08); marimba(1320, 0.07, 0.12, 0.1); }
        var COUNT_NOTES = { 5: 523, 4: 587, 3: 659, 2: 698, 1: 784 };
        function sndCount(n) { marimba(COUNT_NOTES[n] || 659, 0, 0.24, 0.3); }
        function sndGo() { marimba(784, 0, 0.26, 0.25); marimba(1047, 0.09, 0.3, 0.45); }
        function sndFanfare() {
            fanfareAt = Date.now();
            [[523, 0], [659, 0.11], [784, 0.22], [1047, 0.33], [784, 0.62], [1047, 0.74]].forEach(function (n) { marimba(n[0], n[1], 0.24, 0.4); });
        }

        /* ---------- 남은 시간 동그라미 (html은 안 고치고 여기서 만듦, 온라인에서만 보임) ---------- */
        var elTimer = document.createElement("div");
        elTimer.className = "jo-timer idle"; elTimer.hidden = true;
        elTimer.setAttribute("role", "timer"); elTimer.setAttribute("aria-label", T("남은 시간(초)", "Time left (s)"));
        elTimer.innerHTML = '<svg viewBox="0 0 44 44" aria-hidden="true"><circle class="jo-tr-bg" cx="22" cy="22" r="19"/><circle class="jo-tr" cx="22" cy="22" r="19"/></svg><span>60</span>';
        $("jSound").parentNode.insertBefore(elTimer, $("jSound"));
        var elTimerNum = elTimer.querySelector("span"), elTimerRing = elTimer.querySelector(".jo-tr");
        var RING = 2 * Math.PI * 19;
        var timerId = 0, turnEnd = 0, lastTick = 0, timerMine = true;
        function startTimer(ms, mine) {
            stopTimer();
            timerMine = mine !== false;
            turnEnd = Date.now() + (ms == null ? LIMIT * 1000 : ms);
            lastTick = LIMIT + 1;
            timerShow(timerMine ? "run" : "opp");
            timerId = setInterval(timerStep, 200);
            timerStep();
        }
        function stopTimer() { if (timerId) { clearInterval(timerId); timerId = 0; } }
        function timerStep() {
            var rem = Math.max(0, (turnEnd - Date.now()) / 1000);
            var sec = Math.min(LIMIT, Math.ceil(rem));
            elTimerNum.textContent = sec;
            elTimerRing.style.strokeDashoffset = (RING * (1 - Math.min(1, rem / LIMIT))).toFixed(2);
            elTimer.classList.toggle("warn", sec <= 10 && timerMine);
            if (timerMine && sec <= 5 && sec >= 1 && sec < lastTick) sndTick(sec === 1);
            lastTick = sec;
            if (rem <= 0) { stopTimer(); elTimerNum.textContent = "0"; }   // 시간 초과는 서버가 판정
        }
        function timerShow(m) {
            elTimer.className = "jo-timer " + m;
            elTimerRing.style.strokeDashoffset = m === "end" ? elTimerRing.style.strokeDashoffset : "0";
            if (m === "idle") elTimerNum.textContent = LIMIT;
        }

        /* ---------- 결과 창에 [그만할래요]·[종료] (온라인에서만 보임) ---------- */
        var btnStop2 = document.createElement("button");
        btnStop2.type = "button"; btnStop2.className = "g-btn jo-stop jo-only"; btnStop2.textContent = T("그만할래요", "I'm done");
        var btnResultExit = document.createElement("button");
        btnResultExit.type = "button"; btnResultExit.className = "g-btn g-exit jo-only"; btnResultExit.textContent = T("종료", "Exit");
        $("jAgain").insertAdjacentElement("afterend", btnStop2);
        btnStop2.insertAdjacentElement("afterend", btnResultExit);

        function api(path, body, signal) {
            /* Content-Type을 안 붙이면 text/plain 요청이라 사전 확인(OPTIONS) 없이 바로 감 */
            return fetch(ONLINE_URL + "/j" + path, { method: "POST", body: JSON.stringify(body || {}), signal: signal, cache: "no-store" })
                .then(function (r) { return r.json(); });
        }
        function onErr(msg) { elErr.textContent = msg || ""; elErr.hidden = !msg; }
        function netErrText() { return T("온라인 서버에 연결하지 못했어요. 잠시 뒤 다시 해 보세요.", "Couldn't reach the online server. Please try again shortly."); }
        function isPhone() { return !!(window.matchMedia && window.matchMedia("(max-width: 760px)").matches); }
        function setStatus(text, cls) { var st = $("jStatus"); st.textContent = text; st.className = "j-status" + (cls ? " " + cls : ""); }
        function sideTag(s) { return (s > 0 ? T("초", "Cho") : T("한", "Han")); }
        function showView(v) {
            elLobby.hidden = v !== "lobby"; elWait.hidden = v !== "wait"; elPlay.hidden = v !== "play";
            var pre = v === "lobby" || v === "wait";
            var was = document.body.classList.contains("jo-pre");
            document.body.classList.toggle("jo-pre", pre);
            if (isPhone()) {
                if (pre && !was) window.scrollTo(0, 0);
                if (!pre && was) setTimeout(function () { var row = document.querySelector(".j-statusrow"); if (row) row.scrollIntoView({ behavior: "smooth", block: "start" }); }, 50);
            }
        }
        function setBusy(b) { [].forEach.call(elLobby.querySelectorAll("button, input"), function (el) { el.disabled = b; }); }

        /* 판을 처음 모양으로 (기다리는 동안: 내 상차림을 초 자리에) */
        function resetBoard() {
            gameSide = 1;
            board = J.initialBoard(settings.setup, settings.setup);
            turn = 1; hist = []; over = null; selected = -1; lastMove = null; legalCache = []; started = false;
            $("jResult").hidden = true; $("jStart").hidden = true;
        }
        function enterOnline() {
            stopThinking();
            mode = "online";
            document.body.classList.add("jo-mode");
            elBox.hidden = false; elTimer.hidden = false;
            stopTimer(); resetBoard();
            showView("lobby"); onErr(""); setBusy(false);
            timerShow("idle");
            draw();
            setStatus(T("온라인 대결 · 빠른 매칭이나 방 만들기를 고르세요", "Online · choose Quick match or Create a room"));
        }
        function leaveOnline(silent) {
            if (ON) {
                var b = JSON.stringify({ code: ON.code, token: ON.token });
                try { if (!(navigator.sendBeacon && navigator.sendBeacon(ONLINE_URL + "/j/leave", b))) api("/leave", { code: ON.code, token: ON.token }).catch(function () {}); } catch (e) {}
                if (ON.abort) ON.abort.abort();
            }
            ON = null;
            sessDel();
            stopTimer(); hideUndo();
            if (!silent) {
                mode = "ai";
                document.body.classList.remove("jo-mode", "jo-pre");
                elBox.hidden = true; elTimer.hidden = true;
                $("jResult").hidden = true;
                $("jAgain").textContent = T("새 게임", "New game");
                /* 하던 컴퓨터 대국이 있으면 이어서 */
                if (restore()) { refreshLegal(); draw(); if (hist.length) showStart(true); else { save("janggiState.v1", null); newGame(); } }
                else newGame();
            }
        }
        function backToLobby(msg) {
            if (ON && ON.abort) ON.abort.abort();
            ON = null;
            sessDel();
            enterOnline();
            if (msg) onErr(msg);
        }

        /* 방 만들기 / 빠른 매칭 / 코드로 입장 */
        function begin(path, body) {
            audio(); onErr(""); setBusy(true);
            body = body || {}; body.setup = settings.setup;
            api(path, body).then(function (res) {
                setBusy(false);
                if (res.error) {
                    onErr(res.error === "noroom" ? T("그런 방이 없어요. 코드를 다시 확인해 주세요.", "No room with that code. Please check it.")
                        : res.error === "full" ? T("이미 대결이 시작된 방이에요.", "That room is already playing.")
                        : res.error === "badcode" ? T("방 코드 4자리를 넣어 주세요.", "Please enter the 4-character room code.")
                        : res.error === "path" ? T("장기 온라인 서버가 아직 준비되지 않았어요.", "The Janggi online server isn't ready yet.")
                        : netErrText());
                    return;
                }
                ON = { code: res.code, token: res.token, ver: 0, status: "waiting", quick: !!res.quick || path === "/quick", gameKey: "", via: path };
                /* 링크(?room=)로 들어온 주소는 지워 둬요 — 나중에 새로고침해도 예전 방 코드로 다시 들어가지 않게 */
                try { if (/[?&]room=/.test(location.search) && history.replaceState) history.replaceState(null, "", location.pathname); } catch (e) {}
                sessSave({ code: ON.code, token: ON.token, quick: ON.quick }); ON.savedAt = Date.now();
                showWaiting();
                poll();
            }).catch(function () { setBusy(false); onErr(netErrText()); });
        }
        function showWaiting() {
            showView("wait");
            resetBoard(); draw();
            timerShow("idle");
            $("joCodeShow").textContent = ON.code;
            elCodeBox.hidden = ON.quick;
            elWaitMsg.textContent = ON.quick ? T("상대를 찾는 중이에요…", "Looking for an opponent…")
                                             : T("친구에게 방 코드나 링크를 보내 주세요. 들어오면 바로 시작해요.", "Send the room code or link to a friend. The game starts when they join.");
            setStatus(ON.quick ? T("빠른 매칭 · 상대를 찾는 중", "Quick match · finding an opponent") : T("방 ", "Room ") + ON.code + T(" · 상대를 기다리는 중", " · waiting for your opponent"), "think");
        }

        /* 상태 받기 (끊기면 2초 뒤 다시) */
        function poll() {
            var me = ON; if (!me) return;
            if (me.abort) me.abort.abort();
            var ctl = window.AbortController ? new AbortController() : null;
            me.abort = ctl;
            api("/state", { code: me.code, token: me.token, ver: me.ver, cver: me.cver || 0, cid: me.cid || 0 }, ctl && ctl.signal).then(function (s) {
                if (ON !== me) return;
                /* 기억해 둔 방으로 다시 들어왔는데 방이 없거나 이미 끝나고 둘 중 하나가 나갔으면 → 조용히 컴퓨터와 두기로 */
                if (me.resumedFrom && !me.state && (s.error === "noroom" || s.error === "notyou" ||
                        (s.status === "over" && (s.meDeclined || s.oppLeft || s.oppDeclined)))) { sessDel(); ON = null; leaveOnline(false); return; }
                if (s.error === "noroom" || s.error === "notyou") { backToLobby(T("방이 사라졌어요. 다시 시작해 주세요.", "The room is gone. Please start again.")); return; }
                if (s.error) throw new Error(s.error);
                me.netFail = 0; onErr("");
                sessTouch(me);
                chatSync(s);
                applyState(s);
                setTimeout(function () { if (ON === me) poll(); }, 30);
            }).catch(function (e) {
                if (ON !== me || (e && e.name === "AbortError")) return;
                me.netFail = (me.netFail || 0) + 1;
                if (me.netFail >= 2) onErr(T("연결이 불안정해요. 다시 연결하는 중…", "Connection is unstable. Reconnecting…"));
                setTimeout(function () { if (ON === me) poll(); }, 2000);
            });
        }

        /* ---------- 입장 팡파레 + 축하 띠 ---------- */
        function celebrateJoin(via) {
            var msg = via === "/join" ? T("🎉 방에 들어왔어요! 함께 둬요", "🎉 You're in! Let's play")
                    : via === "/quick" ? T("🎉 상대를 찾았어요!", "🎉 Opponent found!")
                    : T("🎉 친구가 들어왔어요!", "🎉 Your friend joined!");
            sndFanfare();
            if (actx && actx.state !== "running") {
                var t0 = Date.now();
                var once = function () { document.removeEventListener("pointerdown", once, true); if (Date.now() - t0 < 6000) sndFanfare(); };
                document.addEventListener("pointerdown", once, true);
            }
            var old = elBoard.querySelector(".jo-join-banner"); if (old) old.remove();
            var el = document.createElement("div");
            el.className = "jo-join-banner"; el.setAttribute("role", "status");
            var html = "<p>" + msg + "</p>", colors = ["#ff5e8a", "#ffd166", "#7bdcb5", "#8ab4ff", "#c79bff", "#ff9f6b"];
            for (var i = 0; i < 26; i++) {
                html += '<i style="left:' + (Math.random() * 100).toFixed(1) + "%;background:" + colors[i % colors.length] +
                        ";animation-delay:" + (Math.random() * 0.5).toFixed(2) + "s;animation-duration:" + (1.4 + Math.random() * 0.9).toFixed(2) + 's"></i>';
            }
            el.innerHTML = html;
            elBoard.appendChild(el);
            setTimeout(function () { el.classList.add("out"); }, 2400);
            setTimeout(function () { el.remove(); }, 2900);
        }

        /* ---------- 시작 카운트다운 5·4·3·2·1 ---------- */
        function showCountdown(s) {
            var me = ON;
            if (me.cdKey === me.gameKey) return;
            me.cdKey = me.gameKey;
            me.cdUntil = Date.now() + s.startIn;
            timerShow("idle");
            var first = s.you > 0 ? T("내가 초(파랑)라 먼저 둬요", "You're Cho (blue) — you go first")
                                  : T("상대가 초(파랑)라 먼저 둬요 · 나는 한(빨강)", "Opponent is Cho (blue) and goes first · you're Han (red)");
            setStatus(T("곧 시작해요 · ", "Starting soon · ") + first, "think");
            var old = elBoard.querySelector(".jo-countdown"); if (old) old.remove();
            var el = document.createElement("div");
            el.className = "jo-countdown";
            el.innerHTML = "<b></b><small>" + first + "</small>";
            elBoard.appendChild(el);
            var num = el.querySelector("b"), last = -1;
            (function tick() {
                if (ON !== me || me.cdKey !== me.gameKey) { el.remove(); return; }
                var left = me.cdUntil - Date.now(), n = Math.ceil(left / 1000);
                if (left <= 0) {
                    num.textContent = T("시작!", "Go!"); num.className = "go"; sndGo();
                    setTimeout(function () { el.classList.add("out"); }, 450);
                    setTimeout(function () { el.remove(); }, 800);
                    me.cdUntil = 0;
                    var st = me.state;
                    if (st && st.status === "playing" && st.moves.length === 0) {
                        var s2 = {}; for (var k in st) s2[k] = st[k];
                        s2.startIn = 0; s2.left = LIMIT * 1000; s2._go = true;
                        applyState(s2);
                    }
                    return;
                }
                if (n !== last) {
                    last = n; num.textContent = n; num.className = ""; void num.offsetWidth; num.className = "pop";
                    if (Date.now() - fanfareAt > 1300) sndCount(n);
                }
                setTimeout(tick, 100);
            })();
        }

        /* ---------- 서버 상태를 화면에 ---------- */
        function rebuild(s) {
            var b = J.initialBoard(s.setups.cho, s.setups.han), caps = [];
            s.moves.forEach(function (m) { caps.push(m >= 0 ? J.makeMove(b, m) : 0); });
            return { board: b, caps: caps };
        }
        function applyState(s) {
            if (!ON || !s || s.ver < ON.ver) return;
            var wasWaiting = ON.status === "waiting";
            if (s.limit) LIMIT = Math.round(s.limit / 1000);
            ON.ver = s.ver; ON.status = s.status; ON.state = s;
            if (s.status === "waiting") { showWaiting(); return; }

            showView("play");
            if (wasWaiting && !ON.resumed && !ON.joinCelebrated && s.status === "playing" && s.games === 1) { ON.joinCelebrated = true; celebrateJoin(ON.via); }
            ON.resumed = false;
            handleUndoNote(s);
            var gameKey = ON.code + ":" + s.games;
            var newGameStarted = ON.gameKey !== gameKey;
            if (newGameStarted) { ON.gameKey = gameKey; ON.recorded = false; $("jResult").hidden = true; }

            var prevLen = newGameStarted ? 0 : (ON.shownLen || 0);
            var r = rebuild(s);
            gameSide = s.you; board = r.board; turn = s.toMove;
            hist = s.moves.map(function (m, i) { return [m, r.caps[i]]; });
            var lm = s.moves.length ? s.moves[s.moves.length - 1] : null;
            lastMove = lm != null && lm >= 0 ? [(lm / 100) | 0, lm % 100] : null;
            var oppNew = s.moves.length > prevLen && (s.moves.length - 1) % 2 === (gameSide > 0 ? 1 : 0);   // 마지막 수가 상대 것
            ON.shownLen = s.moves.length;
            if (oppNew) {
                if (lm === -1) toast(T("상대가 한 수 쉬었어요", "Opponent passed"));
                else sndPlace(!!r.caps[r.caps.length - 1]);
            }
            if (newGameStarted && s.status === "playing" && !(s.startIn > 400 && s.moves.length === 0)) sndBtn();
            started = true; thinking = false;
            if (selected >= 0 && !(isMine(board[selected]) && turn === gameSide)) selected = -1;

            if (s.status === "over") { hideUndo(); legalCache = []; onlineFinish(s); updatePanel(s); draw(); return; }
            over = null;
            if (s.status === "playing" && s.startIn > 400 && s.moves.length === 0) { legalCache = []; showCountdown(s); updatePanel(s); draw(); return; }
            if (s.undoReq) { legalCache = []; selected = -1; showUndo(s); updatePanel(s); draw(); return; }
            hideUndo();
            var check = J.inCheck(board, turn);
            if (turn === gameSide) {
                legalCache = J.legalMoves(board, turn);
                startTimer(s.left, true);
                setStatus((s._go ? T("시작! ", "Go! ") : "") + (check ? T("장군! 궁을 지키세요 · ", "Check! Protect your General · ") : "") +
                    T("내 차례예요 (", "Your move (") + sideTag(gameSide) + ") · " + T(LIMIT >= 60 && LIMIT % 60 === 0 ? (LIMIT / 60) + "분 안에" : LIMIT + "초 안에", "within " + (LIMIT >= 60 && LIMIT % 60 === 0 ? (LIMIT / 60) + " min" : LIMIT + "s")), check ? "danger" : "");
                if (check && oppNew) { sndCheck(); toast(T("장군!", "Check!")); }
            } else {
                legalCache = [];
                startTimer(s.left, false);
                setStatus(T("상대 차례예요 (", "Opponent's move (") + sideTag(-gameSide) + ")" + (s.oppHere ? "" : T(" · 상대 연결 확인 중", " · checking opponent")), "think");
            }
            updatePanel(s);
            draw();
        }
        /* jPass(한 수 쉬기) 버튼만 온라인에 맞게 (무르기·기권은 아래 버튼 줄에서 숨기고 오른쪽 칸 버튼을 써요) */
        onlinePaint = function () {
            var s = ON && ON.state;
            var can = canMove();
            $("jPass").disabled = !can || J.inCheck(board, turn);
            $("jUndo").disabled = true; $("jResign").disabled = true;
            if (s && s.status === "playing" && turn === gameSide && !legalCache.length && !J.inCheck(board, turn) && can) {
                $("jPass").classList.add("jo-hot");
            } else $("jPass").classList.remove("jo-hot");
        };
        function canMove() {
            var s = ON && ON.state;
            return !!(s && s.status === "playing" && !ON.sending && !s.undoReq && !(ON.cdUntil && Date.now() < ON.cdUntil) && turn === gameSide && !over);
        }
        onlineCanMove = canMove;

        function updatePanel(s) {
            paintUndo(s);
            var opp = s.oppLeft ? T("나감", "left") : s.oppDeclined ? T("그만함", "done") : (s.oppHere ? T("접속 중", "online") : T("연결 끊김?", "offline?"));
            elInfo.innerHTML = T("방 ", "Room ") + "<b>" + s.code + "</b> · " + T("나 ", "Me ") + '<b class="' + (s.you > 0 ? "cho" : "han") + '">' + sideTag(s.you) + "</b>" +
                " · " + T("상대 ", "Opponent ") + '<span class="jo-opp ' + (s.oppHere && !s.oppLeft ? "on" : "off") + '">' + opp + "</span>";
            var playing = s.status === "playing";
            var ended = !playing && (s.oppLeft || s.oppDeclined || s.meDeclined);
            btnOnResign.hidden = !playing;
            btnRematch.hidden = playing || s.meDeclined;
            btnStop.hidden = playing || ended;
            btnNewOpp.hidden = !ended;
            btnStop.classList.toggle("jo-stop-hot", !playing && !!s.rematchOpp && !s.rematchMe);
            $("jAgain").hidden = ended; btnStop2.hidden = ended;
            if (ended) $("jResult").hidden = true;
            if (!playing) {
                btnRematch.disabled = s.oppLeft || s.oppDeclined || s.rematchMe;
                btnRematch.textContent = s.oppLeft ? T("상대가 나갔어요", "Opponent left")
                    : s.oppDeclined ? T("상대가 그만하기로 했어요", "Opponent has stopped")
                    : s.rematchMe ? T("상대를 기다리는 중…", "Waiting for opponent…")
                    : s.rematchOpp ? T("한 판 더! (상대가 원해요)", "Rematch! (opponent wants one)")
                    : T("한 판 더 (초·한 바꿔서)", "Rematch (swap sides)");
                btnRematch.classList.toggle("g-primary", !!s.rematchOpp && !s.rematchMe && !s.oppLeft && !s.oppDeclined);
                if (s.meDeclined) setStatus(T("그만하기로 했어요 · 새 대결을 찾거나 컴퓨터와 둘 수 있어요", "You stopped · find a new game or play the computer"));
                else if (s.oppDeclined) setStatus(T("상대가 그만하기로 했어요 👋", "Your opponent doesn't want a rematch 👋"));
            }
        }

        /* 수 두기 (먼저 내 화면에 두고 서버에 보냄) */
        function sendMove(m) {
            var me = ON; if (!me) return;
            if (m >= 0) {
                var cap = J.makeMove(board, m);
                hist.push([m, cap]); lastMove = [(m / 100) | 0, m % 100];
                sndPlace(!!cap);
            } else { hist.push([-1, 0]); lastMove = null; toast(T("한 수 쉼", "Pass")); }
            turn = -turn; selected = -1; legalCache = [];
            me.sending = true; me.shownLen = hist.length;
            setStatus(T("보내는 중", "Sending"), "think");
            startTimer(LIMIT * 1000, false);
            draw();
            api("/move", { code: me.code, token: me.token, m: m }).then(function (res) {
                if (ON !== me) return;
                me.sending = false;
                if (res.error && res.error !== "busy") {
                    sndBuzz();
                    onErr(res.error === "incheck" ? T("장군일 때는 쉴 수 없어요.", "You can't pass while in check.")
                        : res.error === "notyourturn" ? T("지금은 상대 차례예요.", "It's your opponent's turn.")
                        : res.error === "notplaying" ? "" : T("그 수는 둘 수 없어요.", "That move isn't allowed."));
                    me.shownLen = 0;
                }
                if (res.state) applyState(res.state);
                poll();
            }).catch(function () {
                if (ON !== me) return;
                me.sending = false; me.shownLen = 0;
                onErr(netErrText());
                poll();
            });
        }
        onlineMove = sendMove;

        function onlineFinish(s) {
            over = { kind: "online", text: "" };
            selected = -1;
            stopTimer(); timerShow("end");
            var iWin = s.winner === gameSide, draw0 = s.winner === 0;
            var msg, title;
            if (draw0) { msg = T("무승부예요", "It's a draw"); title = T("무승부", "Draw"); }
            else if (s.reason === "timeout") { msg = iWin ? T("상대 시간 초과! 이겼어요 🎉", "Opponent ran out of time! You win 🎉") : T("시간 초과로 졌어요", "You ran out of time"); title = iWin ? T("승리! 🎉", "Victory! 🎉") : T("시간 초과 ⏰", "Time's up ⏰"); }
            else if (s.reason === "resign") { msg = iWin ? T("상대가 기권했어요. 이겼어요 🎉", "Your opponent resigned. You win 🎉") : T("기권했어요", "You resigned"); title = iWin ? T("승리! 🎉", "Victory! 🎉") : T("기권", "Resigned"); }
            else if (s.reason === "left") { msg = iWin ? T("상대가 나갔어요. 이겼어요", "Your opponent left. You win") : T("나가서 졌어요", "You left the game"); title = iWin ? T("승리!", "Victory!") : T("패배", "Defeat"); }
            else { msg = iWin ? T("외통수! 이겼어요 🎉", "Checkmate! You win 🎉") : T("외통수예요. 졌어요 😢", "Checkmate. You lost 😢"); title = iWin ? T("승리! 🎉", "Victory! 🎉") : T("패배", "Defeat"); }
            over.text = msg;
            setStatus(msg, draw0 ? "" : (iWin ? "win" : "lose"));
            if (!ON.recorded) {
                ON.recorded = true;
                if (draw0) onlineRecord.d++; else if (iWin) onlineRecord.w++; else onlineRecord.l++;
                save("janggiOnlineRecord.v1", onlineRecord);
                paintRecord();
                if (iWin) sndWin(); else if (!draw0) sndLose();
                var key = ON.gameKey;
                setTimeout(function () {
                    var st = ON && ON.state;
                    if (!ON || ON.gameKey !== key || ON.status !== "over" || (st && (st.oppLeft || st.oppDeclined || st.meDeclined))) return;
                    $("jResultTitle").textContent = title;
                    $("jResultSub").textContent = msg + "\n" + T("온라인", "Online") + " · " + T("나 ", "Me ") + sideTag(gameSide) + " · " + hist.length + T("수", " moves");
                    $("jAgain").textContent = T("한 판 더", "Rematch");
                    $("jAgain").hidden = false; btnStop2.hidden = false;
                    $("jResult").hidden = false;
                }, 900);
            }
        }
        function onlineRematch() {
            var me = ON; if (!me || me.status !== "over") return;
            btnRematch.disabled = true;
            readSettings();
            api("/rematch", { code: me.code, token: me.token, setup: settings.setup }).then(function (res) {
                if (ON !== me) return;
                if (res.state) applyState(res.state);
            }).catch(function () { onErr(netErrText()); btnRematch.disabled = false; });
        }
        onlineAgain = function () { $("jResult").hidden = true; onlineRematch(); };

        /* ---------- 무르기 요청/대답 (오목과 같음: 한 판에 3번, 10초 안에 대답, 그동안 시계 멈춤) ---------- */
        var btnUndoReq = document.createElement("button");
        btnUndoReq.type = "button"; btnUndoReq.className = "g-btn jo-undo-req"; btnUndoReq.hidden = true;
        btnOnResign.insertAdjacentElement("afterend", btnUndoReq);
        var elUndoAsk = document.createElement("div");
        elUndoAsk.className = "jo-undo-ask"; elUndoAsk.hidden = true;
        elUndoAsk.innerHTML = '<div class="jo-undo-card" role="alertdialog" aria-live="assertive"><p class="jo-undo-t"></p><p class="jo-undo-d"></p>' +
            '<div class="jo-undo-b"><button type="button" class="g-btn g-primary" data-a="1">' + T("↩ 허락", "↩ Allow") + "</button>" +
            '<button type="button" class="g-btn jo-stop" data-a="0">' + T("✋ 거절", "✋ Decline") + "</button></div>" +
            '<div class="jo-undo-bar"><i></i></div></div>';
        elBoard.appendChild(elUndoAsk);
        var elUndoBar = elUndoAsk.querySelector(".jo-undo-bar i");
        function undoErrText(e) {
            return e === "limit" ? T("이번 판의 무르기를 다 썼어요", "No undos left this game")
                 : e === "nomove" ? T("아직 무를 수가 없어요", "Nothing to undo yet")
                 : e === "pending" ? T("이미 무르기 요청 중이에요", "An undo request is already pending")
                 : e === "notstarted" ? T("시작한 뒤에 쓸 수 있어요", "Wait until the game starts")
                 : e === "nopending" ? "" : T("무르기를 하지 못했어요", "Couldn't undo");
        }
        btnUndoReq.addEventListener("click", function () {
            sndBtn();
            var me = ON; if (!me || !me.state) return;
            btnUndoReq.disabled = true;
            api("/undo", { code: me.code, token: me.token }).then(function (res) {
                if (ON !== me) return;
                if (res.error && res.error !== "busy") onErr(undoErrText(res.error));
                if (res.state) applyState(res.state); else paintUndo(me.state);
            }).catch(function () { if (ON === me) { onErr(netErrText()); paintUndo(me.state); } });
        });
        elUndoAsk.addEventListener("click", function (ev) {
            var b = ev.target.closest && ev.target.closest("button[data-a]"); if (!b) return;
            ev.stopPropagation();
            sndBtn();
            var me = ON; if (!me) return;
            elUndoAsk.hidden = true;
            api("/undoreply", { code: me.code, token: me.token, accept: b.getAttribute("data-a") === "1" }).then(function (res) {
                if (ON !== me) return;
                if (res.error && res.error !== "busy") { var t = undoErrText(res.error); if (t) onErr(t); }
                if (res.state) applyState(res.state);
            }).catch(function () { if (ON === me) onErr(netErrText()); });
        });
        function paintUndo(s) {
            var playing = s && s.status === "playing";
            btnUndoReq.hidden = !playing;
            if (!playing) return;
            var mySlot = gameSide > 0 ? 0 : 1;
            var mine = s.moves.some(function (m, i) { return i % 2 === mySlot; });
            btnUndoReq.disabled = !mine || !!s.undoReq || s.undoLeft <= 0 || s.startIn > 300 || (ON && ON.cdUntil > Date.now());
            btnUndoReq.textContent = s.undoReq === "me" ? T("↩ 무르기 요청 중…", "↩ Undo requested…")
                : T("↩ 무르기 요청", "↩ Ask to undo") + " (" + T(s.undoLeft + "번 남음", s.undoLeft + " left") + ")";
        }
        function showUndo(s) {
            stopTimer(); timerShow("idle"); elTimerNum.textContent = "⏸";
            var key = s.undoReq + ":" + s.games + ":" + s.moves.length;
            var fresh = ON.undoKey !== key; ON.undoKey = key;
            if (s.undoReq === "opp") {
                elUndoAsk.querySelector(".jo-undo-t").textContent = T("상대가 무르기를 요청했어요", "Your opponent asks to undo");
                elUndoAsk.querySelector(".jo-undo-d").textContent = T("허락하면 상대의 마지막 수까지 되돌리고 상대가 다시 둬요", "If you allow, their last move is taken back and they play again");
                elUndoAsk.hidden = false;
                if (fresh) {
                    sndChat();
                    elUndoBar.style.transition = "none"; elUndoBar.style.width = (s.undoWait / 100) + "%";
                    void elUndoBar.offsetWidth;
                    elUndoBar.style.transition = "width " + s.undoWait + "ms linear"; elUndoBar.style.width = "0%";
                }
                setStatus(T("무르기 요청이 왔어요 · 허락할까요? (시계 멈춤)", "Undo request · allow it? (clock paused)"), "think");
            } else {
                elUndoAsk.hidden = true;
                setStatus(T("무르기 요청 중… 상대의 대답을 기다려요 (시계 멈춤)", "Undo requested… waiting for your opponent (clock paused)"), "think");
            }
        }
        function hideUndo() { elUndoAsk.hidden = true; if (ON) ON.undoKey = ""; }
        function flashBoard(msg) {
            var old = elBoard.querySelector(".jo-flash"); if (old) old.remove();
            var el = document.createElement("div");
            el.className = "jo-flash"; el.textContent = msg; el.setAttribute("role", "status");
            elBoard.appendChild(el);
            setTimeout(function () { el.classList.add("out"); }, 2000);
            setTimeout(function () { el.remove(); }, 2400);
        }
        function handleUndoNote(s) {
            var n = s.undoNote;
            if (!ON.undoInit) { ON.undoInit = true; ON.undoNoteT = n ? n.t : 0; return; }
            if (!n || !n.t || ON.undoNoteT === n.t) return;
            ON.undoNoteT = n.t;
            if (n.r === "ok") ON.shownLen = 0;          // 되돌린 뒤 판이 새로 그려질 때 소리 안 나게
            var msg = n.mine
                ? (n.r === "ok" ? T("상대가 무르기를 허락했어요 ↩ 다시 두세요", "Undo allowed ↩ play again")
                   : n.r === "no" ? T("상대가 무르기를 거절했어요", "Your opponent declined the undo")
                   : T("상대가 대답하지 않아 무르기가 취소됐어요", "No answer — undo canceled"))
                : (n.r === "ok" ? T("무르기를 허락했어요 ↩", "You allowed the undo ↩")
                   : n.r === "no" ? T("무르기를 거절했어요", "You declined the undo")
                   : T("대답 시간이 지나 무르기를 거절했어요", "Time ran out — undo declined"));
            flashBoard(msg);
            if (n.r === "ok") sndBtn(); else sndBuzz();
        }

        /* ======================= 온라인 대화 (오목과 같음) =======================
           방 코드(친구) 방: 자유 글 100자 + 이모지 / 빠른 매칭(모르는 사람): 정해진 말만
           🔇 대화 끄기: 이 기기만 (janggiChatOff.v1), 폰에서는 화면 아래에 붙음(접기 janggiChatMin.v1) */
        /* 정해진 말 (번호 순서를 바꾸지 마세요: 서버는 번호 0~7만 받아요) */
        var CHAT_PRESETS = [
            T("안녕하세요 👋", "Hi 👋"),
            T("잘 부탁해요 🙂", "Have a good game 🙂"),
            T("좋은 수네요!", "Nice move!"),
            T("앗, 실수 😅", "Oops 😅"),
            T("음… 고민 중 🤔", "Hmm… thinking 🤔"),
            T("한 판 더?", "One more game?"),
            T("수고하셨어요 👍", "Good game 👍"),
            T("고마워요 😊", "Thank you 😊")
        ];
        var CHAT_EMOJI = ["😀", "😂", "👍", "👏", "😅", "🤔", "🎉", "😭"];
        var chatOff = !!load("janggiChatOff.v1", false);
        var chatCode = "", chatUnread = 0, chatBusyUntil = 0;
        var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
        var elChat = document.createElement("div");
        elChat.className = "jo-chat"; elChat.hidden = true;
        elChat.innerHTML =
            '<div class="jo-chat-head"><span>💬 ' + T("대화", "Chat") + '</span><button type="button" class="jo-chat-off"></button></div>' +
            '<div class="jo-chat-body">' +
                '<div class="jo-chat-log" role="log" aria-live="polite" aria-label="' + T("대화 내용", "Messages") + '"></div>' +
                '<div class="jo-chat-presets" aria-label="' + T("정해진 말", "Quick phrases") + '"></div>' +
                '<div class="jo-chat-free">' +
                    '<div class="jo-chat-form"><input type="text" maxlength="100" autocomplete="off" enterkeyhint="send" placeholder="' + T("메시지 (100자까지)", "Message (up to 100 chars)") + '" aria-label="' + T("보낼 메시지", "Message") + '">' +
                    '<button type="button" class="g-btn jo-chat-send">' + T("보내기", "Send") + "</button></div>" +
                    '<div class="jo-chat-emo"></div>' +
                "</div>" +
                '<p class="jo-chat-note"></p>' +
            "</div>" +
            '<p class="jo-chat-offmsg" hidden>' + T("대화를 껐어요. 다시 켜면 그동안 온 대화도 볼 수 있어요.", "Chat is off. Turn it back on to see messages.") + "</p>";
        elPlay.appendChild(elChat);
        var chatMinBtn = document.createElement("button");
        chatMinBtn.type = "button"; chatMinBtn.className = "jo-chat-min";
        elChat.querySelector(".jo-chat-head").insertBefore(chatMinBtn, elChat.querySelector(".jo-chat-off"));
        var chatMin = !!load("janggiChatMin.v1", false);
        var dockMq = window.matchMedia ? window.matchMedia("(max-width: 760px)") : { matches: false };
        var chatLog = elChat.querySelector(".jo-chat-log"), chatIn = elChat.querySelector("input"),
            chatSendBtn = elChat.querySelector(".jo-chat-send"), chatNote = elChat.querySelector(".jo-chat-note"),
            chatOffBtn = elChat.querySelector(".jo-chat-off"), chatBody = elChat.querySelector(".jo-chat-body"),
            chatOffMsg = elChat.querySelector(".jo-chat-offmsg"), chatFree = elChat.querySelector(".jo-chat-free");
        function docked() { return elChat.classList.contains("jo-chat-dock"); }
        function paintChatMin() {
            var min = docked() && chatMin;
            elChat.classList.toggle("is-min", min);
            chatMinBtn.hidden = !docked();
            chatMinBtn.textContent = min ? T("펴기 ▴", "Open ▴") + (chatUnread && !chatOff ? " (" + chatUnread + ")" : "") : T("접기 ▾", "Hide ▾");
            chatMinBtn.classList.toggle("has-new", min && chatUnread > 0 && !chatOff);
            syncDockPad();
        }
        function syncDockPad() {
            var v = docked() && !elChat.hidden ? (elChat.offsetHeight + 10) + "px" : "";
            if (document.body.style.paddingBottom !== v) document.body.style.paddingBottom = v;
        }
        function placeChat() {
            if (dockMq.matches) { if (elChat.parentNode !== document.body) document.body.appendChild(elChat); elChat.classList.add("jo-chat-dock"); }
            else { if (elChat.parentNode !== elPlay) elPlay.appendChild(elChat); elChat.classList.remove("jo-chat-dock"); }
            paintChatMin();
        }
        if (dockMq.addEventListener) dockMq.addEventListener("change", placeChat); else if (dockMq.addListener) dockMq.addListener(placeChat);
        chatMinBtn.addEventListener("click", function () {
            sndBtn();
            chatMin = !chatMin; if (!chatMin) chatUnread = chatOff ? chatUnread : 0;
            save("janggiChatMin.v1", chatMin);
            paintChatMin();
            if (!chatMin) chatLog.scrollTop = chatLog.scrollHeight;
        });
        setInterval(function () {
            var st = ON && ON.state;
            var show = !!(st && st.status !== "waiting" && !elPlay.hidden && mode === "online");
            if (elChat.hidden === show) elChat.hidden = !show;
            syncDockPad();
        }, 300);
        CHAT_PRESETS.forEach(function (txt, i) {
            var b = document.createElement("button");
            b.type = "button"; b.textContent = txt;
            b.addEventListener("click", function () { sndBtn(); sendChat({ p: i }); });
            elChat.querySelector(".jo-chat-presets").appendChild(b);
        });
        CHAT_EMOJI.forEach(function (em) {
            var b = document.createElement("button");
            b.type = "button"; b.textContent = em; b.setAttribute("aria-label", em);
            b.addEventListener("click", function () {
                if (Array.from(chatIn.value).length + Array.from(em).length > 100) return;
                chatIn.value += em;
                if (!coarse) chatIn.focus();
            });
            elChat.querySelector(".jo-chat-emo").appendChild(b);
        });
        /* 2026-11-25: PC에서 메시지 입력칸이 좁아서 — 입력칸을 한 줄 통째로 쓰고, 이모지·보내기는 그 아래 줄로 (모양은 css) */
        (function () { var f = elChat.querySelector(".jo-chat-form"), e = elChat.querySelector(".jo-chat-emo"); if (f && e) f.appendChild(e); })();
        function chatNoteSet(t, warn) { chatNote.textContent = t; chatNote.classList.toggle("warn", !!warn); }
        function chatDefaultNote() {
            chatNoteSet(ON && ON.quick ? T("모르는 상대와는 정해진 말만 보낼 수 있어요.", "With random opponents you can only send quick phrases.")
                                       : T("두 사람만 보여요 · 하루 뒤 지워져요", "Only you two can see this · deleted after a day"));
        }
        function paintChatOff() {
            chatOffBtn.textContent = chatOff ? "💬 " + T("대화 켜기", "Chat on") + (chatUnread ? " (" + chatUnread + ")" : "") : "🔇 " + T("대화 끄기", "Chat off");
            chatOffBtn.setAttribute("aria-pressed", chatOff ? "true" : "false");
            chatOffBtn.classList.toggle("has-new", chatOff && chatUnread > 0);
            chatBody.hidden = chatOff; chatOffMsg.hidden = !chatOff;
            if (!chatOff) chatLog.scrollTop = chatLog.scrollHeight;
            paintChatMin();
        }
        chatOffBtn.addEventListener("click", function () {
            sndBtn();
            chatOff = !chatOff; chatUnread = 0;
            save("janggiChatOff.v1", chatOff);
            paintChatOff();
        });
        function chatRow(m) {
            var row = document.createElement("div");
            row.className = "jo-msg " + (m.mine ? "mine" : "theirs");
            var who = document.createElement("small");
            who.textContent = m.mine ? T("나", "Me") : T("상대", "Opponent");
            var b = document.createElement("span");
            b.textContent = (m.p !== null && m.p !== undefined) ? (CHAT_PRESETS[m.p] || "…") : (m.text || "");   // 글은 textContent로만 (안전)
            row.appendChild(who); row.appendChild(b);
            chatLog.appendChild(row);
            while (chatLog.children.length > 60) chatLog.removeChild(chatLog.firstChild);
        }
        function chatReceive(me, list, quiet) {
            if (!list || !list.length) return;
            var gotNew = false;
            list.forEach(function (m) {
                if (m.id <= (me.cid || 0)) return;
                me.cid = m.id;
                chatRow(m);
                if (!m.mine) gotNew = true;
            });
            chatLog.scrollTop = chatLog.scrollHeight;
            if (gotNew && !quiet) {
                if (chatOff) { chatUnread++; paintChatOff(); }
                else { sndChat(); if (docked() && chatMin) { chatUnread++; paintChatMin(); } }
            }
        }
        function chatSync(s) {
            var me = ON; if (!me) return;
            if (chatCode !== me.code) {
                chatCode = me.code; chatLog.innerHTML = ""; chatUnread = 0;
                chatFree.hidden = !!me.quick;
                chatDefaultNote(); paintChatOff();
            }
            me.cver = s.cver;
            var first = !me.chatLoaded; me.chatLoaded = true;
            chatReceive(me, s.chat, first);
            elChat.hidden = s.status === "waiting";
        }
        function sendChat(payload) {
            var me = ON; if (!me) return;
            if (Date.now() < chatBusyUntil) return;
            if (payload.text !== undefined) {
                payload.text = payload.text.replace(/\s+/g, " ").trim();
                if (!payload.text) return;
            }
            chatBusyUntil = Date.now() + 1000;
            payload.code = me.code; payload.token = me.token; payload.cid = me.cid || 0;
            chatSendBtn.disabled = true;
            setTimeout(function () { chatSendBtn.disabled = false; }, 1000);
            api("/chat", payload).then(function (res) {
                if (ON !== me) return;
                if (res.error) {
                    chatNoteSet(res.error === "slow" ? T("조금 천천히 보내 주세요 🙂", "Please slow down a little 🙂")
                        : res.error === "presetonly" ? T("모르는 상대와는 정해진 말만 보낼 수 있어요.", "Only quick phrases with random opponents.")
                        : res.error === "nopartner" ? T("상대가 들어오면 대화할 수 있어요.", "You can chat once your opponent joins.")
                        : T("보내지 못했어요. 다시 해 보세요.", "Couldn't send. Please try again."), true);
                    setTimeout(chatDefaultNote, 3000);
                    return;
                }
                if (payload.text !== undefined) chatIn.value = "";
                chatReceive(me, res.chat, true);
            }).catch(function () {
                if (ON !== me) return;
                chatNoteSet(T("보내지 못했어요. 연결을 확인해 주세요.", "Couldn't send. Check your connection."), true);
                setTimeout(chatDefaultNote, 3000);
            });
        }
        chatSendBtn.addEventListener("click", function () { sndBtn(); sendChat({ text: chatIn.value }); });
        chatIn.addEventListener("keydown", function (ev) {
            if (ev.key !== "Enter" || ev.isComposing || ev.keyCode === 229) return;   // 한글 조합 중 Enter는 무시
            ev.preventDefault();
            sendChat({ text: chatIn.value });
        });
        placeChat();

        /* ---------- 버튼 ---------- */
        elOnBtn.addEventListener("click", function () { sndBtn(); enterOnline(); });
        $("joQuick").addEventListener("click", function () { sndBtn(); begin("/quick"); });
        $("joCreate").addEventListener("click", function () { sndBtn(); begin("/create"); });
        $("joJoin").addEventListener("click", function () { sndBtn(); begin("/join", { code: inCode.value }); });
        inCode.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); $("joJoin").click(); } });
        inCode.addEventListener("input", function () { inCode.value = inCode.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4); });
        $("joCancel").addEventListener("click", function () { sndBtn(); var q = ON; leaveOnline(true); if (q) enterOnline(); });
        function roomLink() { return location.origin + location.pathname + "?room=" + (ON ? ON.code : ""); }
        function inviteText() { return T("🎮 장기 한 판 해요! 아래 링크를 누르면 바로 들어와요 (방 코드 ", "🎮 Let's play Janggi! Tap the link to join (room code ") + (ON ? ON.code : "") + ")"; }
        $("joCopy").addEventListener("click", function () {
            sndBtn();
            if (!ON) return;
            var link = roomLink(), text = inviteText() + "\n" + link;
            var done = function () { $("joCopy").textContent = T("복사했어요 ✓", "Copied ✓"); setTimeout(function () { $("joCopy").textContent = T("링크 복사", "Copy link"); }, 1800); };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { prompt(T("이 링크를 복사하세요", "Copy this link"), link); });
            else prompt(T("이 링크를 복사하세요", "Copy this link"), link);
        });
        if (navigator.share) {
            var shareBtn = document.createElement("button");
            shareBtn.type = "button"; shareBtn.className = "g-btn jo-share";
            shareBtn.textContent = T("📤 카톡 등으로 보내기", "📤 Share (KakaoTalk etc.)");
            $("joCopy").insertAdjacentElement("afterend", shareBtn);
            shareBtn.addEventListener("click", function () {
                sndBtn();
                if (!ON) return;
                navigator.share({ title: T("장기 한 판 해요!", "Let's play Janggi!"), text: inviteText(), url: roomLink() }).catch(function () {});
            });
        }
        btnOnResign.addEventListener("click", function () {
            sndBtn();
            var me = ON; if (!me || me.status !== "playing") return;
            if (!confirm(T("정말 기권할까요?", "Resign this game?"))) return;
            api("/resign", { code: me.code, token: me.token }).then(function (res) { if (ON === me && res.state) applyState(res.state); }).catch(function () { onErr(netErrText()); });
        });
        btnRematch.addEventListener("click", function () { sndBtn(); onlineRematch(); });
        function onlineDecline() {
            var me = ON; if (!me || me.status !== "over") return;
            $("jResult").hidden = true;
            btnStop.disabled = true;
            api("/decline", { code: me.code, token: me.token }).then(function (res) {
                btnStop.disabled = false;
                if (ON === me && res.state) applyState(res.state);
            }).catch(function () { btnStop.disabled = false; onErr(netErrText()); });
        }
        btnStop.addEventListener("click", function () { sndBtn(); onlineDecline(); });
        btnStop2.addEventListener("click", function () { sndBtn(); onlineDecline(); });
        btnNewOpp.addEventListener("click", function () { sndBtn(); leaveOnline(true); enterOnline(); });
        $("joBack").addEventListener("click", function () {
            sndBtn();
            if (ON && ON.status === "playing" && !confirm(T("두는 중에 나가면 기권으로 져요. 나갈까요?", "Leaving now counts as resigning. Leave?"))) return;
            leaveOnline(false);
        });
        /* 종료: 두는 중이면 "기권으로 져요" 한 번 묻고 창 닫기 */
        function onlineExit() {
            sndBtn();
            if (ON && ON.status === "playing" && !confirm(T("두는 중에 나가면 기권으로 져요. 종료할까요?", "Leaving now counts as resigning. Exit?"))) return;
            if (ON) leaveOnline(true);
            setTimeout(function () {
                window.close();
                setTimeout(function () { if (!window.closed) location.href = T("index.html", "index-en.html"); }, 250);
            }, 300);
        }
        var btnOnExit = document.createElement("button");
        btnOnExit.type = "button"; btnOnExit.className = "g-btn g-exit jo-on-exit";
        btnOnExit.textContent = T("✖ 종료", "✖ Exit"); btnOnExit.title = T("장기 창 닫기", "Close Janggi");
        btnOnExit.addEventListener("click", onlineExit);
        btnNewOpp.insertAdjacentElement("afterend", btnOnExit);
        btnResultExit.addEventListener("click", onlineExit);
        onlineSetupChanged = function () { if (!ON || ON.status === "waiting") { resetBoard(); draw(); } };
        onlinePass = function () {
            if (!canMove() || J.inCheck(board, turn)) return;
            sndBtn(); sendMove(-1);
        };

        /* 기록 칸에 온라인 전적 한 줄 */
        onlineRecordText = function () {
            var r = onlineRecord;
            return T("온라인 · " + r.w + "승 " + r.l + "패" + (r.d ? " " + r.d + "무" : ""), "Online · " + r.w + "W " + r.l + "L" + (r.d ? " " + r.d + "D" : ""));
        };

        /* 주소에 ?room=ABCD 가 있으면 바로 그 방으로 / 새로고침이면 하던 방으로 */
        autoOnline = function () {
            var saved = null;
            saved = sessLoad();
            var m = /[?&]room=([A-Za-z0-9]{4})/.exec(location.search);
            if (saved && saved.code && saved.token && (!m || m[1].toUpperCase() === saved.code)) {
                enterOnline();
                ON = { code: saved.code, token: saved.token, ver: 0, status: "waiting", quick: !!saved.quick, gameKey: "", resumed: true, resumedFrom: true };
                showWaiting();
                poll();
                return;
            }
            if (m) { enterOnline(); inCode.value = m[1].toUpperCase(); begin("/join", { code: m[1] }); }
        };
    })();

    /* 시작 */
    paintSettings(); paintRecord();
    if (restore()) {
        refreshLegal(); draw();
        if (hist.length) showStart(true); else { save("janggiState.v1", null); newGame(); }
    } else newGame();
    if (!legalCache) refreshLegal();
    if (autoOnline) autoOnline();
})();
