window.T = window.T || function (ko) { return ko; };   /* lang.js가 없어도 한국어로 동작 */
/* 환율 계산기 (fx.html / fx-en.html, 2026-11-25)
   - 환율: ExchangeRate-API 무료 공개 주소 (홈 환율 칸 fx.js와 같은 곳, 출처 표기 필요)
     https://open.er-api.com/v6/latest/USD  — 하루 한 번 갱신
   - 홈과 같은 저장 칸(localStorage "fxRates.v1")을 함께 써서, 이미 받은 값이 있으면 다시 받지 않아요
   - 1 외화 = rates.KRW ÷ rates.외화 원
   - 외화칸·원화칸 어느 쪽에 넣어도 반대쪽이 계산돼요
   - 마지막으로 고른 통화는 이 기기에 기억("fxCalc.v1"). 주소에 ?c=JPY 처럼 붙이면 그 통화로 시작 */
(function () {
    "use strict";
    const $ = id => document.getElementById(id);
    if (!$("fx-amt")) return;

    const EN = !!window.SITE_EN;
    const API_URL = "https://open.er-api.com/v6/latest/USD";
    const STORAGE_KEY = "fxRates.v1";
    const MY_KEY = "fxCalc.v1";
    const MIN_GAP_MS = 60 * 60 * 1000;

    /* 통화 목록: 코드, 이름, 표 단위(엔·동은 100), 자주 쓰는 금액 */
    const CUR = [
        { c: "USD", ko: "미국 달러", en: "US dollar", u: 1, t: [1, 5, 10, 20, 50, 100, 500, 1000] },
        { c: "JPY", ko: "일본 엔", en: "Japanese yen", u: 100, t: [100, 500, 1000, 5000, 10000, 30000, 50000, 100000] },
        { c: "EUR", ko: "유로", en: "Euro", u: 1, t: [1, 5, 10, 20, 50, 100, 500, 1000] },
        { c: "CNY", ko: "중국 위안", en: "Chinese yuan", u: 1, t: [1, 10, 50, 100, 500, 1000, 5000, 10000] },
        { c: "GBP", ko: "영국 파운드", en: "British pound", u: 1, t: [1, 5, 10, 20, 50, 100, 500, 1000] },
        { c: "VND", ko: "베트남 동", en: "Vietnamese dong", u: 100, t: [10000, 50000, 100000, 200000, 500000, 1000000, 5000000] },
        { c: "THB", ko: "태국 바트", en: "Thai baht", u: 1, t: [10, 50, 100, 500, 1000, 5000, 10000] },
        { c: "AUD", ko: "호주 달러", en: "Australian dollar", u: 1, t: [1, 5, 10, 50, 100, 500, 1000] },
        { c: "TWD", ko: "대만 달러", en: "Taiwan dollar", u: 1, t: [10, 50, 100, 500, 1000, 5000, 10000] },
        { c: "HKD", ko: "홍콩 달러", en: "Hong Kong dollar", u: 1, t: [10, 50, 100, 500, 1000, 5000] },
        { c: "SGD", ko: "싱가포르 달러", en: "Singapore dollar", u: 1, t: [1, 5, 10, 50, 100, 500, 1000] },
        { c: "PHP", ko: "필리핀 페소", en: "Philippine peso", u: 1, t: [100, 500, 1000, 5000, 10000, 50000] },
        { c: "CAD", ko: "캐나다 달러", en: "Canadian dollar", u: 1, t: [1, 5, 10, 50, 100, 500, 1000] }
    ];
    const WON_T = [1000, 10000, 50000, 100000, 500000, 1000000];

    let rates = null, cur = CUR[0], last = "amt";
    const amt = $("fx-amt"), won = $("fx-won"), chips = $("fx-chips"), info = $("fx-info"),
          table = $("fx-table"), wonTable = $("fx-won-table"), all = $("fx-all"), dateEl = $("fx-date"), codeEl = $("fx-code");

    function name(o) { return EN ? o.en : o.ko; }
    function perOne(o) { return rates && rates.KRW > 0 && rates[o.c] > 0 ? rates.KRW / rates[o.c] : 0; }   // 1 외화 = ? 원
    function fmt(x, d) { return Number(x).toLocaleString(EN ? "en-US" : "ko-KR", { minimumFractionDigits: 0, maximumFractionDigits: d }); }
    function fmtWon(x) { return x >= 100 ? fmt(Math.round(x), 0) : fmt(x, 2); }
    function fmtCur(x) { return fmt(x, x >= 1 ? 2 : 4); }
    function wonTxt(x) { return EN ? fmtWon(x) + " KRW" : fmtWon(x) + "원"; }
    function parseNum(el) { const v = parseFloat(String(el.value || "").replace(/,/g, "")); return isFinite(v) ? v : NaN; }
    function bindNum(el) {
        el.addEventListener("input", function () {
            let raw = el.value.replace(/[^\d.]/g, "");
            const i = raw.indexOf(".");
            if (i >= 0) raw = raw.slice(0, i + 1) + raw.slice(i + 1).replace(/\./g, "");
            const parts = raw.split(".");
            parts[0] = parts[0].replace(/^0+(?=\d)/, "").slice(0, 13);
            const pos = el.selectionStart, before = el.value.length;
            el.value = (parts[0] ? Number(parts[0]).toLocaleString("en-US") : (raw.startsWith(".") ? "0" : "")) + (parts.length > 1 ? "." + parts[1].slice(0, 4) : "");
            try { const p = Math.max(0, pos + el.value.length - before); el.setSelectionRange(p, p); } catch (e) {}
        });
    }
    bindNum(amt); bindNum(won);

    /* 기억한 통화 / 주소의 ?c= */
    try {
        const m = /[?&]c=([A-Za-z]{3})/.exec(location.search);
        const s = JSON.parse(localStorage.getItem(MY_KEY) || "null");
        const want = (m && m[1].toUpperCase()) || (s && s.c);
        const f = CUR.find(o => o.c === want);
        if (f) cur = f;
        if (s && s.v && !m) amt.value = s.v;
    } catch (e) {}
    if (!amt.value) amt.value = cur.u === 100 ? cur.t[2].toLocaleString("en-US") : "100";
    function save() { try { localStorage.setItem(MY_KEY, JSON.stringify({ c: cur.c, v: amt.value })); } catch (e) {} }

    function paintChips() {
        chips.innerHTML = "";
        CUR.forEach(o => {
            const b = document.createElement("button");
            b.type = "button"; b.className = o === cur ? "on" : "";
            b.innerHTML = `<b>${o.c}</b> ${name(o)}`;
            b.setAttribute("aria-pressed", o === cur ? "true" : "false");
            b.addEventListener("click", function () {
                cur = o; amt.value = (o.u === 100 ? o.t[2] : 100).toLocaleString("en-US"); last = "amt";
                paintAll();
            });
            chips.appendChild(b);
        });
    }
    function compute() {
        const p = perOne(cur);
        codeEl.textContent = cur.c;
        if (!p) { info.textContent = T("환율을 불러오는 중이에요…", "Loading exchange rates…"); return; }
        if (last === "amt") {
            const v = parseNum(amt);
            won.value = isNaN(v) ? "" : fmtWon(v * p);
        } else {
            const v = parseNum(won);
            amt.value = isNaN(v) ? "" : fmtCur(v / p);
        }
        const unitTxt = cur.u === 100 ? `100 ${cur.c}` : `1 ${cur.c}`;
        info.innerHTML = `${unitTxt} = <b>${fmt(p * cur.u, 2)}${EN ? " KRW" : "원"}</b> · ${EN ? "10,000 KRW" : "1만 원"} = <b>${fmtCur(10000 / p)} ${cur.c}</b>`;
        save();
    }
    function paintTables() {
        const p = perOne(cur);
        if (!p) { table.innerHTML = ""; wonTable.innerHTML = ""; all.innerHTML = ""; return; }
        table.innerHTML = `<thead><tr><th scope="col">${cur.c} (${name(cur)})</th><th scope="col">${T("원", "KRW")}</th></tr></thead><tbody>` +
            cur.t.map(v => `<tr><td>${fmt(v, 0)} ${cur.c}</td><td>${wonTxt(v * p)}</td></tr>`).join("") + "</tbody>";
        wonTable.innerHTML = `<thead><tr><th scope="col">${T("원", "KRW")}</th><th scope="col">${cur.c}</th></tr></thead><tbody>` +
            WON_T.map(v => `<tr><td>${wonTxt(v)}</td><td>${fmtCur(v / p)} ${cur.c}</td></tr>`).join("") + "</tbody>";
        all.innerHTML = `<thead><tr><th scope="col">${T("통화", "Currency")}</th><th scope="col">${T("원화", "In KRW")}</th></tr></thead><tbody>` +
            CUR.map(o => { const q = perOne(o); return `<tr><td><b>${o.u === 100 ? "100 " : "1 "}${o.c}</b> ${name(o)}</td><td>${q ? wonTxt(q * o.u) : "--"}</td></tr>`; }).join("") + "</tbody>";
        document.querySelectorAll(".fx-cur-name").forEach(el => { el.textContent = name(cur); });
    }
    function paintAll() { paintChips(); compute(); paintTables(); }

    amt.addEventListener("input", function () { last = "amt"; compute(); });
    won.addEventListener("input", function () { last = "won"; compute(); });
    $("fx-swap").addEventListener("click", function () {   // 원화칸에 있는 금액을 외화칸으로 (반대로 생각해 보기)
        const a = amt.value; amt.value = won.value; won.value = a; last = "amt"; compute();
    });

    /* ---------- 환율 받기 (홈 fx.js와 같은 저장 칸) ---------- */
    function readCache() { try { const c = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); return c && c.data && c.data.rates ? c : null; } catch (e) { return null; } }
    function writeCache(data) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ fetchedAt: Date.now(), nextAt: (data.time_next_update_unix || 0) * 1000, data: data })); } catch (e) {} }
    function use(data) {
        rates = data.rates;
        const t = new Date((data.time_last_update_unix || 0) * 1000);
        if (data.time_last_update_unix && !isNaN(t.getTime())) {
            dateEl.textContent = EN ? `Rates as of ${t.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} (updated once a day)`
                                    : `${t.getFullYear()}년 ${t.getMonth() + 1}월 ${t.getDate()}일 기준 (하루 한 번 갱신)`;
        }
        paintAll();
    }
    const cache = readCache();
    if (cache) use(cache.data); else paintAll();
    const now = Date.now();
    if (!cache || (now >= cache.nextAt && now - cache.fetchedAt >= MIN_GAP_MS)) {
        fetch(API_URL).then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
            .then(d => { if (!d || d.result !== "success" || !d.rates) throw new Error("bad"); writeCache(d); use(d); })
            .catch(() => { if (!rates) { info.textContent = T("환율을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.", "Couldn't load exchange rates. Please try again later."); dateEl.textContent = ""; } });
    }
})();
