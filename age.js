window.T = window.T || function (ko) { return ko; };   /* lang.js가 없어도 한국어로 동작 */
/* 만 나이 · D-day 계산기 (age.html / age-en.html, 2026-11-15)
   ① 만 나이: 생년월일 → 만 나이, 연 나이, 다음 생일, 태어난 지 며칠, 띠
   ② D-day: 날짜 하나 → D-23 / D-Day / D+5, 이름 붙여 이 기기에 저장(최대 10개, "ddayList.v1")
   ③ 기념일: 시작일 → 100일·200일·…·1000일, 1·2·3주년 날짜 (시작일을 1일로 셈)
   ④ 날짜 계산: 두 날짜 사이 며칠 / 어떤 날짜에서 며칠 뒤·전
   계산은 모두 브라우저 안에서만 해요. 날짜는 시간대 영향을 안 받게 "연·월·일 숫자"로만 다뤄요. */
(function () {
    "use strict";
    const $ = id => document.getElementById(id);
    if (!$("age-birth")) return;

    const EN = !!window.SITE_EN;
    const DAY = 86400000;
    const WEEK_KO = ["일", "월", "화", "수", "목", "금", "토"];
    const WEEK_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const ZODIAC_KO = ["원숭이", "닭", "개", "돼지", "쥐", "소", "호랑이", "토끼", "용", "뱀", "말", "양"];
    const ZODIAC_EN = ["Monkey", "Rooster", "Dog", "Pig", "Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake", "Horse", "Goat"];
    const ZODIAC_EMOJI = ["🐒", "🐓", "🐕", "🐖", "🐀", "🐂", "🐅", "🐇", "🐉", "🐍", "🐎", "🐐"];

    /* ---------- 날짜 도우미 ---------- */
    function today() { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() }; }
    function parse(v) {                       // "2026-11-15" → {y,m,d} (잘못된 날짜면 null)
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || "");
        if (!m) return null;
        const o = { y: +m[1], m: +m[2], d: +m[3] };
        const t = new Date(Date.UTC(o.y, o.m - 1, o.d));
        return t.getUTCMonth() === o.m - 1 && t.getUTCDate() === o.d ? o : null;
    }
    function iso(o) { return o.y + "-" + String(o.m).padStart(2, "0") + "-" + String(o.d).padStart(2, "0"); }
    function num(o) { return Date.UTC(o.y, o.m - 1, o.d) / DAY; }          // 날짜 → 일 번호
    function fromNum(n) { const t = new Date(n * DAY); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
    function diff(a, b) { return num(b) - num(a); }                        // a → b 며칠
    function addDays(o, k) { return fromNum(num(o) + k); }
    function wd(o) { return new Date(Date.UTC(o.y, o.m - 1, o.d)).getUTCDay(); }
    function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
    function fmtDate(o) {
        return EN ? `${WEEK_EN[wd(o)]}, ${MONTH_EN[o.m - 1]} ${o.d}, ${o.y}`
                  : `${o.y}년 ${o.m}월 ${o.d}일 (${WEEK_KO[wd(o)]})`;
    }
    function n(x) { return x.toLocaleString(EN ? "en-US" : "ko-KR"); }
    function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
    function ddayText(k) { return k === 0 ? "D-Day" : k > 0 ? "D-" + n(k) : "D+" + n(-k); }   // k = 오늘 → 그날 며칠
    function setToday(input) { input.value = iso(today()); }

    /* 생일(월·일)을 그 해에 맞추기: 2월 29일생은 평년엔 3월 1일 */
    function birthdayIn(y, b) {
        if (b.m === 2 && b.d === 29 && !isLeap(y)) return { y, m: 3, d: 1 };
        return { y, m: b.m, d: b.d };
    }

    /* ---------- ① 만 나이 ---------- */
    const birth = $("age-birth"), base = $("age-base"), out = $("age-out");
    setToday(base);
    try { const s = localStorage.getItem("ageBirth.v1"); if (s && parse(s)) birth.value = s; } catch (e) {}

    function calcAge() {
        const b = parse(birth.value), t = parse(base.value) || today();
        try { if (b) localStorage.setItem("ageBirth.v1", birth.value); } catch (e) {}
        if (!b) {
            out.innerHTML = `<p class="tp-empty">${T("생년월일을 넣으면 바로 계산돼요.", "Enter a date of birth to see the result.")}</p>`;
            return;
        }
        if (diff(b, t) < 0) {
            out.innerHTML = `<p class="tp-empty">${T("기준일이 생년월일보다 앞이에요.", "The reference date is before the birth date.")}</p>`;
            return;
        }
        const passed = num(t) >= num(birthdayIn(t.y, b));
        const man = t.y - b.y - (passed ? 0 : 1);
        const yeon = t.y - b.y;
        let next = birthdayIn(t.y, b);
        if (num(next) <= num(t)) next = birthdayIn(t.y + 1, b);
        const toNext = diff(t, next);
        const lived = diff(b, t) + 1;                                     // 태어난 날 = 1일째
        const zi = ((b.y % 12) + 12) % 12;
        const isBirthday = num(birthdayIn(t.y, b)) === num(t);

        out.innerHTML =
            `<div class="age-big"><small>${T("만 나이", "International age")}</small><b>${n(man)}</b><span>${T("세", man === 1 ? "year old" : "years old")}</span></div>` +
            (isBirthday ? `<p class="age-hb">🎂 ${T("오늘 생일이에요! 축하해요.", "Happy birthday! It's today.")}</p>` : "") +
            `<dl class="tp-stats">` +
            `<div><dt>${T("연 나이", "Year age")}</dt><dd>${n(yeon)}${T("세", "")}</dd></div>` +
            `<div><dt>${T("다음 생일까지", "Next birthday")}</dt><dd>${isBirthday ? T("1년 뒤", "in 1 year") : ddayText(toNext)}</dd></div>` +
            `<div><dt>${T("태어난 지", "Days since birth")}</dt><dd>${n(lived)}${T("일째", "")}</dd></div>` +
            `<div><dt>${T("띠", "Chinese zodiac")}</dt><dd>${ZODIAC_EMOJI[zi]} ${T(ZODIAC_KO[zi] + "띠", ZODIAC_EN[zi])}</dd></div>` +
            `</dl>` +
            `<p class="tp-small">${T("다음 생일", "Next birthday")}: ${fmtDate(next)}` +
            (b.m === 2 && b.d === 29 ? T(" · 2월 29일생은 평년엔 3월 1일에 한 살 더해요.", " · Feb 29 birthdays count from Mar 1 in common years.") : "") + `</p>`;
    }
    birth.addEventListener("input", calcAge);
    base.addEventListener("input", calcAge);
    $("age-base-today").addEventListener("click", () => { setToday(base); calcAge(); });

    /* ---------- ② D-day ---------- */
    const ddDate = $("dd-date"), ddName = $("dd-name"), ddOut = $("dd-out"), ddList = $("dd-list");
    const DD_KEY = "ddayList.v1";
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(DD_KEY) || "[]").filter(x => x && parse(x.date)).slice(0, 10); } catch (e) { saved = []; }

    function calcDday() {
        const d = parse(ddDate.value);
        if (!d) { ddOut.innerHTML = `<p class="tp-empty">${T("날짜를 고르면 D-day가 나와요.", "Pick a date to see the D-day.")}</p>`; return; }
        const k = diff(today(), d);
        const name = ddName.value.trim();
        ddOut.innerHTML =
            `<div class="dd-big ${k === 0 ? "is-today" : k < 0 ? "is-past" : ""}">${ddayText(k)}</div>` +
            `<p class="tp-small">${name ? esc(name) + " · " : ""}${fmtDate(d)}` +
            (k > 0 ? T(` · ${n(k)}일 남았어요`, ` · ${n(k)} day${k === 1 ? "" : "s"} to go`)
                   : k < 0 ? T(` · ${n(-k)}일 지났어요`, ` · ${n(-k)} day${k === -1 ? "" : "s"} ago`) : T(" · 바로 오늘이에요!", " · It's today!")) + `</p>`;
    }
    function paintList() {
        if (!saved.length) { ddList.innerHTML = ""; return; }
        const t = today();
        ddList.innerHTML = saved.map((x, i) => {
            const d = parse(x.date), k = diff(t, d);
            return `<li><button type="button" class="dd-pick" data-i="${i}"><b class="${k === 0 ? "is-today" : k < 0 ? "is-past" : ""}">${ddayText(k)}</b>` +
                   `<span>${esc(x.name || T("이름 없음", "Untitled"))}</span><small>${fmtDate(d)}</small></button>` +
                   `<button type="button" class="dd-del" data-i="${i}" aria-label="${T("지우기", "Delete")}" title="${T("지우기", "Delete")}">×</button></li>`;
        }).join("");
    }
    function store() { try { localStorage.setItem(DD_KEY, JSON.stringify(saved)); } catch (e) {} }

    ddDate.addEventListener("input", calcDday);
    ddName.addEventListener("input", calcDday);
    $("dd-save").addEventListener("click", () => {
        const d = parse(ddDate.value);
        if (!d) { ddDate.focus(); return; }
        const name = ddName.value.trim().slice(0, 30);
        saved = saved.filter(x => !(x.date === ddDate.value && (x.name || "") === name));
        saved.unshift({ name, date: ddDate.value });
        saved = saved.slice(0, 10);
        store(); paintList();
    });
    ddList.addEventListener("click", e => {
        const del = e.target.closest(".dd-del"), pick = e.target.closest(".dd-pick");
        if (del) { saved.splice(+del.dataset.i, 1); store(); paintList(); }
        else if (pick) { const x = saved[+pick.dataset.i]; ddDate.value = x.date; ddName.value = x.name || ""; calcDday(); }
    });
    document.querySelectorAll("[data-dd-preset]").forEach(btn => {         // 빠른 선택: 크리스마스·새해 등
        btn.addEventListener("click", () => {
            const t = today(), [mm, dd] = btn.dataset.ddPreset.split("-").map(Number);
            let d = { y: t.y, m: mm, d: dd };
            if (num(d) < num(t)) d.y++;
            ddDate.value = iso(d); ddName.value = btn.dataset.name || btn.textContent.trim(); calcDday();
        });
    });

    /* ---------- ③ 기념일 (시작일 = 1일) ---------- */
    const anStart = $("an-start"), anOut = $("an-out");
    function calcAnniv() {
        const s = parse(anStart.value);
        if (!s) { anOut.innerHTML = `<p class="tp-empty">${T("시작한 날을 고르면 100일·1000일 같은 기념일이 나와요.", "Pick a start date to see the 100th, 1000th day and more.")}</p>`; return; }
        const t = today();
        const rows = [];
        [100, 200, 300, 365, 500, 1000, 2000, 3000].forEach(k => rows.push({ label: k === 365 ? T("365일", "Day 365") : T(n(k) + "일", "Day " + n(k)), d: addDays(s, k - 1) }));
        [1, 2, 3, 5, 10].forEach(k => rows.push({ label: T(k + "주년", k + (k === 1 ? " year" : " years")), d: birthdayIn(s.y + k, s) }));
        rows.sort((a, b) => num(a.d) - num(b.d));
        const nth = diff(s, t) + 1;
        anOut.innerHTML =
            (nth >= 1 ? `<p class="an-now">${T(`오늘은 <b>${n(nth)}일째</b> 되는 날이에요`, `Today is <b>day ${n(nth)}</b>`)}</p>` : "") +
            `<table class="tp-table"><thead><tr><th>${T("기념일", "Milestone")}</th><th>${T("날짜", "Date")}</th><th>D-day</th></tr></thead><tbody>` +
            rows.map(r => { const k = diff(t, r.d); return `<tr class="${k < 0 ? "is-past" : k === 0 ? "is-today" : ""}"><td>${r.label}</td><td>${fmtDate(r.d)}</td><td>${ddayText(k)}</td></tr>`; }).join("") +
            `</tbody></table>`;
    }
    anStart.addEventListener("input", calcAnniv);

    /* ---------- ④ 날짜 계산 ---------- */
    const dfA = $("df-a"), dfB = $("df-b"), dfOut = $("df-out");
    const adBase = $("ad-base"), adNum = $("ad-num"), adDir = $("ad-dir"), adOut = $("ad-out");
    setToday(dfA); setToday(adBase);
    function calcDiff() {
        const a = parse(dfA.value), b = parse(dfB.value);
        if (!a || !b) { dfOut.innerHTML = `<p class="tp-empty">${T("두 날짜를 고르세요.", "Pick two dates.")}</p>`; return; }
        const k = Math.abs(diff(a, b));
        const w = Math.floor(k / 7), r = k % 7;
        dfOut.innerHTML = `<div class="df-big">${n(k)}<span>${T("일 차이", k === 1 ? " day apart" : " days apart")}</span></div>` +
            `<p class="tp-small">${T(`${n(w)}주 ${r}일`, `${n(w)} week${w === 1 ? "" : "s"} ${r} day${r === 1 ? "" : "s"}`)} · ` +
            T(`두 날을 모두 넣어 세면 ${n(k + 1)}일`, `${n(k + 1)} days counting both ends`) + `</p>`;
    }
    function calcAdd() {
        const b = parse(adBase.value), k = parseInt(String(adNum.value).replace(/[^\d]/g, ""), 10);
        if (!b || isNaN(k)) { adOut.innerHTML = `<p class="tp-empty">${T("날짜와 일 수를 넣으세요.", "Enter a date and a number of days.")}</p>`; return; }
        const d = addDays(b, adDir.value === "before" ? -k : k);
        adOut.innerHTML = `<div class="df-big df-date">${fmtDate(d)}</div>`;
    }
    [dfA, dfB].forEach(el => el.addEventListener("input", calcDiff));
    [adBase, adNum, adDir].forEach(el => el.addEventListener("input", calcAdd));
    adDir.addEventListener("change", calcAdd);

    /* 처음 그리기 */
    calcAge(); calcDday(); paintList(); calcAnniv(); calcDiff(); calcAdd();

    /* 자정이 지나면 오늘 기준 값들을 다시 계산 (페이지를 켜 둔 채로 날짜가 바뀔 때) */
    let lastDay = iso(today());
    setInterval(() => {
        const now = iso(today());
        if (now !== lastDay) { lastDay = now; calcDday(); paintList(); calcAnniv(); }
    }, 60000);
})();
