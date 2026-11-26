window.T = window.T || function (ko) { return ko; };   /* lang.js가 없어도 한국어로 동작 */
/* 퍼센트 계산기 (percent.html / percent-en.html, 2026-11-26)
   계산 종류 5가지 (위 알약 버튼):
   - of     : A의 B%            → A × B ÷ 100
   - ratio  : A는 B의 몇 %       → A ÷ B × 100
   - change : A에서 B로 몇 % 변화 → (B − A) ÷ A × 100
   - disc   : 할인가  P × (1 − r) / 거꾸로 원래 가격  P ÷ (1 − r)
   - vat    : 부가세  공급가 × (1 + r) / 거꾸로 공급가  합계 ÷ (1 + r)
   계산은 모두 브라우저 안에서만 해요. 마지막 종류와 값은 이 기기에 기억("percentCalc.v1").
   주소로 시작 종류 정하기: percent.html?m=disc */
(function () {
    "use strict";
    const $ = id => document.getElementById(id);
    if (!$("pc-a")) return;

    const EN = !!window.SITE_EN;
    const KEY = "percentCalc.v1";
    const LOC = EN ? "en-US" : "ko-KR";
    const WON = EN ? "" : "원";

    const MODES = {
        of: {
            chip: T("A의 B%", "X% of Y"),
            q: T("어떤 값의 몇 %는 얼마일까요?", "What is X% of a number?"),
            a: T("값", "Number"), b: T("퍼센트", "Percent"), bUnit: "%",
            def: { a: "50000", b: "15" }, presets: true
        },
        ratio: {
            chip: T("A는 B의 몇 %", "X is what % of Y"),
            q: T("한 값이 전체의 몇 %일까요?", "What percent is one number of another?"),
            a: T("부분 값 (A)", "Part (X)"), b: T("전체 값 (B)", "Whole (Y)"),
            def: { a: "30", b: "40" }
        },
        change: {
            chip: T("증감률", "% change"),
            q: T("얼마나 올랐을까요, 내렸을까요?", "How much did it go up or down?"),
            a: T("처음 값", "Original value"), b: T("바뀐 값", "New value"),
            def: { a: "8000", b: "10000" }
        },
        disc: {
            chip: T("할인", "Discount"),
            q: T("할인하면 얼마일까요?", "What's the price after a discount?"),
            dirs: [["sale", T("할인가 구하기", "Find the sale price")], ["orig", T("원래 가격 찾기", "Find the original price")]],
            a: T("정가", "Original price"), aOrig: T("할인된 가격", "Sale price"),
            b: T("할인율", "Discount"), aUnit: WON, bUnit: "%",
            def: { a: "89000", b: "20", dir: "sale" }, presets: true
        },
        vat: {
            chip: T("부가세", "VAT / tax"),
            q: T("부가세를 더하거나 빼 볼까요?", "Add or remove VAT / sales tax"),
            dirs: [["add", T("공급가 → 합계 (부가세 더하기)", "Net → total (add tax)")], ["sub", T("합계 → 공급가 (부가세 빼기)", "Total → net (remove tax)")]],
            a: T("공급가", "Net amount"), aSub: T("합계 금액 (부가세 포함)", "Total incl. tax"),
            b: T("세율", "Tax rate"), aUnit: WON, bUnit: "%",
            def: { a: "100000", b: "10", dir: "add" }
        }
    };
    const ORDER = ["of", "ratio", "change", "disc", "vat"];
    const RATE_PRESETS = [5, 10, 15, 20, 25, 30, 50];

    /* ---------- 숫자 ---------- */
    function parse(s) {
        s = String(s == null ? "" : s).replace(/,/g, "").trim();
        if (!s || s === "-" || s === ".") return NaN;
        return Number(s);
    }
    function round(x, d) { const p = Math.pow(10, d); return Math.round((x + (x > 0 ? 1e-12 : -1e-12)) * p) / p; }
    function num(x, d) {
        if (!isFinite(x)) return "–";
        const v = round(x, d == null ? 2 : d);
        return (Object.is(v, -0) ? 0 : v).toLocaleString(LOC, { maximumFractionDigits: d == null ? 2 : d });
    }
    function pct(x) { return num(x, 2) + "%"; }
    function money(x) { return WON ? num(x, 0) + WON : num(x, 2); }   /* 원은 1원 단위로 반올림 */
    function signed(x, f) { return (x > 0 ? "+" : x < 0 ? "−" : "") + f(Math.abs(x)); }
    /* 입력칸: 쉼표 넣기 (소수점·마이너스 허용) */
    function bindNum(el) {
        el.addEventListener("input", function () {
            let v = el.value.replace(/[^\d.\-]/g, "");
            const neg = v.charAt(0) === "-";
            v = v.replace(/-/g, "");
            const dot = v.indexOf(".");
            let ip = dot < 0 ? v : v.slice(0, dot), fp = dot < 0 ? null : v.slice(dot + 1).replace(/\./g, "").slice(0, 6);
            ip = ip.replace(/^0+(?=\d)/, "").slice(0, 13);
            const pos = el.selectionStart, before = el.value.length;
            el.value = (neg ? "-" : "") + (ip ? Number(ip).toLocaleString("en-US") : (fp != null ? "0" : "")) + (fp != null ? "." + fp : "");
            try { const p = Math.max(0, pos + el.value.length - before); el.setSelectionRange(p, p); } catch (e) {}
        });
    }
    function show(v) {   // 저장값 → 칸에 보일 글씨
        const n = parse(v);
        if (!isFinite(n)) return "";
        const s = String(v).replace(/,/g, "");
        const dot = s.indexOf(".");
        return (n < 0 ? "-" : "") + Math.floor(Math.abs(n)).toLocaleString("en-US") + (dot >= 0 ? s.slice(dot) : "");
    }

    /* ---------- 상태 ---------- */
    const A = $("pc-a"), B = $("pc-b"), DIR = $("pc-dir");
    bindNum(A); bindNum(B);
    let state = { mode: "of", v: {} };
    try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && MODES[s.mode]) state = { mode: s.mode, v: s.v || {} }; } catch (e) {}
    const qm = (location.search.match(/[?&]m=(\w+)/) || [])[1];
    if (qm && MODES[qm]) state.mode = qm;
    function vals(m) { return Object.assign({}, MODES[m].def, state.v[m] || {}); }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

    /* ---------- 알약 버튼 ---------- */
    const chips = $("pc-chips");
    ORDER.forEach(m => {
        const b = document.createElement("button");
        b.type = "button"; b.dataset.m = m; b.textContent = MODES[m].chip;
        b.addEventListener("click", () => { setMode(m); A.focus(); });
        chips.appendChild(b);
    });
    const pre = $("pc-presets");
    RATE_PRESETS.forEach(r => {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = r + "%";
        b.addEventListener("click", () => { B.value = String(r); calc(); });
        pre.appendChild(b);
    });

    function setMode(m) {
        state.mode = m;
        const M = MODES[m], v = vals(m);
        chips.querySelectorAll("button").forEach(b => { const on = b.dataset.m === m; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
        $("pc-q").textContent = M.q;
        if (M.dirs) {
            DIR.innerHTML = M.dirs.map(d => `<option value="${d[0]}">${d[1]}</option>`).join("");
            DIR.value = v.dir || M.dirs[0][0];
            $("pc-dir-box").hidden = false;
        } else $("pc-dir-box").hidden = true;
        A.value = show(v.a); B.value = show(v.b);
        pre.hidden = !M.presets;
        try { history.replaceState(null, "", location.pathname + (m === "of" ? "" : "?m=" + m) + location.hash); } catch (e) {}
        calc();
    }

    function labels() {
        const M = MODES[state.mode], d = DIR.value;
        let a = M.a;
        if (state.mode === "disc" && d === "orig") a = M.aOrig;
        if (state.mode === "vat" && d === "sub") a = M.aSub;
        $("pc-a-lb").textContent = a;
        $("pc-b-lb").textContent = M.b;
        $("pc-a-unit").textContent = M.aUnit || "";
        $("pc-b-unit").textContent = M.bUnit || "";
        $("pc-a-unit").hidden = !M.aUnit; $("pc-b-unit").hidden = !M.bUnit;
    }

    /* ---------- 계산 ---------- */
    const out = $("pc-out");
    function big(label, value, sub) {
        return `<div class="sv-big pc-big"><small>${label}</small><b>${value}</b>${sub ? `<span class="ln-arrow">${sub}</span>` : ""}</div>`;
    }
    function formula(s) { return `<p class="pc-formula"><span>${T("계산식", "Formula")}</span>${s}</p>`; }
    function rows(list) { return `<dl class="sv-rows">${list.map(r => `<div><dt>${r[0]}</dt><dd>${r[1]}</dd></div>`).join("")}</dl>`; }
    function empty(msg) { out.innerHTML = `<p class="tp-empty">${msg}</p>`; table(NaN); }

    function calc() {
        labels();
        const m = state.mode, a = parse(A.value), b = parse(B.value), d = DIR.value;
        state.v[m] = { a: A.value.replace(/,/g, ""), b: B.value.replace(/,/g, "") };
        if (MODES[m].dirs) state.v[m].dir = d;
        save();
        if (!isFinite(a) || !isFinite(b)) return empty(T("두 칸에 숫자를 넣어 주세요.", "Enter a number in both boxes."));

        let html = "";
        if (m === "of") {
            const r = a * b / 100;
            html = big(T(`${num(a)}의 ${pct(b)}`, `${pct(b)} of ${num(a)}`), num(r)) +
                formula(`${num(a)} × ${num(b)} ÷ 100 = <b>${num(r)}</b>`) +
                rows([[T("더하면", "Plus"), `${num(a + r)}<small>${T(`${num(a)}에서 ${pct(b)} 늘어난 값`, `${num(a)} increased by ${pct(b)}`)}</small>`],
                      [T("빼면", "Minus"), `${num(a - r)}<small>${T(`${num(a)}에서 ${pct(b)} 줄어든 값`, `${num(a)} decreased by ${pct(b)}`)}</small>`]]);
            table(a);
        } else if (m === "ratio") {
            if (b === 0) return empty(T("전체 값(B)이 0이면 계산할 수 없어요.", "The whole (Y) can't be 0."));
            const r = a / b * 100;
            html = big(T(`${num(a)}은(는) ${num(b)}의`, `${num(a)} is this much of ${num(b)}`), pct(r)) +
                formula(`${num(a)} ÷ ${num(b)} × 100 = <b>${pct(r)}</b>`) +
                rows([[T("나머지", "The rest"), `${num(b - a)}<small>${T(`전체의 ${pct(100 - r)}`, `${pct(100 - r)} of the whole`)}</small>`],
                      [T("분수로", "As a ratio"), `${num(a)} : ${num(b)}<small>${T(`소수로 ${num(a / b, 4)}`, `decimal ${num(a / b, 4)}`)}</small>`]]);
            table(NaN);
        } else if (m === "change") {
            if (a === 0) return empty(T("처음 값이 0이면 증감률을 계산할 수 없어요.", "The original value can't be 0."));
            const diff = b - a, r = diff / Math.abs(a) * 100;
            const word = r > 0 ? T("올랐어요", "increase") : r < 0 ? T("내렸어요", "decrease") : T("그대로예요", "no change");
            html = big(T(`${num(a)} → ${num(b)}`, `${num(a)} → ${num(b)}`), signed(r, pct), word) +
                formula(`(${num(b)} − ${num(a)}) ÷ ${num(Math.abs(a))} × 100 = <b>${signed(r, pct)}</b>`) +
                rows([[T("차이", "Difference"), signed(diff, num)],
                      [T("배수", "Multiple"), `${num(b / a, 4)}${T("배", "×")}<small>${T("바뀐 값 ÷ 처음 값", "new ÷ original")}</small>`],
                      [T("되돌리려면", "To get back"), b === 0 ? "–" : `${signed((a - b) / Math.abs(b) * 100, pct)}<small>${T(`${num(b)}에서 ${num(a)}(으)로 돌아가는 비율`, `from ${num(b)} back to ${num(a)}`)}</small>`]]);
            table(NaN);
        } else if (m === "disc") {
            if (b < 0 || b >= 100 && d === "orig" || b > 100) return empty(T("할인율은 0~100% 사이로 넣어 주세요.", "Use a discount between 0 and 100%."));
            if (d === "sale") {
                const off = a * b / 100, sale = a - off;
                html = big(T(`${money(a)}에서 ${pct(b)} 할인`, `${money(a)} with ${pct(b)} off`), money(sale), T(`${money(off)} 아껴요`, `You save ${money(off)}`)) +
                    formula(`${num(a)} × (1 − ${num(b)} ÷ 100) = <b>${money(sale)}</b>`) +
                    rows([[T("할인 금액", "Amount off"), `${money(off)}<small>${num(a)} × ${num(b)} ÷ 100</small>`],
                          [T("내는 비율", "You pay"), `${pct(100 - b)}<small>${T("정가 대비", "of the original price")}</small>`]]);
                table(a);
            } else {
                const orig = a / (1 - b / 100), off = orig - a;
                html = big(T(`${pct(b)} 할인해서 ${money(a)}이면 원래 가격은`, `If ${money(a)} is ${pct(b)} off, the original was`), money(orig)) +
                    formula(`${num(a)} ÷ (1 − ${num(b)} ÷ 100) = <b>${money(orig)}</b>`) +
                    rows([[T("할인 금액", "Amount off"), money(off)],
                          [T("확인", "Check"), `${money(orig)} × ${pct(100 - b)} = ${money(a)}`]]) +
                    `<p class="sv-why">${T(`${money(a)}에 ${pct(b)}를 더한 ${money(a * (1 + b / 100))}이 <b>아니에요</b>. 할인은 원래 가격을 기준으로 하기 때문이에요.`,
                                           `It is <b>not</b> ${money(a)} + ${pct(b)} = ${money(a * (1 + b / 100))}, because the discount was taken from the original price.`)}</p>`;
                table(orig);
            }
        } else if (m === "vat") {
            if (b < 0) return empty(T("세율은 0 이상으로 넣어 주세요.", "The tax rate can't be negative."));
            if (d === "add") {
                const tax = a * b / 100, total = a + tax;
                html = big(T(`공급가 ${money(a)} + 부가세 ${pct(b)}`, `${money(a)} + ${pct(b)} tax`), money(total), T(`부가세 ${money(tax)}`, `Tax ${money(tax)}`)) +
                    formula(`${num(a)} × (1 + ${num(b)} ÷ 100) = <b>${money(total)}</b>`) +
                    rows([[T("공급가", "Net amount"), money(a)], [T("부가세", "Tax"), `${money(tax)}<small>${num(a)} × ${num(b)} ÷ 100</small>`], [T("합계", "Total"), money(total)]]);
            } else {
                const net = a / (1 + b / 100), tax = a - net;
                html = big(T(`합계 ${money(a)}에서 부가세를 빼면`, `${money(a)} without ${pct(b)} tax`), money(net), T(`부가세 ${money(tax)}`, `Tax ${money(tax)}`)) +
                    formula(`${num(a)} ÷ (1 + ${num(b)} ÷ 100) = <b>${money(net)}</b>`) +
                    rows([[T("공급가", "Net amount"), money(net)], [T("부가세", "Tax"), money(tax)], [T("합계", "Total"), money(a)]]) +
                    `<p class="sv-why">${T(`${num(a)} × ${num(1 - b / 100, 4)} = ${money(a * (1 - b / 100))}처럼 계산하면 <b>틀려요</b>. 부가세는 공급가에 붙은 것이라 ÷ ${num(1 + b / 100, 4)}로 나눠야 해요.`,
                                           `Multiplying by ${num(1 - b / 100, 4)} (= ${money(a * (1 - b / 100))}) is <b>wrong</b>. Tax was added to the net amount, so divide by ${num(1 + b / 100, 4)}.`)}</p>`;
            }
            table(NaN);
        }
        out.innerHTML = html;
    }

    /* 아래 표: 그 값의 비율별 금액 (A의 B%, 할인일 때만) */
    const tbox = $("pc-table-box"), tb = $("pc-table");
    function table(base) {
        if (!isFinite(base) || base === 0) { tbox.hidden = true; return; }
        tbox.hidden = false;
        $("pc-table-base").textContent = T(`기준 ${num(base)}`, `based on ${num(base)}`);
        const list = [1, 3, 5, 10, 15, 20, 25, 30, 40, 50, 70];
        tb.innerHTML = `<thead><tr><th>${T("비율", "Percent")}</th><th>${T("그만큼", "That much")}</th><th>${T("빼면 (할인가)", "Minus (sale price)")}</th><th>${T("더하면", "Plus")}</th></tr></thead><tbody>` +
            list.map(p => { const x = base * p / 100; return `<tr><td>${p}%</td><td>${num(x)}</td><td>${num(base - x)}</td><td>${num(base + x)}</td></tr>`; }).join("") + "</tbody>";
    }

    A.addEventListener("input", calc); B.addEventListener("input", calc); DIR.addEventListener("change", calc);
    $("pc-swap").addEventListener("click", () => { const t = A.value; A.value = B.value; B.value = t; calc(); });
    $("pc-reset").addEventListener("click", () => { delete state.v[state.mode]; setMode(state.mode); });
    setMode(state.mode);
})();
