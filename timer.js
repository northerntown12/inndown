window.T = window.T || function (ko) { return ko; };   /* lang.js가 없어도 한국어로 동작 */
/* =========================================================
   타이머 · 스톱워치 · 뽀모도로 · 인터벌 (timer.html / timer-en.html, 2026-11-27)
   - 위 알약 버튼 4개로 모드를 바꿔요. 모든 시간은 "끝나는 시각"을 기준으로 계산해서
     탭을 옮기거나 새로고침해도 어긋나지 않아요 (이 기기에 기억 "timerTool.v1").
   - 타이머: 여러 개 동시에(최대 8개), 이름 붙이기, 자주 쓰는 시간, 최근 시간, 몇 시에 울리기, +1분
   - 스톱워치: 1/100초, 랩(가장 빠른·느린 표시), 복사·CSV 저장
   - 뽀모도로: 집중·짧은 휴식·긴 휴식, 자동 시작, 째깍 소리, 오늘 🍅 수·7일 기록
   - 인터벌(운동): 준비·운동·휴식·라운드, 3·2·1 삐 소리, 구간마다 음성 안내
   - 알림: 소리 5가지(Web Audio로 직접 만든 소리, 녹음 파일 없음)·볼륨·울리는 시간,
     진동(폰), 음성 안내, 브라우저 알림, 탭 제목·아이콘에 남은 시간, 화면 꺼짐 막기, 크게 보기
   - 단축키: Space 시작/멈춤 · R 초기화 · L 랩 · F 크게 보기 · 1~4 모드 · Esc 알람 끄기
   - 주소로 시작하기: timer.html?m=sw|pomo|iv , timer.html?t=180 (3분 타이머 준비)
   - 서버로 보내는 것 없음. 브라우저 알림 권한은 사용자가 버튼을 눌렀을 때만 물어봐요.
   ========================================================= */
(function () {
    "use strict";
    const $ = id => document.getElementById(id);
    const stage = $("tm-stage");
    if (!stage) return;

    const EN = !!window.SITE_EN;
    const KEY = "timerTool.v1";
    const LOC = EN ? "en-US" : "ko-KR";
    const BASE_TITLE = document.title;
    const MAX_TIMERS = 8;

    /* ---------------- 작은 도구 ---------------- */
    const pad = n => String(n).padStart(2, "0");
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const now = () => Date.now();
    function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
    let saveT = 0;
    function save() {
        clearTimeout(saveT);
        saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 120);
    }
    /* 남은 시간 (초 올림): 4.2초 남음 → 00:05 */
    function fmtLeft(ms) {
        const s = Math.max(0, Math.ceil(ms / 1000));
        const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
        return h ? h + ":" + pad(m) + ":" + pad(x) : pad(m) + ":" + pad(x);
    }
    /* 지난 시간 (초 내림) */
    function fmtUp(ms) {
        const s = Math.max(0, Math.floor(ms / 1000));
        const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
        return h ? h + ":" + pad(m) + ":" + pad(x) : pad(m) + ":" + pad(x);
    }
    /* 스톱워치: 1/100초 */
    function fmtSW(ms, short) {
        ms = Math.max(0, ms);
        const cs = Math.floor(ms / 10) % 100, s = Math.floor(ms / 1000);
        const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
        const main = h ? h + ":" + pad(m) + ":" + pad(x) : pad(m) + ":" + pad(x);
        return short ? main + "." + pad(cs) : { main: main, cs: pad(cs) };
    }
    /* "5분", "1시간 30분", "45초" */
    function human(ms) {
        const s = Math.round(ms / 1000);
        const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
        const out = [];
        if (EN) {
            if (h) out.push(h + " h"); if (m) out.push(m + " min"); if (x || !out.length) out.push(x + " s");
        } else {
            if (h) out.push(h + "시간"); if (m) out.push(m + "분"); if (x || !out.length) out.push(x + "초");
        }
        return out.join(" ");
    }
    function clockStr(ts) {
        return new Date(ts).toLocaleTimeString(LOC, { hour: "numeric", minute: "2-digit" });
    }
    function today(ts) { const d = new Date(ts || now()); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
    let uid = 0;
    const newId = () => "t" + now().toString(36) + (uid++);

    /* ---------------- 저장된 상태 ---------------- */
    const DEF_SET = { sound: "bell", vol: 0.7, ringFor: 30, vibrate: true, speak: true, notify: false, titleShow: true, awake: true };
    const S = load();
    S.mode = ["timer", "sw", "pomo", "iv"].indexOf(S.mode) >= 0 ? S.mode : "timer";
    S.set = Object.assign({}, DEF_SET, S.set || {});
    S.timers = Array.isArray(S.timers) && S.timers.length ? S.timers.slice(0, MAX_TIMERS) : [];
    if (!S.timers.length) S.timers.push(makeTimer(5 * 60000));
    if (!S.timers.some(t => t.id === S.sel)) S.sel = S.timers[0].id;
    S.recent = Array.isArray(S.recent) ? S.recent.slice(0, 6) : [];
    S.sw = Object.assign({ run: false, start: 0, acc: 0, laps: [] }, S.sw || {});
    S.pomo = Object.assign({ focus: 25, short: 5, long: 15, every: 4, autoBreak: true, autoFocus: false, tick: false, task: "",
        phase: "focus", state: "idle", end: 0, left: 0, total: 0, count: 0 }, S.pomo || {});
    S.log = S.log && typeof S.log === "object" ? S.log : {};
    S.iv = Object.assign({ prep: 10, work: 40, rest: 20, rounds: 8,
        phase: "prep", state: "idle", round: 1, end: 0, left: 0, total: 0 }, S.iv || {});
    S.tMode = S.tMode === "at" ? "at" : "dur";
    S.atTime = /^\d\d:\d\d$/.test(S.atTime || "") ? S.atTime : "";

    function makeTimer(dur, label) {
        return { id: newId(), label: label || "", dur: dur, total: dur, state: "idle", end: 0, left: 0, doneAt: 0 };
    }
    const selTimer = () => S.timers.find(t => t.id === S.sel) || S.timers[0];

    /* ---------------- 소리 (Web Audio로 직접 만듦) ---------------- */
    let AC = null, master = null;
    function ac() {
        try {
            if (!AC) {
                const C = window.AudioContext || window.webkitAudioContext;
                if (!C) return null;
                AC = new C(); master = AC.createGain(); master.connect(AC.destination);
            }
            if (AC.state === "suspended") AC.resume();
            master.gain.value = S.set.vol;
            return AC;
        } catch (e) { return null; }
    }
    function tone(f, t0, dur, type, g, attack) {
        const c = AC, o = c.createOscillator(), v = c.createGain();
        o.type = type || "sine"; o.frequency.setValueAtTime(f, t0);
        v.gain.setValueAtTime(0.0001, t0);
        v.gain.exponentialRampToValueAtTime(g || 0.3, t0 + (attack || 0.008));
        v.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(v); v.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
    }
    /* 알람 소리: 한 번 울리는 묶음, 돌려주는 값 = 다음 묶음까지 초 */
    const SOUNDS = {
        bell:    { name: T("탁상 종", "Desk bell"), play(t) { [0, 0.45].forEach(d => { tone(1318, t + d, 1.2, "sine", 0.35); tone(2637, t + d, 0.6, "sine", 0.08); tone(1976, t + d, 0.9, "triangle", 0.06); }); return 1.6; } },
        beep:    { name: T("디지털 삐삐", "Digital beep"), play(t) { for (let i = 0; i < 4; i++) tone(2093, t + i * 0.16, 0.1, "square", 0.12, 0.003); return 1.2; } },
        chime:   { name: T("차임 (딩동댕)", "Chime"), play(t) { [659, 784, 1047].forEach((f, i) => { tone(f, t + i * 0.28, 1.1, "triangle", 0.28); tone(f * 2, t + i * 0.28, 0.5, "sine", 0.05); }); return 2.0; } },
        marimba: { name: T("마림바", "Marimba"), play(t) { [784, 988, 1175, 988, 1568].forEach((f, i) => { tone(f, t + i * 0.14, 0.35, "sine", 0.32, 0.004); tone(f * 4, t + i * 0.14, 0.06, "sine", 0.05, 0.002); }); return 1.5; } },
        soft:    { name: T("부드러운 알림", "Gentle"), play(t) { [523, 659].forEach((f, i) => tone(f, t + i * 0.5, 1.4, "sine", 0.3, 0.12)); return 2.2; } }
    };
    function playSound(key) { const c = ac(); if (!c) return 1.5; return (SOUNDS[key] || SOUNDS.bell).play(c.currentTime + 0.03); }
    /* 짧은 신호음 (인터벌 3·2·1, 구간 바뀜, 뽀모도로 자동 진행) */
    function cue(kind) {
        const c = ac(); if (!c) return; const t = c.currentTime + 0.02;
        if (kind === "count") tone(880, t, 0.12, "sine", 0.3, 0.004);
        else if (kind === "go") { tone(1320, t, 0.18, "square", 0.12, 0.003); tone(1760, t + 0.2, 0.35, "square", 0.12, 0.003); }
        else if (kind === "rest") { tone(784, t, 0.3, "triangle", 0.3); tone(523, t + 0.25, 0.5, "triangle", 0.3); }
        else if (kind === "tick") tone(1800, t, 0.03, "square", 0.025, 0.001);
        else if (kind === "start") tone(1047, t, 0.15, "sine", 0.25, 0.005);
        else if (kind === "fanfare") [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.13, i === 3 ? 0.8 : 0.2, "triangle", 0.3));
    }
    function vibrate(p) { if (S.set.vibrate && navigator.vibrate) try { navigator.vibrate(p); } catch (e) {} }
    /* 음성 안내 (2026-11-27 18:4x): 기본은 젊고 밝은 여성 목소리를 골라 씀
       - 기기마다 들어 있는 목소리가 달라서, 이름으로 여성 목소리를 찾고(자연스러운 "Natural/Online" 우선) 남성은 피함
       - 음높이를 조금 올리고(1.15) 살짝 빠르게(1.05) 해서 밝게. 사용자가 목록에서 직접 고를 수도 있음 (S.set.voice) */
    const LANG = EN ? "en" : "ko";
    const FEMALE = EN ? /samantha|ava|allison|zira|aria|jenny|michelle|emma|ana\b|libby|sonia|karen|moira|tessa|serena|susan|victoria|female|google us english/i
                      : /sunhi|sun-hi|yuna|heami|sora|seoyeon|jimin|seohyeon|yujin|jiyoung|google 한국|female|여성|여자/i;
    const MALE = /injoon|hyunsu|bongjin|gookmin|david|mark|guy|daniel|alex\b|fred|george|ryan|eric|christopher|male\b|남성|남자/i;
    function voices() { try { return (speechSynthesis.getVoices() || []).filter(v => (v.lang || "").toLowerCase().indexOf(LANG) === 0); } catch (e) { return []; } }
    function scoreVoice(v) {
        let s = 0;
        if (FEMALE.test(v.name)) s += 10;
        if (MALE.test(v.name)) s -= 20;
        if (/natural|online|neural|premium|enhanced/i.test(v.name)) s += 5;
        if (/^ko-kr|^en-us/i.test(v.lang)) s += 2;
        if (v.localService === false) s += 1;
        return s;
    }
    function pickVoice() {
        const list = voices(); if (!list.length) return null;
        if (S.set.voice) { const own = list.find(v => v.name === S.set.voice); if (own) return own; }
        return list.slice().sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
    }
    function speak(text, force) {
        if ((!S.set.speak && !force) || !window.speechSynthesis || !text) return;
        try {
            speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text), v = pickVoice();
            u.lang = v ? v.lang : (EN ? "en-US" : "ko-KR"); if (v) u.voice = v;
            u.pitch = 1.15; u.rate = 1.05; u.volume = 1;
            speechSynthesis.speak(u);
        } catch (e) {}
    }

    /* ---------------- 알람 (울리는 중) ---------------- */
    const ringBox = $("tm-ring");
    let ringing = [];          // [{key, title, body, again}]
    let ringLoop = 0, ringStop = 0, ringStarted = 0;
    function startRing(item) {
        ringing = ringing.filter(r => r.key !== item.key).concat(item);
        renderRing();
        if (!ringLoop) {
            ringStarted = now();
            const once = () => {
                const gap = playSound(S.set.sound);
                vibrate([400, 200, 400]);
                ringLoop = setTimeout(once, (gap + 0.5) * 1000);
            };
            once();
            if (S.set.ringFor > 0) ringStop = setTimeout(() => stopRing(true), S.set.ringFor * 1000);
        }
        setTimeout(() => speak(item.say || item.title), 1300);
        notify(item.title, item.body);
        flashTitle();
    }
    function stopRing(keepBox) {
        clearTimeout(ringLoop); clearTimeout(ringStop); ringLoop = 0; ringStop = 0;
        if (navigator.vibrate) try { navigator.vibrate(0); } catch (e) {}
        if (!keepBox) { ringing = []; renderRing(); }
        else { ringBox.classList.add("is-quiet"); }
        try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) {}
    }
    function renderRing() {
        if (!ringing.length) { ringBox.hidden = true; ringBox.classList.remove("is-quiet"); document.body.classList.remove("tm-ringing"); return; }
        ringBox.hidden = false; ringBox.classList.remove("is-quiet");
        document.body.classList.add("tm-ringing");
        $("tm-ring-list").innerHTML = ringing.map(r =>
            '<li><b>' + esc(r.title) + '</b>' + (r.body ? '<small>' + esc(r.body) + '</small>' : '') +
            (r.again ? '<span class="tm-ring-acts"><button type="button" data-again="' + esc(r.key) + '">' + T("+1분 더", "+1 min") + '</button>' +
                '<button type="button" data-restart="' + esc(r.key) + '">' + T("다시 시작", "Restart") + '</button></span>' : '') + '</li>').join("");
        const off = $("tm-ring-off"); if (off) setTimeout(() => { try { off.focus(); } catch (e) {} }, 30);
    }
    $("tm-ring-off").addEventListener("click", () => stopRing());
    $("tm-ring-list").addEventListener("click", e => {
        const a = e.target.closest("[data-again]"), r = e.target.closest("[data-restart]");
        if (!a && !r) return;
        const key = (a || r).getAttribute(a ? "data-again" : "data-restart");
        const t = S.timers.find(x => x.id === key);
        ringing = ringing.filter(x => x.key !== key);
        if (!ringing.length) stopRing(); else renderRing();
        if (!t) return;
        if (a) { t.total = 60000; t.state = "run"; t.end = now() + 60000; }
        else { t.total = t.dur; t.state = "run"; t.end = now() + t.dur; }
        S.sel = t.id; save(); renderAll();
    });

    /* 브라우저 알림 */
    function notifyOK() { return "Notification" in window && Notification.permission === "granted" && S.set.notify; }
    function notify(title, body) {
        if (!notifyOK()) return;
        try {
            const n = new Notification(title, { body: body || "", tag: "wowezbox-timer", renotify: true, requireInteraction: true, silent: false });
            n.onclick = () => { window.focus(); stopRing(); n.close(); };
        } catch (e) {}
    }
    /* 탭 제목 깜빡임 */
    let flashT = 0;
    function flashTitle() {
        clearInterval(flashT); let on = false;
        flashT = setInterval(() => {
            if (!ringing.length) { clearInterval(flashT); flashT = 0; updateTitle(true); return; }
            on = !on; document.title = on ? "⏰ " + T("시간 됐어요!", "Time's up!") : ringing[0].title;
        }, 900);
    }

    /* ---------------- 화면 꺼짐 막기 ---------------- */
    let lock = null;
    async function wakeSync() {
        const want = S.set.awake && anyRunning() && document.visibilityState === "visible";
        try {
            if (want && !lock && navigator.wakeLock) { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => { lock = null; }); }
            else if (!want && lock) { await lock.release(); lock = null; }
        } catch (e) { lock = null; }
    }
    function anyRunning() {
        return S.timers.some(t => t.state === "run") || S.sw.run || S.pomo.state === "run" || S.iv.state === "run";
    }

    /* ---------------- 타이머 ---------------- */
    function tLeft(t) {
        if (t.state === "run") return t.end - now();
        if (t.state === "pause") return t.left;
        if (t.state === "done") return 0;
        return t.dur;
    }
    function tTitle(t) { return t.label || T("타이머", "Timer") + " " + human(t.total || t.dur); }
    function pushRecent(ms) {
        if (!ms) return;
        S.recent = [ms].concat(S.recent.filter(x => x !== ms)).slice(0, 6);
    }
    function tStart(t) {
        ac();
        if (t.state === "pause") { t.end = now() + t.left; }
        else {
            if (t === selTimer() && S.mode === "timer" && S.tMode === "at") {
                const ms = untilClock(S.atTime);
                if (!ms) { $("tm-at").focus(); return; }
                t.dur = ms; if (!t.label) t.label = S.atTime + " " + T("알람", "alarm");
            } else readEditor(t);
            if (t.dur < 1000) { flashEditor(); return; }
            t.total = t.dur; t.end = now() + t.dur; pushRecent(t.dur);
        }
        t.state = "run"; cue("start"); save(); renderAll();
    }
    function tPause(t) { if (t.state !== "run") return; t.left = Math.max(0, t.end - now()); t.state = "pause"; save(); renderAll(); }
    function tReset(t) { t.state = "idle"; t.end = 0; t.left = 0; t.total = t.dur; ringing = ringing.filter(r => r.key !== t.id); if (!ringing.length) stopRing(); else renderRing(); save(); renderAll(); }
    function tAdd(t, ms) {
        if (t.state === "run") { t.end += ms; t.total += ms; }
        else if (t.state === "pause") { t.left += ms; t.total += ms; }
        else if (t.state === "done") { t.state = "run"; t.total = ms; t.end = now() + ms; ringing = ringing.filter(r => r.key !== t.id); if (!ringing.length) stopRing(); else renderRing(); }
        else { t.dur = Math.min(t.dur + ms, 100 * 3600000 - 1000); t.total = t.dur; }
        save(); renderAll();
    }
    function tDone(t, late) {
        t.state = "done"; t.doneAt = t.end; save();
        if (late > 90000) return;          // 오래전에 끝난 것(창을 닫아 둔 동안)은 조용히 "끝남"으로만
        startRing({ key: t.id, title: "⏰ " + tTitle(t) + " " + T("끝!", "done!"), body: T("설정 ", "") + human(t.total) + T(" · ", " timer · ended ") + clockStr(t.end) + T("에 끝남", ""),
            say: (t.label ? t.label + ", " : "") + T("시간이 다 됐어요!", "Time is up!"), again: true });
    }
    function untilClock(hhmm) {
        const m = /^(\d\d):(\d\d)$/.exec(hhmm || ""); if (!m) return 0;
        const d = new Date(); d.setHours(+m[1], +m[2], 0, 0);
        if (d.getTime() <= now() + 500) d.setDate(d.getDate() + 1);
        return d.getTime() - now();
    }

    /* ---------------- 스톱워치 ---------------- */
    const swNow = () => S.sw.acc + (S.sw.run ? now() - S.sw.start : 0);
    function swToggle() {
        ac();
        if (S.sw.run) { S.sw.acc = swNow(); S.sw.run = false; }
        else { S.sw.start = now(); S.sw.run = true; cue("start"); }
        save(); renderAll();
    }
    function swLap() { if (!S.sw.run) return; S.sw.laps.push(swNow()); cue("tick"); save(); renderSide(); }
    function swReset() { S.sw = { run: false, start: 0, acc: 0, laps: [] }; save(); renderAll(); }

    /* ---------------- 뽀모도로 ---------------- */
    const P = () => S.pomo;
    const pLen = ph => (ph === "focus" ? P().focus : ph === "short" ? P().short : P().long) * 60000;
    const pName = ph => ph === "focus" ? T("집중", "Focus") : ph === "short" ? T("짧은 휴식", "Short break") : T("긴 휴식", "Long break");
    const pIcon = ph => ph === "focus" ? "🍅" : ph === "short" ? "☕" : "🌿";
    function pLeft() { const p = P(); return p.state === "run" ? p.end - now() : p.state === "pause" ? p.left : pLen(p.phase); }
    function pStart() {
        ac(); const p = P();
        if (p.state === "pause") p.end = now() + p.left;
        else { p.total = pLen(p.phase); p.end = now() + p.total; }
        p.state = "run"; cue("start"); save(); renderAll();
    }
    function pPause() { const p = P(); if (p.state !== "run") return; p.left = Math.max(0, p.end - now()); p.state = "pause"; save(); renderAll(); }
    function pNext(auto) {
        const p = P();
        let next;
        if (p.phase === "focus") { next = p.count > 0 && p.count % Math.max(1, p.every) === 0 ? "long" : "short"; }
        else next = "focus";
        p.phase = next; p.state = "idle"; p.left = 0; p.total = pLen(next);
        if (auto && ((next === "focus" && p.autoFocus) || (next !== "focus" && p.autoBreak))) { p.total = pLen(next); p.end = now() + p.total; p.state = "run"; }
        save(); renderAll();
    }
    function pFinish(late) {
        const p = P(), was = p.phase;
        if (was === "focus") {
            p.count++;
            const d = today(p.end), mins = Math.round((p.total || pLen("focus")) / 60000);
            const L = S.log[d] || { n: 0, m: 0 }; L.n++; L.m += mins; S.log[d] = L;
            const keys = Object.keys(S.log).sort(); while (keys.length > 60) delete S.log[keys.shift()];
        }
        pNext(true);
        if (late > 90000) return;
        const nextP = P().phase, autoRun = P().state === "run";
        const title = was === "focus" ? "🍅 " + T("집중 끝! ", "Focus done! ") + pName(nextP) + T(" 시간이에요", " time")
            : pIcon(nextP) + " " + T("휴식 끝! 다시 집중해 볼까요?", "Break over! Back to focus?");
        const say = was === "focus" ? T("집중 시간이 끝났어요. 쉬어 가세요.", "Focus time is over. Take a break.") : T("휴식이 끝났어요. 다시 집중해요.", "Break is over. Let's focus.");
        if (autoRun) {             // 자동으로 다음 단계가 시작되면 짧게만 알림
            playSound(S.set.sound); vibrate([300, 150, 300]); notify(title, ""); setTimeout(() => speak(say), 1200);
            toast(title);
        } else startRing({ key: "pomo", title: title, body: T("오늘 집중 ", "Today: ") + todayCount() + T("번", " pomodoros"), say: say });
    }
    function pReset() { const p = P(); p.phase = "focus"; p.state = "idle"; p.left = 0; p.count = 0; p.total = pLen("focus"); save(); renderAll(); }
    const todayCount = () => (S.log[today()] || { n: 0 }).n;

    /* ---------------- 인터벌 ---------------- */
    const V = () => S.iv;
    const vLen = ph => (ph === "prep" ? V().prep : ph === "work" ? V().work : V().rest) * 1000;
    const vName = ph => ph === "prep" ? T("준비", "Get ready") : ph === "work" ? T("운동", "Work") : ph === "rest" ? T("휴식", "Rest") : T("완료", "Done");
    function vLeft() { const v = V(); return v.state === "run" ? v.end - now() : v.state === "pause" ? v.left : v.state === "done" ? 0 : vLen(v.phase); }
    function vTotalLeft() {
        const v = V(); if (v.state === "done") return 0;
        let ms = Math.max(0, vLeft());
        const after = v.phase === "prep" ? v.rounds * (v.work + v.rest) - v.rest
            : v.phase === "work" ? (v.rounds - v.round) * (v.work + v.rest)
            : (v.rounds - v.round) * (v.work + v.rest) - v.rest;
        return ms + Math.max(0, after) * 1000;
    }
    let lastBeep = -1;
    function vStart() {
        ac(); const v = V();
        if (v.state === "pause") v.end = now() + v.left;
        else {
            if (v.state === "done") { v.phase = "prep"; v.round = 1; }
            if (v.phase === "prep" && v.prep <= 0) v.phase = "work";
            v.total = vLen(v.phase); v.end = now() + v.total;
            if (v.phase === "work") { cue("go"); speak(T("운동 시작", "Go")); } else cue("start");
        }
        v.state = "run"; lastBeep = -1; save(); renderAll();
    }
    function vPause() { const v = V(); if (v.state !== "run") return; v.left = Math.max(0, v.end - now()); v.state = "pause"; save(); renderAll(); }
    function vAdvance(late) {
        const v = V(), base = v.end;
        if (v.phase === "prep") v.phase = "work";
        else if (v.phase === "work") {
            if (v.round >= v.rounds) { v.phase = "done"; v.state = "done"; save(); renderAll();
                if (!late) { cue("fanfare"); setTimeout(() => startRing({ key: "iv", title: "🏁 " + T("인터벌 운동 완료!", "Interval workout done!"), body: v.rounds + T("라운드를 모두 마쳤어요", " rounds finished"), say: T("수고하셨어요. 운동을 모두 마쳤어요.", "Great job. Workout complete.") }), 900); }
                return; }
            if (v.rest > 0) v.phase = "rest"; else { v.round++; }
        } else { v.phase = "work"; v.round++; }
        v.total = vLen(v.phase); v.end = (late ? now() : base) + v.total; lastBeep = -1;
        if (!late) {
            if (v.phase === "work") { cue("go"); vibrate(300); speak(v.round === v.rounds ? T("마지막 라운드", "Last round") : v.round + T("라운드 시작", ", go")); }
            else { cue("rest"); vibrate([150, 100, 150]); speak(T("휴식", "Rest")); }
        }
        save(); renderAll();
    }
    function vReset() { const v = V(); v.phase = "prep"; v.round = 1; v.state = "idle"; v.left = 0; save(); renderAll(); }
    function vSkip() { const v = V(); if (v.state === "idle" || v.state === "done") return; if (v.state === "pause") { v.state = "run"; } v.end = now(); vAdvance(false); }

    /* ---------------- 화면 그리기 ---------------- */
    const timeEl = $("tm-time"), csEl = $("tm-cs"), underEl = $("tm-under"), phaseEl = $("tm-phase"), subEl = $("tm-sub"), prog = $("tm-prog");
    const CIRC = 2 * Math.PI * 100;
    prog.style.strokeDasharray = CIRC;
    function setRing(frac) { prog.style.strokeDashoffset = CIRC * (1 - clamp(frac, 0, 1)); }

    document.querySelectorAll(".tm-mode").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
    function setMode(m) {
        if (S.mode === m) return;
        S.mode = m; save(); renderAll();
        try { history.replaceState(null, "", location.pathname + (m === "timer" ? "" : "?m=" + m)); } catch (e) {}
    }

    function renderAll() { renderModes(); renderCtrls(); renderEditor(); renderSide(); draw(true); updateTitle(true); wakeSync(); }

    function renderModes() {
        document.querySelectorAll(".tm-mode").forEach(b => {
            const on = b.dataset.mode === S.mode;
            b.classList.toggle("on", on); b.setAttribute("aria-selected", on ? "true" : "false");
            const live = b.dataset.mode === "timer" ? S.timers.some(t => t.state === "run") : b.dataset.mode === "sw" ? S.sw.run : b.dataset.mode === "pomo" ? P().state === "run" : V().state === "run";
            b.classList.toggle("is-live", live && !on);
        });
        stage.dataset.mode = S.mode;
        document.querySelectorAll("[data-for]").forEach(el => { el.hidden = el.getAttribute("data-for").split(" ").indexOf(S.mode) < 0; });
    }

    /* 버튼 줄 */
    const ctrls = $("tm-ctrls");
    function btn(act, label, cls) { return '<button type="button" class="tm-b ' + (cls || "") + '" data-act="' + act + '">' + label + '</button>'; }
    function renderCtrls() {
        let h = "";
        if (S.mode === "timer") {
            const t = selTimer();
            h += t.state === "run" ? btn("pause", "⏸ " + T("일시정지", "Pause"), "main is-run") : btn("start", "▶ " + (t.state === "pause" ? T("계속", "Resume") : T("시작", "Start")), "main");
            h += btn("reset", "↺ " + T("초기화", "Reset")) + btn("plus", "+1" + T("분", " min"));
        } else if (S.mode === "sw") {
            h += S.sw.run ? btn("sw", "⏸ " + T("멈춤", "Stop"), "main is-run") : btn("sw", "▶ " + (S.sw.acc ? T("계속", "Resume") : T("시작", "Start")), "main");
            h += S.sw.run ? btn("lap", "🏁 " + T("랩", "Lap")) : btn("swreset", "↺ " + T("초기화", "Reset"));
        } else if (S.mode === "pomo") {
            const p = P();
            h += p.state === "run" ? btn("ppause", "⏸ " + T("일시정지", "Pause"), "main is-run") : btn("pstart", "▶ " + (p.state === "pause" ? T("계속", "Resume") : pName(p.phase) + T(" 시작", "")), "main");
            h += btn("pskip", "⏭ " + T("건너뛰기", "Skip")) + btn("preset", "↺ " + T("처음부터", "Restart"));
        } else {
            const v = V();
            h += v.state === "run" ? btn("vpause", "⏸ " + T("일시정지", "Pause"), "main is-run") : btn("vstart", "▶ " + (v.state === "pause" ? T("계속", "Resume") : v.state === "done" ? T("다시 하기", "Again") : T("시작", "Start")), "main");
            h += btn("vskip", "⏭ " + T("다음 구간", "Next")) + btn("vreset", "↺ " + T("초기화", "Reset"));
        }
        h += '<button type="button" class="tm-b ghost tm-fullb" data-act="full" title="' + T("크게 보기 (F)", "Full screen (F)") + '" aria-label="' + T("크게 보기", "Full screen") + '">⛶</button>';
        ctrls.innerHTML = h;
    }
    ctrls.addEventListener("click", e => {
        const b = e.target.closest("[data-act]"); if (!b) return;
        doAct(b.dataset.act);
    });
    function doAct(a) {
        const t = selTimer();
        switch (a) {
            case "start": tStart(t); break;
            case "pause": tPause(t); break;
            case "reset": tReset(t); break;
            case "plus": tAdd(t, 60000); break;
            case "sw": swToggle(); break;
            case "lap": swLap(); break;
            case "swreset": swReset(); break;
            case "pstart": pStart(); break;
            case "ppause": pPause(); break;
            case "pskip": { const p = P(); const was = p.state; if (p.phase === "focus" && was !== "idle") { /* 집중을 건너뛰면 기록 안 함 */ } p.state = "idle"; pNext(was === "run"); break; }
            case "preset": pReset(); break;
            case "vstart": vStart(); break;
            case "vpause": vPause(); break;
            case "vskip": vSkip(); break;
            case "vreset": vReset(); break;
            case "full": toggleFull(); break;
        }
    }

    /* 타이머 입력 칸 (선택한 타이머) */
    const edH = $("tm-h"), edM = $("tm-m"), edS = $("tm-s"), edLabel = $("tm-label"), edAt = $("tm-at");
    function renderEditor() {
        const t = selTimer(), lockEd = t.state === "run" || t.state === "pause";
        const d = Math.round(t.dur / 1000);
        if (document.activeElement !== edH) edH.value = Math.floor(d / 3600);
        if (document.activeElement !== edM) edM.value = Math.floor(d % 3600 / 60);
        if (document.activeElement !== edS) edS.value = d % 60;
        if (document.activeElement !== edLabel) edLabel.value = t.label || "";
        [edH, edM, edS, edAt].forEach(x => { x.disabled = lockEd; });
        $("tm-editor").classList.toggle("is-locked", lockEd);
        document.querySelectorAll(".tm-seg button").forEach(b => b.classList.toggle("on", b.dataset.tmode === S.tMode));
        $("tm-dur-box").hidden = S.tMode !== "dur"; $("tm-at-box").hidden = S.tMode !== "at";
        if (document.activeElement !== edAt) edAt.value = S.atTime;
        updateAtHint();
        $("tm-lock-msg").hidden = !lockEd;
        const rc = $("tm-recent");
        rc.innerHTML = S.recent.length ? '<span>' + T("최근", "Recent") + '</span>' + S.recent.map(ms => '<button type="button" data-ms="' + ms + '">' + human(ms) + '</button>').join("") : "";
    }
    function readEditor(t) {
        const h = clamp(parseInt(edH.value, 10) || 0, 0, 99), m = clamp(parseInt(edM.value, 10) || 0, 0, 59 + 60 * 99), s = clamp(parseInt(edS.value, 10) || 0, 0, 59 + 60 * 99);
        t.dur = Math.min((h * 3600 + m * 60 + s) * 1000, 100 * 3600000 - 1000); t.total = t.dur;
        t.label = edLabel.value.trim().slice(0, 30);
    }
    function flashEditor() { const e = $("tm-dur-box"); e.classList.remove("is-shake"); void e.offsetWidth; e.classList.add("is-shake"); }
    [edH, edM, edS].forEach(x => {
        x.addEventListener("input", () => { const t = selTimer(); if (t.state === "idle" || t.state === "done") { if (t.state === "done") t.state = "idle"; readEditor(t); save(); draw(true); renderSide(); } });
        x.addEventListener("focus", () => x.select());
        x.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); tStart(selTimer()); } });
    });
    edLabel.addEventListener("input", () => { const t = selTimer(); t.label = edLabel.value.trim().slice(0, 30); save(); renderSide(); draw(true); });
    edLabel.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); edLabel.blur(); } });
    edAt.addEventListener("input", () => { S.atTime = edAt.value; save(); updateAtHint(); });
    function updateAtHint() {
        const ms = untilClock(S.atTime);
        $("tm-at-hint").textContent = ms ? T("지금부터 ", "Rings in ") + human(Math.ceil(ms / 60000) * 60000) + T(" 뒤에 울려요", "") + (new Date(now() + ms).getDate() !== new Date().getDate() ? T(" (내일)", " (tomorrow)") : "") : T("울릴 시각을 고르세요", "Pick a time");
    }
    document.querySelectorAll(".tm-seg button").forEach(b => b.addEventListener("click", () => { S.tMode = b.dataset.tmode; save(); renderEditor(); if (S.tMode === "at" && !S.atTime) { const d = new Date(now() + 3600000); S.atTime = pad(d.getHours()) + ":00"; renderEditor(); } }));
    /* 자주 쓰는 시간 + 더하기 버튼 */
    const PRESETS = [
        [60, T("1분", "1 min")], [180, T("3분 · 라면", "3 min · noodles")], [300, T("5분", "5 min")], [420, T("7분 · 반숙 달걀", "7 min · soft egg")],
        [600, T("10분", "10 min")], [900, T("15분", "15 min")], [1500, T("25분 · 집중", "25 min · focus")], [1800, T("30분", "30 min")], [3600, T("1시간", "1 hour")]
    ];
    $("tm-presets").innerHTML = PRESETS.map(p => '<button type="button" data-ms="' + p[0] * 1000 + '" data-lb="' + esc(p[1].split(" · ")[1] || "") + '">' + esc(p[1]) + '</button>').join("");
    $("tm-adds").innerHTML = [[10, "+10" + T("초", "s")], [30, "+30" + T("초", "s")], [60, "+1" + T("분", "m")], [300, "+5" + T("분", "m")], [600, "+10" + T("분", "m")]].map(a => '<button type="button" data-add="' + a[0] * 1000 + '">' + a[1] + '</button>').join("") +
        '<button type="button" data-add="0" class="tm-clear">' + T("0으로", "Clear") + '</button>';
    $("tm-editor").addEventListener("click", e => {
        const p = e.target.closest("[data-ms]"), a = e.target.closest("[data-add]");
        const t = selTimer(); if (t.state === "run" || t.state === "pause") return;
        if (p) {
            S.tMode = "dur"; t.state = "idle"; t.dur = +p.dataset.ms; t.total = t.dur;
            if (p.dataset.lb !== undefined && p.dataset.lb) t.label = p.dataset.lb; else if (p.closest("#tm-presets")) t.label = "";
            save(); renderAll(); return;
        }
        if (a) {
            t.state = "idle";
            t.dur = +a.dataset.add === 0 ? 0 : Math.min(t.dur + +a.dataset.add, 100 * 3600000 - 1000); t.total = t.dur;
            S.tMode = "dur"; save(); renderAll();
        }
    });

    /* 옆 카드 (모드마다) */
    const side = $("tm-side-body"), sideH = $("tm-side-h");
    function renderSide() {
        if (S.mode === "timer") renderTimerList();
        else if (S.mode === "sw") renderLaps();
        else if (S.mode === "pomo") renderPomoSide();
        else renderIvSide();
    }
    function renderTimerList() {
        sideH.textContent = T("내 타이머", "My timers") + " (" + S.timers.length + "/" + MAX_TIMERS + ")";
        side.innerHTML = '<ul class="tm-list">' + S.timers.map(t => {
            const left = tLeft(t), frac = t.state === "idle" ? 1 : t.state === "done" ? 0 : left / (t.total || 1);
            const st = t.state === "run" ? T("진행 중", "Running") : t.state === "pause" ? T("멈춤", "Paused") : t.state === "done" ? T("끝남", "Done") : T("대기", "Ready");
            return '<li class="tm-li st-' + t.state + (t.id === S.sel ? " is-sel" : "") + '" data-id="' + t.id + '">' +
                '<button type="button" class="tm-li-pick" data-pick="' + t.id + '"><span class="tm-li-name">' + esc(tTitle(t)) + '</span>' +
                '<b class="tm-li-time" data-live="' + t.id + '">' + (t.state === "done" ? "+" + fmtUp(now() - t.doneAt) : fmtLeft(left)) + '</b>' +
                '<small>' + st + (t.state === "run" ? " · " + T(clockStr(t.end) + "에 끝", "ends " + clockStr(t.end)) : "") + '</small>' +
                '<i class="tm-li-bar"><s data-bar="' + t.id + '" style="width:' + (frac * 100).toFixed(1) + '%"></s></i></button>' +
                '<span class="tm-li-acts">' +
                (t.state === "run" ? '<button type="button" data-tp="' + t.id + '" aria-label="' + T("일시정지", "Pause") + '">⏸</button>' : '<button type="button" data-ts="' + t.id + '" aria-label="' + T("시작", "Start") + '">▶</button>') +
                (S.timers.length > 1 ? '<button type="button" data-tdel="' + t.id + '" aria-label="' + T("지우기", "Delete") + '">✕</button>' : '') +
                '</span></li>';
        }).join("") + '</ul>' +
            (S.timers.length < MAX_TIMERS ? '<button type="button" class="tp-btn solid tm-add" id="tm-add">＋ ' + T("타이머 추가", "Add a timer") + '</button>' : '<p class="tp-small">' + T("타이머는 8개까지 만들 수 있어요.", "Up to 8 timers.") + '</p>') +
            '<p class="tp-small">' + T("여러 개를 동시에 돌릴 수 있어요. 누르면 위 큰 화면에 보여요.", "Run several at once. Tap one to show it on the big dial.") + '</p>';
    }
    side.addEventListener("click", e => {
        const g = k => { const el = e.target.closest("[" + k + "]"); return el ? el.getAttribute(k) : null; };
        let id;
        if ((id = g("data-ts"))) { const t = S.timers.find(x => x.id === id); if (t) { if (t.state === "done") t.state = "idle"; tStart(t); } return; }
        if ((id = g("data-tp"))) { const t = S.timers.find(x => x.id === id); if (t) tPause(t); return; }
        if ((id = g("data-tdel"))) { S.timers = S.timers.filter(x => x.id !== id); ringing = ringing.filter(r => r.key !== id); if (!ringing.length) stopRing(); else renderRing(); if (S.sel === id) S.sel = S.timers[0].id; save(); renderAll(); return; }
        if ((id = g("data-pick"))) { S.sel = id; S.mode = "timer"; save(); renderAll(); return; }
        if (e.target.closest("#tm-add")) { const t = makeTimer(5 * 60000); S.timers.push(t); S.sel = t.id; S.tMode = "dur"; save(); renderAll(); edM.focus(); return; }
        if (e.target.closest("#tm-copy")) { copyLaps(); return; }
        if (e.target.closest("#tm-csv")) { csvLaps(); return; }
        const pre = e.target.closest("[data-ivp]");
        if (pre) { const a = pre.getAttribute("data-ivp").split(","); Object.assign(V(), { prep: +a[0], work: +a[1], rest: +a[2], rounds: +a[3] }); vReset(); return; }
    });

    function lapRows() {
        const L = S.sw.laps; return L.map((tot, i) => ({ n: i + 1, lap: tot - (i ? L[i - 1] : 0), tot: tot }));
    }
    function renderLaps() {
        sideH.textContent = T("랩 기록", "Laps");
        const rows = lapRows();
        if (!rows.length) { side.innerHTML = '<p class="tp-empty">' + T("달리는 중에 [🏁 랩]을 누르면 구간 기록이 여기에 쌓여요. (단축키 L)", "Press [🏁 Lap] while running to record splits here. (Shortcut: L)") + '</p>'; return; }
        const laps = rows.map(r => r.lap), best = Math.min.apply(null, laps), worst = Math.max.apply(null, laps), avg = laps.reduce((a, b) => a + b, 0) / laps.length;
        side.innerHTML = '<div class="tm-lap-sum"><span>' + T("랩", "Laps") + ' <b>' + rows.length + '</b></span><span>' + T("평균", "Avg") + ' <b>' + fmtSW(avg, true) + '</b></span></div>' +
            '<div class="tm-lap-scroll"><table class="tp-table tm-laps"><thead><tr><th>#</th><th>' + T("랩 시간", "Lap") + '</th><th>' + T("전체", "Total") + '</th></tr></thead><tbody>' +
            rows.slice().reverse().map(r => '<tr class="' + (rows.length > 1 && r.lap === best ? "is-best" : rows.length > 1 && r.lap === worst ? "is-worst" : "") + '"><td>' + r.n + '</td><td>' + fmtSW(r.lap, true) +
                (rows.length > 1 && r.lap === best ? ' <em>' + T("가장 빠름", "best") + '</em>' : rows.length > 1 && r.lap === worst ? ' <em>' + T("가장 느림", "slowest") + '</em>' : '') + '</td><td>' + fmtSW(r.tot, true) + '</td></tr>').join("") +
            '</tbody></table></div><div class="tm-lap-btns"><button type="button" class="tp-btn" id="tm-copy">📋 ' + T("복사", "Copy") + '</button><button type="button" class="tp-btn" id="tm-csv">⬇ ' + T("CSV 저장", "Save CSV") + '</button><span class="cc-msg" id="tm-lap-msg"></span></div>';
    }
    function lapText(sep) {
        return ["#" + sep + T("랩 시간", "Lap") + sep + T("전체", "Total")].concat(lapRows().map(r => r.n + sep + fmtSW(r.lap, true) + sep + fmtSW(r.tot, true))).join("\n");
    }
    function copyLaps() {
        const txt = lapText("\t"), msg = () => { const m = $("tm-lap-msg"); if (m) { m.textContent = T("복사했어요", "Copied"); setTimeout(() => { if (m) m.textContent = ""; }, 1600); } };
        if (navigator.clipboard) navigator.clipboard.writeText(txt).then(msg, () => {}); else { const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); msg(); } catch (e) {} ta.remove(); }
    }
    function csvLaps() {
        const blob = new Blob(["\ufeff" + lapText(",")], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "stopwatch-laps-" + today() + ".csv";
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }

    function numField(id, label, val, min, max, unit) {
        return '<label class="tp-field"><span>' + label + '</span><span class="tm-num"><input type="number" id="' + id + '" min="' + min + '" max="' + max + '" value="' + val + '" inputmode="numeric"><em>' + unit + '</em></span></label>';
    }
    function check(id, label, on) { return '<label class="sv-check tm-check"><input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + '> ' + label + '</label>'; }
    function renderPomoSide() {
        const p = P();
        sideH.textContent = T("뽀모도로 설정 · 기록", "Pomodoro settings & stats");
        const days = []; for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = today(d.getTime()); days.push({ k: k, d: d, v: S.log[k] || { n: 0, m: 0 } }); }
        const maxN = Math.max(4, ...days.map(x => x.v.n));
        const wk = EN ? ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] : ["일", "월", "화", "수", "목", "금", "토"];
        const tn = todayCount();
        side.innerHTML =
            '<label class="tp-field tp-wide tm-task"><span>' + T("지금 할 일 (선택)", "Working on (optional)") + '</span><input type="text" id="pm-task" maxlength="40" placeholder="' + T("예: 보고서 초안 쓰기", "e.g. Draft the report") + '" value="' + esc(p.task) + '"></label>' +
            '<div class="tp-fields tm-pfields">' + numField("pm-f", T("집중", "Focus"), p.focus, 1, 180, T("분", "min")) + numField("pm-s", T("짧은 휴식", "Short break"), p.short, 1, 60, T("분", "min")) +
            numField("pm-l", T("긴 휴식", "Long break"), p.long, 1, 90, T("분", "min")) + numField("pm-e", T("긴 휴식 간격", "Long break every"), p.every, 2, 12, T("번째", "")) + '</div>' +
            '<div class="tp-presets tm-ppre"><button type="button" data-pp="25,5,15,4">25 / 5 ' + T("(기본)", "(classic)") + '</button><button type="button" data-pp="50,10,20,3">50 / 10</button><button type="button" data-pp="45,15,30,3">45 / 15</button><button type="button" data-pp="15,3,10,4">15 / 3</button></div>' +
            check("pm-ab", T("휴식 자동으로 시작", "Start breaks automatically"), p.autoBreak) + check("pm-af", T("집중도 자동으로 시작", "Start focus automatically"), p.autoFocus) + check("pm-tk", T("집중할 때 째깍 소리", "Ticking sound while focusing"), p.tick) +
            '<div class="tm-pstat"><div><small>' + T("오늘 집중", "Today") + '</small><b>' + tn + '<span>' + T("번", "") + '</span></b><i>' + ("🍅".repeat(Math.min(tn, 12)) || "—") + '</i></div>' +
            '<div><small>' + T("오늘 집중 시간", "Focus time today") + '</small><b>' + (((S.log[today()] || {}).m || 0) + T("분", " min")) + '</b><i>' + T("이번 묶음 ", "This set ") + (p.count % p.every) + "/" + p.every + '</i></div></div>' +
            '<div class="tm-week" aria-label="' + T("최근 7일 집중 횟수", "Pomodoros in the last 7 days") + '">' + days.map((x, i) =>
                '<div class="tm-wbar' + (i === 6 ? " is-today" : "") + '" title="' + x.k + " · " + x.v.n + T("번 · ", " · ") + x.v.m + T("분", " min") + '"><span>' + (x.v.n || "") + '</span><i style="height:' + Math.round(x.v.n / maxN * 100) + '%"></i><small>' + wk[x.d.getDay()] + '</small></div>').join("") + '</div>' +
            '<p class="tp-small">' + T("기록은 이 기기에만 남아요 (최근 60일).", "Stats stay on this device (last 60 days).") + '</p>';
    }
    function renderIvSide() {
        const v = V();
        sideH.textContent = T("인터벌 설정", "Interval settings");
        const total = (v.prep + v.rounds * (v.work + v.rest) - v.rest) * 1000;
        side.innerHTML =
            '<div class="tp-presets tm-ipre">' + [["10,20,10,8", T("20초/10초 × 8 (타바타식)", "20s/10s × 8 (Tabata-style)")], ["10,40,20,8", "40/20 × 8"], ["10,30,30,10", "30/30 × 10"], ["10,60,60,5", T("1분/1분 × 5", "1m/1m × 5")], ["5,45,15,12", "45/15 × 12"]]
                .map(x => '<button type="button" data-ivp="' + x[0] + '">' + x[1] + '</button>').join("") + '</div>' +
            '<div class="tp-fields tm-pfields">' + numField("iv-p", T("준비", "Get ready"), v.prep, 0, 120, T("초", "s")) + numField("iv-w", T("운동", "Work"), v.work, 5, 3600, T("초", "s")) +
            numField("iv-r", T("휴식", "Rest"), v.rest, 0, 3600, T("초", "s")) + numField("iv-n", T("라운드", "Rounds"), v.rounds, 1, 99, T("회", "×")) + '</div>' +
            '<div class="tm-pstat"><div><small>' + T("전체 시간", "Total time") + '</small><b>' + human(total) + '</b><i>' + T("준비 포함", "incl. get-ready") + '</i></div>' +
            '<div><small>' + T("남은 시간", "Remaining") + '</small><b data-ivleft>' + fmtLeft(v.state === "idle" ? total : vTotalLeft()) + '</b><i>' + T("구간마다 소리·음성 안내", "Beeps & voice cues") + '</i></div></div>' +
            '<p class="tp-small">' + T("구간이 끝나기 3초 전부터 삐-삐-삐 울리고, 운동·휴식이 바뀔 때 소리와 음성으로 알려 줘요.", "Beeps for the last 3 seconds of each part, plus a sound and voice cue when work and rest switch.") + '</p>';
    }
    side.addEventListener("change", e => {
        const id = e.target.id, num = (min, max) => clamp(parseInt(e.target.value, 10) || min, min, max);
        const p = P(), v = V();
        if (id === "pm-f") p.focus = num(1, 180); else if (id === "pm-s") p.short = num(1, 60); else if (id === "pm-l") p.long = num(1, 90); else if (id === "pm-e") p.every = num(2, 12);
        else if (id === "pm-ab") p.autoBreak = e.target.checked; else if (id === "pm-af") p.autoFocus = e.target.checked; else if (id === "pm-tk") p.tick = e.target.checked;
        else if (id === "iv-p") v.prep = num(0, 120); else if (id === "iv-w") v.work = num(5, 3600); else if (id === "iv-r") v.rest = num(0, 3600); else if (id === "iv-n") v.rounds = num(1, 99);
        else return;
        if (id.startsWith("pm-") && p.state === "idle") p.total = pLen(p.phase);
        if (id.startsWith("iv-") && v.state === "idle") v.total = vLen(v.phase);
        save(); renderSide(); renderCtrls(); draw(true);
    });
    side.addEventListener("input", e => { if (e.target.id === "pm-task") { P().task = e.target.value.slice(0, 40); save(); draw(true); } });
    side.addEventListener("click", e => {
        const pp = e.target.closest("[data-pp]"); if (!pp) return;
        const a = pp.getAttribute("data-pp").split(",").map(Number);
        Object.assign(P(), { focus: a[0], short: a[1], long: a[2], every: a[3] }); if (P().state === "idle") P().total = pLen(P().phase);
        save(); renderSide(); draw(true);
    });

    /* 큰 화면 (매 틱) */
    let lastSec = -1;
    function draw(force) {
        let main = "", cs = "", under = "", phase = "", sub = "", frac = 1, cls = "";
        if (S.mode === "timer") {
            const t = selTimer(), left = tLeft(t);
            phase = esc(tTitle(t));
            if (t.state === "done") { main = "+" + fmtUp(now() - t.doneAt); under = T("끝났어요 · ", "Finished at ") + clockStr(t.doneAt); frac = 0; cls = "is-done"; }
            else {
                main = fmtLeft(left); frac = t.state === "idle" ? 1 : left / (t.total || 1);
                under = t.state === "run" ? clockStr(t.end) + T("에 끝나요", "") : t.state === "pause" ? T("멈춤", "Paused") : (S.tMode === "at" && untilClock(S.atTime) ? S.atTime + T("에 울리기", " alarm") : T("준비됐어요", "Ready"));
                if (EN && t.state === "run") under = "Ends at " + clockStr(t.end);
                cls = t.state === "run" ? "is-run" : t.state === "pause" ? "is-pause" : "";
                if (t.state === "run" && left < 10000) cls += " is-last";
            }
            const running = S.timers.filter(x => x.state === "run").length;
            sub = S.timers.length > 1 ? T("타이머 ", "Timers: ") + S.timers.length + T("개", "") + (running ? T(" · ", " · ") + running + T("개 진행 중", " running") : "") : "";
        } else if (S.mode === "sw") {
            const e = swNow(), f = fmtSW(e); main = f.main; cs = "." + f.cs;
            frac = (e % 60000) / 60000; phase = T("스톱워치", "Stopwatch");
            under = S.sw.run ? T("재는 중", "Running") : e ? T("멈춤", "Stopped") : T("준비됐어요", "Ready");
            if (S.sw.laps.length) { const L = S.sw.laps; sub = T("랩 ", "Lap ") + (L.length + 1) + " · " + fmtSW(e - L[L.length - 1], true); }
            cls = (S.sw.run ? "is-run" : e ? "is-pause" : "") + " is-sw";
        } else if (S.mode === "pomo") {
            const p = P(), left = pLeft();
            main = fmtLeft(left); frac = p.state === "idle" ? 1 : left / (p.total || pLen(p.phase));
            phase = pIcon(p.phase) + " " + pName(p.phase) + (p.state === "run" ? T(" 중", "") : "");
            under = p.task ? esc(p.task) : (p.state === "run" ? T(clockStr(p.end) + "까지", "until " + clockStr(p.end)) : T("오늘 ", "Today ") + todayCount() + T("번 집중했어요", " done"));
            sub = T("이번 묶음 ", "Set ") + (p.count % p.every) + "/" + p.every;
            cls = "ph-" + p.phase + (p.state === "run" ? " is-run" : p.state === "pause" ? " is-pause" : "");
        } else {
            const v = V(), left = vLeft();
            main = v.state === "done" ? "🏁" : fmtLeft(left); frac = v.state === "idle" ? 1 : v.state === "done" ? 0 : left / (v.total || vLen(v.phase));
            phase = vName(v.phase) + (v.phase === "work" || v.phase === "rest" ? " · " + v.round + "/" + v.rounds : "");
            under = v.state === "done" ? T("수고하셨어요!", "Well done!") : T("남은 전체 ", "Total left ") + fmtLeft(v.state === "idle" ? (v.prep + v.rounds * (v.work + v.rest) - v.rest) * 1000 : vTotalLeft());
            sub = v.state === "idle" ? T("준비 → 운동 ↔ 휴식", "Ready → Work ↔ Rest") : "";
            cls = "ph-" + v.phase + (v.state === "run" ? " is-run" : v.state === "pause" ? " is-pause" : "") + (v.state === "run" && left < 3500 ? " is-last" : "");
        }
        if (timeEl.textContent !== main) timeEl.textContent = main;
        if (csEl.textContent !== cs) csEl.textContent = cs;
        if (force || underEl.innerHTML !== under) underEl.innerHTML = under;
        if (force || phaseEl.innerHTML !== phase) phaseEl.innerHTML = phase;
        if (subEl.textContent !== sub) subEl.textContent = sub;
        timeEl.classList.toggle("is-long", main.length > 6);
        setRing(frac);
        const c = "tm-stage tp-panel " + cls;
        if (stage.className !== c) stage.className = c;
        /* 옆 목록 숫자만 갈아 끼우기 */
        if (S.mode === "timer") S.timers.forEach(t => {
            const el = side.querySelector('[data-live="' + t.id + '"]'), bar = side.querySelector('[data-bar="' + t.id + '"]');
            if (el) el.textContent = t.state === "done" ? "+" + fmtUp(now() - t.doneAt) : fmtLeft(tLeft(t));
            if (bar && t.state === "run") bar.style.width = (clamp(tLeft(t) / (t.total || 1), 0, 1) * 100).toFixed(1) + "%";
        });
        if (S.mode === "iv") { const el = side.querySelector("[data-ivleft]"); if (el && V().state !== "idle") el.textContent = fmtLeft(vTotalLeft()); }
    }

    /* 탭 제목 + 탭 아이콘 */
    const fav = (() => { let l = document.querySelector('link[rel~="icon"]'); if (!l) { l = document.createElement("link"); l.rel = "icon"; document.head.appendChild(l); } return l; })();
    const favC = document.createElement("canvas"); favC.width = favC.height = 64;
    let lastFav = "";
    function drawFav(frac, color, run) {
        const key = Math.round(frac * 60) + color + run; if (key === lastFav) return; lastFav = key;
        const g = favC.getContext("2d"); g.clearRect(0, 0, 64, 64);
        g.fillStyle = "#2b1640"; g.beginPath(); g.arc(32, 32, 31, 0, 7); g.fill();
        g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = 9; g.beginPath(); g.arc(32, 32, 22, 0, 7); g.stroke();
        g.strokeStyle = color; g.lineCap = "round"; g.beginPath(); g.arc(32, 32, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(frac, 0.001, 1)); g.stroke();
        if (!run) { g.fillStyle = color; g.beginPath(); g.arc(32, 32, 6, 0, 7); g.fill(); }
        try { fav.href = favC.toDataURL("image/png"); } catch (e) {}
    }
    function primary() {
        /* 제목에 보여 줄 것: 지금 모드에서 돌고 있는 것 → 다른 모드에서 돌고 있는 것 */
        const tRun = S.timers.filter(t => t.state === "run").sort((a, b) => a.end - b.end)[0];
        const list = {
            timer: tRun ? { txt: fmtLeft(tRun.end - now()), name: tTitle(tRun), frac: (tRun.end - now()) / (tRun.total || 1), color: "#d6f56b" } : null,
            sw: S.sw.run ? { txt: fmtSW(swNow()).main, name: T("스톱워치", "Stopwatch"), frac: (swNow() % 60000) / 60000, color: "#9fe8ff" } : null,
            pomo: P().state === "run" ? { txt: fmtLeft(pLeft()), name: pName(P().phase), frac: pLeft() / (P().total || 1), color: P().phase === "focus" ? "#ff7a6b" : "#7ee0a8", icon: pIcon(P().phase) } : null,
            iv: V().state === "run" ? { txt: fmtLeft(vLeft()), name: vName(V().phase), frac: vLeft() / (V().total || 1), color: V().phase === "work" ? "#ffb347" : "#7ee0a8" } : null
        };
        return list[S.mode] || list.timer || list.pomo || list.iv || list.sw;
    }
    function updateTitle(force) {
        if (flashT && ringing.length) return;
        const p = primary();
        if (p && S.set.titleShow) document.title = (p.icon || "⏱") + " " + p.txt + " · " + p.name;
        else if (force || document.title !== BASE_TITLE) document.title = BASE_TITLE;
        if (p) drawFav(p.frac, p.color, true); else drawFav(1, "#d6f56b", false);
    }

    /* ---------------- 시계 (틱) ---------------- */
    function tick() {
        const n = now();
        S.timers.forEach(t => { if (t.state === "run" && t.end <= n) { tDone(t, n - t.end); if (S.mode === "timer") renderAll(); else { renderModes(); } } });
        const p = P();
        if (p.state === "run") {
            if (p.end <= n) pFinish(n - p.end);
            else if (p.tick && p.phase === "focus" && document.visibilityState === "visible") { const s = Math.ceil((p.end - n) / 1000); if (s !== lastSec) { lastSec = s; cue("tick"); } }
        }
        const v = V();
        if (v.state === "run") {
            let guard = 0;
            while (v.state === "run" && v.end <= now() && guard++ < 400) vAdvance(now() - v.end > 3000);
            if (v.state === "run") {
                const s = Math.ceil((v.end - now()) / 1000);
                if (s <= 3 && s >= 1 && s !== lastBeep) { lastBeep = s; cue("count"); }
            }
        }
        draw(false);
        updateTitle(false);
    }
    setInterval(tick, 200);
    /* 스톱워치 1/100초는 화면이 보일 때 부드럽게 */
    (function raf() { if (S.mode === "sw" && S.sw.run && document.visibilityState === "visible") draw(false); requestAnimationFrame(raf); })();
    document.addEventListener("visibilitychange", () => { tick(); wakeSync(); });

    /* ---------------- 알림 설정 카드 ---------------- */
    const sndSel = $("tm-sound");
    sndSel.innerHTML = Object.keys(SOUNDS).map(k => '<option value="' + k + '">' + SOUNDS[k].name + '</option>').join("");
    sndSel.value = S.set.sound;
    sndSel.addEventListener("change", () => { S.set.sound = sndSel.value; save(); playSound(S.set.sound); });
    $("tm-test").addEventListener("click", () => { playSound(S.set.sound); vibrate(200); });
    const vol = $("tm-vol");
    vol.value = Math.round(S.set.vol * 100);
    const volTxt = () => { $("tm-vol-v").textContent = vol.value + "%"; };
    volTxt();
    vol.addEventListener("input", () => { S.set.vol = vol.value / 100; if (master) master.gain.value = S.set.vol; volTxt(); save(); });
    vol.addEventListener("change", () => playSound(S.set.sound));
    /* 안내 음성 고르기 */
    const vSel = $("tm-voice");
    function fillVoices() {
        if (!vSel) return;
        const list = voices();
        const auto = pickVoice();
        vSel.innerHTML = '<option value="">' + T("자동 (밝은 여성 목소리)", "Auto (bright female voice)") + (auto && !S.set.voice ? " · " + esc(auto.name.replace(/^Microsoft |^Google /, "").replace(/ - .*$/, "")) : "") + '</option>' +
            list.slice().sort((a, b) => scoreVoice(b) - scoreVoice(a)).map(v => '<option value="' + esc(v.name) + '">' + esc(v.name) + (FEMALE.test(v.name) ? " ♀" : MALE.test(v.name) ? " ♂" : "") + '</option>').join("");
        vSel.value = list.some(v => v.name === S.set.voice) ? S.set.voice : "";
        vSel.closest("label").hidden = !window.speechSynthesis;
    }
    if (vSel) {
        fillVoices();
        try { speechSynthesis.addEventListener("voiceschanged", fillVoices); } catch (e) {}
        vSel.addEventListener("change", () => { S.set.voice = vSel.value; save(); speak(T("시간이 다 됐어요!", "Time is up!"), true); });
        $("tm-vtest").addEventListener("click", () => speak(T("라면, 시간이 다 됐어요!", "Pasta, time is up!"), true));
    }
    const rf = $("tm-ringfor");
    rf.value = String(S.set.ringFor);
    rf.addEventListener("change", () => { S.set.ringFor = +rf.value; save(); });
    [["tm-vib", "vibrate"], ["tm-speak", "speak"], ["tm-title", "titleShow"], ["tm-awake", "awake"]].forEach(a => {
        const el = $(a[0]); el.checked = !!S.set[a[1]];
        el.addEventListener("change", () => { S.set[a[1]] = el.checked; save(); if (a[1] === "speak" && el.checked) speak(T("음성 안내를 켰어요", "Voice cues on")); updateTitle(true); wakeSync(); });
    });
    if (!navigator.vibrate) { $("tm-vib").closest("label").title = T("이 기기에서는 진동을 쓸 수 없어요", "Vibration isn't supported on this device"); }
    if (!navigator.wakeLock) { const l = $("tm-awake").closest("label"); l.classList.add("is-na"); l.title = T("이 브라우저에서는 지원하지 않아요", "Not supported in this browser"); }
    /* 브라우저 알림 */
    const nBtn = $("tm-notify"), nTxt = $("tm-notify-txt");
    function nRender() {
        if (!("Notification" in window)) { nBtn.hidden = true; nTxt.textContent = T("이 브라우저는 알림을 지원하지 않아요. (아이폰은 홈 화면에 추가한 뒤에만 돼요)", "This browser doesn't support notifications. (On iPhone, only after adding to the Home Screen)"); return; }
        const perm = Notification.permission;
        if (perm === "granted" && S.set.notify) { nBtn.textContent = "🔔 " + T("알림 켜짐 (끄기)", "Notifications on (turn off)"); nBtn.classList.add("is-on"); nTxt.textContent = T("다른 탭이나 창을 보고 있어도 끝나면 알려 드려요.", "You'll be notified even when this tab is in the background."); }
        else if (perm === "denied") { nBtn.textContent = "🔕 " + T("알림이 막혀 있어요", "Notifications blocked"); nBtn.classList.remove("is-on"); nTxt.textContent = T("주소창 왼쪽 자물쇠(사이트 설정)에서 알림을 '허용'으로 바꿔 주세요.", "Allow notifications in the site settings (lock icon left of the address bar)."); }
        else { nBtn.textContent = "🔔 " + T("브라우저 알림 켜기", "Turn on notifications"); nBtn.classList.remove("is-on"); nTxt.textContent = T("켜 두면 다른 탭을 보고 있을 때도 화면 구석에 알림이 떠요.", "Get a pop-up notice even while you're in another tab."); }
    }
    nBtn.addEventListener("click", () => {
        if (!("Notification" in window)) return;
        if (Notification.permission === "granted") { S.set.notify = !S.set.notify; save(); nRender(); if (S.set.notify) notify("🔔 " + T("알림이 켜졌어요", "Notifications on"), T("타이머가 끝나면 이렇게 알려 드려요.", "This is how you'll be told when time's up.")); return; }
        if (Notification.permission === "denied") { nRender(); return; }
        const r = Notification.requestPermission(res => { S.set.notify = res === "granted"; save(); nRender(); });
        if (r && r.then) r.then(res => { S.set.notify = res === "granted"; save(); nRender(); if (res === "granted") notify("🔔 " + T("알림이 켜졌어요", "Notifications on"), T("타이머가 끝나면 이렇게 알려 드려요.", "This is how you'll be told when time's up.")); });
    });
    nRender();

    /* ---------------- 크게 보기 ---------------- */
    function toggleFull() {
        const on = !document.body.classList.contains("tm-max");
        document.body.classList.toggle("tm-max", on);
        try {
            if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
            if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
        } catch (e) {}
        $("tm-exit").hidden = !on;
    }
    $("tm-exit").addEventListener("click", toggleFull);
    document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && document.body.classList.contains("tm-max")) { document.body.classList.remove("tm-max"); $("tm-exit").hidden = true; } });

    /* ---------------- 단축키 ---------------- */
    document.addEventListener("keydown", e => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === "Escape") { if (ringing.length) { stopRing(); e.preventDefault(); return; } if (document.body.classList.contains("tm-max")) { toggleFull(); return; } }
        const tag = (e.target.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;
        const k = e.key.toLowerCase();
        if (k === " " || k === "spacebar") {
            if (e.target.closest && e.target.closest("button")) return;   // 버튼에 초점이 있으면 그 버튼 누르기
            e.preventDefault();
            if (ringing.length) { stopRing(); return; }
            const m = ctrls.querySelector(".main"); if (m) m.click();
        } else if (k === "r") { const r = ctrls.querySelector('[data-act$="reset"],[data-act="preset"]'); if (r) r.click(); }
        else if (k === "l" && S.mode === "sw") swLap();
        else if (k === "f") toggleFull();
        else if (k >= "1" && k <= "4") setMode(["timer", "sw", "pomo", "iv"][+k - 1]);
    });

    /* 알림 띠 (뽀모도로 자동 진행 등) */
    let toastT = 0;
    function toast(msg) { const el = $("tm-toast"); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 4000); }

    /* 나가기 전 경고 (돌아가는 게 있을 때) */
    window.addEventListener("beforeunload", e => { save(); if (anyRunning()) { /* 시간은 저장되므로 경고는 하지 않아요 */ } });
    window.addEventListener("pagehide", () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (err) {} });

    /* ---------------- 시작 ---------------- */
    (function boot() {
        const q = new URLSearchParams(location.search);
        const m = q.get("m"); if (["timer", "sw", "pomo", "iv"].indexOf(m) >= 0) S.mode = m;
        const tq = parseInt(q.get("t"), 10);
        if (tq > 0 && tq < 360000) {
            let t = selTimer(); if (t.state !== "idle" && t.state !== "done") { if (S.timers.length < MAX_TIMERS) { t = makeTimer(0); S.timers.push(t); S.sel = t.id; } }
            if (t.state === "idle" || t.state === "done") { t.state = "idle"; t.dur = tq * 1000; t.total = t.dur; t.label = q.get("label") ? q.get("label").slice(0, 30) : ""; S.mode = "timer"; S.tMode = "dur"; }
        }
        /* 창을 닫아 둔 사이 끝난 것 정리 (오래된 건 조용히) */
        const n = now();
        S.timers.forEach(t => { if (t.state === "run" && t.end <= n) tDone(t, n - t.end); });
        if (P().state === "run" && P().end <= n) pFinish(n - P().end);
        if (V().state === "run") { let g = 0; while (V().state === "run" && V().end <= now() && g++ < 400) vAdvance(true); }
        renderAll();
    })();

    /* 시험용 */
    window.__timer = { state: () => S, tick: tick, ring: startRing, stop: stopRing };
})();
