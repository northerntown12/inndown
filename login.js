/* ===== 로그인 화면 (테스트용) =====
   - 주소로 들어오면 빈 화면에 로그인 창만 보여요.
   - 아이디 없이 비밀번호만 입력해요. (테스트용 비밀번호: 12)
   - 로그인하면 이 탭에서는 다시 묻지 않아요. 탭/브라우저를 닫으면 다시 로그인해야 해요.

   ※ 나중에 외부 로그온 서버로 바꿀 때는 아래 checkPassword() 만 교체하면 돼요.
     (서버에 비밀번호를 보내 성공이면 true 를 돌려주도록)
   ※ 지금 방식은 테스트용이에요. 비밀번호가 이 파일에 그대로 적혀 있어서
     누구나 소스를 보면 알 수 있어요. 실제 보안은 서버에서 확인해야 해요. */
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
            '<h2 class="login-title">로그인 테스트중</h2>' +
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
