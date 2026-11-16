window.T = window.T || function (ko) { return ko; };   /* lang.js가 없어도 한국어로 동작 */
/* =========================================================
   오늘의 영단어 (word.html, word-en.html) — 2026-11-17
   - 숨은 영어 5글자 단어를 6번 안에 맞히기. 칸 색: 초록(자리까지 맞음)·노랑(자리 다름)·회색(없음)
   - 오늘의 문제: 한국 시간 자정마다 바뀜, 모든 사람이 같은 단어 (#1 = 2026-11-17)
   - 연습: 무작위, 몇 번이든
   - 단어 자료는 word-data.js (WORD_ANSWERS, WORD_VALID)
   - 기기에 기억: 오늘 문제 진행 wordDaily.v1, 기록 wordStats.v1, 연습 wordPractice.v1, 소리 wordMuted.v1
   ========================================================= */
(function () {
    "use strict";

    var LEN = 5, TRIES = 6;
    var START_DAY = Math.floor(Date.UTC(2026, 10, 17) / 864e5);   // 오늘의 문제 #1 날짜 (한국 시간)
    var FLIP_GAP = 260;                                           // 칸이 하나씩 뒤집히는 간격 (ms)

    function $(id) { return document.getElementById(id); }
    function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
    function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 무시 */ } }
    var EN = !!window.SITE_EN;

    var ANSWERS = (window.WORD_ANSWERS || []).filter(function (a) { return a && a[0] && a[0].length === LEN; });
    var VALID = {};
    String(window.WORD_VALID || "").split(" ").forEach(function (w) { if (w) VALID[w] = 1; });
    ANSWERS.forEach(function (a) { VALID[a[0]] = 1; });

    /* 오늘의 문제 순서: 정해진 씨앗으로 섞어서 누구나 같은 순서 */
    function seeded(seed) { return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
    var ORDER = ANSWERS.map(function (_, i) { return i; });
    (function () { var r = seeded(20261117); for (var i = ORDER.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = ORDER[i]; ORDER[i] = ORDER[j]; ORDER[j] = t; } })();

    function seoulDay() { return Math.floor((Date.now() + 9 * 3600e3) / 864e5); }
    function puzzleNo() { return seoulDay() - START_DAY + 1; }
    function dailyEntry(no) { var n = ORDER.length; return ANSWERS[ORDER[(((no - 1) % n) + n) % n]]; }

    /* ======================= 상태 ======================= */
    var stats = load("wordStats.v1", null) || { played: 0, wins: 0, streak: 0, best: 0, lastDay: 0, dist: [0, 0, 0, 0, 0, 0] };
    var prac = load("wordPractice.v1", null) || { played: 0, wins: 0 };
    var muted = !!load("wordMuted.v1", false);

    var mode = "daily";
    var G = null;        // { entry, guesses:[], cur:"", done, win, no }
    var busy = false;    // 뒤집히는 중엔 입력 막기

    /* ======================= 소리 (Web Audio로 직접 만듦) ======================= */
    var actx = null;
    function audio() {
        if (muted) return null;
        try {
            if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; actx = new AC(); }
            if (actx.state === "suspended") actx.resume();
            return actx;
        } catch (e) { return null; }
    }
    function marimba(freq, at, vol, len) {
        var a = audio(); if (!a) return;
        var t = a.currentTime + 0.02 + (at || 0), v = vol || 0.28;
        [[1, v, len || 0.3], [4, v * 0.26, 0.06]].forEach(function (h) {
            var o = a.createOscillator(); o.type = "sine"; o.frequency.value = freq * h[0];
            var g = a.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(h[1], t + 0.006);
            g.gain.exponentialRampToValueAtTime(0.0001, t + h[2]);
            o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + h[2] + 0.03);
        });
    }
    function sndKey() { marimba(660, 0, 0.12, 0.08); }
    function sndDel() { marimba(440, 0, 0.1, 0.07); }
    function sndBad() { marimba(220, 0, 0.22, 0.18); marimba(208, 0.09, 0.2, 0.2); }
    var FLIP_NOTE = { ok: 784, "in": 587, no: 392 };
    function sndFlip(kind, at) { marimba(FLIP_NOTE[kind] || 440, at, 0.2, 0.22); }
    function sndWin() { [523, 659, 784, 1047, 1319].forEach(function (f, i) { marimba(f, i * 0.09, 0.26, 0.4); }); }
    function sndLose() { [523, 440, 349].forEach(function (f, i) { marimba(f, i * 0.16, 0.22, 0.4); }); }
    function sndBtn() { marimba(523, 0, 0.18, 0.12); marimba(784, 0.07, 0.18, 0.16); }

    /* ======================= 화면 만들기 ======================= */
    var elBoard = $("wBoard"), elKeys = $("wKeys"), elToast = $("wToast"), elSub = $("wSub");
    var elResult = $("wResult");
    var rows = [], keyEls = {};
    for (var r = 0; r < TRIES; r++) {
        var row = document.createElement("div"); row.className = "w-row";
        var cells = [];
        for (var c = 0; c < LEN; c++) { var t = document.createElement("div"); t.className = "w-tile"; row.appendChild(t); cells.push(t); }
        elBoard.appendChild(row); rows.push({ el: row, cells: cells });
    }
    var BACK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-6-6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m12 10 4 4m0-4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    ["qwertyuiop", "asdfghjkl", "+zxcvbnm-"].forEach(function (line) {
        var kr = document.createElement("div"); kr.className = "w-krow";
        line.split("").forEach(function (ch) {
            var b = document.createElement("button"); b.type = "button"; b.className = "w-key";
            if (ch === "+") { b.className += " wide"; b.textContent = T("확인", "Enter"); b.dataset.k = "Enter"; }
            else if (ch === "-") { b.className += " wide"; b.innerHTML = BACK_SVG; b.dataset.k = "Backspace"; b.setAttribute("aria-label", T("지우기", "Delete")); }
            else { b.textContent = ch; b.dataset.k = ch; keyEls[ch] = b; }
            kr.appendChild(b);
        });
        elKeys.appendChild(kr);
    });
    elKeys.addEventListener("click", function (e) {
        var b = e.target.closest(".w-key"); if (!b) return;
        b.blur();
        press(b.dataset.k);
    });

    var toastTimer = 0;
    function toast(msg, ms) {
        elToast.textContent = msg; elToast.classList.add("show");
        clearTimeout(toastTimer); toastTimer = setTimeout(function () { elToast.classList.remove("show"); }, ms || 1600);
    }

    /* 채점: 같은 글자가 여러 번 나와도 정답에 있는 개수만큼만 초록·노랑 */
    function score(guess, answer) {
        var res = ["no", "no", "no", "no", "no"], left = {};
        for (var i = 0; i < LEN; i++) {
            if (guess[i] === answer[i]) res[i] = "ok";
            else left[answer[i]] = (left[answer[i]] || 0) + 1;
        }
        for (i = 0; i < LEN; i++) {
            if (res[i] === "ok") continue;
            if (left[guess[i]] > 0) { res[i] = "in"; left[guess[i]]--; }
        }
        return res;
    }

    var RANK = { no: 1, "in": 2, ok: 3 };
    function paintKeys() {
        Object.keys(keyEls).forEach(function (k) { keyEls[k].classList.remove("ok", "in", "no"); });
        var best = {};
        G.guesses.forEach(function (g) {
            var s = score(g, G.entry[0]);
            for (var i = 0; i < LEN; i++) { var ch = g[i]; if (!best[ch] || RANK[s[i]] > RANK[best[ch]]) best[ch] = s[i]; }
        });
        Object.keys(best).forEach(function (ch) { if (keyEls[ch]) keyEls[ch].classList.add(best[ch]); });
    }

    function paintAll() {
        for (var r = 0; r < TRIES; r++) {
            var g = G.guesses[r], cells = rows[r].cells;
            var s = g ? score(g, G.entry[0]) : null;
            var text = g || (r === G.guesses.length ? G.cur : "");
            for (var c = 0; c < LEN; c++) {
                var el = cells[c];
                el.className = "w-tile";
                el.textContent = text[c] || "";
                if (s) el.classList.add(s[c]);
                else if (text[c]) el.classList.add("filled");
            }
        }
        paintKeys();
    }

    function paintCurrent() {
        var r = G.guesses.length; if (r >= TRIES) return;
        var cells = rows[r].cells;
        for (var c = 0; c < LEN; c++) {
            var ch = G.cur[c] || "";
            if (cells[c].textContent !== ch) {
                cells[c].textContent = ch;
                cells[c].className = "w-tile" + (ch ? " filled" : "");
            }
        }
    }

    /* ======================= 입력 ======================= */
    function press(k) {
        if (!G || busy) return;
        if (G.done) { if (k === "Enter" && elResult.hidden) showResult(); return; }
        audio();
        if (k === "Enter") return submit();
        if (k === "Backspace") { if (G.cur) { G.cur = G.cur.slice(0, -1); sndDel(); paintCurrent(); persist(); } return; }
        if (/^[a-z]$/.test(k) && G.cur.length < LEN) { G.cur += k; sndKey(); paintCurrent(); persist(); }
    }

    function shake(msg) {
        var row = rows[G.guesses.length].el;
        row.classList.remove("shake"); void row.offsetWidth; row.classList.add("shake");
        sndBad(); toast(msg);
    }

    function submit() {
        if (G.cur.length < LEN) return shake(T("글자가 모자라요 (5글자)", "Not enough letters"));
        if (!VALID[G.cur]) return shake(T("단어 목록에 없어요", "Not in word list"));
        var guess = G.cur, r = G.guesses.length, s = score(guess, G.entry[0]);
        G.guesses.push(guess); G.cur = "";
        var win = guess === G.entry[0];
        if (win || G.guesses.length >= TRIES) { G.done = true; G.win = win; }
        persist();
        busy = true;
        var cells = rows[r].cells;
        cells.forEach(function (el, i) {
            setTimeout(function () {
                el.classList.remove("filled"); el.classList.add("flip");
                setTimeout(function () { el.classList.add(s[i]); }, 230);
            }, i * FLIP_GAP);
            sndFlip(s[i], i * FLIP_GAP / 1000 + 0.2);
        });
        setTimeout(function () {
            cells.forEach(function (el) { el.classList.remove("flip"); });
            paintKeys();
            busy = false;
            if (G.done) finish();
        }, (LEN - 1) * FLIP_GAP + 520);
    }

    var PRAISE_KO = ["천재예요! 🤯", "대단해요! 🎉", "멋져요! 👏", "잘했어요! 😊", "좋아요! 👍", "휴, 아슬아슬! 😅"];
    var PRAISE_EN = ["Genius! 🤯", "Magnificent! 🎉", "Impressive! 👏", "Splendid! 😊", "Great! 👍", "Phew! 😅"];
    function finish() {
        var n = G.guesses.length;
        if (G.win) {
            rows[n - 1].cells.forEach(function (el, i) { setTimeout(function () { el.classList.add("jump"); }, i * 90); });
            sndWin(); toast(EN ? PRAISE_EN[n - 1] : PRAISE_KO[n - 1], 1500);
        } else {
            sndLose(); toast(T("아쉬워요! 정답은 ", "The word was ") + G.entry[0].toUpperCase(), 2000);
        }
        if (!G.counted) {
            G.counted = true;
            if (mode === "daily") {
                var day = G.no;
                stats.played++;
                if (G.win) {
                    stats.wins++; stats.dist[n - 1]++;
                    stats.streak = stats.lastDay === day - 1 ? stats.streak + 1 : 1;
                    stats.lastDay = day;
                    if (stats.streak > stats.best) stats.best = stats.streak;
                } else { stats.streak = 0; stats.lastDay = 0; }
                save("wordStats.v1", stats);
            } else {
                prac.played++; if (G.win) prac.wins++;
                save("wordPractice.v1", prac);
            }
            persist();
        }
        paintRecord();
        setTimeout(showResult, G.win ? 1500 : 1900);
    }

    /* ======================= 결과 창 ======================= */
    var nextTimer = 0;
    function showResult() {
        var e = G.entry;
        $("wResultTitle").textContent = G.win
            ? T(G.guesses.length + "번 만에 맞혔어요! 🎉", "Solved in " + G.guesses.length + "! 🎉")
            : T("다음엔 맞힐 수 있어요 💪", "Better luck next time 💪");
        $("wWord").textContent = e[0].toUpperCase();
        $("wMean").textContent = EN ? "Korean: " + e[1] : e[1];
        $("wEx").textContent = e[2] || "";
        $("wExKo").textContent = EN ? "" : (e[3] || "");
        $("wPlayMore").textContent = mode === "daily" ? T("연습하기", "Practice") : T("다음 문제", "Next word");
        elResult.hidden = false;
        clearInterval(nextTimer);
        if (mode === "daily") { tickNext(); nextTimer = setInterval(tickNext, 1000); }
        else $("wNext").textContent = "";
    }
    function tickNext() {
        var now = Date.now() + 9 * 3600e3, left = 864e5 - (now % 864e5);
        var h = Math.floor(left / 3600e3), m = Math.floor(left % 3600e3 / 6e4), s = Math.floor(left % 6e4 / 1e3);
        var hms = h + ":" + (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
        $("wNext").textContent = T("다음 문제까지 ", "Next word in ") + hms;
        if (mode === "daily" && G && G.no !== puzzleNo()) { clearInterval(nextTimer); startDaily(); }
    }
    function hideResult() { elResult.hidden = true; clearInterval(nextTimer); }

    $("wResultClose").addEventListener("click", hideResult);
    elResult.addEventListener("click", function (e) { if (e.target === elResult) hideResult(); });
    $("wPlayMore").addEventListener("click", function () { sndBtn(); hideResult(); startPractice(true); });

    $("wShare").addEventListener("click", function () {
        var title = mode === "daily" ? T("오늘의 영단어 #", "Daily Word #") + G.no : T("오늘의 영단어 연습", "Daily Word practice");
        var lines = G.guesses.map(function (g) {
            return score(g, G.entry[0]).map(function (k) { return k === "ok" ? "🟩" : k === "in" ? "🟨" : "⬜"; }).join("");
        });
        var text = title + " " + (G.win ? G.guesses.length : "X") + "/" + TRIES + "\n" + lines.join("\n") + "\n" + location.href.split("?")[0].split("#")[0];
        copyText(text, function (ok) { toast(ok ? T("결과를 복사했어요 📋", "Copied to clipboard 📋") : T("복사하지 못했어요", "Couldn't copy")); });
    });
    function copyText(text, done) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallback()); });
        } else done(fallback());
        function fallback() {
            try {
                var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", "");
                ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
                var ok = document.execCommand("copy"); ta.remove(); return ok;
            } catch (e) { return false; }
        }
    }

    /* ======================= 기록 ======================= */
    function paintRecord() {
        var rate = stats.played ? Math.round(stats.wins / stats.played * 100) : 0;
        var max = Math.max.apply(null, stats.dist.concat([1]));
        var hot = mode === "daily" && G && G.done && G.win ? G.guesses.length - 1 : -1;
        var dist = stats.dist.map(function (v, i) {
            return '<div><span>' + (i + 1) + '</span><i class="' + (i === hot ? "hot" : "") + '" style="width:' + Math.max(8, Math.round(v / max * 100)) + '%">' + v + '</i></div>';
        }).join("");
        $("wRecord").innerHTML =
            T("오늘의 문제 ", "Daily: ") + "<b>" + stats.played + "</b>" + T("판 · 성공률 ", " played · win ") + "<b>" + rate + "%</b><br>" +
            T("연속 성공 ", "Streak ") + "<b>" + stats.streak + "</b>" + T("일 · 최고 ", " · best ") + "<b>" + stats.best + "</b>" + T("일", "") + "<br>" +
            T("몇 번 만에 맞혔나", "Guess distribution") + '<div class="w-dist">' + dist + "</div>" +
            '<div style="margin-top:6px">' + T("연습 ", "Practice: ") + "<b>" + prac.wins + "</b> / " + prac.played + T(" 성공", " solved") + "</div>";
    }

    /* ======================= 모드 ======================= */
    function persist() {
        if (!G) return;
        if (mode === "daily") save("wordDaily.v1", { no: G.no, guesses: G.guesses, cur: G.cur, done: G.done, win: G.win, counted: !!G.counted });
        else save("wordPracticeState.v1", { w: G.entry[0], guesses: G.guesses, cur: G.cur, done: G.done, win: G.win, counted: !!G.counted });
    }
    function setTab() {
        $("wTabDaily").classList.toggle("on", mode === "daily");
        $("wTabPractice").classList.toggle("on", mode === "practice");
        $("wTabDaily").setAttribute("aria-selected", mode === "daily");
        $("wTabPractice").setAttribute("aria-selected", mode === "practice");
        $("wNew").disabled = mode === "daily";
        elSub.textContent = mode === "daily"
            ? T("오늘의 문제 #" + G.no + " · 6번 안에 맞혀 보세요", "Puzzle #" + G.no + " · six tries")
            : T("연습 문제 · 몇 번이든 새로 풀 수 있어요", "Practice · play as many as you like");
    }
    function startDaily() {
        mode = "daily"; hideResult();
        var no = puzzleNo(), st = load("wordDaily.v1", null);
        G = { no: no, entry: dailyEntry(no), guesses: [], cur: "", done: false, win: false };
        if (st && st.no === no) { G.guesses = (st.guesses || []).slice(0, TRIES); G.cur = st.cur || ""; G.done = !!st.done; G.win = !!st.win; G.counted = !!st.counted; }
        /* 하루를 건너뛰었으면 연속 기록 끊기 */
        if (stats.lastDay && stats.lastDay < no - 1 && stats.streak) { stats.streak = 0; save("wordStats.v1", stats); }
        setTab(); paintAll(); paintRecord();
        if (G.done) setTimeout(showResult, 300);
    }
    function findEntry(w) { for (var i = 0; i < ANSWERS.length; i++) if (ANSWERS[i][0] === w) return ANSWERS[i]; return null; }
    function startPractice(fresh) {
        mode = "practice"; hideResult();
        var st = fresh ? null : load("wordPracticeState.v1", null), entry = st && findEntry(st.w);
        if (entry && !st.done) {
            G = { entry: entry, guesses: (st.guesses || []).slice(0, TRIES), cur: st.cur || "", done: false, win: false };
        } else {
            var today = mode === "daily" ? null : dailyEntry(puzzleNo())[0], pick;
            do { pick = ANSWERS[Math.floor(Math.random() * ANSWERS.length)]; } while (ANSWERS.length > 1 && pick[0] === today);
            G = { entry: pick, guesses: [], cur: "", done: false, win: false };
        }
        persist(); setTab(); paintAll(); paintRecord();
    }

    $("wTabDaily").addEventListener("click", function () { if (mode !== "daily" && !busy) { sndBtn(); startDaily(); } });
    $("wTabPractice").addEventListener("click", function () { if (mode !== "practice" && !busy) { sndBtn(); startPractice(false); } });
    $("wNew").addEventListener("click", function () { if (busy) return; sndBtn(); startPractice(true); });

    /* 마우스·손가락으로 누른 버튼은 바로 초점을 빼서, 그다음 Enter가 그 버튼이 아니라 단어 확인으로 가게 */
    document.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest("button");
        if (b && e.detail > 0) b.blur();
    });

    /* 키보드: 한글 입력 상태여도 자판 위치(KeyA 등)로 영어 글자를 알아냄 */
    document.addEventListener("keydown", function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        var k = e.key;
        if (k === "Enter" || k === "Backspace") {
            if (e.target && e.target.tagName === "BUTTON" && k === "Enter" && !e.target.classList.contains("w-key")) return;
            e.preventDefault(); press(k); return;
        }
        if (k === "Escape") { hideResult(); return; }
        var ch = /^[a-zA-Z]$/.test(k) ? k.toLowerCase() : (/^Key[A-Z]$/.test(e.code || "") ? e.code.slice(3).toLowerCase() : "");
        if (ch) { e.preventDefault(); press(ch); }
    });

    /* 소리 버튼 */
    var btnSound = $("wSound");
    function syncSound() {
        btnSound.classList.toggle("muted", muted);
        var l = muted ? T("소리 켜기", "Sound on") : T("소리 끄기", "Sound off");
        btnSound.setAttribute("aria-label", l); btnSound.title = l;
    }
    btnSound.addEventListener("click", function () { muted = !muted; save("wordMuted.v1", muted); syncSound(); if (!muted) sndBtn(); });
    syncSound();

    /* 종료: 창 닫기 (안 닫히면 홈으로) */
    $("wExit").addEventListener("click", function () {
        sndBtn();
        setTimeout(function () {
            window.close();
            setTimeout(function () { if (!window.closed) location.href = T("index.html", "index-en.html"); }, 250);
        }, 300);
    });

    if (!ANSWERS.length) { elSub.textContent = T("단어 자료(word-data.js)를 불러오지 못했어요", "Couldn't load word-data.js"); return; }
    startDaily();
})();
