window.T = window.T || function (ko) { return ko; };   /* lang.js가 없어도 한국어로 동작 */
/* 퇴직금 계산기 (severance.html / severance-en.html, 2026-11-18)
   근로자퇴직급여 보장법 제8조: 계속근로 1년에 30일분 이상의 평균임금
   - 퇴직일 = 마지막 근무일 다음 날, 재직일수 = 입사일 ~ 퇴직일 전날
   - 1일 평균임금 = (퇴직 전 3개월 임금 + 연간 상여금 × 3/12 + 연차수당 × 3/12) ÷ 그 3개월의 날수
   - 1일 통상임금(월 통상임금 ÷ 209 × 8)이 더 크면 통상임금으로
   - 퇴직금 = 1일 평균임금 × 30 × 재직일수 ÷ 365
   계산은 모두 브라우저 안에서만 해요. 입력값은 이 기기에 기억("severanceForm.v1"). */
(function () {
    "use strict";
    const $ = id => document.getElementById(id);
    if (!$("sv-start")) return;

    const EN = !!window.SITE_EN;
    const DAY = 86400000;
    const KEY = "severanceForm.v1";

    /* ---------- 날짜 도우미 (시간대 영향 없게 연·월·일 숫자로) ---------- */
    function parse(v) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || "");
        if (!m) return null;
        const o = { y: +m[1], m: +m[2], d: +m[3] };
        const t = new Date(Date.UTC(o.y, o.m - 1, o.d));
        return t.getUTCMonth() === o.m - 1 && t.getUTCDate() === o.d ? o : null;
    }
    function iso(o) { return o.y + "-" + String(o.m).padStart(2, "0") + "-" + String(o.d).padStart(2, "0"); }
    function num(o) { return Date.UTC(o.y, o.m - 1, o.d) / DAY; }
    function fromNum(n) { const t = new Date(n * DAY); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
    function addDays(o, k) { return fromNum(num(o) + k); }
    function today() { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() }; }
    /* k개월 전/후 같은 날. 그 달에 그날이 없으면(예: 2월 31일) 다음 달 1일 */
    function addMonths(o, k) {
        const t = o.y * 12 + (o.m - 1) + k, y = Math.floor(t / 12), m = t % 12 + 1;
        const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
        return o.d <= last ? { y, m, d: o.d } : addDays({ y, m, d: last }, 1);
    }
    function fmtDate(o) {
        const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return EN ? `${MON[o.m - 1]} ${o.d}, ${o.y}` : `${o.y}.${o.m}.${o.d}`;
    }
    function fmtShort(o) {
        const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return EN ? `${MON[o.m - 1]} ${o.d}` : `${o.m}.${o.d}`;
    }
    /* 입사일 → 퇴직일 사이를 "n년 n개월 n일"로 */
    function ymd(a, b) {
        let y = b.y - a.y, m = b.m - a.m, d = b.d - a.d;
        if (d < 0) { m -= 1; d += new Date(Date.UTC(b.y, b.m - 1, 0)).getUTCDate(); }
        if (m < 0) { y -= 1; m += 12; }
        return { y, m, d };
    }

    /* ---------- 숫자 입력 (쉼표 넣기) ---------- */
    function money(el) { const v = String(el.value || "").replace(/[^\d]/g, ""); return v ? Number(v) : 0; }
    function won(x) { return Math.floor(x).toLocaleString(EN ? "en-US" : "ko-KR") + (EN ? " KRW" : "원"); }
    function n(x) { return Math.round(x).toLocaleString(EN ? "en-US" : "ko-KR"); }
    function bindMoney(el) {
        el.addEventListener("input", function () {
            const raw = el.value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "").slice(0, 13);
            const pos = el.selectionStart, before = el.value.length;
            el.value = raw ? Number(raw).toLocaleString("en-US") : "";
            try { const p = Math.max(0, pos + el.value.length - before); el.setSelectionRange(p, p); } catch (e) {}
        });
    }

    const F = {
        start: $("sv-start"), last: $("sv-last"), monthly: $("sv-monthly"), bonus: $("sv-bonus"),
        leave: $("sv-leave"), ordinary: $("sv-ordinary"), hours: $("sv-hours"), split: $("sv-split"),
        m1: $("sv-m1"), m2: $("sv-m2"), m3: $("sv-m3")
    };
    const out = $("sv-out"), splitBox = $("sv-split-box");
    [F.monthly, F.bonus, F.leave, F.ordinary, F.m1, F.m2, F.m3].forEach(bindMoney);

    /* ---------- 기억해 둔 입력값 ---------- */
    try {
        const s = JSON.parse(localStorage.getItem(KEY) || "null");
        if (s) Object.keys(F).forEach(k => {
            if (s[k] == null || !F[k]) return;
            if (F[k].type === "checkbox") F[k].checked = !!s[k]; else F[k].value = s[k];
        });
    } catch (e) {}
    if (!F.last.value) F.last.value = iso(today());
    function save() {
        try {
            const s = {};
            Object.keys(F).forEach(k => { if (F[k]) s[k] = F[k].type === "checkbox" ? F[k].checked : F[k].value; });
            localStorage.setItem(KEY, JSON.stringify(s));
        } catch (e) {}
    }

    /* ---------- 계산 ---------- */
    function calc() {
        save();
        const st = parse(F.start.value), last = parse(F.last.value);
        splitBox.hidden = !F.split.checked;
        F.monthly.closest(".tp-field").hidden = F.split.checked;
        if (!st || !last) { out.innerHTML = `<p class="tp-empty">${T("입사일과 마지막 근무일을 넣어 주세요.", "Enter your start date and last working day.")}</p>`; return; }
        if (num(last) < num(st)) { out.innerHTML = `<p class="tp-empty">${T("마지막 근무일이 입사일보다 앞이에요.", "The last working day is before the start date.")}</p>`; return; }

        const quit = addDays(last, 1);                       // 퇴직일
        const days = num(quit) - num(st);                    // 재직일수
        const pStart = addMonths(quit, -3);                  // 평균임금 산정 기간: pStart ~ last
        const pDays = num(quit) - num(pStart);
        /* 3개월을 한 달씩 나눈 기간 (각각 입력할 때 안내용) */
        const seg = [0, 1, 2].map(i => {
            const a = addMonths(quit, i - 3), b = addDays(addMonths(quit, i - 2), -1);
            return { a, b: num(b) < num(a) ? a : b };
        });
        ["sv-m1-l", "sv-m2-l", "sv-m3-l"].forEach((id, i) => {
            const el = $(id);
            if (el) el.textContent = `${fmtShort(seg[i].a)} ~ ${fmtShort(seg[i].b)} ${T("임금", "pay")}`;
        });

        const wages3 = F.split.checked ? money(F.m1) + money(F.m2) + money(F.m3) : money(F.monthly) * 3;
        const bonus = money(F.bonus), leave = money(F.leave);
        const bonusAdd = bonus * 3 / 12, leaveAdd = leave * 3 / 12;
        const total3 = wages3 + bonusAdd + leaveAdd;
        const avgDay = pDays > 0 ? total3 / pDays : 0;
        const ordDay = money(F.ordinary) / 209 * 8;          // 주 40시간 기준 월 소정근로 209시간, 하루 8시간
        const useOrd = ordDay > avgDay;
        const dayWage = useOrd ? ordDay : avgDay;
        const pay = dayWage * 30 * days / 365;
        const oneYear = addMonths(st, 12);
        const eligible = num(quit) >= num(oneYear) && F.hours.checked;
        const span = ymd(st, quit);
        const spanTxt = EN ? `${span.y} yr ${span.m} mo ${span.d} d` : `${span.y}년 ${span.m}개월 ${span.d}일`;

        let head;
        if (!F.hours.checked) {
            head = `<div class="sv-big is-no"><small>${T("예상 퇴직금", "Estimated severance")}</small><b>${T("대상 아님", "Not eligible")}</b></div>
                <p class="sv-why">${T("4주 평균 1주 근로시간이 15시간 미만이면 법정 퇴직금이 없어요.", "Workers under 15 hours a week on average are not covered by statutory severance pay.")}</p>`;
        } else if (!eligible) {
            const left = num(oneYear) - num(quit);
            head = `<div class="sv-big is-no"><small>${T("예상 퇴직금", "Estimated severance")}</small><b>${T("아직 대상 아님", "Not yet eligible")}</b></div>
                <p class="sv-why">${T(`계속 일한 기간이 1년이 안 돼요. 1년을 채우려면 <b>${n(left)}일</b> 더 일해야 해요 (마지막 근무일이 ${fmtDate(addDays(oneYear, -1))} 이후).`,
                                      `You need one full year of service. Work <b>${n(left)} more day(s)</b> — your last working day must be ${fmtDate(addDays(oneYear, -1))} or later.`)}</p>
                <p class="sv-why">${T("참고로 1년을 채웠다면", "For reference, with one full year it would be about")} ${won(dayWage * 30 * 365 / 365)}${T(" 정도예요.", ".")}</p>`;
        } else if (wages3 <= 0) {
            head = `<p class="tp-empty">${T("월 급여(세전)를 넣어 주세요.", "Enter your monthly pay (before tax).")}</p>`;
        } else {
            head = `<div class="sv-big"><small>${T("예상 퇴직금 (세전)", "Estimated severance (before tax)")}</small><b>${won(pay)}</b></div>`;
        }

        const rows = [
            [T("재직 기간", "Length of service"), `${spanTxt}<small>${T("총", "total")} ${n(days)}${T("일", " days")} · ${fmtDate(st)} ~ ${fmtDate(last)}</small>`],
            [T("퇴직일", "Leaving date"), `${fmtDate(quit)}<small>${T("마지막 근무일 다음 날", "the day after your last working day")}</small>`],
            [T("평균임금 기간", "Averaging period"), `${fmtDate(pStart)} ~ ${fmtDate(last)}<small>${n(pDays)}${T("일 (퇴직 전 3개월)", " days (3 months before leaving)")}</small>`],
            [T("1일 평균임금", "Average daily wage"), `${won(avgDay)}<small>${T("3개월 합계", "3-month total")} ${won(total3)} ÷ ${n(pDays)}${T("일", " days")}</small>`]
        ];
        if (money(F.ordinary) > 0) rows.push([T("1일 통상임금", "Ordinary daily wage"), `${won(ordDay)}<small>${T("월 통상임금 ÷ 209시간 × 8시간", "monthly ordinary wage ÷ 209 h × 8 h")}${useOrd ? T(" · 평균임금보다 커서 이걸로 계산", " · higher, so this is used") : ""}</small>`]);

        const steps = [
            [T("3개월 임금", "3 months of pay"), F.split.checked ? `${won(money(F.m1))} + ${won(money(F.m2))} + ${won(money(F.m3))}` : `${won(money(F.monthly))} × 3`, won(wages3)],
            [T("상여금 3/12", "Bonus × 3/12"), `${won(bonus)} × 3/12`, won(bonusAdd)],
            [T("연차수당 3/12", "Leave pay × 3/12"), `${won(leave)} × 3/12`, won(leaveAdd)],
            [T("1일 " + (useOrd ? "통상임금" : "평균임금"), useOrd ? "Ordinary daily wage" : "Average daily wage"), useOrd ? T("통상임금 적용", "ordinary wage applies") : `${won(total3)} ÷ ${n(pDays)}${T("일", " d")}`, won(dayWage)],
            [T("퇴직금", "Severance"), `${won(dayWage)} × 30${T("일", " d")} × ${n(days)} ÷ 365`, won(pay)]
        ];

        out.innerHTML = head +
            `<dl class="sv-rows">${rows.map(r => `<div><dt>${r[0]}</dt><dd>${r[1]}</dd></div>`).join("")}</dl>` +
            (eligible && wages3 > 0 ? `<h3 class="tp-sub">${T("계산 과정", "How it was calculated")}</h3>
            <table class="tp-table sv-steps"><tbody>${steps.map(s => `<tr><th scope="row">${s[0]}</th><td>${s[1]}</td><td>${s[2]}</td></tr>`).join("")}</tbody></table>` : "") +
            `<p class="tp-small">${T("세금(퇴직소득세)을 떼기 전 금액이에요. 회사가 퇴직연금(DC형)에 가입했다면 계좌에 쌓인 금액으로 받아서 결과가 다를 수 있어요.",
                                      "This is before income tax on retirement pay. If your employer uses a defined-contribution (DC) pension, you receive what has built up in that account instead.")}</p>`;
    }

    Object.keys(F).forEach(k => F[k] && F[k].addEventListener(F[k].type === "checkbox" ? "change" : "input", calc));
    $("sv-today").addEventListener("click", function () { F.last.value = iso(today()); calc(); });
    $("sv-reset").addEventListener("click", function () {
        Object.keys(F).forEach(k => { if (!F[k]) return; if (F[k].type === "checkbox") F[k].checked = k === "hours"; else F[k].value = ""; });
        F.last.value = iso(today());
        try { localStorage.removeItem(KEY); } catch (e) {}
        calc();
    });
    calc();
})();
