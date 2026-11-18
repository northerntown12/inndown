window.T = window.T || function (ko) { return ko; };   /* lang.js가 없어도 한국어로 동작 */
/* 대출 이자 계산기 (loan.html / loan-en.html, 2026-11-18)
   - 원리금균등: 매달 같은 금액 = P·r·(1+r)^n / ((1+r)^n − 1)
   - 원금균등: 원금은 매달 P/n, 이자는 남은 원금 × r
   - 만기일시: 매달 이자만(P × r), 마지막 달에 원금 전부
   - 거치기간: 그동안은 이자만 내고, 남은 기간에 위 방식으로 갚아요
   r = 연 이자율 ÷ 12. 속으로는 소수까지 계산하고, 화면에 보일 때만 원 단위로 반올림해요.
   계산은 브라우저 안에서만, 입력값은 이 기기에 기억("loanForm.v1"). */
(function () {
    "use strict";
    const $ = id => document.getElementById(id);
    if (!$("ln-amount")) return;
    const EN = !!window.SITE_EN;
    const KEY = "loanForm.v1";
    const F = { amount: $("ln-amount"), rate: $("ln-rate"), term: $("ln-term"), unit: $("ln-unit"), grace: $("ln-grace"), method: $("ln-method") };
    const out = $("ln-out"), cmp = $("ln-cmp"), sched = $("ln-sched"), more = $("ln-more");
    let showAll = false;

    function money(el) { const v = String(el.value || "").replace(/[^\d]/g, ""); return v ? Number(v) : 0; }
    function won(x) { return Math.round(x).toLocaleString(EN ? "en-US" : "ko-KR") + (EN ? "" : "원"); }
    function n(x) { return Math.round(x).toLocaleString(EN ? "en-US" : "ko-KR"); }
    function bindMoney(el) {
        el.addEventListener("input", function () {
            const raw = el.value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "").slice(0, 13);
            const pos = el.selectionStart, before = el.value.length;
            el.value = raw ? Number(raw).toLocaleString("en-US") : "";
            try { const p = Math.max(0, pos + el.value.length - before); el.setSelectionRange(p, p); } catch (e) {}
        });
    }
    bindMoney(F.amount);
    try {
        const s = JSON.parse(localStorage.getItem(KEY) || "null");
        if (s) Object.keys(F).forEach(k => { if (s[k] != null && F[k]) F[k].value = s[k]; });
    } catch (e) {}
    function save() { try { const s = {}; Object.keys(F).forEach(k => s[k] = F[k].value); localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }

    /* 상환 표 만들기: [{k, pay, prin, int, left}] */
    function schedule(P, annual, months, grace, method) {
        const r = annual / 100 / 12, rows = [];
        let left = P;
        for (let k = 1; k <= grace; k++) {
            const it = left * r;
            rows.push({ k, pay: it, prin: 0, int: it, left, grace: true });
        }
        const m = months - grace;
        if (m <= 0) return rows;
        const level = r === 0 ? P / m : P * r * Math.pow(1 + r, m) / (Math.pow(1 + r, m) - 1);
        for (let i = 1; i <= m; i++) {
            const it = left * r;
            let prin;
            if (method === "level") prin = level - it;
            else if (method === "principal") prin = P / m;
            else prin = 0;
            if (i === m) prin = left;                         // 마지막 달: 남은 원금 전부
            prin = Math.min(Math.max(prin, 0), left);
            left -= prin;
            if (Math.abs(left) < 0.005) left = 0;
            rows.push({ k: grace + i, pay: prin + it, prin, int: it, left });
        }
        return rows;
    }
    function sum(rows, key) { return rows.reduce((a, b) => a + b[key], 0); }
    const NAMES = { level: T("원리금균등", "Equal payments"), principal: T("원금균등", "Equal principal"), bullet: T("만기일시", "Interest-only (bullet)") };

    function calc() {
        save();
        const P = money(F.amount), annual = parseFloat(String(F.rate.value).replace(/[^\d.]/g, "")) || 0;
        const termN = parseInt(F.term.value, 10) || 0, months = F.unit.value === "y" ? termN * 12 : termN;
        const grace = Math.min(parseInt(F.grace.value, 10) || 0, Math.max(0, months - 1));
        if (!P || !months) {
            out.innerHTML = `<p class="tp-empty">${T("대출 금액과 기간을 넣어 주세요.", "Enter the loan amount and term.")}</p>`;
            cmp.innerHTML = ""; sched.innerHTML = ""; more.hidden = true; return;
        }
        if (months > 600) { out.innerHTML = `<p class="tp-empty">${T("기간은 50년(600개월)까지 넣을 수 있어요.", "The term can be up to 50 years (600 months).")}</p>`; return; }
        const method = F.method.value;
        const all = {};
        ["level", "principal", "bullet"].forEach(k => { all[k] = schedule(P, annual, months, grace, k); });
        const rows = all[method];
        const tInt = sum(rows, "int");
        const firstPay = rows[grace] ? rows[grace].pay : rows[0].pay;
        const lastPay = rows[rows.length - 1].pay;

        let payLine;
        if (method === "level") payLine = `<b>${won(firstPay)}</b>`;
        else if (method === "principal") payLine = `<b>${won(firstPay)}</b><span class="ln-arrow">→ ${T("마지막 달", "last month")} ${won(lastPay)}</span>`;
        else payLine = `<b>${won(firstPay)}</b><span class="ln-arrow">${T("마지막 달", "last month")} ${won(lastPay)}</span>`;

        out.innerHTML = `
            <div class="sv-big"><small>${grace ? T(`거치 ${grace}개월 뒤 매달 내는 돈`, `Monthly payment after ${grace}-month grace`) : T("매달 내는 돈", "Monthly payment")} · ${NAMES[method]}</small>${payLine}</div>
            <dl class="sv-rows">
                ${grace ? `<div><dt>${T("거치기간", "Grace period")}</dt><dd>${T("매달 이자만", "interest only")} ${won(rows[0].pay)}<small>${grace}${T("개월", " months")}</small></dd></div>` : ""}
                <div><dt>${T("총 이자", "Total interest")}</dt><dd>${won(tInt)}<small>${T("빌린 돈의", "")} ${(tInt / P * 100).toFixed(1)}%${T("", " of the loan")}</small></dd></div>
                <div><dt>${T("총 갚을 돈", "Total repaid")}</dt><dd>${won(P + tInt)}<small>${T("원금", "principal")} ${won(P)} + ${T("이자", "interest")} ${won(tInt)}</small></dd></div>
                <div><dt>${T("기간 · 금리", "Term · rate")}</dt><dd>${n(months)}${T("개월", " months")}${months >= 12 ? ` (${(months / 12).toFixed(months % 12 ? 1 : 0)}${T("년", " yr")})` : ""} · ${T("연", "")} ${annual}%${T("", " a year")}</dd></div>
            </dl>`;

        cmp.innerHTML = `<thead><tr><th>${T("상환 방식", "Method")}</th><th>${T("첫 달", "First month")}</th><th>${T("총 이자", "Total interest")}</th></tr></thead><tbody>` +
            ["level", "principal", "bullet"].map(k => {
                const rs = all[k], f = rs[grace] ? rs[grace].pay : rs[0].pay;
                return `<tr class="${k === method ? "is-on" : ""}"><td><button type="button" data-ln-pick="${k}">${NAMES[k]}</button></td><td>${won(f)}</td><td>${won(sum(rs, "int"))}</td></tr>`;
            }).join("") + "</tbody>";
        cmp.querySelectorAll("[data-ln-pick]").forEach(b => b.addEventListener("click", function () { F.method.value = b.getAttribute("data-ln-pick"); calc(); }));

        const LIMIT = 24;
        const list = showAll || rows.length <= LIMIT + 1 ? rows : rows.slice(0, 12).concat([null], rows.slice(-12));
        sched.innerHTML = `<thead><tr><th>${T("회차", "#")}</th><th>${T("낼 돈", "Payment")}</th><th>${T("원금", "Principal")}</th><th>${T("이자", "Interest")}</th><th>${T("남은 원금", "Balance")}</th></tr></thead><tbody>` +
            list.map(r => r ? `<tr class="${r.grace ? "is-grace" : ""}"><td>${r.k}</td><td>${n(r.pay)}</td><td>${n(r.prin)}</td><td>${n(r.int)}</td><td>${n(r.left)}</td></tr>`
                            : `<tr class="ln-gap"><td colspan="5">⋯ ${T(`${rows.length - 24}회차 생략`, `${rows.length - 24} rows hidden`)} ⋯</td></tr>`).join("") + "</tbody>";
        more.hidden = rows.length <= LIMIT + 1;
        more.textContent = showAll ? T("줄여 보기", "Show less") : T(`전체 ${rows.length}회차 모두 보기`, `Show all ${rows.length} payments`);
    }

    Object.keys(F).forEach(k => F[k].addEventListener(F[k].tagName === "SELECT" ? "change" : "input", calc));
    more.addEventListener("click", function () { showAll = !showAll; calc(); });
    document.querySelectorAll("[data-ln-amount]").forEach(b => b.addEventListener("click", function () {
        F.amount.value = Number(b.getAttribute("data-ln-amount")).toLocaleString("en-US"); calc();
    }));
    calc();
})();
