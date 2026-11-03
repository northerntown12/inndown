
(function () {
    "use strict";

    var TEST_PASSWORD = "12";
    var FLAG_KEY = "loginOK";

    function isLoggedIn() {
        try { return sessionStorage.getItem(FLAG_KEY) === "1"; } catch (e) { return false; }
    }

    function unlock() {
        try { sessionStorage.setItem(FLAG_KEY, "1"); } catch (e) { /* 저장 못 해도 이번 접속은 통과 */ }
        document.documentElement.classList.remove("locked");
        var gate = document.getElementById("login-gate");
        if (gate) gate.remove();
    }

    // 나중에 외부 로그온 서버 연동 시 여기를 바꾸세요.
    function checkPassword(pw) {
        return pw === TEST_PASSWORD;
    }

    if (isLoggedIn()) {
        document.documentElement.classList.remove("locked");
        return;
    }

    document.documentElement.classList.add("locked");

    var gate = document.createElement("div");
    gate.id = "login-gate";
    gate.innerHTML =
        '<form class="login-box" autocomplete="off">' +
            '<h2 class="login-title">로그인 테스트</h2>' +
            '<input type="password" id="login-pw" placeholder="비밀번호" aria-label="비밀번호" autofocus>' +
            '<p class="login-hint">password: 12</p>' +
            '<button type="submit" class="login-btn">로그인</button>' +
            '<p class="login-error" id="login-error" role="alert"></p>' +
        '</form>';
    document.body.appendChild(gate);

    var form = gate.querySelector("form");
    var input = gate.querySelector("#login-pw");
    var errEl = gate.querySelector("#login-error");

    form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (checkPassword(input.value)) {
            unlock();
        } else {
            errEl.textContent = "비밀번호가 맞지 않아요.";
            input.value = "";
            input.focus();
        }
    });

    input.focus();
})();
