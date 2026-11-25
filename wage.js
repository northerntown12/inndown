window.T = window.T || function (ko) { return ko; };   /* lang.js가 없어도 한국어로 동작 */
/* 시급·주휴수당 계산기 (wage.html / wage-en.html, 2026-11-25)
   - 주휴수당: 1주 소정근로시간 15시간 이상 + 그 주 정해진 날 개근 → 1일분 임금
     주휴시간 = (1주 소정근로시간 ÷ 40) × 8시간, 40시간 넘으면 8시간
   - 주급 = 시급 × 1주 근로시간 + 주휴수당
   - 월 예상 = 주급 × (365 ÷ 7 ÷ 12 ≈ 4.345주)
   - 연장근로(주 40시간 넘는 부분) 가산수당은 계산에 넣지 않고 안내만
   ★ 매년 고칠 곳: 아래 MIN_WAGE (최저시급) — 새해 최저임금이 정해지면 한 줄 추가
   계산은 모두 브라우저 안에서만 해요. 입력값은 이 기기에 기억("wageForm.v1"). */
(function () {
    "use strict";
    const $ = id => document.getElementById(id);
    if (!$("wg-wage")) return;

    /* 최저시급 (원). 2026년 10,320원, 2027년 10,700원(2026-08-05 고시) */
    const MIN_WAGE = { 2026: 10320, 2027: 10700 };
    const EN = !!window.SITE_EN;
    const KEY = "wageForm.v1";
    const WEEKS_PER_MONTH = 365 / 7 / 12;               // 약 4.345주

    const nowYear = new Date().getFullYear();
    const years = Object.keys(MIN_WAGE).map(Number).sort();
    const curYear = MIN_WAGE[nowYear] ? nowYear : (nowYear > years[years.length - 1] ? years[years.length - 1] : years[0]);

    function won(x) { return Math.round(x).toLocaleString(EN ? "en-US" : "ko-KR") + (EN ? " KRW" : "원"); }
    function n(x, d) { return Number(x).toLocaleString(EN ? "en-US" : "ko-KR", { maximumFractionDigits: d == null ? 2 : d }); }
    function money(el) { const v = String(el.value || "").replace(/[^\d]/g, ""); return v ? Number(v) : 0; }
    function dec(el) { const v = parseFloat(String(el.value || "").replace(/[^\d.]/g, "")); return isFinite(v) ? v : 0; }
    function bindMoney(el) {
        el.addEventListener("input", function () {
            const raw = el.value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "").slice(0, 9);
            const pos = el.selectionStart, before = el.value.length;
            el.value = raw ? Number(raw).toLocaleString("en-US") : "";
            try { const p = Math.max(0, pos + el.value.length - before); el.setSelectionRange(p, p); } catch (e) {}
        });
    }

    const F = { wage: $("wg-wage"), hours: $("wg-hours"), days: $("wg-days"), full: $("wg-full"), year: $("wg-year") };
    const out = $("wg-out");
    bindMoney(F.wage);

    /* 연도 고르기 (최저시급 비교용) */
    F.year.innerHTML = years.map(y => `<option value="${y}">${EN ? y + " minimum wage" : y + "년 최저시급"} · ${won(MIN_WAGE[y])}</option>`).join("");
    F.year.value = String(curYear);
    /* 빠른 버튼: 최저시급 넣기 */
    const pre = $("wg-presets");
    years.forEach(y => {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = (EN ? y + " minimum " : y + " 최저 ") + Number(MIN_WAGE[y]).toLocaleString("en-US");
        b.addEventListener("click", function () { F.wage.value = MIN_WAGE[y].toLocaleString("en-US"); F.year.value = String(y); calc(); });
        pre.appendChild(b);
    });

    /* 기억해 둔 입력값 */
    try {
        const s = JSON.parse(localStorage.getItem(KEY) || "null");
        if (s) Object.keys(F).forEach(k => {
            if (s[k] == null || !F[k]) return;
            if (F[k].type === "checkbox") F[k].checked = !!s[k];
            else if (k === "year") { if (MIN_WAGE[s[k]]) F[k].value = s[k]; }
            else F[k].value = s[k];
        });
    } catch (e) {}
    if (!F.wage.value) F.wage.value = MIN_WAGE[curYear].toLocaleString("en-US");
    if (!F.hours.value) F.hours.value = "8";
    if (!F.days.value) F.days.value = "5";
    function save() {
        try {
            const s = {};
            Object.keys(F).forEach(k => { s[k] = F[k].type === "checkbox" ? F[k].checked : F[k].value; });
            localStorage.setItem(KEY, JSON.stringify(s));
        } catch (e) {}
    }

    function calc() {
        save();
        const wage = money(F.wage), h = dec(F.hours), d = Math.round(dec(F.days));
        const minW = MIN_WAGE[F.year.value] || MIN_WAGE[curYear];
        if (!wage || !h || !d) { out.innerHTML = `<p class="tp-empty">${T("시급, 하루 근무시간, 일주일 근무일수를 넣어 주세요.", "Enter your hourly wage, hours per day and days per week.")}</p>`; return; }
        if (h > 24 || d > 7) { out.innerHTML = `<p class="tp-empty">${T("하루는 24시간, 일주일은 7일까지 넣을 수 있어요.", "Use up to 24 hours a day and 7 days a week.")}</p>`; return; }

        const weekH = h * d;
        const enough = weekH >= 15;
        const eligible = enough && F.full.checked;
        const holH = eligible ? Math.min(weekH, 40) / 40 * 8 : 0;      // 주휴시간
        const basePay = wage * weekH;
        const holPay = wage * holH;
        const week = basePay + holPay;
        const month = week * WEEKS_PER_MONTH;
        const perHour = week / weekH;                                   // 주휴 포함 실제 시급

        let head = `<div class="sv-big"><small>${T("이번 주 받을 돈 (세전)", "This week's pay (before tax)")}</small><b>${won(week)}</b>` +
            `<span class="ln-arrow">${T("한 달 예상", "Monthly estimate")} ${won(month)}</span></div>`;
        let notes = "";
        if (!enough) notes += `<p class="sv-why">${T(`일주일 근무시간이 <b>${n(weekH)}시간</b>이라 주휴수당이 없어요. 주 15시간 이상이어야 받을 수 있어요.`,
                                                    `You work <b>${n(weekH)} hours</b> a week, so there is no weekly holiday pay. You need at least 15 hours a week.`)}</p>`;
        else if (!F.full.checked) notes += `<p class="sv-why">${T("정해진 날 중 하루라도 빠지면 그 주의 주휴수당은 없어요. (지각·조퇴는 결근이 아니에요)",
                                                                   "If you miss a scheduled day, there is no holiday pay for that week. (Being late or leaving early is not an absence.)")}</p>`;
        if (wage < minW) notes += `<p class="sv-why">${T(`시급이 ${F.year.value}년 최저시급(<b>${won(minW)}</b>)보다 낮아요. 수습 3개월(1년 이상 계약, 단순 노무 제외) 같은 예외가 아니라면 최저시급 이상을 받아야 해요.`,
                                                         `This is below the ${F.year.value} minimum wage (<b>${won(minW)}</b>). Unless an exception applies (such as the first 3 months of probation on a 1-year+ contract, excluding simple labor), you must be paid at least the minimum.`)}</p>`;
        if (weekH > 40) notes += `<p class="sv-why">${T(`주 40시간을 넘는 <b>${n(weekH - 40)}시간</b>은 연장근로예요. 직원 5명 이상 사업장이면 그 시간은 시급의 1.5배를 받아요 (이 계산에는 넣지 않았어요).`,
                                                       `The <b>${n(weekH - 40)} hours</b> over 40 are overtime. At workplaces with 5 or more employees they are paid at 1.5× (not included here).`)}</p>`;

        const rows = [
            [T("일주일 근무", "Hours per week"), `${n(weekH)}${T("시간", " h")}<small>${n(h)}${T("시간", " h")} × ${d}${T("일", d === 1 ? " day" : " days")}</small>`],
            [T("일한 돈", "Pay for hours worked"), `${won(basePay)}<small>${won(wage)} × ${n(weekH)}${T("시간", " h")}</small>`],
            [T("주휴수당", "Weekly holiday pay"), eligible ? `${won(holPay)}<small>${won(wage)} × ${n(holH)}${T("시간", " h")} (${n(Math.min(weekH, 40))} ÷ 40 × 8)</small>` : `${won(0)}<small>${enough ? T("개근하지 않음", "not full attendance") : T("주 15시간 미만", "under 15 h/week")}</small>`],
            [T("주휴 포함 시급", "Hourly incl. holiday pay"), `${won(perHour)}`],
            [T("한 달 예상", "Monthly estimate"), `${won(month)}<small>${T("주급", "weekly pay")} × 4.345${T("주", " weeks")} (365 ÷ 7 ÷ 12)</small>`]
        ];
        if (Math.abs(weekH - 40) < 1e-9 && eligible) rows.push([T("월급 기준", "Monthly (209 h)"), `${won(wage * 209)}<small>${T("주 40시간 월 209시간으로 계산하는 방식", "the usual 209-hour monthly basis for 40 h/week")}</small>`]);

        out.innerHTML = head + notes +
            `<dl class="sv-rows">${rows.map(r => `<div><dt>${r[0]}</dt><dd>${r[1]}</dd></div>`).join("")}</dl>` +
            `<p class="tp-small">${T("세금·4대 보험을 떼기 전 금액이에요. 야간(밤 10시~아침 6시)·휴일 가산수당은 넣지 않았어요.",
                                      "Before tax and social insurance. Night (10 pm–6 am) and holiday premiums are not included.")}</p>`;
    }

    Object.keys(F).forEach(k => F[k].addEventListener(F[k].type === "checkbox" || F[k].tagName === "SELECT" ? "change" : "input", calc));
    $("wg-reset").addEventListener("click", function () {
        try { localStorage.removeItem(KEY); } catch (e) {}
        F.wage.value = MIN_WAGE[curYear].toLocaleString("en-US"); F.hours.value = "8"; F.days.value = "5"; F.full.checked = true; F.year.value = String(curYear);
        calc();
    });
    calc();
})();
