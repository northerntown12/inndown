// 단위 환산 위젯 (오른쪽 광고 영역, 바로가기 위)
// 목록을 바꾸려면 아래 UNIT_PAIRS만 고치면 돼요.
//   k   : 저장용 이름 (바꾸지 않기)
//   a,b : 단위 이름 (a → b)
//   f   : 1a = f b  (온도처럼 곱하기로 안 되는 건 to/from 함수로)
(function () {
    "use strict";

    const UNIT_PAIRS = [
        { k: "pyeong", a: "평",   b: "㎡",  f: 400 / 121 },        // 1평 = 3.3058㎡
        { k: "temp",   a: "°F",   b: "°C",
          to:   v => (v - 32) * 5 / 9,
          from: v => v * 9 / 5 + 32,
          hint: ["°C = (°F − 32) × 5 ÷ 9", "°F = °C × 9 ÷ 5 + 32"] },
        { k: "inch",   a: "인치", b: "cm",  f: 2.54 },
        { k: "feet",   a: "피트", b: "cm",  f: 30.48 },
        { k: "mile",   a: "마일", b: "km",  f: 1.609344 },
        { k: "pound",  a: "파운드", b: "kg", f: 0.45359237 },
        { k: "gallon", a: "갤런", b: "L",   f: 3.785411784 },      // 미국 갤런
        { k: "ounce",  a: "온스", b: "g",   f: 28.349523125 },
        { k: "yard",   a: "야드", b: "m",   f: 0.9144 },
        { k: "acre",   a: "에이커", b: "평", f: 4046.8564224 * 121 / 400 },
        { k: "geun",   a: "근",   b: "g",   f: 600 }               // 고기 1근 = 600g
    ];

    const STORE_KEY = "unitConv.v1";

    const box = document.getElementById("unit-widget");
    if (!box) return;

    const sel    = document.getElementById("uc-pair");
    const input  = document.getElementById("uc-input");
    const fromEl = document.getElementById("uc-from");
    const toEl   = document.getElementById("uc-to");
    const outEl  = document.getElementById("uc-result");
    const hintEl = document.getElementById("uc-hint");
    const swap   = document.getElementById("uc-swap");

    let state = { k: "pyeong", rev: false };
    try {
        const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
        if (saved && UNIT_PAIRS.some(p => p.k === saved.k)) {
            state = { k: saved.k, rev: !!saved.rev };
        }
    } catch (e) { /* 저장 안 돼도 기본값으로 */ }

    function save() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
    }

    function pair() {
        return UNIT_PAIRS.find(p => p.k === state.k) || UNIT_PAIRS[0];
    }

    function convert(p, v, rev) {
        if (p.to) return rev ? p.from(v) : p.to(v);
        return rev ? v / p.f : v * p.f;
    }

    function fmt(n) {
        if (!isFinite(n)) return "-";
        const a = Math.abs(n);
        const digits = a >= 1000 ? 1 : a >= 100 ? 2 : a >= 1 ? 3 : 5;
        return n.toLocaleString("ko-KR", { maximumFractionDigits: digits });
    }

    function fillSelect() {
        sel.innerHTML = "";
        UNIT_PAIRS.forEach(p => {
            const o = document.createElement("option");
            o.value = p.k;
            o.textContent = state.rev ? `${p.b} → ${p.a}` : `${p.a} → ${p.b}`;
            sel.appendChild(o);
        });
        sel.value = state.k;
    }

    function update() {
        const p = pair();
        const from = state.rev ? p.b : p.a;
        const to   = state.rev ? p.a : p.b;
        fromEl.textContent = from;
        toEl.textContent = to;

        const raw = input.value.replace(/,/g, "").trim();
        const v = parseFloat(raw);
        outEl.textContent = raw === "" || isNaN(v) ? "-" : fmt(convert(p, v, state.rev));

        hintEl.textContent = p.hint
            ? p.hint[state.rev ? 1 : 0]
            : `1${from} = ${fmt(convert(p, 1, state.rev))}${to}`;
    }

    sel.addEventListener("change", () => {
        state.k = sel.value;
        save();
        update();
    });

    input.addEventListener("input", () => {
        // 숫자, 소수점, 쉼표, 마이너스(온도)만 받아요.
        const clean = input.value.replace(/[^0-9.,\-]/g, "");
        if (clean !== input.value) input.value = clean;
        update();
    });

    input.addEventListener("focus", () => input.select());

    swap.addEventListener("click", () => {
        // 지금 결과를 입력칸으로 옮기고 방향을 뒤집어요.
        const shown = outEl.textContent.replace(/,/g, "");
        state.rev = !state.rev;
        if (shown !== "-" && !isNaN(parseFloat(shown))) input.value = shown;
        swap.classList.toggle("spin");
        save();
        fillSelect();
        update();
    });

    fillSelect();
    update();
})();
