window.T = window.T || function (ko) { return ko; };   /* lang.js가 없어도 한국어로 동작 */
/* =========================================================
   2048 (game2048.html) — 2026-11-13
   - 방향키·WASD, 손가락/마우스로 밀기
   - 되돌리기 1번, 소리(Web Audio로 직접 만듦, 파일 없음)
   - 기기에 기억: 하던 게임 g2048State.v1, 최고 점수·기록 g2048Record.v1, 소리 g2048Muted.v1, 배경음악 g2048Music.v1
   - 2026-11-20 배경음악: 직접 작곡한 8비트풍 곡을 Web Audio로 연주, 계속 반복 (♪ 버튼)
   ========================================================= */
(function () {
    "use strict";

    var SIZE = 4;
    var SLIDE_MS = 110;        // 타일이 미끄러지는 시간 (game2048.css의 --speed와 같게)
    var FOUR_CHANCE = 0.1;     // 새 타일이 4일 확률
    var GOAL = 2048;

    function $(id) { return document.getElementById(id); }
    function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
    function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 무시 */ } }

    var elTiles = $("gTiles"), elBoard = $("gBoard");
    var elScore = $("gScore"), elBest = $("gBest"), elPlus = $("gPlus");
    var elResult = $("gResult"), elResultTitle = $("gResultTitle"), elResultSub = $("gResultSub");
    var btnKeep = $("gKeep"), btnUndo = $("gUndo"), btnSound = $("gSound");
    var elRecord = $("gRecord"), elHint = $("gHint");
    var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

    var muted = !!load("g2048Muted.v1", false);
    var musicOn = load("g2048Music.v1", true) !== false;   // 배경음악 (처음엔 켜짐)
    var record = load("g2048Record.v1", null) || { best: 0, maxTile: 0, games: 0, wins: 0 };

    /* ======================= 소리 ======================= */
    var actx = null, noiseBuf = null;
    function audio() {
        if (muted) return null;
        return ctx();
    }
    /* 효과음 끄기와 상관없이 소리 장치 준비 (배경음악도 같이 씀) */
    function ctx() {
        try {
            if (!actx) {
                var AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return null;
                actx = new AC();
                noiseBuf = actx.createBuffer(1, Math.floor(actx.sampleRate * 0.12), actx.sampleRate);
                var d = noiseBuf.getChannelData(0);
                for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
            }
            if (actx.state === "suspended") actx.resume();
            return actx;
        } catch (e) { return null; }
    }
    /* 미끄러지는 "스윽" */
    function sndSlide() {
        var a = audio(); if (!a) return;
        var t = a.currentTime;
        var src = a.createBufferSource(); src.buffer = noiseBuf;
        var f = a.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 0.9;
        f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(1600, t + 0.09);
        var g = a.createGain(); g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
        src.connect(f); f.connect(g); g.connect(a.destination); src.start(t);
    }
    /* 합쳐질 때 "띵" — 숫자가 클수록 높은 소리 */
    function sndMerge(v) {
        var a = audio(); if (!a) return;
        var t = a.currentTime + SLIDE_MS / 1000;
        var k = Math.log2(v);                       // 4 → 2, 2048 → 11
        var freq = 330 * Math.pow(2, (k - 2) * 2 / 12);
        [[freq, 0.22, "triangle"], [freq * 2, 0.06, "sine"]].forEach(function (n) {
            var o = a.createOscillator(); o.type = n[2]; o.frequency.value = n[0];
            var g = a.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(n[1], t + 0.015);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
            o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.2);
        });
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
    function sndWin()  { tones([[523, 0, 0.18], [659, 0.13, 0.18], [784, 0.26, 0.18], [1047, 0.39, 0.5]]); }
    function sndLose() { tones([[392, 0, 0.25], [330, 0.2, 0.25], [262, 0.4, 0.5]], "sine", 0.2); }
    function sndClick() { tones([[880, 0, 0.05]], "sine", 0.12); }
    function sndBump() { tones([[160, 0, 0.07]], "sine", 0.1); }   // 움직일 수 없는 쪽으로 밀었을 때


    /* ======================= 배경음악 (2026-11-20) =======================
       직접 작곡한 경쾌한 8비트풍 곡 (C장조, 16마디, 약 25초, 2026-11-20 저녁 낮은·가운데 음역으로 내림) — 끝나면 처음부터 계속 반복.
       파일 없이 Web Audio로 연주: 멜로디(부드러운 사각파+삼각파, C4~F5) + 베이스(삼각파) + 가벼운 드럼(높은 칙 소리 줄임).
       - 속도: BGM_BPM, 전체 크기: BGM_VOL
       - 브라우저 정책상 첫 키·클릭·밀기를 한 뒤부터 나옴
       - 게임이 끝나면 멈추고, 새 게임·되돌리기를 하면 다시 나옴. 창을 내리면 잠시 멈춤 */
    var BGM_BPM = 150;
    var BGM_VOL = 0.55;
    var EIGHTH = 30 / BGM_BPM;          // 8분음표 길이(초)

    function nf(name) {                 // "C5" → 주파수
        var m = /^([A-G])(#?)(\d)$/.exec(name);
        var semi = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0);
        var midi = (parseInt(m[3], 10) + 1) * 12 + semi;
        return 440 * Math.pow(2, (midi - 69) / 12);
    }
    // 멜로디: [음, 길이(8분음표 개수)], "-"는 쉼표. 한 마디 = 8
    var BGM_LEAD = [
        // A (1~8마디)
        ["E4",1],["G4",1],["C5",2],["G4",1],["E4",1],["G4",2],
        ["A4",1],["G4",1],["E4",2],["C4",1],["D4",1],["E4",2],
        ["F4",1],["A4",1],["C5",2],["A4",1],["F4",1],["A4",1],["C5",1],
        ["B4",2],["A4",1],["G4",1],["D4",2],["-",2],
        ["E4",1],["G4",1],["C5",2],["D5",1],["C5",1],["B4",1],["C5",1],
        ["A4",2],["E4",1],["A4",1],["C5",2],["B4",1],["A4",1],
        ["F4",1],["E4",1],["D4",1],["F4",1],["G4",2],["B4",2],
        ["C5",3],["G4",1],["C5",2],["-",2],
        // B (9~16마디)
        ["A4",1],["C5",1],["A4",1],["F4",1],["A4",2],["C5",2],
        ["B4",1],["D5",1],["B4",1],["G4",1],["B4",2],["D5",2],
        ["G4",1],["B4",1],["G4",1],["E4",1],["G4",1],["B4",1],["E5",2],
        ["C5",2],["B4",1],["A4",1],["E4",2],["A4",2],
        ["F4",1],["A4",1],["C5",1],["F5",1],["E5",2],["C5",2],
        ["D5",1],["C5",1],["B4",1],["A4",1],["G4",2],["B4",2],
        ["D5",1],["-",1],["D5",1],["-",1],["D5",1],["E5",1],["F5",2],
        ["E5",2],["C5",1],["G4",1],["C5",2],["-",2]
    ];
    // 베이스: 반 마디(4칸)마다 화음의 바탕음
    var BGM_BASS = ["C","C","A","A","F","F","G","G","C","C","A","A","D","G","C","C",
                    "F","F","G","G","E","E","A","A","F","F","G","G","G","G","C","G"];
    var BGM_STEPS = 128;
    var bgmLead = {};                    // 칸 번호 → [주파수, 길이]
    (function () {
        var pos = 0;
        BGM_LEAD.forEach(function (n) {
            if (n[0] !== "-") bgmLead[pos] = [nf(n[0]), n[1]];
            pos += n[1];
        });
    })();

    var bgm = { playing: false, step: 0, next: 0, timer: null, bus: null, held: false };

    function bgmBus() {
        var a = ctx(); if (!a) return null;
        if (!bgm.bus) {
            bgm.bus = a.createGain(); bgm.bus.gain.value = BGM_VOL;
            bgm.bus.connect(a.destination);
        }
        return a;
    }
    function bgmNote(a, type, freq, t, len, vol, cutoff) {
        var o = a.createOscillator(); o.type = type; o.frequency.value = freq;
        var g = a.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
        g.gain.setValueAtTime(vol * 0.75, t + Math.min(0.06, len * 0.4));
        g.gain.exponentialRampToValueAtTime(0.0001, t + len * 0.92);
        if (cutoff) {
            var f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = cutoff;
            o.connect(f); f.connect(g);
        } else o.connect(g);
        g.connect(bgm.bus); o.start(t); o.stop(t + len);
    }
    function bgmNoise(a, t, len, vol, hp) {
        var s = a.createBufferSource(); s.buffer = noiseBuf;
        var f = a.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
        var g = a.createGain();
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        s.connect(f); f.connect(g); g.connect(bgm.bus); s.start(t); s.stop(t + len + 0.02);
    }
    function bgmKick(a, t) {
        var o = a.createOscillator(); o.type = "sine";
        o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        var g = a.createGain();
        g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
        o.connect(g); g.connect(bgm.bus); o.start(t); o.stop(t + 0.16);
    }
    function bgmPlayStep(a, s, t) {
        var lead = bgmLead[s];
        if (lead) {   // 멜로디: 가운데 음역(C4~F5), 부드럽게 깎은 사각파 + 같은 음 삼각파를 겹침
            bgmNote(a, "square", lead[0], t, lead[1] * EIGHTH, 0.045, 1100);
            bgmNote(a, "triangle", lead[0], t, lead[1] * EIGHTH, 0.1);
        }
        // 베이스: 바탕음 낮게·높게 번갈아 (통통 튀는 느낌)
        var root = BGM_BASS[Math.floor(s / 4)];
        bgmNote(a, "triangle", nf(root + (s % 2 ? "3" : "2")), t, EIGHTH * 0.9, 0.2);
        // 드럼: 1·3박 쿵, 2·4박 탁, 8분마다 칙
        var inBar = s % 8;
        if (inBar === 0 || inBar === 4) bgmKick(a, t);
        if (inBar === 2 || inBar === 6) bgmNoise(a, t, 0.08, 0.08, 700);
        if (s % 2) bgmNoise(a, t, 0.025, 0.014, 3500);   // 칙: 뒷박에만 아주 작게
    }
    function bgmTick() {
        var a = actx; if (!a || !bgm.playing) return;
        while (bgm.next < a.currentTime + 0.15) {
            bgmPlayStep(a, bgm.step, bgm.next);
            bgm.next += EIGHTH;
            bgm.step = (bgm.step + 1) % BGM_STEPS;
        }
    }
    /* 켜져 있고, 게임 중이고, 창이 보일 때만 연주 */
    function bgmWanted() { return musicOn && !over && !bgm.held && !document.hidden; }
    function bgmSync() {
        if (bgmWanted()) bgmStart(); else bgmStop();
    }
    function bgmStart() {
        if (bgm.playing || !gestured) return;
        var a = bgmBus(); if (!a) return;
        if (a.state === "suspended") a.resume();
        var t = a.currentTime;
        bgm.bus.gain.cancelScheduledValues(t);
        bgm.bus.gain.setValueAtTime(0.0001, t);
        bgm.bus.gain.exponentialRampToValueAtTime(BGM_VOL, t + 0.4);
        bgm.next = t + 0.08;
        bgm.playing = true;
        bgmTick();
        bgm.timer = setInterval(bgmTick, 25);
    }
    function bgmStop() {
        if (!bgm.playing) return;
        bgm.playing = false;
        clearInterval(bgm.timer); bgm.timer = null;
        if (actx && bgm.bus) {
            var t = actx.currentTime;
            bgm.bus.gain.cancelScheduledValues(t);
            bgm.bus.gain.setValueAtTime(bgm.bus.gain.value, t);
            bgm.bus.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        }
    }
    /* 2048 팡파레 동안 잠깐 쉬었다가 이어서 */
    function bgmPause(ms) {
        bgm.held = true; bgmSync();
        setTimeout(function () { bgm.held = false; bgmSync(); }, ms);
    }
    var gestured = false;                // 첫 키·클릭·밀기를 했는지 (브라우저 자동 재생 정책)
    function firstGesture() {
        if (gestured) return;
        gestured = true;
        bgmSync();
    }
    document.addEventListener("keydown", firstGesture, true);
    document.addEventListener("pointerdown", firstGesture, true);
    document.addEventListener("visibilitychange", bgmSync);

    /* ======================= 게임 상태 ======================= */
    // grid[r][c] = 타일 { id, v } 또는 null
    var grid, score, won, keepGoing, over, nextId = 1;
    var undoSnap = null;
    var els = {};               // id → 타일 요소
    var pending = null;         // 미끄러진 뒤 마무리할 일 (빠르게 연속으로 밀면 바로 마무리)

    function emptyGrid() {
        var g = [];
        for (var r = 0; r < SIZE; r++) { g.push([null, null, null, null]); }
        return g;
    }
    function emptyCells() {
        var list = [];
        for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) if (!grid[r][c]) list.push([r, c]);
        return list;
    }
    function addRandom() {
        var cells = emptyCells();
        if (!cells.length) return null;
        var p = cells[Math.floor(Math.random() * cells.length)];
        var t = { id: nextId++, v: Math.random() < FOUR_CHANCE ? 4 : 2, isNew: true };
        grid[p[0]][p[1]] = t;
        return t;
    }
    function snapshot() {
        return {
            cells: grid.map(function (row) { return row.map(function (t) { return t ? t.v : 0; }); }),
            score: score, won: won, keepGoing: keepGoing
        };
    }
    function restore(s) {
        grid = emptyGrid();
        for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) {
            var v = s.cells[r][c];
            if (v) grid[r][c] = { id: nextId++, v: v };
        }
        score = s.score || 0; won = !!s.won; keepGoing = !!s.keepGoing; over = false;
    }
    function validSave(s) {
        if (!s || !s.cells || s.cells.length !== SIZE) return false;
        var any = false;
        for (var r = 0; r < SIZE; r++) {
            if (!s.cells[r] || s.cells[r].length !== SIZE) return false;
            for (var c = 0; c < SIZE; c++) {
                var v = s.cells[r][c];
                if (v !== 0 && !(v >= 2 && (v & (v - 1)) === 0)) return false;
                if (v) any = true;
            }
        }
        return any;
    }
    function persist() { save("g2048State.v1", snapshot()); }

    /* ======================= 그리기 ======================= */
    function tileClass(t) {
        var digits = String(t.v).length;
        return "g-tile " + (t.v <= GOAL ? "v" + t.v : "vbig") + (digits >= 3 ? " d" + Math.min(digits, 5) : "");
    }
    function placeEl(el, r, c) { el.style.setProperty("--r", r); el.style.setProperty("--c", c); }
    function makeEl(t, r, c, anim) {
        var el = document.createElement("div");
        el.className = tileClass(t) + (anim ? " " + anim : "");
        placeEl(el, r, c);
        var b = document.createElement("b"); b.textContent = t.v; el.appendChild(b);
        elTiles.appendChild(el);
        els[t.id] = el;
        return el;
    }
    /* 처음부터 다시 그리기 (불러오기·되돌리기·새 게임) */
    function rebuild() {
        elTiles.innerHTML = ""; els = {};
        for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) {
            var t = grid[r][c];
            if (t) { makeEl(t, r, c, t.isNew ? "new" : ""); t.isNew = false; }
        }
        showScore(0);
    }
    function showScore(gain) {
        elScore.textContent = score;
        if (score > record.best) { record.best = score; save("g2048Record.v1", record); }
        elBest.textContent = record.best;
        if (gain > 0) {
            elPlus.textContent = "+" + gain;
            elPlus.classList.remove("go"); void elPlus.offsetWidth; elPlus.classList.add("go");
        }
        btnUndo.disabled = !undoSnap;
        showRecord();
    }
    function showRecord() {
        elRecord.innerHTML =
            T("최고 점수 <b>", "Best score <b>") + record.best.toLocaleString() + "</b><br>" +
            T("가장 큰 타일 <b>", "Biggest tile <b>") + (record.maxTile || "-") + "</b><br>" +
            T("끝낸 판 <b>" + record.games + "</b> · 2048 달성 <b>" + record.wins + "</b>번", "Games played <b>" + record.games + "</b> · Reached 2048 <b>" + record.wins + "</b>×");
    }

    /* ======================= 움직이기 ======================= */
    var DIRS = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] };

    function finishPending() {
        if (!pending) return;
        clearTimeout(pending.timer);
        var p = pending; pending = null;
        p.run();
    }

    function move(dir) {
        if (over || !elResult.hidden) return;
        finishPending();
        var d = DIRS[dir];
        var before = snapshot();
        var moved = false, gain = 0, bestMerge = 0;
        var dying = [], merged = [];

        // 미는 쪽 끝에서부터 차례로
        var rows = [0, 1, 2, 3], cols = [0, 1, 2, 3];
        if (d[0] === 1) rows.reverse();
        if (d[1] === 1) cols.reverse();
        var mergedThisTurn = {};

        rows.forEach(function (r) {
            cols.forEach(function (c) {
                var t = grid[r][c];
                if (!t) return;
                var nr = r, nc = c;
                while (true) {
                    var tr = nr + d[0], tc = nc + d[1];
                    if (tr < 0 || tr >= SIZE || tc < 0 || tc >= SIZE) break;
                    var other = grid[tr][tc];
                    if (!other) { nr = tr; nc = tc; continue; }
                    if (other.v === t.v && !mergedThisTurn[other.id]) {
                        // 합치기: 두 타일 모두 그 자리로 미끄러진 뒤 사라지고, 새 타일이 생김
                        var nt = { id: nextId++, v: t.v * 2 };
                        mergedThisTurn[nt.id] = true;
                        grid[r][c] = null;
                        grid[tr][tc] = nt;
                        dying.push({ id: t.id, r: tr, c: tc }, { id: other.id, r: tr, c: tc });
                        merged.push({ t: nt, r: tr, c: tc });
                        gain += nt.v;
                        if (nt.v > bestMerge) bestMerge = nt.v;
                        moved = true;
                        return;
                    }
                    break;
                }
                if (nr !== r || nc !== c) {
                    grid[r][c] = null;
                    grid[nr][nc] = t;
                    moved = true;
                }
            });
        });

        if (!moved) { sndBump(); nudge(dir); return; }

        undoSnap = before;
        score += gain;

        // 1) 남아 있는 타일과 사라질 타일을 새 자리로 미끄러뜨리기
        for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) {
            var t = grid[r][c];
            if (t && els[t.id]) placeEl(els[t.id], r, c);
        }
        dying.forEach(function (x) {
            var el = els[x.id];
            if (el) { el.classList.add("dying"); placeEl(el, x.r, x.c); }
        });

        var spawned = addRandom();
        sndSlide();
        if (bestMerge) sndMerge(bestMerge);
        showScore(gain);

        // 2) 미끄러진 뒤: 사라질 타일 지우고, 합친 타일·새 타일 보이기
        pending = {
            run: function () {
                dying.forEach(function (x) {
                    var el = els[x.id];
                    if (el && el.parentNode) el.parentNode.removeChild(el);
                    delete els[x.id];
                });
                merged.forEach(function (m) { makeEl(m.t, m.r, m.c, "pop"); });
                if (spawned) {
                    for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) {
                        if (grid[r][c] === spawned) makeEl(spawned, r, c, "new");
                    }
                    spawned.isNew = false;
                }
                afterMove(bestMerge);
            }
        };
        pending.timer = setTimeout(function () { finishPending(); }, SLIDE_MS);
        persist();
    }

    function maxTile() {
        var m = 0;
        for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) if (grid[r][c] && grid[r][c].v > m) m = grid[r][c].v;
        return m;
    }
    function canMove() {
        if (emptyCells().length) return true;
        for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) {
            var v = grid[r][c].v;
            if (c + 1 < SIZE && grid[r][c + 1].v === v) return true;
            if (r + 1 < SIZE && grid[r + 1][c].v === v) return true;
        }
        return false;
    }
    function afterMove(bestMerge) {
        var m = maxTile();
        if (m > record.maxTile) { record.maxTile = m; save("g2048Record.v1", record); showRecord(); }
        if (!won && bestMerge >= GOAL) {
            won = true;
            record.wins++; save("g2048Record.v1", record); showRecord();
            persist();
            showResult(T("2048 달성! 🎉", "You made 2048! 🎉"), T("점수 ", "Score ") + score.toLocaleString() + T(" · 계속해서 더 큰 숫자에 도전할 수 있어요", " · Keep going for an even bigger tile"), true);
            sndWin();
            bgmPause(1600);
            return;
        }
        if (!canMove()) {
            over = true;
            record.games++; save("g2048Record.v1", record); showRecord();
            try { localStorage.removeItem("g2048State.v1"); } catch (e) { /* 무시 */ }
            showResult(T("더 움직일 수 없어요", "No more moves"), T("점수 ", "Score ") + score.toLocaleString() + T(" · 가장 큰 타일 ", " · Biggest tile ") + m, false);
            sndLose();
            bgmSync();
        }
    }

    /* 움직일 수 없는 쪽으로 밀면 판을 살짝 흔들기 */
    function nudge(dir) {
        if (!elBoard.animate) return;
        var d = DIRS[dir], px = 6;
        elBoard.animate([
            { transform: "translate(0,0)" },
            { transform: "translate(" + d[1] * px + "px," + d[0] * px + "px)" },
            { transform: "translate(0,0)" }
        ], { duration: 160, easing: "ease-out" });
    }

    /* ======================= 결과 창 ======================= */
    function showResult(title, sub, canKeep) {
        elResultTitle.textContent = title;
        elResultSub.textContent = sub;
        btnKeep.hidden = !canKeep;
        elResult.hidden = false;
        (canKeep ? btnKeep : $("gAgain")).focus({ preventScroll: true });
    }
    function hideResult() { elResult.hidden = true; elBoard.focus({ preventScroll: true }); }

    /* ======================= 새 게임 · 되돌리기 ======================= */
    function newGame(countUnfinished) {
        finishPending();
        // 진행 중이던 판을 버리고 새로 시작하면 "끝낸 판"으로 셈 (빈 판 제외)
        if (countUnfinished && !over && grid && score > 0) { record.games++; save("g2048Record.v1", record); }
        grid = emptyGrid(); score = 0; won = false; keepGoing = false; over = false; undoSnap = null;
        addRandom(); addRandom();
        elResult.hidden = true;
        rebuild();
        persist();
        bgmSync();
    }
    function undo() {
        if (!undoSnap) return;
        finishPending();
        restore(undoSnap);
        undoSnap = null;
        elResult.hidden = true;
        rebuild();
        persist();
        bgmSync();
    }

    /* ======================= 입력 ======================= */
    var KEYS = {
        ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
        a: "left", d: "right", w: "up", s: "down", A: "left", D: "right", W: "up", S: "down"
    };
    document.addEventListener("keydown", function (e) {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        var tag = (e.target && e.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        var dir = KEYS[e.key];
        if (!dir) return;
        // 결과 창이 떠 있거나 버튼에 초점이 있을 때 WASD는 무시 (방향키는 판을 움직임)
        if (e.key.length === 1 && tag === "BUTTON") return;
        e.preventDefault();
        move(dir);
    });

    // 손가락·마우스로 밀기
    var start = null;
    elBoard.addEventListener("pointerdown", function (e) {
        if (!elResult.hidden) return;
        start = { x: e.clientX, y: e.clientY, id: e.pointerId };
        try { elBoard.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    });
    function endSwipe(e) {
        if (!start || e.pointerId !== start.id) return;
        var dx = e.clientX - start.x, dy = e.clientY - start.y;
        start = null;
        var ax = Math.abs(dx), ay = Math.abs(dy);
        if (Math.max(ax, ay) < 24) return;            // 너무 짧으면 무시
        if (ax > ay) move(dx > 0 ? "right" : "left");
        else move(dy > 0 ? "down" : "up");
    }
    elBoard.addEventListener("pointerup", endSwipe);
    elBoard.addEventListener("pointercancel", function () { start = null; });
    elBoard.tabIndex = 0;

    $("gNew").addEventListener("click", function () { sndClick(); newGame(true); });
    $("gAgain").addEventListener("click", function () { sndClick(); newGame(false); hideResult(); });
    btnKeep.addEventListener("click", function () { sndClick(); keepGoing = true; persist(); hideResult(); });
    btnUndo.addEventListener("click", function () { sndClick(); undo(); });
    /* 종료: 2048 창 닫기. 홈에서 새 창으로 연 경우만 닫힘 → 안 닫히면(주소로 직접 연 경우 등) 홈으로 */
    $("gExit").addEventListener("click", function () {
        sndClick();
        finishPending();
        setTimeout(function () {
            window.close();
            setTimeout(function () { if (!window.closed) location.href = T("index.html", "index-en.html"); }, 250);
        }, 120);
    });

    function syncSound() {
        btnSound.classList.toggle("muted", muted);
        btnSound.setAttribute("aria-label", muted ? T("소리 켜기", "Sound on") : T("소리 끄기", "Sound off"));
        btnSound.title = muted ? T("소리 켜기", "Sound on") : T("소리 끄기", "Sound off");
    }
    var btnMusic = $("gMusic");
    function syncMusic() {
        if (!btnMusic) return;
        btnMusic.classList.toggle("muted", !musicOn);
        var label = musicOn ? T("배경음악 끄기", "Music off") : T("배경음악 켜기", "Music on");
        btnMusic.setAttribute("aria-label", label);
        btnMusic.title = label;
    }
    if (btnMusic) btnMusic.addEventListener("click", function () {
        musicOn = !musicOn; save("g2048Music.v1", musicOn); syncMusic();
        gestured = true;
        bgmSync();
    });
    btnSound.addEventListener("click", function () {
        muted = !muted; save("g2048Muted.v1", muted); syncSound();
        if (!muted) sndMerge(8);
    });

    /* ======================= 시작 ======================= */
    elHint.textContent = coarse
        ? T("판을 손가락으로 밀어서 같은 숫자를 합치세요.", "Swipe the board to merge matching numbers.")
        : T("방향키(← ↑ → ↓)나 마우스로 밀어서 같은 숫자를 합치세요.", "Use the arrow keys (← ↑ → ↓) or drag with the mouse to merge matching numbers.");
    syncSound();
    syncMusic();
    var saved = load("g2048State.v1", null);
    if (validSave(saved)) {
        restore(saved);
        rebuild();
        if (!canMove()) { over = true; showResult(T("더 움직일 수 없어요", "No more moves"), T("점수 ", "Score ") + score.toLocaleString(), false); }
    } else {
        newGame(false);
    }
    showScore(0);
})();
