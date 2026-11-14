window.T = window.T || function (ko) { return ko; };   /* lang.js가 없어도 한국어로 동작 */
// 단위 환산 위젯 (오른쪽 광고 영역, 바로가기 위)
// 입력칸이 2개라서 어느 쪽에 숫자를 넣어도 반대쪽이 바로 계산돼요.
// 목록을 바꾸려면 아래 UNIT_PAIRS만 고치면 돼요.
//   k   : 저장용 이름 (바꾸지 않기)
//   a,b : 위 칸 / 아래 칸 단위 이름 "한글(영문 줄임)"
//   s   : 목록에 보이는 짧은 이름
//   f   : 1a = f b  (온도처럼 곱하기로 안 되는 건 ab/ba 함수로)
(function () {
    "use strict";

    const UNIT_PAIRS = [
        { k: "pyeong", s: T("평 ↔ 제곱미터", "Pyeong ↔ Square meter"),     a: T("평(py)", "Pyeong (py)"),     b: T("제곱미터(㎡)", "Square meter (㎡)"), f: 400 / 121 },   // 1평 = 3.3058㎡
        { k: "temp",   s: T("화씨 ↔ 섭씨", "Fahrenheit ↔ Celsius"),       a: T("화씨(°F)", "Fahrenheit (°F)"),   b: T("섭씨(°C)", "Celsius (°C)"),
          ab: v => (v - 32) * 5 / 9,
          ba: v => v * 9 / 5 + 32,
          hint: "°C = (°F − 32) × 5 ÷ 9" },
        { k: "inch",   s: T("인치 ↔ 센티미터", "Inch ↔ Centimeter"),   a: T("인치(in)", "Inch (in)"),   b: T("센티미터(cm)", "Centimeter (cm)"), f: 2.54 },
        { k: "feet",   s: T("피트 ↔ 센티미터", "Foot ↔ Centimeter"),   a: T("피트(ft)", "Foot (ft)"),   b: T("센티미터(cm)", "Centimeter (cm)"), f: 30.48 },
        { k: "yard",   s: T("야드 ↔ 미터", "Yard ↔ Meter"),       a: T("야드(yd)", "Yard (yd)"),   b: T("미터(m)", "Meter (m)"),      f: 0.9144 },
        { k: "mile",   s: T("마일 ↔ 킬로미터", "Mile ↔ Kilometer"),   a: T("마일(mi)", "Mile (mi)"),   b: T("킬로미터(km)", "Kilometer (km)"), f: 1.609344 },
        { k: "pound",  s: T("파운드 ↔ 킬로그램", "Pound ↔ Kilogram"), a: T("파운드(lb)", "Pound (lb)"), b: T("킬로그램(kg)", "Kilogram (kg)"), f: 0.45359237 },
        { k: "ounce",  s: T("온스 ↔ 그램", "Ounce ↔ Gram"),       a: T("온스(oz)", "Ounce (oz)"),   b: T("그램(g)", "Gram (g)"),      f: 28.349523125 },
        { k: "gallon", s: T("갤런 ↔ 리터", "Gallon ↔ Liter"),       a: T("갤런(gal)", "US gallon (gal)"),  b: T("리터(L)", "Liter (L)"),      f: 3.785411784 },  // 미국 갤런
        { k: "acre",   s: T("에이커 ↔ 평", "Acre ↔ Pyeong"),       a: T("에이커(ac)", "Acre (ac)"), b: T("평(py)", "Pyeong (py)"),       f: 4046.8564224 * 121 / 400 },
        { k: "geun",   s: T("근 ↔ 그램", "Geun ↔ Gram"),         a: T("근(geun)", "Geun (geun, 600 g)"),   b: T("그램(g)", "Gram (g)"),      f: 600 }           // 고기 1근 = 600g
    ];

    const STORE_KEY = "unitConv.v2";

    const box = document.getElementById("unit-widget");
    if (!box) return;

    const sel    = document.getElementById("uc-pair");
    const inA    = document.getElementById("uc-a");
    const inB    = document.getElementById("uc-b");
    const unitA  = document.getElementById("uc-a-unit");
    const unitB  = document.getElementById("uc-b-unit");
    const hintEl = document.getElementById("uc-hint");

    let key = "pyeong";
    try {
        const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
        if (saved && UNIT_PAIRS.some(p => p.k === saved.k)) key = saved.k;
    } catch (e) { /* 저장 안 돼도 기본값으로 */ }

    function save() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify({ k: key })); } catch (e) {}
    }

    function pair() {
        return UNIT_PAIRS.find(p => p.k === key) || UNIT_PAIRS[0];
    }

    function aToB(p, v) { return p.ab ? p.ab(v) : v * p.f; }
    function bToA(p, v) { return p.ba ? p.ba(v) : v / p.f; }

    function fmt(n) {
        if (!isFinite(n)) return "";
        const x = Math.abs(n);
        const digits = x >= 1000 ? 1 : x >= 100 ? 2 : x >= 1 ? 3 : 5;
        return n.toLocaleString("ko-KR", { maximumFractionDigits: digits });
    }

    function short(label) {           // "센티미터(cm)" → "cm"
        const m = label.match(/\(([^)]+)\)/);
        return m ? m[1] : label;
    }

    function readNum(input) {
        const raw = input.value.replace(/,/g, "").trim();
        if (raw === "" || raw === "-" || raw === ".") return NaN;
        return parseFloat(raw);
    }

    // 한쪽 칸 값으로 반대쪽 칸을 채워요.
    function recalc(from) {
        const p = pair();
        if (from === "a") {
            const v = readNum(inA);
            inB.value = isNaN(v) ? "" : fmt(aToB(p, v));
        } else {
            const v = readNum(inB);
            inA.value = isNaN(v) ? "" : fmt(bToA(p, v));
        }
    }

    function showPair() {
        const p = pair();
        unitA.textContent = p.a;
        unitB.textContent = p.b;
        inA.setAttribute("aria-label", p.a + T(" 값", " value"));
        inB.setAttribute("aria-label", p.b + T(" 값", " value"));
        hintEl.textContent = p.hint || `1${short(p.a)} = ${fmt(aToB(p, 1))}${short(p.b)}`;
    }

    UNIT_PAIRS.forEach(p => {
        const o = document.createElement("option");
        o.value = p.k;
        o.textContent = p.s;
        sel.appendChild(o);
    });
    sel.value = key;

    sel.addEventListener("change", () => {
        key = sel.value;
        save();
        showPair();
        // 단위를 바꾸면 위 칸은 1(온도는 100°F)로 돌아가고 아래 칸을 다시 계산해요.
        inA.value = key === "temp" ? "100" : "1";
        recalc("a");
    });

    function onType(input, side) {
        // 숫자, 소수점, 쉼표, 마이너스(온도)만 받아요.
        const clean = input.value.replace(/[^0-9.,\-]/g, "");
        if (clean !== input.value) input.value = clean;
        recalc(side);
    }

    inA.addEventListener("input", () => onType(inA, "a"));
    inB.addEventListener("input", () => onType(inB, "b"));
    inA.addEventListener("focus", () => inA.select());
    inB.addEventListener("focus", () => inB.select());

    showPair();
    recalc("a");
})();
