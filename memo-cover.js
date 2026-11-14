window.T = window.T || function (ko) { return ko; };   /* lang.js가 없어도 한국어로 동작 */

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
    keyBtn.title = T("커버 비밀번호 바꾸기", "Change cover password");
    keyBtn.setAttribute("aria-label", T("커버 비밀번호 바꾸기", "Change cover password"));
    keyBtn.innerHTML = KEY_SVG;
    tabs.appendChild(keyBtn);

    /* 표지 배경: 옛날 광고 스크랩 그림 (memo-cover.webp, 원본은 ads.webp) */
    var COVER_IMG = "memo-cover.webp?v=1";

    // 커버 (노트 표지)
    var cover = mk("div", "memo-cover");
    cover.setAttribute("aria-hidden", "true");
    var face = mk("div", "mc-face");
    face.style.backgroundImage = 'url("' + COVER_IMG + '")';
    var plate = mk("div", "mc-plate");          // 글씨 영역 (광고 스크랩 위의 남색 이름표)
    var emblem = mk("div", "mc-emblem"); emblem.innerHTML = LOCK_SVG;
    var title = mk("div", "mc-title", T("커버 씌워짐", "Cover on"));
    var sub = mk("div", "mc-sub", T("비밀번호 3자리로 열 수 있어요", "Open it with your 3-digit password"));
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
    pinInput.setAttribute("aria-label", T("비밀번호 3자리", "3-digit password"));
    pinInput.placeholder = "• • •";
    var pinMsg = mk("div", "mc-pin-msg", "");
    var pinRow = mk("div", "mc-pin-row");
    var pinCancel = mk("button", "mc-link", T("닫기", "Close")); pinCancel.type = "button";
    var pinForgot = mk("button", "mc-link", T("잊었어요", "Forgot it")); pinForgot.type = "button";
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
    dlgInput.setAttribute("aria-label", T("비밀번호 3자리", "3-digit password"));
    var dlgMsg = mk("div", "mc-pin-msg", "");
    var dlgRow = mk("div", "mc-dlg-row");
    var dlgOk = mk("button", "mc-btn mc-btn-main"); dlgOk.type = "button";
    var dlgNo = mk("button", "mc-btn", T("취소", "Cancel")); dlgNo.type = "button";
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
        btn.innerHTML = (covered ? OPEN_SVG : LOCK_SVG) + "<span>" + (covered ? T("커버 열기", "Open cover") : T("커버 덮기", "Close cover")) + "</span>";
        btn.setAttribute("aria-label", covered ? T("커버 열기", "Open cover") : T("커버 덮기", "Close cover"));
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
        title.textContent = T("커버 열림", "Cover open");
        pinBox.hidden = true;
        sub.hidden = false;
        sub.textContent = "";
        pad.classList.add("mc-flipping");
        setTimeout(function () {
            cover.classList.remove("on");
            setTimeout(function () {
                pad.classList.remove("mc-flipping");
                setInert(false);
                title.textContent = T("커버 씌워짐", "Cover on");
                sub.textContent = T("비밀번호 3자리로 열 수 있어요", "Open it with your 3-digit password");
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
                pinMsg.textContent = T(left + "초 뒤에 다시 입력할 수 있어요", "Try again in " + left + "s");
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
                    pinMsg.textContent = T("비밀번호가 달라요 (", "Wrong password (") + st.fails + "/" + MAX_FAIL + ")";
                }
            }
        });
    });
    pinInput.addEventListener("keydown", function (e) { if (e.key === "Escape") hidePin(); });
    pinCancel.addEventListener("click", hidePin);

    // 이름표의 자물쇠·"커버 씌워짐" 글씨를 눌러도 비밀번호 칸이 떠요
    [emblem, title, sub].forEach(function (el) {
        el.classList.add("mc-tap");
        el.addEventListener("click", function () {
            if (busy || !st.covered || !pinBox.hidden) return;
            showPin();
        });
    });
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
            dlgTitle.textContent = T("비밀번호 초기화", "Reset password");
            dlgText.textContent = T("초기화하면 할 일과 메모가 모두 지워져요. (다른 사람이 열어 보지 못하게 하려는 거예요)", "Resetting erases all your to-dos and notes (so no one else can open them).");
            dlgOk.textContent = T("지우고 초기화", "Erase and reset");
            dlgOk.classList.add("danger");
            return;
        }
        dlgOk.classList.remove("danger");
        if (mode === "change" && step === 0) {
            dlgTitle.textContent = T("비밀번호 바꾸기", "Change password");
            dlgText.textContent = T("지금 비밀번호 3자리를 입력해 주세요", "Enter your current 3-digit password");
        } else {
            dlgTitle.textContent = mode === "change" ? T("새 비밀번호", "New password") : T("커버 비밀번호 정하기", "Set a cover password");
            dlgText.textContent = firstPin ? T("확인을 위해 한 번 더 입력해 주세요", "Enter it once more to confirm") : T("커버를 열 때 쓸 숫자 3자리를 정해 주세요", "Choose 3 digits to open the cover");
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
                else { dlgMsg.className = "mc-pin-msg bad"; dlgMsg.textContent = T("비밀번호가 달라요", "Wrong password"); shake(dlgCard); }
            });
            return;
        }
        if (!firstPin) { firstPin = pin; renderDialog(); return; }
        if (pin !== firstPin) {
            firstPin = "";
            dlgMsg.className = "mc-pin-msg bad";
            dlgMsg.textContent = T("두 번 입력한 숫자가 달라요. 처음부터 다시 입력해 주세요", "The two entries don't match. Please start again");
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
            else flash(T("비밀번호를 바꿨어요", "Password changed"));
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
