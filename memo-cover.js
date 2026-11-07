/* =====================================================================
   할 일 · 메모 커버 (사생활 보호용)
   - 오른쪽 위 [커버 덮기]를 누르면 스프링 쪽을 축으로 노트 표지가 덮여요.
   - 처음 한 번은 비밀번호(숫자 3자리)를 정해요.
   - 덮인 뒤에는 버튼이 [커버 열기]로 바뀌고, 비밀번호를 맞게 넣어야 열려요.
   - 5번 틀리면 30초 동안 입력을 막아요.
   - 열쇠 버튼(탭 줄): 비밀번호 바꾸기 / 커버의 "잊었어요": 메모를 지우고 초기화
   ※ 이 기기 브라우저 안에서만 쓰는 가벼운 가림막이에요. 은행 수준의 보안은 아니에요.
   ===================================================================== */
(function () {
    "use strict";

    var root = document.getElementById("memo-widget");
    if (!root) return;
    var pad = root.querySelector(".memo-pad");
    var tabs = root.querySelector(".memo-tabs");
    if (!pad || !tabs) return;

    var KEY = "homepageMemo.cover.v1";
    var MEMO_KEY = "homepageMemo.v1";
    var MAX_FAIL = 5, LOCK_MS = 30 * 1000, ANIM_MS = 800;

    /* ---------- 저장값 ---------- */
    var st = { salt: "", hash: "", covered: false, fails: 0, lockUntil: 0 };
    try {
        var saved = JSON.parse(localStorage.getItem(KEY));
        if (saved && typeof saved === "object") {
            st.salt = String(saved.salt || "");
            st.hash = String(saved.hash || "");
            st.covered = saved.covered === true && !!st.hash;
            st.fails = Number(saved.fails) || 0;
            st.lockUntil = Number(saved.lockUntil) || 0;
        }
    } catch (e) { /* 무시 */ }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* 무시 */ } }

    function sha(text) {
        if (window.crypto && crypto.subtle && window.TextEncoder) {
            return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
                return Array.prototype.map.call(new Uint8Array(buf), function (b) { return (b < 16 ? "0" : "") + b.toString(16); }).join("");
            });
        }
        var h = 5381;                                       // 예비용 (https가 아닐 때)
        for (var i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
        return Promise.resolve("d" + (h >>> 0).toString(16));
    }
    function hashPin(pin, salt) { return sha("memo-cover|" + salt + "|" + pin); }
    function newSalt() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

    /* ---------- 요소 만들기 ---------- */
    function mk(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    var LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><rect x="4.5" y="10" width="15" height="11" rx="2.5" fill="currentColor"/><circle cx="12" cy="15.2" r="1.7" fill="#0f2147"/></svg>';
    var OPEN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 9.6-1.9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><rect x="4.5" y="10" width="15" height="11" rx="2.5" fill="currentColor"/></svg>';
    var KEY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12.2 12H21M18 12v3.2M15.4 12v2.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

    // 오른쪽 위 버튼: 커버 덮기 / 커버 열기
    var btn = mk("button", "memo-cover-btn");
    btn.type = "button";
    pad.appendChild(btn);

    // 탭 줄 열쇠 버튼: 비밀번호 바꾸기 (비밀번호가 있을 때만)
    var keyBtn = mk("button", "memo-icon memo-cover-key");
    keyBtn.type = "button";
    keyBtn.title = "커버 비밀번호 바꾸기";
    keyBtn.setAttribute("aria-label", "커버 비밀번호 바꾸기");
    keyBtn.innerHTML = KEY_SVG;
    tabs.appendChild(keyBtn);

    /* 표지 배경: 외국 신문 기사를 오려 붙인 스크랩 (가상의 신문·기사) */
    function collageSVG() {
        var WORDS = ("the of and in a to was for on with as by at from city new year it is that this an "
            + "market river garden harbour council morning evening weekend season local visitors "
            + "spring autumn museum festival rail station bridge square street old music art rain "
            + "le la les de du et un une dans pour sur avec der die das und im mit von zu il di "
            + "del che per nel").split(" ");
        var seed = 7;
        function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
        function words(n) {
            var out = [];
            for (var i = 0; i < n; i++) out.push(WORDS[Math.floor(rnd() * WORDS.length)]);
            return out.join(" ");
        }
        function esc(t) { return t.replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
        function body(x, y, w, h, cols, fs) {
            var g = "", lh = fs * 1.35, cw = (w - (cols - 1) * 3) / cols;
            for (var c = 0; c < cols; c++) {
                var cx = x + c * (cw + 3);
                for (var yy = y + fs; yy < y + h; yy += lh) {
                    var chars = Math.floor(cw / (fs * 0.5));
                    var line = words(12).slice(0, chars);
                    g += '<text x="' + cx.toFixed(1) + '" y="' + yy.toFixed(1) + '" font-size="' + fs +
                         '" textLength="' + (rnd() < 0.15 ? (cw * 0.6).toFixed(1) : cw.toFixed(1)) +
                         '" lengthAdjust="spacingAndGlyphs">' + esc(line) + '</text>';
                }
                if (c < cols - 1) g += '<line x1="' + (cx + cw + 1.5).toFixed(1) + '" y1="' + y + '" x2="' + (cx + cw + 1.5).toFixed(1) + '" y2="' + (y + h) + '" stroke="#999" stroke-width=".3"/>';
            }
            return '<g fill="#3d3a33" font-family="Georgia, \'Times New Roman\', serif">' + g + '</g>';
        }
        function photo(x, y, w, h, kind) {
            var id = "mcp" + Math.floor(rnd() * 1e6);
            var g = '<clipPath id="' + id + '"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/></clipPath>';
            g += '<g clip-path="url(#' + id + ')"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="#9b968a"/>';
            if (kind === 0) {        // 산과 하늘
                g += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h * 0.55 + '" fill="#c9c4b6"/>';
                g += '<path d="M' + x + ' ' + (y + h * 0.7) + ' L' + (x + w * 0.3) + ' ' + (y + h * 0.35) + ' L' + (x + w * 0.5) + ' ' + (y + h * 0.55) + ' L' + (x + w * 0.75) + ' ' + (y + h * 0.25) + ' L' + (x + w) + ' ' + (y + h * 0.6) + ' V' + (y + h) + ' H' + x + 'Z" fill="#6e6a60"/>';
            } else if (kind === 1) { // 건물들
                for (var i = 0; i < 6; i++) {
                    var bw = w / 6, bh = h * (0.35 + rnd() * 0.5);
                    g += '<rect x="' + (x + i * bw).toFixed(1) + '" y="' + (y + h - bh).toFixed(1) + '" width="' + (bw - 0.6).toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + (i % 2 ? "#5f5b52" : "#77736a") + '"/>';
                }
            } else {                 // 사람 실루엣
                g += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="#b5b0a3"/>';
                g += '<circle cx="' + (x + w * 0.5) + '" cy="' + (y + h * 0.38) + '" r="' + (h * 0.16) + '" fill="#4f4b44"/>';
                g += '<path d="M' + (x + w * 0.22) + ' ' + (y + h) + ' Q' + (x + w * 0.5) + ' ' + (y + h * 0.45) + ' ' + (x + w * 0.78) + ' ' + (y + h) + 'Z" fill="#4f4b44"/>';
            }
            g += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="url(#mcDots)" opacity=".55"/></g>';
            return g;
        }
        function clip(x, y, w, h, rot, paper, inner) {
            return '<g transform="translate(' + x + ' ' + y + ') rotate(' + rot + ')" filter="url(#mcShadow)">' +
                   '<rect width="' + w + '" height="' + h + '" fill="' + paper + '"/>' + inner + '</g>';
        }
        function head(t, x, y, fs, w, italic) {
            return '<text x="' + x + '" y="' + y + '" font-size="' + fs + '" font-weight="bold"' + (italic ? ' font-style="italic"' : "") +
                   ' fill="#1f1d19" font-family="Georgia, \'Times New Roman\', serif"' +
                   (w ? ' textLength="' + w + '" lengthAdjust="spacingAndGlyphs"' : "") + '>' + esc(t) + '</text>';
        }
        function masthead(t, x, y, w) {
            return '<text x="' + x + '" y="' + y + '" font-size="11" fill="#141210" font-family="\'Old English Text MT\', \'UnifrakturMaguntia\', Georgia, serif"' +
                   ' textLength="' + w + '" lengthAdjust="spacingAndGlyphs">' + esc(t) + '</text>' +
                   '<line x1="' + x + '" y1="' + (y + 3) + '" x2="' + (x + w) + '" y2="' + (y + 3) + '" stroke="#222" stroke-width=".6"/>' +
                   '<line x1="' + x + '" y1="' + (y + 4.4) + '" x2="' + (x + w) + '" y2="' + (y + 4.4) + '" stroke="#222" stroke-width=".3"/>';
        }
        function tape(x, y, w, rot) {
            return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="9" fill="#efe6c8" opacity=".75" transform="rotate(' + rot + ' ' + (x + w / 2) + ' ' + (y + 4.5) + ')"/>';
        }

        var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" preserveAspectRatio="xMidYMid slice">' +
            '<defs><pattern id="mcDots" width="2.2" height="2.2" patternUnits="userSpaceOnUse"><circle cx="1.1" cy="1.1" r=".55" fill="#2a2824"/></pattern>' +
            '<filter id="mcShadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="1.2" dy="1.6" stdDeviation="1.2" flood-opacity=".45"/></filter></defs>' +
            '<rect width="300" height="300" fill="#2b2a27"/>';

        s += clip(-12, -10, 150, 120, -4, "#ece4cf",
            masthead("The Elmbridge Chronicle", 8, 18, 132) +
            head("City Garden Opens Its Gates", 8, 34, 10, 130) +
            photo(8, 40, 60, 42, 0) + body(72, 40, 66, 70, 2, 3.4) + body(8, 86, 60, 24, 1, 3.4));
        s += clip(150, -14, 165, 112, 3, "#f1ede2",
            head("Le Matin Bleu", 10, 18, 13, 90, true) +
            '<line x1="10" y1="22" x2="155" y2="22" stroke="#333" stroke-width=".5"/>' +
            head("Une nouvelle saison commence au port", 10, 34, 8, 145) +
            body(10, 38, 95, 66, 3, 3.2) + photo(110, 40, 46, 40, 1) + body(110, 84, 46, 22, 1, 3.2));
        s += clip(-16, 112, 112, 118, 5, "#e6dcc2",
            head("Kunst im Park", 10, 18, 12, 80) +
            head("Nordstadt Zeitung · Sonntag", 10, 27, 4.2, 90, true) +
            photo(10, 32, 90, 38, 2) + body(10, 74, 92, 42, 2, 3.2));
        s += clip(205, 96, 110, 140, -6, "#efe9da",
            head("RAIN EXPECTED", 10, 18, 11, 92) + head("THROUGH THE WEEKEND", 10, 28, 6.5, 92) +
            body(10, 32, 92, 104, 2, 3.2));
        s += clip(-10, 222, 150, 96, -3, "#f3efe4",
            head("La Gazzetta del Porto", 8, 15, 10, 120, true) +
            head("Il mercato del sabato torna in piazza", 8, 26, 7, 136) +
            body(8, 30, 90, 60, 3, 3.2) + photo(102, 30, 42, 34, 0));
        s += clip(135, 218, 175, 100, 4, "#e9e1cb",
            head("Notes from the Old Harbour", 10, 17, 9.5, 155) +
            body(10, 22, 155, 72, 4, 3.2));
        s += clip(96, 160, 90, 70, -9, "#f4f0e6",
            head("WEATHER", 8, 14, 7, 40) + body(8, 18, 74, 46, 2, 3));
        s += tape(30, -4, 40, -8) + tape(210, -6, 44, 10) + tape(-6, 120, 36, 70) + tape(250, 100, 40, -20) +
             tape(30, 228, 44, 6) + tape(190, 222, 40, -12) + tape(120, 160, 30, 30);
        s += '<rect width="300" height="300" fill="#6b4a1f" opacity=".12"/></svg>';   // 살짝 바랜 색
        return "url(\"data:image/svg+xml;charset=utf-8," + encodeURIComponent(s) + "\")";
    }

    // 커버 (노트 표지)
    var cover = mk("div", "memo-cover");
    cover.setAttribute("aria-hidden", "true");
    var face = mk("div", "mc-face");
    face.style.backgroundImage = collageSVG();
    var plate = mk("div", "mc-plate");          // 글씨 영역 (신문 스크랩 위의 남색 이름표)
    var emblem = mk("div", "mc-emblem"); emblem.innerHTML = LOCK_SVG;
    var title = mk("div", "mc-title", "커버 씌워짐");
    var sub = mk("div", "mc-sub", "비밀번호 3자리로 열 수 있어요");
    var pinBox = mk("div", "mc-pin");
    pinBox.hidden = true;
    /* 비밀번호 칸: type="password"를 쓰면 크롬이 "비밀번호 저장/업데이트" 창을 띄워요.
       그래서 일반 글자 칸으로 만들고, 글자만 점(•)으로 가려 보여줘요. */
    var MASK_OK = !!(window.CSS && CSS.supports && (CSS.supports("-webkit-text-security", "disc") || CSS.supports("text-security", "disc")));
    function pinField(input) {
        input.type = MASK_OK ? "text" : "password";
        input.name = "mc-code-" + Math.random().toString(36).slice(2, 8);
        input.setAttribute("autocomplete", "off");
        input.setAttribute("autocorrect", "off");
        input.setAttribute("autocapitalize", "off");
        input.setAttribute("spellcheck", "false");
        input.setAttribute("data-lpignore", "true");      // 비밀번호 관리 프로그램이 무시하게
        input.setAttribute("data-1p-ignore", "");
        input.setAttribute("data-form-type", "other");
    }
    var pinInput = mk("input", "mc-pin-input");
    pinField(pinInput);
    pinInput.inputMode = "numeric";
    pinInput.maxLength = 3;
    pinInput.setAttribute("aria-label", "비밀번호 3자리");
    pinInput.placeholder = "• • •";
    var pinMsg = mk("div", "mc-pin-msg", "");
    var pinRow = mk("div", "mc-pin-row");
    var pinCancel = mk("button", "mc-link", "닫기"); pinCancel.type = "button";
    var pinForgot = mk("button", "mc-link", "잊었어요"); pinForgot.type = "button";
    pinRow.appendChild(pinCancel); pinRow.appendChild(pinForgot);
    pinBox.appendChild(pinInput); pinBox.appendChild(pinMsg); pinBox.appendChild(pinRow);
    plate.appendChild(mk("div", "mc-stitch"));
    plate.appendChild(emblem); plate.appendChild(title); plate.appendChild(sub); plate.appendChild(pinBox);
    face.appendChild(plate);
    cover.appendChild(face);
    pad.appendChild(cover);

    // 작은 대화창 (비밀번호 정하기 / 바꾸기 / 초기화 확인)
    var dlg = mk("div", "mc-dlg");
    dlg.hidden = true;
    dlg.setAttribute("role", "dialog");
    var dlgCard = mk("div", "mc-dlg-card");
    var dlgTitle = mk("div", "mc-dlg-title");
    var dlgText = mk("div", "mc-dlg-text");
    var dlgInput = mk("input", "mc-pin-input");
    pinField(dlgInput);
    dlgInput.inputMode = "numeric"; dlgInput.maxLength = 3; dlgInput.placeholder = "• • •";
    dlgInput.setAttribute("aria-label", "비밀번호 3자리");
    var dlgMsg = mk("div", "mc-pin-msg", "");
    var dlgRow = mk("div", "mc-dlg-row");
    var dlgOk = mk("button", "mc-btn mc-btn-main"); dlgOk.type = "button";
    var dlgNo = mk("button", "mc-btn", "취소"); dlgNo.type = "button";
    dlgRow.appendChild(dlgNo); dlgRow.appendChild(dlgOk);
    [dlgTitle, dlgText, dlgInput, dlgMsg, dlgRow].forEach(function (n) { dlgCard.appendChild(n); });
    dlg.appendChild(dlgCard);
    pad.appendChild(dlg);

    /* ---------- 커버 위치: 탭 줄부터 맨 아래까지, 스프링 오른쪽 ---------- */
    function placeCover() {
        cover.style.top = Math.max(0, tabs.offsetTop - 2) + "px";
    }
    placeCover();
    if (window.ResizeObserver) new ResizeObserver(placeCover).observe(pad);
    else window.addEventListener("resize", placeCover);

    /* ---------- 덮인 동안 안쪽 내용은 누르거나 탭 키로 갈 수 없게 ---------- */
    function setInert(on) {
        Array.prototype.forEach.call(pad.children, function (ch) {
            if (ch === btn || ch === cover || ch === dlg || ch.tagName === "H2" || ch.classList.contains("memo-coil")) return;
            if (on) { ch.setAttribute("inert", ""); ch.setAttribute("aria-hidden", "true"); }
            else { ch.removeAttribute("inert"); ch.removeAttribute("aria-hidden"); }
        });
    }

    function setBtn(covered) {
        btn.innerHTML = (covered ? OPEN_SVG : LOCK_SVG) + "<span>" + (covered ? "커버 열기" : "커버 덮기") + "</span>";
        btn.setAttribute("aria-label", covered ? "커버 열기" : "커버 덮기");
        btn.classList.toggle("is-covered", covered);
        keyBtn.hidden = covered || !st.hash;
    }

    var busy = false;
    function closeCover() {
        busy = true;
        st.covered = true; save();
        hidePin();
        setInert(true);
        if (document.activeElement && pad.contains(document.activeElement)) document.activeElement.blur();
        cover.classList.add("on");
        pad.classList.add("mc-flipping");
        setTimeout(function () {                  // 다 덮이면 글씨가 [커버 열기]로 바뀌어요
            pad.classList.remove("mc-flipping");
            setBtn(true);
            busy = false;
        }, ANIM_MS);
    }
    function openCover() {
        busy = true;
        st.covered = false; st.fails = 0; st.lockUntil = 0; save();
        title.textContent = "커버 열림";
        pinBox.hidden = true;
        sub.hidden = false;
        sub.textContent = "";
        pad.classList.add("mc-flipping");
        setTimeout(function () {
            cover.classList.remove("on");
            setTimeout(function () {
                pad.classList.remove("mc-flipping");
                setInert(false);
                title.textContent = "커버 씌워짐";
                sub.textContent = "비밀번호 3자리로 열 수 있어요";
                setBtn(false);
                busy = false;
            }, ANIM_MS);
        }, 250);
    }

    /* ---------- 커버 위 비밀번호 입력 ---------- */
    var lockTimer = null;
    function showPin() {
        pinBox.classList.remove("mc-shake");
        sub.hidden = true;
        pinBox.hidden = false;
        pinInput.value = "";
        pinMsg.textContent = "";
        pinMsg.className = "mc-pin-msg";
        updateLock();
        setTimeout(function () { try { pinInput.focus(); } catch (e) {} }, 30);
    }
    function hidePin() {
        pinBox.classList.remove("mc-shake");
        pinBox.hidden = true;
        sub.hidden = false;
        clearInterval(lockTimer);
    }
    function updateLock() {
        clearInterval(lockTimer);
        function tick() {
            var left = Math.ceil((st.lockUntil - Date.now()) / 1000);
            if (left > 0) {
                pinInput.disabled = true;
                pinMsg.className = "mc-pin-msg bad";
                pinMsg.textContent = left + "초 뒤에 다시 입력할 수 있어요";
            } else {
                clearInterval(lockTimer);
                if (pinInput.disabled) {
                    pinInput.disabled = false;
                    pinMsg.textContent = "";
                    try { pinInput.focus(); } catch (e) {}
                }
            }
        }
        tick();
        if (st.lockUntil > Date.now()) lockTimer = setInterval(tick, 500);
    }
    // 틀렸을 때만 흔들어요. 다 흔든 뒤에는 표시를 지워서, 다음에 창이 다시 뜰 때 저절로 흔들리지 않게 해요.
    function shake(el) {
        el.classList.remove("mc-shake");
        void el.offsetWidth;
        el.classList.add("mc-shake");
    }
    [pinBox, dlgCard].forEach(function (el) {
        el.addEventListener("animationend", function () { el.classList.remove("mc-shake"); });
    });

    pinInput.addEventListener("input", function () {
        pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 3);
        if (pinInput.value.length < 3) return;
        var pin = pinInput.value;
        hashPin(pin, st.salt).then(function (h) {
            if (h === st.hash) {
                pinMsg.textContent = "";
                openCover();
            } else {
                st.fails++;
                if (st.fails >= MAX_FAIL) { st.fails = 0; st.lockUntil = Date.now() + LOCK_MS; }
                save();
                pinInput.value = "";
                shake(pinBox);
                if (st.lockUntil > Date.now()) updateLock();
                else {
                    pinMsg.className = "mc-pin-msg bad";
                    pinMsg.textContent = "비밀번호가 달라요 (" + st.fails + "/" + MAX_FAIL + ")";
                }
            }
        });
    });
    pinInput.addEventListener("keydown", function (e) { if (e.key === "Escape") hidePin(); });
    pinCancel.addEventListener("click", hidePin);
    pinForgot.addEventListener("click", function () { openDialog("forgot"); });

    /* ---------- 대화창 ---------- */
    var mode = "", step = 0, firstPin = "";
    function openDialog(m) {
        mode = m; step = 0; firstPin = "";
        dlgCard.classList.remove("mc-shake");
        dlg.hidden = false;
        dlgMsg.textContent = ""; dlgMsg.className = "mc-pin-msg";
        dlgInput.value = "";
        renderDialog();
    }
    function closeDialog() { dlg.hidden = true; mode = ""; }
    function renderDialog() {
        dlgInput.hidden = mode === "forgot";
        dlgOk.hidden = mode !== "forgot";
        if (mode === "forgot") {
            dlgTitle.textContent = "비밀번호 초기화";
            dlgText.textContent = "초기화하면 할 일과 메모가 모두 지워져요. (다른 사람이 열어 보지 못하게 하려는 거예요)";
            dlgOk.textContent = "지우고 초기화";
            dlgOk.classList.add("danger");
            return;
        }
        dlgOk.classList.remove("danger");
        if (mode === "change" && step === 0) {
            dlgTitle.textContent = "비밀번호 바꾸기";
            dlgText.textContent = "지금 비밀번호 3자리를 입력해 주세요";
        } else {
            dlgTitle.textContent = mode === "change" ? "새 비밀번호" : "커버 비밀번호 정하기";
            dlgText.textContent = firstPin ? "확인을 위해 한 번 더 입력해 주세요" : "커버를 열 때 쓸 숫자 3자리를 정해 주세요";
        }
        setTimeout(function () { try { dlgInput.focus(); } catch (e) {} }, 30);
    }
    dlgInput.addEventListener("input", function () {
        dlgInput.value = dlgInput.value.replace(/\D/g, "").slice(0, 3);
        if (dlgInput.value.length < 3) return;
        var pin = dlgInput.value;
        dlgInput.value = "";
        dlgMsg.textContent = "";
        dlgMsg.className = "mc-pin-msg";

        if (mode === "change" && step === 0) {
            hashPin(pin, st.salt).then(function (h) {
                if (h === st.hash) { step = 1; renderDialog(); }
                else { dlgMsg.className = "mc-pin-msg bad"; dlgMsg.textContent = "비밀번호가 달라요"; shake(dlgCard); }
            });
            return;
        }
        if (!firstPin) { firstPin = pin; renderDialog(); return; }
        if (pin !== firstPin) {
            firstPin = "";
            dlgMsg.className = "mc-pin-msg bad";
            dlgMsg.textContent = "두 번 입력한 숫자가 달라요. 처음부터 다시 입력해 주세요";
            shake(dlgCard);
            renderDialog();
            return;
        }
        var salt = newSalt();
        hashPin(pin, salt).then(function (h) {
            st.salt = salt; st.hash = h; st.fails = 0; st.lockUntil = 0; save();
            var wasSetup = mode === "setup";
            closeDialog();
            setBtn(false);
            if (wasSetup) closeCover();
            else flash("비밀번호를 바꿨어요");
        });
    });
    dlgInput.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDialog(); });
    dlgNo.addEventListener("click", closeDialog);
    dlgOk.addEventListener("click", function () {
        if (mode !== "forgot") return;
        try { localStorage.removeItem(MEMO_KEY); localStorage.removeItem(KEY); } catch (e) {}
        location.reload();
    });

    function flash(msg) {
        var t = document.getElementById("memo-toast");
        if (!t) return;
        t.textContent = msg;
        t.classList.add("show");
        setTimeout(function () { t.classList.remove("show"); }, 2200);
    }

    /* ---------- 버튼 ---------- */
    btn.addEventListener("click", function () {
        if (busy) return;
        if (st.covered) {
            if (pinBox.hidden) showPin(); else hidePin();
        } else if (!st.hash) {
            openDialog("setup");
        } else {
            closeCover();
        }
    });
    keyBtn.addEventListener("click", function () { if (!st.covered && st.hash) openDialog("change"); });

    // 페이지를 떠날 때 입력칸을 비워서, 브라우저가 "입력한 비밀번호"로 여기지 않게 해요.
    window.addEventListener("pagehide", function () { pinInput.value = ""; dlgInput.value = ""; });

    /* ---------- 시작: 덮어 둔 상태였으면 바로 덮인 채로 (움직임 없이) ---------- */
    if (st.covered) {
        cover.classList.add("on", "mc-instant");
        setInert(true);
        requestAnimationFrame(function () { requestAnimationFrame(function () { cover.classList.remove("mc-instant"); }); });
    }
    setBtn(st.covered);
})();
