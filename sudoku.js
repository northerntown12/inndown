window.T = window.T || function (ko) { return ko; };   /* lang.js가 없어도 한국어로 동작 */
/* =========================================================
   오늘의 스도쿠 (sudoku.html / sudoku-en.html, 2026-11-27) — 화면·소리·기록
   - 문제 만들기·판정은 sudoku-engine.js (window.SudokuEngine)
   - 모드: 📅 오늘의 문제(날짜가 씨앗 → 그날은 누구나 같은 문제, 쉬움·보통·어려움) / 🎲 연습(쉬움~전문가, 새 문제 계속)
   - 칸 누르고 숫자 / 키보드 1~9, 방향키, Backspace, N(메모), Ctrl+Z(되돌리기), H(힌트), P(일시정지)
   - 메모(후보 숫자), 후보 모두 채우기, 숫자 넣으면 같은 줄·상자 메모 자동 정리, 같은 숫자 강조,
     틀린 숫자 빨갛게(끌 수 있음), 힌트(어떤 이유로 그 숫자인지 설명), 되돌리기, 일시정지(판 가림), 시간·실수·힌트 수
   - 줄·세로줄·상자를 다 채우면 반짝, 다 풀면 팡파레 + 결과 창
   - 기기에 기억: 하던 판 sudokuState.v1, 기록 sudokuRecord.v1, 설정 sudokuSettings.v1, 소리 sudokuMuted.v1
   ========================================================= */
(function () {
    "use strict";
    const E = window.SudokuEngine;
    const $ = id => document.getElementById(id);
    const boardEl = $("sBoard");
    if (!E || !boardEl) return;
    const EN = !!window.SITE_EN;
    const { ROW, COL, BOX, PEERS, UNITS, bit, digits } = E;

    function load(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
    function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    const pad = n => String(n).padStart(2, "0");
    const fmtTime = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" + pad(m) : m) + ":" + pad(x); };
    function todayStr(d) { d = d || new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
    const DAY1 = new Date(2026, 10, 27);   // 2026-11-27 = 1회
    const dayNo = ds => { const p = ds.split("-").map(Number); return Math.round((new Date(p[0], p[1] - 1, p[2]) - DAY1) / 86400000) + 1; };

    const LV_NAME = { easy: T("쉬움", "Easy"), mid: T("보통", "Medium"), hard: T("어려움", "Hard"), expert: T("전문가", "Expert") };
    const DAILY_LV = ["easy", "mid", "hard"], PRAC_LV = ["easy", "mid", "hard", "expert"];

    /* ---------------- 설정·기록 ---------------- */
    const set = Object.assign({ errors: true, same: true, autoClean: true, mode: "daily", lv: "mid" }, load("sudokuSettings.v1", {}));
    const rec = Object.assign({ best: {}, wins: {}, daily: {}, played: 0 }, load("sudokuRecord.v1", {}));
    let muted = !!load("sudokuMuted.v1", false);
    let store = load("sudokuState.v1", {});        // 키별로 하던 판
    const saveSet = () => save("sudokuSettings.v1", set);
    const saveRec = () => save("sudokuRecord.v1", rec);

    /* ---------------- 소리 (Web Audio) ---------------- */
    let AC = null;
    function ac() {
        if (muted) return null;
        try { if (!AC) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; AC = new C(); } if (AC.state === "suspended") AC.resume(); return AC; } catch (e) { return null; }
    }
    function tone(f, t, dur, type, g) {
        const c = AC, o = c.createOscillator(), v = c.createGain();
        o.type = type || "sine"; o.frequency.setValueAtTime(f, t);
        v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(g || 0.2, t + 0.008); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(v); v.connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
    }
    const NOTE = [0, 523, 587, 659, 698, 784, 880, 988, 1047, 1175];   // 숫자마다 다른 음 (도레미…)
    function snd(kind, d) {
        const c = ac(); if (!c) return; const t = c.currentTime + 0.01;
        if (kind === "tap") tone(1400, t, 0.04, "sine", 0.06);
        else if (kind === "place") tone(NOTE[d] || 660, t, 0.18, "triangle", 0.18);
        else if (kind === "note") tone(1800, t, 0.05, "sine", 0.05);
        else if (kind === "wrong") { tone(220, t, 0.22, "sawtooth", 0.08); tone(196, t + 0.08, 0.25, "sawtooth", 0.07); }
        else if (kind === "unit") [784, 988, 1175, 1568].forEach((f, k) => tone(f, t + k * 0.06, 0.25, "sine", 0.1));
        else if (kind === "erase") tone(500, t, 0.06, "sine", 0.06);
        else if (kind === "hint") [880, 1320].forEach((f, k) => tone(f, t + k * 0.1, 0.3, "sine", 0.12));
        else if (kind === "win") [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, k) => tone(f, t + k * 0.12, k === 6 ? 0.9 : 0.2, "triangle", 0.2));
    }

    /* ---------------- 판 상태 ---------------- */
    let G = null;          // {key, mode, lv, date, puzzle[], solution[], val[], notes[], time, mistakes, hints, done, given[]}
    let sel = -1, noteMode = false, paused = false, history = [];

    function keyFor(mode, lv) { return mode === "daily" ? "d:" + todayStr() + ":" + lv : "p:" + lv; }
    function startGame(mode, lv, fresh) {
        const key = keyFor(mode, lv);
        const old = store[key];
        if (old && !fresh && old.puzzle && old.puzzle.length === 81) { G = old; }
        else {
            let gen;
            if (mode === "daily") gen = E.generate(lv, "wowezbox-sudoku|" + todayStr() + "|" + lv);
            else gen = E.generate(lv, "p|" + lv + "|" + Date.now() + "|" + Math.random());
            G = { key: key, mode: mode, lv: lv, date: todayStr(), puzzle: gen.puzzle, solution: gen.solution, val: gen.puzzle.slice(), notes: new Array(81).fill(0),
                time: 0, mistakes: 0, hints: 0, done: false, started: false };
            store[key] = G; tidyStore(); persist();
        }
        sel = -1; history = []; paused = false; noteMode = false;
        set.mode = mode; set.lv = lv; saveSet();
        renderAll();
        showMsg("");
        if (G.done) showResult(true);
        else hideResult();
    }
    function tidyStore() {
        /* 지난 날짜의 오늘의 문제는 지움 */
        Object.keys(store).forEach(k => { if (k.startsWith("d:") && k.indexOf(todayStr()) < 0) delete store[k]; });
    }
    let persistT = 0;
    function persist() { clearTimeout(persistT); persistT = setTimeout(() => save("sudokuState.v1", store), 150); }
    const given = i => !!G.puzzle[i];
    const isWrong = i => G.val[i] && !given(i) && G.val[i] !== G.solution[i];

    /* ---------------- 판 그리기 ---------------- */
    const cells = [];
    for (let i = 0; i < 81; i++) {
        const c = document.createElement("div");
        c.className = "s-cell"; c.dataset.i = i; c.setAttribute("role", "gridcell");
        if (COL[i] % 3 === 2 && COL[i] < 8) c.classList.add("br");
        if (ROW[i] % 3 === 2 && ROW[i] < 8) c.classList.add("bb");
        boardEl.appendChild(c); cells.push(c);
    }
    function cellHTML(i) {
        if (G.val[i]) return '<span class="s-v">' + G.val[i] + '</span>';
        const m = G.notes[i]; if (!m) return "";
        let h = '<span class="s-notes">';
        for (let d = 1; d <= 9; d++) h += '<i' + (m & bit(d) ? ' class="on"' : '') + '>' + (m & bit(d) ? d : "") + '</i>';
        return h + "</span>";
    }
    function renderCell(i) {
        const c = cells[i];
        c.innerHTML = cellHTML(i);
        c.classList.toggle("given", given(i));
        c.classList.toggle("user", !!G.val[i] && !given(i));
        c.classList.toggle("wrong", set.errors && isWrong(i));
        c.setAttribute("aria-label", (ROW[i] + 1) + T("행 ", " row ") + (COL[i] + 1) + T("열 ", " col ") + (G.val[i] || T("빈칸", "empty")));
    }
    function renderHighlight() {
        const sv = sel >= 0 ? G.val[sel] : 0;
        for (let i = 0; i < 81; i++) {
            const c = cells[i];
            c.classList.toggle("sel", i === sel);
            c.classList.toggle("peer", sel >= 0 && i !== sel && (ROW[i] === ROW[sel] || COL[i] === COL[sel] || BOX[i] === BOX[sel]));
            c.classList.toggle("same", set.same && sv > 0 && i !== sel && G.val[i] === sv);
            c.classList.toggle("samenote", set.same && sv > 0 && !G.val[i] && !!(G.notes[i] & bit(sv)));
            c.classList.toggle("clash", set.errors && sel >= 0 && sv > 0 && i !== sel && G.val[i] === sv && PEERS[sel].indexOf(i) >= 0);
        }
    }
    function renderPad() {
        const cnt = new Array(10).fill(0);
        for (let i = 0; i < 81; i++) if (G.val[i] && G.val[i] === G.solution[i]) cnt[G.val[i]]++;
        document.querySelectorAll(".s-num").forEach(b => {
            const d = +b.dataset.d, left = 9 - cnt[d];
            b.querySelector("small").textContent = left > 0 ? left : "";
            b.classList.toggle("is-full", left <= 0);
            b.classList.toggle("is-cur", sel >= 0 && G.val[sel] === d);
        });
        const nb = $("sNote");
        nb.classList.toggle("on", noteMode); nb.setAttribute("aria-pressed", noteMode ? "true" : "false");
        $("sNoteState").textContent = noteMode ? "ON" : "OFF";
        $("sUndo").disabled = !history.length || G.done;
        const fb = $("sFill"), on = G.notes.some((m, i) => m && !G.val[i]);
        fb.textContent = on ? "🧹 " + T("후보 숫자 모두 비우기", "Clear all candidates") : "✏️ " + T("후보 숫자 모두 채우기", "Fill in all candidates");
        fb.classList.toggle("is-clear", on);
        boardEl.classList.toggle("note-mode", noteMode);
    }
    function renderStatus() {
        $("sMistakes").textContent = G.mistakes;
        $("sHints").textContent = G.hints;
        $("sTime").textContent = fmtTime(G.time);
        const label = G.mode === "daily" ? "📅 " + T("오늘의 문제", "Daily") + " #" + dayNo(G.date) + " · " + LV_NAME[G.lv] : "🎲 " + T("연습", "Practice") + " · " + LV_NAME[G.lv];
        $("sLabel").textContent = label;
        document.querySelectorAll(".s-mode").forEach(b => { const on = b.dataset.mode === G.mode; b.classList.toggle("on", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
        const lvs = G.mode === "daily" ? DAILY_LV : PRAC_LV;
        document.querySelectorAll(".s-level").forEach(b => {
            const lv = b.dataset.lv; b.hidden = lvs.indexOf(lv) < 0; b.classList.toggle("on", lv === G.lv);
            const doneToday = G.mode === "daily" && rec.daily[todayStr()] && rec.daily[todayStr()][lv] != null;
            b.classList.toggle("is-done", !!doneToday);
        });
        $("sNew").textContent = G.mode === "daily" ? T("처음부터", "Restart") : T("새 문제", "New puzzle");
        $("sPause").textContent = paused ? "▶" : "⏸";
        $("sPause").setAttribute("aria-label", paused ? T("계속하기", "Resume") : T("일시정지", "Pause"));
        boardEl.classList.toggle("is-paused", paused);
        $("sPaused").hidden = !paused;
    }
    function renderAll() { for (let i = 0; i < 81; i++) renderCell(i); renderHighlight(); renderPad(); renderStatus(); renderRecord(); syncOpts(); }

    /* ---------------- 시간 ---------------- */
    let lastTick = Date.now();
    setInterval(() => {
        const n = Date.now(), dt = (n - lastTick) / 1000; lastTick = n;
        if (!G || G.done || paused || !G.started || document.visibilityState !== "visible") return;
        G.time += dt; $("sTime").textContent = fmtTime(G.time);
        if (Math.floor(G.time) % 5 === 0) persist();
    }, 250);
    document.addEventListener("visibilitychange", () => { lastTick = Date.now(); if (document.visibilityState !== "visible") persist(); });

    /* ---------------- 입력 ---------------- */
    function snapshot() { history.push({ val: G.val.slice(), notes: G.notes.slice() }); if (history.length > 300) history.shift(); }
    function select(i) { if (paused) return; sel = i; renderHighlight(); renderPad(); }
    function place(d) {
        if (!G || G.done || paused || sel < 0 || given(sel)) return;
        G.started = true;
        if (noteMode) {
            if (G.val[sel]) return;
            snapshot(); G.notes[sel] ^= bit(d); snd("note");
            renderCell(sel); renderHighlight(); renderPad(); persist(); return;
        }
        if (G.val[sel] === d) { erase(); return; }
        snapshot();
        G.val[sel] = d; G.notes[sel] = 0;
        const wrong = d !== G.solution[sel];
        if (wrong) { G.mistakes++; snd("wrong"); cells[sel].classList.remove("shake"); void cells[sel].offsetWidth; cells[sel].classList.add("shake"); }
        else snd("place", d);
        if (set.autoClean && !wrong) for (const p of PEERS[sel]) if (G.notes[p] & bit(d)) { G.notes[p] &= ~bit(d); renderCell(p); }
        renderCell(sel);
        if (!wrong) flashUnits(sel);
        renderHighlight(); renderPad(); renderStatus(); persist();
        showMsg("");
        checkWin();
    }
    function erase() {
        if (!G || G.done || paused || sel < 0 || given(sel)) return;
        if (!G.val[sel] && !G.notes[sel]) return;
        snapshot(); G.val[sel] = 0; G.notes[sel] = 0; snd("erase");
        renderCell(sel); renderHighlight(); renderPad(); persist();
    }
    function undo() {
        if (!history.length || G.done || paused) return;
        const h = history.pop(); G.val = h.val; G.notes = h.notes; snd("erase");
        for (let i = 0; i < 81; i++) renderCell(i); renderHighlight(); renderPad(); persist();
    }
    function flashUnits(i) {
        const units = [ROW[i] * 3, COL[i] * 3 + 1, BOX[i] * 3 + 2];
        let any = false;
        units.forEach(u => {
            if (UNITS[u].every(k => G.val[k] && G.val[k] === G.solution[k])) {
                any = true;
                UNITS[u].forEach((k, n) => { const c = cells[k]; c.classList.remove("glow"); setTimeout(() => { c.classList.add("glow"); setTimeout(() => c.classList.remove("glow"), 700); }, n * 35); });
            }
        });
        if (any) setTimeout(() => snd("unit"), 120);
    }
    function fillAllNotes() {
        if (!G || G.done || paused) return;
        snapshot(); G.started = true;
        for (let i = 0; i < 81; i++) {
            if (G.val[i]) continue;
            let m = 0x3fe; for (const p of PEERS[i]) if (G.val[p] && !isWrong(p)) m &= ~bit(G.val[p]);
            G.notes[i] = m; renderCell(i);
        }
        snd("note"); renderHighlight(); renderPad(); persist();
        showMsg(T("빈칸마다 들어갈 수 있는 숫자를 모두 적어 뒀어요. 숫자를 넣으면 같은 줄·상자의 메모가 저절로 지워져요.", "Every empty cell now shows its possible numbers. Placing a number clears it from the same row, column and box."));
    }

    /* 힌트: 틀린 칸이 있으면 먼저 알려 주고, 아니면 사람 방식으로 다음 한 칸 + 이유 */
    function hint() {
        if (!G || G.done || paused) return;
        G.started = true;
        const wrongs = []; for (let i = 0; i < 81; i++) if (isWrong(i)) wrongs.push(i);
        if (wrongs.length) {
            sel = wrongs[0]; renderHighlight(); renderPad();
            cells[sel].classList.add("wrong"); cells[sel].classList.remove("shake"); void cells[sel].offsetWidth; cells[sel].classList.add("shake");
            snd("hint");
            showMsg("💡 " + T("이 칸의 숫자가 맞지 않아요. 먼저 고쳐 보세요.", "This number isn't right. Try fixing it first.") + (wrongs.length > 1 ? T(" (틀린 칸 " + wrongs.length + "개)", " (" + wrongs.length + " wrong cells)") : ""));
            return;
        }
        const g = G.val.slice(), c = E.candidates(g);
        let s = null, guard = 0;
        while (guard++ < 50) { s = E.step(g, c); if (!s || !s.elim) break; }
        let i, d, why;
        if (s && !s.elim) {
            i = s.i; d = s.d;
            if (s.type === "naked") why = T("가로줄·세로줄·상자에 나머지 숫자가 다 있어서 이 칸에는 " + d + "만 들어갈 수 있어요.", "The row, column and box already hold every other number, so only " + d + " fits here.");
            else {
                const u = s.unit, kind = u % 3 === 0 ? T("이 가로줄", "this row") : u % 3 === 1 ? T("이 세로줄", "this column") : T("이 상자", "this box");
                why = T(kind + "에서 " + d + GA[d] + " 들어갈 수 있는 자리는 여기 하나뿐이에요.", "In " + kind + ", this is the only place a " + d + " can go.");
            }
        } else {
            let best = -1, bn = 10;
            for (let k = 0; k < 81; k++) if (!g[k]) { const n = E.popcnt(c[k]); if (n < bn) { bn = n; best = k; } }
            i = best; d = G.solution[i];
            why = T("어려운 자리라 정답을 바로 채웠어요.", "This one needs advanced logic, so the answer was filled in.");
        }
        if (i == null || i < 0) return;
        snapshot();
        G.val[i] = d; G.notes[i] = 0; G.hints++;
        if (set.autoClean) for (const p of PEERS[i]) if (G.notes[p] & bit(d)) { G.notes[p] &= ~bit(d); renderCell(p); }
        sel = i; renderCell(i); cells[i].classList.add("hinted"); setTimeout(() => cells[i].classList.remove("hinted"), 1400);
        snd("hint"); flashUnits(i);
        renderHighlight(); renderPad(); renderStatus(); persist();
        showMsg("💡 " + why);
        checkWin();
    }
    const GA = ["", "이", "가", "이", "가", "가", "이", "이", "이", "가"];   /* 숫자 뒤 "이/가" (일이, 이가, 삼이…) */
    function showMsg(t) { const m = $("sMsg"); m.textContent = t; m.classList.toggle("on", !!t); }

    /* ---------------- 다 풀었을 때 ---------------- */
    function checkWin() {
        for (let i = 0; i < 81; i++) if (G.val[i] !== G.solution[i]) return;
        G.done = true; G.doneAt = Date.now(); persist();
        const secs = Math.round(G.time);
        rec.played++;
        rec.wins[G.lv] = (rec.wins[G.lv] || 0) + 1;
        const prev = rec.best[G.lv]; G.newBest = !G.hints && (!prev || secs < prev);
        if (G.newBest) rec.best[G.lv] = secs;
        if (G.mode === "daily") { const d = rec.daily[G.date] || {}; if (d[G.lv] == null) d[G.lv] = secs; rec.daily[G.date] = d; }
        const keys = Object.keys(rec.daily).sort(); while (keys.length > 400) delete rec.daily[keys.shift()];
        saveRec();
        sel = -1; renderHighlight(); renderPad(); renderStatus(); renderRecord();
        boardEl.classList.add("is-won");
        cells.forEach((c, k) => setTimeout(() => { c.classList.add("glow"); setTimeout(() => c.classList.remove("glow"), 600); }, (ROW[k] + COL[k]) * 45));
        snd("win");
        setTimeout(() => showResult(false), 1100);
    }
    function streak() {
        let n = 0; const d = new Date();
        if (!rec.daily[todayStr(d)]) d.setDate(d.getDate() - 1);   // 오늘 아직 안 풀었으면 어제부터 셈
        while (rec.daily[todayStr(d)]) { n++; d.setDate(d.getDate() - 1); }
        return n;
    }
    function showResult(quiet) {
        boardEl.classList.add("is-won");
        $("sResultTitle").textContent = "🎉 " + T("다 풀었어요!", "Solved!");
        const lines = [
            (G.mode === "daily" ? T("오늘의 문제 #", "Daily #") + dayNo(G.date) + " · " : T("연습 · ", "Practice · ")) + LV_NAME[G.lv],
            T("걸린 시간 ", "Time ") + fmtTime(G.time) + (G.newBest ? T(" · 🏆 최고 기록!", " · 🏆 New best!") : ""),
            T("실수 ", "Mistakes ") + G.mistakes + T("번 · 힌트 ", " · Hints ") + G.hints + T("번", "")
        ];
        if (G.mode === "daily") lines.push("🔥 " + T("연속 ", "Streak: ") + streak() + T("일째 오늘의 문제를 풀었어요", streak() === 1 ? " day" : " days"));
        $("sResultSub").textContent = lines.join("\n");
        const nextLv = G.mode === "daily" ? DAILY_LV.find(l => !(rec.daily[todayStr()] || {})[l]) : null;
        $("sNext").textContent = G.mode === "daily" ? (nextLv ? LV_NAME[nextLv] + T(" 문제 풀기", " puzzle") : T("연습 문제 풀기", "Practice")) : T("새 문제", "New puzzle");
        $("sNext").dataset.next = G.mode === "daily" ? (nextLv ? "d:" + nextLv : "p:" + G.lv) : "p:" + G.lv;
        $("sResult").hidden = false;
        if (!quiet) { try { $("sNext").focus(); } catch (e) {} }
    }
    function hideResult() { $("sResult").hidden = true; boardEl.classList.remove("is-won"); }

    /* ---------------- 기록 칸 ---------------- */
    function renderRecord() {
        const today = rec.daily[todayStr()] || {};
        let h = "<b>" + T("오늘의 문제", "Today's puzzles") + " #" + dayNo(todayStr()) + "</b><br>";
        h += DAILY_LV.map(l => LV_NAME[l] + " " + (today[l] != null ? "✅ " + fmtTime(today[l]) : "—")).join(" · ") + "<br>";
        h += "🔥 " + T("연속 ", "Streak ") + "<b>" + streak() + "</b>" + T("일", "") + "<br>";
        h += "<b>" + T("최고 기록 (힌트 없이)", "Best times (no hints)") + "</b><br>";
        h += PRAC_LV.map(l => LV_NAME[l] + " " + (rec.best[l] ? fmtTime(rec.best[l]) : "—")).join(" · ") + "<br>";
        h += T("푼 문제 ", "Solved ") + "<b>" + (rec.played || 0) + "</b>" + T("개", "");
        $("sRecord").innerHTML = h;
    }

    /* ---------------- 버튼·키보드 ---------------- */
    boardEl.addEventListener("pointerdown", e => {
        const c = e.target.closest(".s-cell"); if (!c) return;
        e.preventDefault(); ac(); select(+c.dataset.i); snd("tap");
    });
    $("sPad").addEventListener("click", e => {
        const b = e.target.closest(".s-num"); if (!b) return;
        ac(); place(+b.dataset.d);
    });
    $("sErase").addEventListener("click", () => { ac(); erase(); });
    $("sUndo").addEventListener("click", () => { ac(); undo(); });
    $("sNote").addEventListener("click", () => { ac(); noteMode = !noteMode; snd("tap"); renderPad(); });
    $("sHint").addEventListener("click", () => { ac(); hint(); });
    /* 2026-11-27: 메모가 하나라도 있으면 [모두 비우기], 없으면 [모두 채우기] (누를 때마다 바뀜) */
    const hasNotes = () => G && G.notes.some((m, i) => m && !G.val[i]);
    function clearAllNotes() {
        if (!G || G.done || paused) return;
        snapshot();
        for (let i = 0; i < 81; i++) if (G.notes[i]) { G.notes[i] = 0; renderCell(i); }
        snd("erase"); renderHighlight(); renderPad(); persist();
        showMsg(T("메모를 모두 지웠어요. [되돌리기]로 되살릴 수 있어요.", "All notes cleared. Use Undo to bring them back."));
    }
    $("sFill").addEventListener("click", () => { ac(); if (hasNotes()) clearAllNotes(); else fillAllNotes(); });
    $("sPause").addEventListener("click", () => togglePause());
    $("sResume").addEventListener("click", () => togglePause(false));
    function togglePause(v) {
        if (!G || G.done) return;
        paused = v === undefined ? !paused : v; lastTick = Date.now();
        renderStatus(); persist();
    }
    document.querySelectorAll(".s-mode").forEach(b => b.addEventListener("click", () => {
        ac(); snd("tap");
        const mode = b.dataset.mode; let lv = set.lv;
        if (mode === "daily" && DAILY_LV.indexOf(lv) < 0) lv = "mid";
        startGame(mode, lv, false);
    }));
    document.querySelectorAll(".s-level").forEach(b => b.addEventListener("click", () => { ac(); snd("tap"); startGame(G.mode, b.dataset.lv, false); }));
    $("sNew").addEventListener("click", () => {
        ac(); snd("tap");
        const started = G.started && !G.done;
        if (started && !confirmBox()) return;
        if (G.mode === "daily") {   // 오늘의 문제는 같은 문제를 처음부터
            G.val = G.puzzle.slice(); G.notes = new Array(81).fill(0); G.time = 0; G.mistakes = 0; G.hints = 0; G.done = false; G.started = false;
            history = []; sel = -1; hideResult(); renderAll(); persist(); showMsg("");
        } else startGame("practice", G.lv, true);
    });
    let confirmArm = 0;
    function confirmBox() {
        /* 한 번 더 누르면 실행 (팝업 창 대신) */
        if (Date.now() - confirmArm < 3000) { confirmArm = 0; return true; }
        confirmArm = Date.now();
        showMsg(G.mode === "daily" ? T("하던 판이 지워져요. 한 번 더 누르면 처음부터 시작해요.", "Your progress will be cleared. Press again to restart.")
            : T("하던 판이 지워져요. 한 번 더 누르면 새 문제를 시작해요.", "Your progress will be lost. Press again for a new puzzle."));
        return false;
    }
    $("sNext").addEventListener("click", () => {
        const n = $("sNext").dataset.next || "p:mid", p = n.split(":");
        startGame(p[0] === "d" ? "daily" : "practice", p[1], p[0] === "p");
    });
    $("sLook").addEventListener("click", () => { $("sResult").hidden = true; });
    $("sExit").addEventListener("click", () => {
        persist(); snd("tap");
        setTimeout(() => { window.close(); setTimeout(() => { if (!window.closed) location.href = T("index.html", "index-en.html"); }, 250); }, 200);
    });
    /* 설정 */
    function syncOpts() { $("oErrors").checked = set.errors; $("oSame").checked = set.same; $("oClean").checked = set.autoClean; }
    [["oErrors", "errors"], ["oSame", "same"], ["oClean", "autoClean"]].forEach(a => $(a[0]).addEventListener("change", e => { set[a[1]] = e.target.checked; saveSet(); for (let i = 0; i < 81; i++) renderCell(i); renderHighlight(); }));
    /* 소리 */
    const btnSound = $("sSound");
    function syncSound() { btnSound.classList.toggle("muted", muted); const l = muted ? T("소리 켜기", "Sound on") : T("소리 끄기", "Sound off"); btnSound.setAttribute("aria-label", l); btnSound.title = l; }
    btnSound.addEventListener("click", () => { muted = !muted; save("sudokuMuted.v1", muted); syncSound(); if (!muted) snd("tap"); });
    syncSound();

    document.addEventListener("keydown", e => {
        if (!G) return;
        const tag = (e.target.tagName || "").toLowerCase(); if (tag === "input" || tag === "textarea" || tag === "select") return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key;
        if (/^[1-9]$/.test(k)) { ac(); place(+k); e.preventDefault(); return; }
        if (k === "Backspace" || k === "Delete" || k === "0") { erase(); e.preventDefault(); return; }
        if (k.startsWith("Arrow")) {
            e.preventDefault(); if (paused) return;
            let i = sel < 0 ? 40 : sel;
            if (k === "ArrowUp") i = (i + 72) % 81; else if (k === "ArrowDown") i = (i + 9) % 81;
            else if (k === "ArrowLeft") i = ROW[i] * 9 + (COL[i] + 8) % 9; else if (k === "ArrowRight") i = ROW[i] * 9 + (COL[i] + 1) % 9;
            select(i); return;
        }
        const l = k.toLowerCase();
        if (l === "n") { noteMode = !noteMode; renderPad(); }
        else if (l === "h") hint();
        else if (l === "p") togglePause();
        else if (k === "Escape") { if (!$("sResult").hidden) $("sResult").hidden = true; else { sel = -1; renderHighlight(); renderPad(); } }
    });
    /* 판 밖을 누르면 선택 풀기 (버튼 제외) */
    document.addEventListener("pointerdown", e => {
        if (sel < 0 || e.target.closest(".s-board, .s-pad, .s-tools, button, label, .g-panel")) return;
        sel = -1; renderHighlight(); renderPad();
    });
    window.addEventListener("pagehide", () => save("sudokuState.v1", store));

    /* ---------------- 시작 ---------------- */
    const q = new URLSearchParams(location.search);
    const qm = q.get("m") === "practice" ? "practice" : q.get("m") === "daily" ? "daily" : null;
    const ql = PRAC_LV.indexOf(q.get("lv")) >= 0 ? q.get("lv") : null;
    let mode = qm || (set.mode === "practice" ? "practice" : "daily"), lv = ql || set.lv || "mid";
    if (mode === "daily" && DAILY_LV.indexOf(lv) < 0) lv = "mid";
    tidyStore();
    startGame(mode, lv, false);

    window.__sudoku = { state: () => G, solve: () => { G.val = G.solution.slice(); G.val[0] = 0; renderAll(); } };
})();
