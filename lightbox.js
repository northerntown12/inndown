d
(function () {
    "use strict";

    var img = document.querySelector(".tree-panel img");
    if (!img) return;

    /* 설정 */
    var WHEEL_DOWN_ZOOMS_IN = true;   // true: 휠 아래로 = 확대 / false: 휠 위로 = 확대 (일반적인 방식)
    var MIN_SCALE = 1;
    var MAX_SCALE = 6;
    var ZOOM_SPEED = 0.0015;          // 클수록 한 번에 많이 확대돼요

    /* 스타일 */
    var style = document.createElement("style");
    style.textContent = [
        ".tree-panel img { cursor: pointer; }",
        "body.lightbox-open { overflow: hidden; }",
        ".img-lightbox {",
        "    position: fixed; inset: 0; z-index: 1000;",
        "    display: flex; align-items: center; justify-content: center;",
        "    padding: 16px; background: rgba(0, 0, 0, 0.82);",
        "    cursor: pointer; animation: lightbox-in 0.18s ease;",
        "    overflow: hidden;",
        "}",
        ".img-lightbox[hidden] { display: none; }",
        ".img-lightbox-img {",
        "    display: block; max-width: 92vw; max-height: 88vh;",
        "    object-fit: contain; border-radius: 6px;",
        "    box-shadow: 0 6px 30px rgba(0, 0, 0, 0.6);",
        "    touch-action: none; user-select: none; -webkit-user-select: none;",
        "    -webkit-user-drag: none; will-change: transform;",
        "}",
        ".img-lightbox-img.zoomed { cursor: grab; }",
        ".img-lightbox-img.dragging { cursor: grabbing; }",
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
    big.draggable = false;

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "img-lightbox-close";
    closeBtn.setAttribute("aria-label", "닫기");
    closeBtn.textContent = "✕";

    overlay.appendChild(big);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);

    /* 확대/이동 상태 */
    var scale = 1;
    var tx = 0;
    var ty = 0;
    var dragging = false;
    var dragMoved = false;
    var dragStartX = 0;
    var dragStartY = 0;
    var startTx = 0;
    var startTy = 0;

    function applyTransform() {
        big.style.transform = "translate(" + tx + "px, " + ty + "px) scale(" + scale + ")";
        big.classList.toggle("zoomed", scale > 1);
    }

    function resetZoom() {
        scale = 1;
        tx = 0;
        ty = 0;
        applyTransform();
    }

    function openLightbox() {
        big.src = img.currentSrc || img.src;
        big.alt = img.alt || "";
        resetZoom();
        overlay.hidden = false;
        document.body.classList.add("lightbox-open");
        closeBtn.focus();
    }

    function closeLightbox() {
        overlay.hidden = true;
        document.body.classList.remove("lightbox-open");
        big.removeAttribute("src");
        resetZoom();
        img.focus();
    }

    /* 휠: 마우스가 가리키는 지점을 기준으로 확대/축소 */
    overlay.addEventListener("wheel", function (e) {
        e.preventDefault();

        var delta = WHEEL_DOWN_ZOOMS_IN ? e.deltaY : -e.deltaY;
        var next = scale * Math.exp(delta * ZOOM_SPEED);
        next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));

        if (next === scale) return;

        // 화면 가운데를 기준으로 한 마우스 위치
        var px = e.clientX - window.innerWidth / 2;
        var py = e.clientY - window.innerHeight / 2;
        var ratio = next / scale;

        tx = px - (px - tx) * ratio;
        ty = py - (py - ty) * ratio;
        scale = next;

        if (scale === 1) {
            tx = 0;
            ty = 0;
        }

        applyTransform();
    }, { passive: false });

    /* 확대한 상태에서 끌어서 이동 */
    big.addEventListener("pointerdown", function (e) {
        dragMoved = false;
        if (scale <= 1) return;

        dragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        startTx = tx;
        startTy = ty;
        big.classList.add("dragging");

        try { big.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    });

    big.addEventListener("pointermove", function (e) {
        if (!dragging) return;

        var dx = e.clientX - dragStartX;
        var dy = e.clientY - dragStartY;

        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved = true;

        tx = startTx + dx;
        ty = startTy + dy;
        applyTransform();
    });

    function endDrag() {
        dragging = false;
        big.classList.remove("dragging");
    }

    big.addEventListener("pointerup", endDrag);
    big.addEventListener("pointercancel", endDrag);

    /* 누르기: 끌고 난 직후에는 무시 / 확대 상태에서 그림을 누르면 원래 크기로 / 그 외에는 닫기 */
    overlay.addEventListener("click", function (e) {
        if (dragMoved) {
            dragMoved = false;
            return;
        }

        if (e.target === big && scale > 1) {
            resetZoom();
            return;
        }

        closeLightbox();
    });

    /* 열기: 클릭 / 키보드 */
    img.tabIndex = 0;
    img.setAttribute("role", "button");

    img.addEventListener("click", openLightbox);
    img.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openLightbox();
        }
    });

    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && !overlay.hidden) {
            closeLightbox();
        }
    });
})();
