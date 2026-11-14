window.T = window.T || function (ko) { return ko; };   /* lang.js가 없어도 한국어로 동작 */
/* ===== 전국 우편번호 검색 (카카오/다음 우편번호 서비스, 무료·키 불필요) =====
   - "우편번호 찾기" 버튼을 누르면 팝업이 떠요. 주소를 고르면 이 칸에 결과가 표시돼요.
   - 우편번호(5자리)·도로명주소·지번주소를 눌러서 복사할 수 있어요.
   - 마지막 검색 결과는 이 브라우저에 저장돼요. */
(function () {
    "use strict";

    var box = document.getElementById("postal-widget");
    if (!box) return;

    var SCRIPT_URL = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    var STORAGE_KEY = "postalLast.v1";

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    /* ---------- 화면 ---------- */
    box.appendChild(el("h3", "pst-title", T("우편번호 검색", "Postal Code Search")));

    var btn = el("button", "pst-btn", T("우편번호 찾기", "Find postal code"));
    btn.type = "button";
    box.appendChild(btn);

    var result = el("div", "pst-result");
    var zipEl  = el("div", "pst-zip");
    var digits = [];
    for (var di = 0; di < 5; di++) {
        var d = el("span", "pst-d", "");
        digits.push(d);
        zipEl.appendChild(d);
    }
    var roadEl = el("div", "pst-addr", "");
    var jibunEl = el("div", "pst-addr pst-jibun", "");
    var copyBtn = el("button", "pst-copy", T("주소 복사", "Copy address"));
    copyBtn.type = "button";
    zipEl.title = T("눌러서 우편번호 복사", "Click to copy the postal code");
    result.appendChild(zipEl);
    result.appendChild(roadEl);
    result.appendChild(jibunEl);
    var resetBtn = el("button", "pst-reset", T("새로고침", "Reset"));
    resetBtn.type = "button";
    resetBtn.title = T("표시된 주소 지우기", "Clear the address");
    var actions = el("div", "pst-actions");
    actions.appendChild(copyBtn);
    actions.appendChild(resetBtn);
    result.appendChild(actions);
    box.appendChild(result);

    var msg = el("div", "pst-msg", "");
    msg.setAttribute("role", "status");
    box.appendChild(msg);

    var msgTimer = null;
    function say(text, keep) {
        msg.textContent = text;
        clearTimeout(msgTimer);
        if (!keep) msgTimer = setTimeout(function () { msg.textContent = ""; }, 2500);
    }

    var current = null;   // { zip, road, jibun }

    function setDigits(zip) {
        for (var i = 0; i < 5; i++) digits[i].textContent = zip.charAt(i) || "";
    }

    function show(r) {
        current = r;
        if (!r) {
            setDigits("");
            roadEl.textContent = "";
            jibunEl.textContent = "";
            result.classList.remove("has");
            return;
        }
        setDigits(r.zip);
        roadEl.textContent = r.road || "";
        jibunEl.textContent = r.jibun ? T("(지번) ", "(Lot) ") + r.jibun : "";
        result.classList.add("has");
    }

    /* ---------- 저장 ---------- */
    try {
        var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved && saved.zip) show(saved);
    } catch (e) { /* 무시 */ }

    function save(r) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(r)); } catch (e) { /* 무시 */ }
    }

    /* ---------- 복사 ---------- */
    function copyText(text, okMsg) {
        function fallback() {
            var ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            var ok = false;
            try { ok = document.execCommand("copy"); } catch (e) { /* 무시 */ }
            ta.remove();
            say(ok ? okMsg : T("복사하지 못했어요", "Couldn't copy"));
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { say(okMsg); }, fallback);
        } else {
            fallback();
        }
    }

    resetBtn.addEventListener("click", function () {
        show(null);
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* 무시 */ }
        say("");
    });

    zipEl.addEventListener("click", function () {
        if (current) copyText(current.zip, T("우편번호를 복사했어요", "Postal code copied"));
    });
    copyBtn.addEventListener("click", function () {
        if (!current) return;
        copyText("(" + current.zip + ") " + (current.road || current.jibun), T("주소를 복사했어요", "Address copied"));
    });

    /* ---------- 검색 팝업 ---------- */
    var loading = false;

    function loadScript(cb) {
        if (window.daum && window.daum.Postcode) return cb(true);
        if (loading) return;
        loading = true;
        var s = document.createElement("script");
        s.src = SCRIPT_URL;
        s.onload = function () { loading = false; cb(true); };
        s.onerror = function () { loading = false; cb(false); };
        document.head.appendChild(s);
    }

    function openSearch() {
        new window.daum.Postcode({
            oncomplete: function (d) {
                var road = d.roadAddress || "";
                if (d.buildingName && d.apartment === "Y") road += " (" + d.buildingName + ")";
                var r = {
                    zip: d.zonecode,
                    road: road,
                    jibun: d.jibunAddress || d.autoJibunAddress || ""
                };
                show(r);
                save(r);
                say("");
            }
        }).open();
    }

    btn.addEventListener("click", function () {
        say(T("불러오는 중...", "Loading..."), true);
        loadScript(function (ok) {
            if (!ok) { say(T("검색 서비스를 불러오지 못했어요", "Couldn't load the search service")); return; }
            say("");
            openSearch();
        });
    });
})();
