/* 한국어 / English 전환 (2026-11-14)
   - 모든 페이지 <head> 맨 위에서 다른 js보다 먼저 읽어요.
   - 페이지 오른쪽 위에 태극기 "한국어" · 성조기 "English" 버튼을 붙여요.
     한국어 페이지 이름.html ↔ 영문 페이지 이름-en.html  (예: index.html ↔ index-en.html)
   - 다른 js에서는 T("한국어 글씨", "English text") 로 쓰면
     영문 페이지(<html lang="en">)에서는 영어, 한국어 페이지에서는 한국어가 나와요.
   - 영문 페이지가 아직 없는 곳(블로그 글 페이지 등)에는 버튼을 붙이지 않아요. */
(function () {
    var EN = (document.documentElement.getAttribute("lang") || "").toLowerCase().indexOf("en") === 0;
    window.SITE_EN = EN;
    window.T = function (ko, en) { return EN ? en : ko; };

    /* 영문 페이지가 있는 한국어 페이지 이름 (여기 없는 페이지에는 전환 버튼을 안 붙여요) */
    var PAGES = ["index", "blog", "about", "privacy", "contact", "omok", "game2048"];

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
        /* 홈: 배너 위 오른쪽 끝 (배너 위 여백 안) */
        '.lang-switch.ls-float{position:absolute;top:5px;right:28px}' +
        /* 블로그·안내·게임 페이지: 위 막대 오른쪽 */
        '.lang-switch.ls-inbar{margin-left:auto;margin-right:12px}' +
        '@media (max-width:768px){.lang-switch.ls-float{top:6px;right:10px}' +
        '.lang-switch{font-size:11px}.lang-switch a{padding:3px 7px 3px 5px;gap:4px}.lang-flag{width:18px;height:12px}' +
        '.lang-switch.ls-inbar{margin-right:8px}}' +
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
            '<a href="' + enUrl + '" lang="en" hreflang="en"' + (EN ? ' class="on" aria-current="true"' : "") + '>' + FLAG_US + 'English</a>';

        /* 위 막대가 있는 페이지는 막대 안 오른쪽 끝 글자(홈으로·브랜드) 앞에 */
        var bar = document.querySelector(".bp-top-in, .om-top-in, .g-top-in");
        if (bar) {
            var ref = bar.querySelector(".bp-home, .om-brand, .g-brand");
            box.classList.add("ls-inbar");
            bar.insertBefore(box, ref || null);
        } else {
            box.classList.add("ls-float");
            document.body.appendChild(box);
        }
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
    else build();
})();
