window.T = window.T || function (ko) { return ko; };   /* lang.js가 없어도 한국어로 동작 */
/* 글자 수 세기 (charcount.html / charcount-en.html, 2026-11-18)
   - 공백 포함·제외 글자 수, 단어·줄·문단 수, 바이트(UTF-8 / 한글 2바이트), 원고지 매수(대략)
   - 목표 글자 수(예: 자기소개서 500자)를 정하면 막대로 얼마나 찼는지 보여 줘요.
   - 글은 이 기기에만 기억("charcountText.v1"), 서버로 보내지 않아요. */
(function () {
    "use strict";
    const $ = id => document.getElementById(id);
    const box = $("cc-text");
    if (!box) return;
    const EN = !!window.SITE_EN;
    const KEY = "charcountText.v1", KEY_GOAL = "charcountGoal.v1";
    const seg = window.Intl && Intl.Segmenter ? new Intl.Segmenter(EN ? "en" : "ko", { granularity: "grapheme" }) : null;

    /* 눈에 보이는 글자 하나(이모지·결합 문자 포함)를 1자로 */
    function chars(s) {
        if (!s) return 0;
        if (seg) { let k = 0; for (const _ of seg.segment(s)) k++; return k; }
        return Array.from(s).length;
    }
    function utf8(s) { return new TextEncoder().encode(s).length; }
    /* 예전 방식(EUC-KR·완성형): 한글·한자 등은 2바이트, 영문·숫자·공백은 1바이트, 줄바꿈은 2바이트로 세는 곳이 많아요 */
    function legacy(s) {
        let b = 0;
        for (const ch of s.replace(/\r\n/g, "\n")) {
            if (ch === "\n") b += 2;
            else b += ch.codePointAt(0) < 128 ? 1 : 2;
        }
        return b;
    }
    function n(x) { return Math.round(x).toLocaleString(EN ? "en-US" : "ko-KR"); }

    const goal = $("cc-goal"), goalMode = $("cc-goal-mode"), bar = $("cc-bar"), barTxt = $("cc-bar-txt");
    try {
        const t = localStorage.getItem(KEY); if (t) box.value = t;
        const g = JSON.parse(localStorage.getItem(KEY_GOAL) || "null");
        if (g) { goal.value = g.v || ""; goalMode.value = g.m || "with"; }
    } catch (e) {}

    let saveTimer = null;
    function update() {
        const s = box.value;
        const withSp = chars(s);
        const noSp = chars(s.replace(/\s+/g, ""));
        const words = (s.trim().match(/\S+/g) || []).length;
        const lines = s ? s.split(/\r\n|\r|\n/).length : 0;
        const paras = s.trim() ? s.trim().split(/\n\s*\n/).length : 0;
        $("cc-with").textContent = n(withSp);
        $("cc-no").textContent = n(noSp);
        $("cc-words").textContent = n(words);
        $("cc-lines").textContent = n(lines);
        $("cc-paras").textContent = n(paras);
        $("cc-utf8").textContent = n(utf8(s));
        $("cc-legacy").textContent = n(legacy(s));
        $("cc-paper").textContent = withSp ? (EN ? "about " : "약 ") + n(Math.ceil(withSp / 200)) + (EN ? "" : "매") : (EN ? "0" : "0매");

        const g = parseInt(String(goal.value).replace(/[^\d]/g, ""), 10) || 0;
        const cur = goalMode.value === "no" ? noSp : withSp;
        if (g > 0) {
            const pct = Math.min(100, cur / g * 100);
            bar.style.width = pct + "%";
            bar.parentNode.classList.toggle("is-over", cur > g);
            barTxt.textContent = cur > g
                ? T(`${n(cur)} / ${n(g)}자 · ${n(cur - g)}자 넘었어요`, `${n(cur)} / ${n(g)} · ${n(cur - g)} over`)
                : T(`${n(cur)} / ${n(g)}자 · ${n(g - cur)}자 남았어요`, `${n(cur)} / ${n(g)} · ${n(g - cur)} left`);
        } else {
            bar.style.width = "0%";
            bar.parentNode.classList.remove("is-over");
            barTxt.textContent = T("목표 글자 수를 넣으면 얼마나 찼는지 보여 드려요.", "Set a target to see how close you are.");
        }
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
            try {
                localStorage.setItem(KEY, s);
                localStorage.setItem(KEY_GOAL, JSON.stringify({ v: goal.value, m: goalMode.value }));
            } catch (e) {}
        }, 400);
    }

    box.addEventListener("input", update);
    goal.addEventListener("input", update);
    goalMode.addEventListener("change", update);
    document.querySelectorAll("[data-cc-goal]").forEach(function (b) {
        b.addEventListener("click", function () { goal.value = b.getAttribute("data-cc-goal"); update(); });
    });

    /* 버튼: 복사 · 공백 정리 · 지우기 */
    const msg = $("cc-msg");
    let msgTimer = null;
    function say(t) { msg.textContent = t; clearTimeout(msgTimer); msgTimer = setTimeout(function () { msg.textContent = ""; }, 2200); }
    $("cc-copy").addEventListener("click", function () {
        const done = function () { say(T("복사했어요 ✓", "Copied ✓")); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(box.value).then(done, function () { box.select(); try { document.execCommand("copy"); done(); } catch (e) {} });
        } else { box.select(); try { document.execCommand("copy"); done(); } catch (e) {} }
    });
    $("cc-trim").addEventListener("click", function () {
        box.value = box.value.replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
        update(); say(T("겹친 공백과 빈 줄을 정리했어요", "Extra spaces and blank lines removed"));
    });
    $("cc-clear").addEventListener("click", function () {
        if (!box.value) return;
        box.value = ""; update(); box.focus(); say(T("지웠어요", "Cleared"));
    });
    update();
})();
