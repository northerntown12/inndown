window.T = window.T || function (ko) { return ko; };   /* lang.js가 없어도 한국어로 동작 */
/* =========================================================
   계산기 크게 보기 (calc.html / calc-en.html, 2026-11-27)
   - 일반 / 공학용 두 가지 (공학용: 괄호, x², √, xʸ, sin·cos·tan, ln·log, π, e, n!, 1/x, |x|, 각도 DEG·RAD)
   - 식을 보면서 계산 (× ÷ 먼저, 괄호 먼저), 치는 동안 답 미리 보기, 천 단위 쉼표, 한글 금액(1억 2,345만)
   - % : "200 + 10%" = 220 (앞 숫자의 10%를 더함), 그냥 "10%" = 0.1
   - 메모리 MC·MR·M+·M−, ± 부호 바꾸기, 00 버튼, 답 복사
   - 계산 기록: 최근 100개, 누르면 그 답(또는 식)을 다시 불러옴, 이 기기에만 기억 (calcHistory.v1)
   - 키보드: 숫자, + - * / ^ ( ) . %, Enter/=, Backspace, Esc(AC)
   - 기억: 모드·각도·소리 calcPage.v1, 메모리 calcMem.v1
   ========================================================= */
(function () {
    "use strict";
    const $ = id => document.getElementById(id);
    const root = $("cx");
    if (!root) return;
    const EN = !!window.SITE_EN;
    const LOC = EN ? "en-US" : "ko-KR";

    function load(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
    function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    const opt = Object.assign({ sci: false, deg: true, muted: false }, load("calcPage.v1", {}));
    let mem = load("calcMem.v1", 0) || 0;
    let hist = load("calcHistory.v1", []);
    if (!Array.isArray(hist)) hist = [];

    /* ---------------- 소리 ---------------- */
    let AC = null;
    function click(kind) {
        if (opt.muted) return;
        try {
            if (!AC) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; AC = new C(); }
            if (AC.state === "suspended") AC.resume();
            const t = AC.currentTime + 0.005, o = AC.createOscillator(), g = AC.createGain();
            const f = kind === "eq" ? 1500 : kind === "op" ? 1050 : kind === "clr" ? 620 : 880;
            o.type = "sine"; o.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(kind === "eq" ? 0.09 : 0.06, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === "eq" ? 0.18 : 0.07));
            o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + 0.2);
        } catch (e) {}
    }

    /* ---------------- 숫자 모양 ---------------- */
    function fmtNum(str) {                 // 입력 중인 숫자 문자열 → 쉼표
        let s = String(str), neg = "";
        if (s[0] === "-") { neg = "-"; s = s.slice(1); }
        const p = s.split(".");
        const int = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return neg + int + (p.length > 1 ? "." + p[1] : "");
    }
    function fmtVal(v) {                   // 계산 결과 → 보기 좋은 문자열
        if (!isFinite(v)) return T("계산할 수 없어요", "Can't calculate");
        if (v === 0) return "0";
        const a = Math.abs(v);
        if (a >= 1e15 || a < 1e-9) return v.toExponential(10).replace(/\.?0+e/, "e").replace("e+", "e+");
        const r = Number(v.toPrecision(14));
        const s = r.toString().indexOf("e") >= 0 ? r.toFixed(12).replace(/\.?0+$/, "") : r.toString();
        return fmtNum(s);
    }
    function plain(v) { return isFinite(v) ? String(Number(v.toPrecision(14))) : "0"; }
    /* 한글 금액: 1억 2,345만 6,789 / 영어: 1.23 million */
    function wordsOf(v) {
        if (!isFinite(v)) return "";
        const neg = v < 0 ? "−" : "", a = Math.floor(Math.abs(v));
        if (a < 10000 && EN === false) return "";
        if (EN) {
            if (a < 1e6) return "";
            const units = [[1e12, "trillion"], [1e9, "billion"], [1e6, "million"]];
            for (const u of units) if (a >= u[0]) return "≈ " + neg + Number((a / u[0]).toPrecision(4)) + " " + u[1];
            return "";
        }
        if (a >= 1e20) return "";
        const parts = [], names = ["", "만", "억", "조", "경"];
        let n = a, i = 0;
        while (n > 0 && i < names.length) {
            const chunk = n % 10000;
            if (chunk) parts.unshift(chunk.toLocaleString("ko-KR") + names[i]);
            n = Math.floor(n / 10000); i++;
        }
        return neg + parts.join(" ");
    }

    /* ---------------- 식 (토큰) ----------------
       토큰 종류: {t:"num", s:"123.4"} {t:"op", s:"+|−|×|÷|^"} {t:"(" } {t:")"} {t:"fn", s:"sin|cos|tan|ln|log|√"} (뒤에 "(" 가 따라옴)
                  {t:"post", s:"²|!|%"} {t:"const", s:"π|e"} {t:"neg"} (앞에 붙는 −) {t:"ans"} */
    let expr = [];          // 지금 치는 식
    let lastAns = 0, justEq = false, lastExprText = "";

    const last = () => expr[expr.length - 1];
    const isValueEnd = tk => tk && (tk.t === "num" || tk.t === ")" || tk.t === "post" || tk.t === "const" || tk.t === "ans");
    function openCount() { let n = 0; for (const tk of expr) { if (tk.t === "(") n++; else if (tk.t === ")") n--; } return n; }
    function implicitMul() { if (isValueEnd(last())) expr.push({ t: "op", s: "×" }); }
    function startFromAns() {           // = 뒤에 기호를 누르면 답에 이어서
        if (justEq) { expr = [{ t: "num", s: plain(lastAns) }]; justEq = false; }
    }
    function freshAfterEq() { if (justEq) { expr = []; justEq = false; } }

    function inDigit(d) {
        freshAfterEq();
        const tk = last();
        if (tk && tk.t === "num") {
            if (d === "." && tk.s.indexOf(".") >= 0) return;
            const digitsN = tk.s.replace(/[^0-9]/g, "").length;
            if (digitsN >= 15 && d !== ".") return;
            if (tk.s === "0" && d !== "." && d !== "00") tk.s = d;
            else if (tk.s === "-0" && d !== "." && d !== "00") tk.s = "-" + d;
            else if (d === "00" && (tk.s === "0" || tk.s === "-0")) return;
            else tk.s += d;
        } else {
            implicitMul();
            expr.push({ t: "num", s: d === "." ? "0." : d === "00" ? "0" : d });
        }
    }
    function inOp(op) {
        startFromAns();
        const tk = last();
        if (!tk) {
            if (op === "−") { expr.push({ t: "neg" }); return; }
            expr.push({ t: "num", s: plain(lastAns) }, { t: "op", s: op }); return;
        }
        if (tk.t === "op" || tk.t === "neg") {
            if (op === "−" && tk.t === "op" && (tk.s === "×" || tk.s === "÷" || tk.s === "^")) { expr.push({ t: "neg" }); return; }
            if (tk.t === "neg") { expr.pop(); if (!expr.length) return; }
            expr[expr.length - 1] = { t: "op", s: op }; return;
        }
        if (tk.t === "(" || tk.t === "fn") { if (op === "−") expr.push({ t: "neg" }); return; }
        expr.push({ t: "op", s: op });
    }
    function inParen(p) {
        if (p === "(") { freshAfterEq(); implicitMul(); expr.push({ t: "(" }); return; }
        startFromAns();
        const tk = last();
        if (openCount() > 0 && isValueEnd(tk)) expr.push({ t: ")" });
    }
    function inFn(f) { freshAfterEq(); implicitMul(); expr.push({ t: "fn", s: f }, { t: "(" }); }
    function inConst(c) { freshAfterEq(); implicitMul(); expr.push({ t: "const", s: c }); }
    function inPost(p) {
        startFromAns();
        const tk = last();
        if (!isValueEnd(tk)) { if (!tk) { expr.push({ t: "num", s: plain(lastAns) }); } else return; }
        expr.push({ t: "post", s: p });
    }
    function inSign() {
        startFromAns();
        const tk = last();
        if (tk && tk.t === "num") { tk.s = tk.s[0] === "-" ? tk.s.slice(1) : "-" + tk.s; return; }
        if (tk && tk.t === "neg") { expr.pop(); return; }
        if (!tk || tk.t === "op" || tk.t === "(" ) { expr.push({ t: "neg" }); return; }
        if (isValueEnd(tk)) {   // 괄호·상수 등 → 앞에 −(…)로 감싸기 대신 × −1
            expr.push({ t: "op", s: "×" }, { t: "num", s: "-1" });
        }
    }
    function inRecip() { startFromAns(); const body = expr.length ? expr : [{ t: "num", s: plain(lastAns) }]; expr = [{ t: "num", s: "1" }, { t: "op", s: "÷" }, { t: "(" }].concat(body, [{ t: ")" }]); }
    function inBack() {
        if (justEq) { justEq = false; lastExprText = ""; return; }
        const tk = last(); if (!tk) return;
        if (tk.t === "num" && tk.s.length > 1 && !(tk.s.length === 2 && tk.s[0] === "-")) { tk.s = tk.s.slice(0, -1); return; }
        expr.pop();
        if (tk.t === "(" && last() && last().t === "fn") expr.pop();
    }
    function inClear() { expr = []; justEq = false; lastExprText = ""; }

    /* ---------------- 계산 (재귀 하강) ---------------- */
    function evaluate(list) {
        let i = 0;
        const toRad = x => opt.deg ? x * Math.PI / 180 : x;
        const peek = () => list[i];
        function fact(n) { if (n < 0 || n % 1) return NaN; if (n > 170) return Infinity; let r = 1; for (let k = 2; k <= n; k++) r *= k; return r; }
        function primary() {
            const tk = list[i++];
            if (!tk) throw 0;
            if (tk.t === "num") return { v: parseFloat(tk.s) };
            if (tk.t === "ans") return { v: lastAns };
            if (tk.t === "const") return { v: tk.s === "π" ? Math.PI : Math.E };
            if (tk.t === "neg") { const r = power(); return { v: -r.v, pct: r.pct }; }
            if (tk.t === "(") { const r = sum(); if (peek() && peek().t === ")") i++; return { v: r }; }   // 닫는 괄호가 없어도 끝까지 계산
            if (tk.t === "fn") {
                if (peek() && peek().t === "(") i++;
                const x = sum(); if (peek() && peek().t === ")") i++;
                const v = tk.s === "sin" ? Math.sin(toRad(x)) : tk.s === "cos" ? Math.cos(toRad(x)) : tk.s === "tan" ? Math.tan(toRad(x))
                    : tk.s === "ln" ? Math.log(x) : tk.s === "log" ? Math.log10(x) : tk.s === "√" ? Math.sqrt(x) : tk.s === "abs" ? Math.abs(x) : NaN;
                return { v: Math.abs(v) < 1e-13 ? 0 : v };
            }
            throw 0;
        }
        function postfix() {
            let r = primary();
            while (peek() && peek().t === "post") {
                const p = list[i++].s;
                if (p === "²") r = { v: r.v * r.v }; else if (p === "!") r = { v: fact(r.v) }; else if (p === "%") r = { v: r.v / 100, pct: true, raw: r.v };
            }
            return r;
        }
        function power() {
            const b = postfix();
            if (peek() && peek().t === "op" && peek().s === "^") { i++; const e = power(); return { v: Math.pow(b.v, e.v) }; }
            return b;
        }
        function product() {
            let r = power();
            while (peek() && peek().t === "op" && (peek().s === "×" || peek().s === "÷")) {
                const op = list[i++].s, b = power();
                r = { v: op === "×" ? r.v * b.v : r.v / b.v };
            }
            return r;
        }
        function sum() {
            let r = product();
            while (peek() && peek().t === "op" && (peek().s === "+" || peek().s === "−")) {
                const op = list[i++].s, b = product();
                const add = b.pct ? r.v * b.raw / 100 : b.v;     // 200 + 10% = 220
                r = { v: op === "+" ? r.v + add : r.v - add };
            }
            return r.v;
        }
        const out = sum();
        if (i < list.length) throw 0;
        return out;
    }
    function tryEval(list) {
        let l = list.slice();
        while (l.length && (l[l.length - 1].t === "op" || l[l.length - 1].t === "neg" || l[l.length - 1].t === "(" || l[l.length - 1].t === "fn")) {
            const x = l.pop(); if (x.t === "(" && l.length && l[l.length - 1].t === "fn") l.pop();
        }
        if (!l.length) return null;
        try { const v = evaluate(l); return typeof v === "number" ? v : null; } catch (e) { return null; }
    }

    /* ---------------- 식 보이기 ---------------- */
    function tokText(tk, k, list) {
        if (tk.t === "num") return fmtNum(tk.s);
        if (tk.t === "op") return " " + tk.s + " ";
        if (tk.t === "neg") return "−";
        if (tk.t === "(") return "(";
        if (tk.t === ")") return ")";
        if (tk.t === "fn") return tk.s === "abs" ? "abs" : tk.s;
        if (tk.t === "post") return tk.s;
        if (tk.t === "const") return tk.s;
        if (tk.t === "ans") return "Ans";
        return "";
    }
    const exprText = list => list.map(tokText).join("").replace(/\s+/g, " ").trim();

    /* ---------------- 화면 ---------------- */
    const elExpr = $("cxExpr"), elMain = $("cxMain"), elWords = $("cxWords"), elMem = $("cxMemFlag"), elDeg = $("cxDeg");
    function fitMain() {
        elMain.style.fontSize = "";
        const box = elMain.parentElement.clientWidth - 8;
        let size = parseFloat(getComputedStyle(elMain).fontSize), guard = 0;
        while (elMain.offsetWidth > box && size > 18 && guard++ < 40) { size -= 2; elMain.style.fontSize = size + "px"; }
        elExpr.scrollLeft = elExpr.scrollWidth;      // 식이 길면 끝부분(최근 입력)이 보이게
    }
    function render() {
        let main, top, words = "";
        if (justEq) {
            top = lastExprText + " =";
            main = fmtVal(lastAns); words = wordsOf(lastAns);
        } else {
            const tk = last();
            top = exprText(expr) + (openCount() > 0 ? " " + ")".repeat(openCount()).replace(/\)/g, "⁾") : "");
            if (tk && tk.t === "num") main = fmtNum(tk.s);
            else { const pv = tryEval(expr); main = pv == null ? (expr.length ? "" : "0") : fmtVal(pv); }
            const pv = tryEval(expr);
            if (pv != null && expr.length > 1) words = "= " + fmtVal(pv) + (wordsOf(pv) ? " · " + wordsOf(pv) : "");
            else if (tk && tk.t === "num") words = wordsOf(parseFloat(tk.s));
            if (!expr.length) { main = "0"; top = ""; }
        }
        elExpr.textContent = top || " ";
        elMain.textContent = main || "0";
        elWords.textContent = words || " ";
        elMain.classList.toggle("is-result", justEq);
        elMem.hidden = !mem; elMem.title = "M = " + fmtVal(mem);
        elDeg.textContent = opt.deg ? "DEG" : "RAD";
        elDeg.hidden = !opt.sci;
        requestAnimationFrame(fitMain);
    }

    function equals() {
        if (justEq || !expr.length) return;
        while (openCount() > 0 && isValueEnd(last())) expr.push({ t: ")" });
        const v = tryEval(expr);
        if (v == null) { shake(); return; }
        if (!isFinite(v)) {
            flash(Math.abs(v) === Infinity && expr.some((tk, k) => tk.t === "op" && tk.s === "÷") ? T("0으로 나눌 수 없어요", "Can't divide by zero") : T("계산할 수 없는 식이에요", "Can't calculate that"));
            shake(); return;
        }
        lastExprText = exprText(expr);
        lastAns = v; justEq = true;
        hist.unshift({ e: lastExprText, v: plain(v), t: Date.now() });
        if (hist.length > 100) hist.length = 100;
        save("calcHistory.v1", hist);
        renderHist();
    }
    function shake() { root.classList.remove("is-shake"); void root.offsetWidth; root.classList.add("is-shake"); }
    let flashT = 0;
    function flash(msg) { const el = $("cxMsg"); el.textContent = msg; el.hidden = false; clearTimeout(flashT); flashT = setTimeout(() => { el.hidden = true; }, 2200); }

    function currentValue() {
        if (justEq) return lastAns;
        const v = tryEval(expr); return v == null ? 0 : v;
    }
    function memDo(k) {
        if (k === "mc") mem = 0;
        else if (k === "mr") { freshAfterEq(); implicitMul(); expr.push({ t: "num", s: plain(mem) }); }
        else if (k === "m+") { mem += currentValue(); flash("M + " + fmtVal(currentValue()) + " → " + fmtVal(mem)); }
        else if (k === "m-") { mem -= currentValue(); flash("M − " + fmtVal(currentValue()) + " → " + fmtVal(mem)); }
        save("calcMem.v1", mem);
    }
    function copyResult() {
        const txt = plain(currentValue());
        const ok = () => flash(T("복사했어요: ", "Copied: ") + fmtVal(+txt));
        if (navigator.clipboard) navigator.clipboard.writeText(txt).then(ok, () => {});
        else { const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); ok(); } catch (e) {} ta.remove(); }
    }

    /* ---------------- 버튼 ---------------- */
    function press(k) {
        if (/^\d$|^00$|^\.$/.test(k)) { click("num"); inDigit(k); }
        else if (["+", "−", "×", "÷", "^"].indexOf(k) >= 0) { click("op"); inOp(k); }
        else if (k === "(" || k === ")") { click("op"); inParen(k); }
        else if (k === "=") { click("eq"); equals(); }
        else if (k === "ac") { click("clr"); inClear(); }
        else if (k === "del") { click("clr"); inBack(); }
        else if (k === "%" || k === "²" || k === "!") { click("op"); inPost(k); }
        else if (k === "±") { click("op"); inSign(); }
        else if (["sin", "cos", "tan", "ln", "log", "√", "abs"].indexOf(k) >= 0) { click("op"); inFn(k); }
        else if (k === "π" || k === "e") { click("num"); inConst(k); }
        else if (k === "1/x") { click("op"); inRecip(); }
        else if (k === "deg") { opt.deg = !opt.deg; save("calcPage.v1", opt); click("op"); }
        else if (/^m[cr+-]$/.test(k)) { click("op"); memDo(k); }
        else if (k === "copy") { copyResult(); }
        render();
    }
    root.addEventListener("click", e => {
        const b = e.target.closest("[data-k]"); if (!b || !root.contains(b)) return;
        press(b.dataset.k);
        b.blur && e.detail > 0 && b.blur();
    });
    /* 모드 */
    function setSci(on) {
        opt.sci = on; save("calcPage.v1", opt);
        root.classList.toggle("is-sci", on);
        document.querySelectorAll(".cx-mode").forEach(b => { const s = b.dataset.sci === "1"; b.classList.toggle("on", s === on); b.setAttribute("aria-selected", s === on ? "true" : "false"); });
        render();
    }
    document.querySelectorAll(".cx-mode").forEach(b => b.addEventListener("click", () => { click("op"); setSci(b.dataset.sci === "1"); }));
    /* 소리 */
    const sb = $("cxSound");
    function syncSound() { sb.classList.toggle("muted", opt.muted); const l = opt.muted ? T("버튼 소리 켜기", "Sound on") : T("버튼 소리 끄기", "Sound off"); sb.title = l; sb.setAttribute("aria-label", l); }
    sb.addEventListener("click", () => { opt.muted = !opt.muted; save("calcPage.v1", opt); syncSound(); click("op"); });
    syncSound();

    /* 키보드 */
    document.addEventListener("keydown", e => {
        const tag = (e.target.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;
        if (e.ctrlKey || e.metaKey || e.altKey) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && !String(window.getSelection())) { copyResult(); e.preventDefault(); } return; }
        const map = { "+": "+", "-": "−", "*": "×", "x": "×", "X": "×", "/": "÷", "^": "^", "(": "(", ")": ")", ".": ".", ",": ".", "%": "%", "=": "=", "Enter": "=", "Backspace": "del", "Delete": "ac", "Escape": "ac", "!": "!" };
        let k = /^\d$/.test(e.key) ? e.key : map[e.key];
        if (!k) return;
        if (!opt.sci && ["^", "(", ")", "!"].indexOf(k) >= 0) setSci(true);
        e.preventDefault(); press(k);
        const btn = root.querySelector('[data-k="' + CSS.escape(k) + '"]');
        if (btn) { btn.classList.add("is-press"); setTimeout(() => btn.classList.remove("is-press"), 120); }
    });

    /* ---------------- 계산 기록 ---------------- */
    const hl = $("cxHist");
    function renderHist() {
        $("cxHistCount").textContent = hist.length ? "(" + hist.length + ")" : "";
        if (!hist.length) { hl.innerHTML = '<li class="cx-empty">' + T("= 을 누르면 계산한 식과 답이 여기에 쌓여요.", "Press = and your calculations will appear here.") + '</li>'; $("cxHistClear").hidden = true; return; }
        $("cxHistClear").hidden = false;
        const fmtT = ts => new Date(ts).toLocaleString(LOC, { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
        hl.innerHTML = hist.map((h, k) => '<li><button type="button" class="cx-h" data-h="' + k + '" title="' + T("이 답 불러오기", "Use this answer") + '">' +
            '<span class="cx-h-e">' + escHtml(h.e) + ' =</span><b>' + fmtVal(+h.v) + '</b><small>' + fmtT(h.t) + '</small></button>' +
            '<button type="button" class="cx-h-x" data-hx="' + k + '" aria-label="' + T("지우기", "Delete") + '">✕</button></li>').join("");
    }
    function escHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
    hl.addEventListener("click", e => {
        const x = e.target.closest("[data-hx]");
        if (x) { hist.splice(+x.dataset.hx, 1); save("calcHistory.v1", hist); renderHist(); return; }
        const b = e.target.closest("[data-h]"); if (!b) return;
        const h = hist[+b.dataset.h]; if (!h) return;
        click("num");
        /* 지금 식이 기호로 끝나 있으면 그 뒤에 답을 이어 붙이고, 아니면 답으로 새로 시작 */
        const tk = last();
        if (!justEq && tk && (tk.t === "op" || tk.t === "(" || tk.t === "neg")) expr.push({ t: "num", s: h.v });
        else { expr = [{ t: "num", s: h.v }]; justEq = false; }
        render();
    });
    $("cxHistClear").addEventListener("click", () => {
        if ($("cxHistClear").dataset.arm && Date.now() - +$("cxHistClear").dataset.arm < 3000) { hist = []; save("calcHistory.v1", hist); renderHist(); $("cxHistClear").dataset.arm = ""; $("cxHistClear").textContent = T("기록 지우기", "Clear history"); return; }
        $("cxHistClear").dataset.arm = Date.now(); $("cxHistClear").textContent = T("한 번 더 누르면 지워요", "Press again to clear");
        setTimeout(() => { $("cxHistClear").textContent = T("기록 지우기", "Clear history"); $("cxHistClear").dataset.arm = ""; }, 3000);
    });

    /* 시작 */
    window.addEventListener("resize", () => requestAnimationFrame(fitMain));
    setSci(!!opt.sci);
    renderHist();
    render();
    window.__calc = { press: press, state: () => ({ expr: expr, lastAns: lastAns, justEq: justEq, mem: mem }), evalText: s => { inClear(); s.split(" ").forEach(press); return currentValue(); } };
})();
