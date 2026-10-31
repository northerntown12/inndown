
(function () {
    "use strict";

    var img = document.querySelector(".tree-panel img");
    if (!img) return;

    /* 스타일 */
    var style = document.createElement("style");
    style.textContent = [
        ".tree-panel img { cursor: pointer; }",
        "body.lightbox-open { overflow: hidden; }",
        ".img-lightbox {",
        "    position: fixed; inset: 0; z-index: 1000;",
        "    display: flex; align-items: center; justify-content: center;",
        "    padding: 16px; background: rgba(0, 0, 0, 0.82);",
        "    cursor: zoom-out; animation: lightbox-in 0.18s ease;",
        "}",
        ".img-lightbox[hidden] { display: none; }",
        ".img-lightbox-img {",
        "    display: block; max-width: 92vw; max-height: 88vh;",
        "    object-fit: contain; border-radius: 6px;",
        "    box-shadow: 0 6px 30px rgba(0, 0, 0, 0.6);",
        "}",
        ".img-lightbox .img-lightbox-close {",
        "    position: absolute;",
        "    top: max(12px, env(safe-area-inset-top, 0px));",
        "    right: max(12px, env(safe-area-inset-right, 0px));",
        "    width: 40px; height: 40px; padding: 0;",
        "    border-radius: 50%; background: rgba(255, 255, 255, 0.22);",
        "    color: #fff; font-size: 1.2rem; line-height: 1; cursor: pointer;",
        "}",
        ".img-lightbox .img-lightbox-close:hover { background: rgba(255, 255, 255, 0.4); }",
        "@keyframes lightbox-in { from { opacity: 0; } to { opacity: 1; } }"
    ].join("\n");
    document.head.appendChild(style);

    /* 팝업 요소 */
    var overlay = document.createElement("div");
    overlay.className = "img-lightbox";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "이미지 크게 보기");

    var big = document.createElement("img");
    big.className = "img-lightbox-img";

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "img-lightbox-close";
    closeBtn.setAttribute("aria-label", "닫기");
    closeBtn.textContent = "✕";

    overlay.appendChild(big);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);

    function openLightbox() {
        big.src = img.currentSrc || img.src;
        big.alt = img.alt || "";
        overlay.hidden = false;
        document.body.classList.add("lightbox-open");
        closeBtn.focus();
    }

    function closeLightbox() {
        overlay.hidden = true;
        document.body.classList.remove("lightbox-open");
        big.removeAttribute("src");
        img.focus();
    }

    /* 키보드로도 열 수 있게 */
    img.tabIndex = 0;
    img.setAttribute("role", "button");

    img.addEventListener("click", openLightbox);
    img.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openLightbox();
        }
    });

    overlay.addEventListener("click", closeLightbox);

    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && !overlay.hidden) {
            closeLightbox();
        }
    });
})();
