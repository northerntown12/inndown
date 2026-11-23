/* 한국어 / English 전환 (2026-11-14)
   - 모든 페이지 <head> 맨 위에서 다른 js보다 먼저 읽어요.
   - 오른쪽 위에 태극기 "한국어" · 영국 국기+성조기 "English" 버튼을 붙여요. (홈은 배너 오른쪽 끝 바로 위)
     한국어 페이지 이름.html ↔ 영문 페이지 이름-en.html  (예: index.html ↔ index-en.html)
   - 다른 js에서는 T("한국어 글씨", "English text") 로 쓰면
     영문 페이지(<html lang="en">)에서는 영어, 한국어 페이지에서는 한국어가 나와요.
   - 영문 페이지가 아직 없는 곳(블로그 글 페이지 등)에는 버튼을 붙이지 않아요. */
(function () {
    var EN = (document.documentElement.getAttribute("lang") || "").toLowerCase().indexOf("en") === 0;
    window.SITE_EN = EN;
    window.T = function (ko, en) { return EN ? en : ko; };

    /* 영문 페이지가 있는 한국어 페이지 이름 (여기 없는 페이지에는 전환 버튼을 안 붙여요) */
    var PAGES = ["index", "blog", "about", "privacy", "contact", "omok", "game2048", "units", "age", "word", "mines", "tools", "severance", "charcount", "loan", "janggi"];

    var path = location.pathname;
    var file = path.substring(path.lastIndexOf("/") + 1) || "index.html";
    var dir = path.substring(0, path.lastIndexOf("/") + 1);
    var base = file.replace(/\.html?$/i, "").replace(/-en$/i, "");
    if (PAGES.indexOf(base) < 0) return;

    var koUrl = dir + base + ".html" + location.search;
    var enUrl = dir + base + "-en.html" + location.search;

    /* 깃발 그림 (직접 그린 SVG) */
    var FLAG_KR =
        '<svg class="lang-flag" viewBox="0 0 36 24" aria-hidden="true">' +
        '<rect width="36" height="24" fill="#fff"/>' +
        '<g transform="translate(18 12) rotate(33.69)">' +
        '<circle r="6" fill="#0047a0"/>' +
        '<path d="M-6 0A6 6 0 0 1 6 0A3 3 0 0 0 0 0A3 3 0 0 1 -6 0Z" fill="#cd2e3a"/>' +
        '</g>' +
        /* 건(☰) 왼쪽 위 */
        '<g transform="translate(18 12) rotate(-56.31) translate(0 -9.6)" fill="#000">' +
        '<rect x="-3" y="-2.1" width="6" height="0.95"/><rect x="-3" y="-0.48" width="6" height="0.95"/><rect x="-3" y="1.15" width="6" height="0.95"/></g>' +
        /* 곤(☷) 오른쪽 아래 */
        '<g transform="translate(18 12) rotate(123.69) translate(0 -9.6)" fill="#000">' +
        '<rect x="-3" y="-2.1" width="2.6" height="0.95"/><rect x="0.4" y="-2.1" width="2.6" height="0.95"/>' +
        '<rect x="-3" y="-0.48" width="2.6" height="0.95"/><rect x="0.4" y="-0.48" width="2.6" height="0.95"/>' +
        '<rect x="-3" y="1.15" width="2.6" height="0.95"/><rect x="0.4" y="1.15" width="2.6" height="0.95"/></g>' +
        /* 감(☵) 오른쪽 위 */
        '<g transform="translate(18 12) rotate(56.31) translate(0 -9.6)" fill="#000">' +
        '<rect x="-3" y="-2.1" width="2.6" height="0.95"/><rect x="0.4" y="-2.1" width="2.6" height="0.95"/>' +
        '<rect x="-3" y="-0.48" width="6" height="0.95"/>' +
        '<rect x="-3" y="1.15" width="2.6" height="0.95"/><rect x="0.4" y="1.15" width="2.6" height="0.95"/></g>' +
        /* 리(☲) 왼쪽 아래 */
        '<g transform="translate(18 12) rotate(-123.69) translate(0 -9.6)" fill="#000">' +
        '<rect x="-3" y="-2.1" width="6" height="0.95"/>' +
        '<rect x="-3" y="-0.48" width="2.6" height="0.95"/><rect x="0.4" y="-0.48" width="2.6" height="0.95"/>' +
        '<rect x="-3" y="1.15" width="6" height="0.95"/></g>' +
        '<rect x=".25" y=".25" width="35.5" height="23.5" fill="none" stroke="rgba(0,0,0,.18)" stroke-width=".5"/>' +
        '</svg>';

    var stripes = "";
    for (var i = 0; i < 13; i += 2) stripes += '<rect y="' + (i * 24 / 13).toFixed(2) + '" width="36" height="' + (24 / 13).toFixed(2) + '" fill="#b22234"/>';
    var stars = "";
    for (var r = 0; r < 5; r++) for (var c = 0; c < 6; c++) {
        if (r % 2 === 1 && c === 5) continue;
        stars += '<circle cx="' + (1.4 + c * 2.45 + (r % 2) * 1.22).toFixed(2) + '" cy="' + (1.3 + r * 2.5).toFixed(2) + '" r=".55" fill="#fff"/>';
    }
    /* 영국 국기 (유니언 잭) */
    var FLAG_UK =
        '<svg class="lang-flag" viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
        '<clipPath id="lsUkT"><path d="M30 20h30v20zv20H0zH0V0zV0h30z"/></clipPath>' +
        '<rect width="60" height="40" fill="#012169"/>' +
        '<path d="M-3 -2L63 42M63 -2L-3 42" stroke="#fff" stroke-width="8"/>' +
        '<path d="M-3 -2L63 42M63 -2L-3 42" stroke="#c8102e" stroke-width="4" clip-path="url(#lsUkT)"/>' +
        '<path d="M30 0v40M0 20h60" stroke="#fff" stroke-width="12"/>' +
        '<path d="M30 0v40M0 20h60" stroke="#c8102e" stroke-width="7"/>' +
        '<rect x=".4" y=".4" width="59.2" height="39.2" fill="none" stroke="rgba(0,0,0,.18)" stroke-width=".8"/>' +
        '</svg>';

    var FLAG_US =
        '<svg class="lang-flag" viewBox="0 0 36 24" aria-hidden="true">' +
        '<rect width="36" height="24" fill="#fff"/>' + stripes +
        '<rect width="15.6" height="12.92" fill="#3c3b6e"/>' + stars +
        '<rect x=".25" y=".25" width="35.5" height="23.5" fill="none" stroke="rgba(0,0,0,.18)" stroke-width=".5"/>' +
        '</svg>';

    var CSS =
        '.lang-switch{display:inline-flex;align-items:center;gap:2px;padding:2px;border-radius:999px;' +
        'background:rgba(255,255,255,.92);border:1px solid rgba(54,52,122,.22);box-shadow:0 2px 8px rgba(30,30,70,.12);' +
        'font:600 12px/1 "Segoe UI","Noto Sans KR",sans-serif;z-index:50;white-space:nowrap}' +
        '.lang-switch a{display:inline-flex;align-items:center;gap:5px;padding:4px 9px 4px 6px;border-radius:999px;' +
        'color:#36347a;text-decoration:none;transition:background .15s}' +
        '.lang-switch a:hover{background:#efeeff}' +
        '.lang-switch a.on{background:#DAD9FF;color:#24225e;pointer-events:none}' +
        '.lang-flag{width:20px;height:13.3px;border-radius:2px;display:block;flex:none}' +
        '.lang-flags{display:inline-flex;gap:3px}' +
        /* 홈: 배너 바로 위, 배너 오른쪽 끝에 맞춰서 (PC·폰 같은 모양) */
        '.main-banner .lang-switch.ls-banner{position:absolute;right:0;bottom:calc(100% + 5px)}' +
        /* 홈: 배너 위 오른쪽 끝 (배너 위 여백 안) */
        '.lang-switch.ls-float{position:absolute;top:5px;right:28px}' +
        /* 블로그·안내·게임 페이지: 위 막대 오른쪽 */
        '.lang-switch.ls-inbar{margin-left:auto;margin-right:12px}' +
        '@media (max-width:768px){.lang-switch.ls-float{top:6px;right:10px}' +
        '.lang-switch{font-size:11px}.lang-switch a{padding:3px 7px 3px 5px;gap:4px}.lang-flag{width:18px;height:12px}' +
        '.lang-switch.ls-inbar{margin-right:8px}.main-banner .lang-switch.ls-banner{bottom:calc(100% + 6px)}}' +
        '@media (max-width:480px){.om-brand,.g-brand{display:none}.lang-switch.ls-inbar{margin-right:0}}' +
        '@media print{.lang-switch{display:none}}';

    function build() {
        if (document.querySelector(".lang-switch")) return;
        var st = document.createElement("style");
        st.textContent = CSS;
        document.head.appendChild(st);

        var box = document.createElement("nav");
        box.className = "lang-switch";
        box.setAttribute("aria-label", EN ? "Language" : "언어 선택");
        box.innerHTML =
            '<a href="' + koUrl + '" lang="ko" hreflang="ko"' + (EN ? "" : ' class="on" aria-current="true"') + '>' + FLAG_KR + '한국어</a>' +
            '<a href="' + enUrl + '" lang="en" hreflang="en"' + (EN ? ' class="on" aria-current="true"' : "") + '><span class="lang-flags">' + FLAG_UK + FLAG_US + '</span>English</a>';

        /* 위 막대가 있는 페이지는 막대 안 오른쪽 끝 글자(홈으로·브랜드) 앞에 */
        var bar = document.querySelector(".bp-top-in, .om-top-in, .g-top-in");
        if (bar) {
            var ref = bar.querySelector(".bp-home, .om-brand, .g-brand");
            box.classList.add("ls-inbar");
            bar.insertBefore(box, ref || null);
        } else if (document.querySelector(".main-banner")) {
            box.classList.add("ls-banner");           // 홈: 배너 오른쪽 끝 위
            document.querySelector(".main-banner").appendChild(box);
        } else {
            box.classList.add("ls-float");
            document.body.appendChild(box);
        }
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
    else build();
})();

/* 도구 페이지(body.tool-page)의 "← 홈으로"·"다른 도구 보기 → 홈" (2026-11-15)
   홈에서 새 탭으로 열고 들어왔으면(이전 페이지가 우리 홈) 이 탭을 닫아서 원래 홈 탭으로 돌아가요.
   닫히지 않으면(검색으로 들어온 경우 등) 예전처럼 홈으로 이동해요. */
(function () {
    function fromOurHome() {
        try {
            var r = document.referrer ? new URL(document.referrer) : null;
            if (!r || r.origin !== location.origin) return false;
            var f = r.pathname.substring(r.pathname.lastIndexOf("/") + 1);
            return f === "" || /^index(-en)?\.html?$/i.test(f);
        } catch (e) { return false; }
    }
    document.addEventListener("click", function (e) {
        if (!document.body || !document.body.classList.contains("tool-page")) return;
        var a = e.target.closest && e.target.closest('a[href^="index"]:not([href*="#"])');   // 홈의 어느 칸(#…)으로 가는 링크는 그냥 이동
        if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
        /* 2026-11-23: 홈이 연 도구 창("toolsWin")이면, 안에서 계산기 등으로 옮겨 다녔어도 창을 닫아 원래 홈으로 */
        var popup = false;
        try { popup = window.name === "toolsWin" && !!window.opener && !window.opener.closed; } catch (err) {}
        if (popup) {
            e.preventDefault();
            try { window.opener.focus(); } catch (err) {}
            window.close();
            setTimeout(function () { location.href = a.href; }, 250);   // 안 닫혔으면 홈으로
            return;
        }
        if (!fromOurHome() || history.length > 1) return;   // 탭 안에서 다른 도구로 옮겨 다녔으면 그냥 이동
        e.preventDefault();
        window.close();
        setTimeout(function () { location.href = a.href; }, 250);   // 안 닫혔으면 홈으로
    });
})();

/* 도구 페이지(body.tool-page) 위 막대: "← 홈으로" 바로 왼쪽에 "이전 페이지" 화살표 (2026-11-18)
   도구 창 안에서 다른 도구로 옮겨 다닌 뒤 앞 페이지로 돌아갈 때 써요. 돌아갈 곳이 없으면 흐리게. */
(function () {
    function add() {
        if (!document.body || !document.body.classList.contains("tool-page")) return;
        if (document.body.classList.contains("theme-hub")) return;   // 도구 모음(메인) 페이지에는 안 붙여요
        var home = document.querySelector(".bp-top-in .bp-home");
        if (!home || document.querySelector(".bp-back")) return;
        var EN = window.SITE_EN;
        var b = document.createElement("button");
        b.type = "button";
        b.className = "bp-back";
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        var can = history.length > 1;
        var label = can ? (EN ? "Back to previous page" : "이전 페이지로") : (EN ? "No previous page" : "이전 페이지가 없어요");
        b.title = label;
        b.setAttribute("aria-label", label);
        if (!can) b.disabled = true;
        b.addEventListener("click", function () { history.back(); });
        home.parentNode.insertBefore(b, home);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add); else add();
})();
