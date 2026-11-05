
(function () {
    "use strict";

    var LOGIN_URL = "https://homelogin.sumerboy.workers.dev";
    var KEY = "loginAuth.v1";
    var TIMEOUT_MS = 10 * 1000;
    var html = document.documentElement;

    /* ---------- 저장 ---------- */
    function readAuth() {
        try {
            var a = JSON.parse(localStorage.getItem(KEY));
            return a && a.token && a.exp > Date.now() ? a : null;
        } catch (e) { return null; }
    }
    function saveAuth(a) {
        try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { /* 저장 못 해도 이번 접속은 통과 */ }
    }
    function clearAuth() {
        try { localStorage.removeItem(KEY); } catch (e) { /* 무시 */ }
    }

    /* ---------- 서버에 보내기 ---------- */
    function post(path, data) {
        var ctrl = typeof AbortController === "function" ? new AbortController() : null;
        var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;
        return fetch(LOGIN_URL.replace(/\/+$/, "") + path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
            signal: ctrl ? ctrl.signal : undefined
        }).then(function (res) {
            if (timer) clearTimeout(timer);
            return res.json().catch(function () { return {}; }).then(function (json) {
                return { status: res.status, json: json };
            });
        }, function (err) {
            if (timer) clearTimeout(timer);
            throw err;
        });
    }

    /* ---------- 로그아웃 단추 ---------- */
    function addLogout(name) {
        if (document.getElementById("logout-btn")) return;
        var b = document.createElement("button");
        b.id = "logout-btn";
        b.type = "button";
        b.textContent = "로그아웃";
        b.title = name ? name + " 님 · 눌러서 로그아웃" : "로그아웃";
        b.addEventListener("click", function () {
            clearAuth();
            location.reload();
        });
        document.body.appendChild(b);
    }

    function unlock(name) {
        html.classList.remove("locked");
        var gate = document.getElementById("login-gate");
        if (gate) gate.remove();
        addLogout(name);
    }

    /* ---------- 이미 입장권이 있을 때 ---------- */
    var auth = readAuth();
    if (auth) {
        unlock(auth.name);
        // 뒤에서 조용히 확인: 서버가 "무효"라고 하면 다시 로그인 화면으로 (인터넷이 안 될 땐 그냥 통과)
        if (LOGIN_URL.indexOf("YOUR-LOGIN") < 0) {
            post("/verify", { token: auth.token }).then(function (r) {
                if (r.status === 401) {
                    clearAuth();
                    location.reload();
                }
            }, function () { /* 연결 문제는 무시 */ });
        }
        return;
    }

    /* ---------- 로그인 창 ---------- */
    html.classList.add("locked");

    var gate = document.createElement("div");
    gate.id = "login-gate";
    gate.innerHTML =
        '<form class="login-box" autocomplete="on">' +
            '<h2 class="login-title">로그인</h2>' +
            '<input type="text" id="login-id" name="username" placeholder="아이디" aria-label="아이디" ' +
                'autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" autofocus>' +
            '<input type="password" id="login-pw" name="password" placeholder="비밀번호" aria-label="비밀번호" ' +
                'autocomplete="current-password">' +
            '<button type="submit" class="login-btn">로그인</button>' +
            '<p class="login-error" id="login-error" role="alert"></p>' +
        '</form>';
    document.body.appendChild(gate);

    var form = gate.querySelector("form");
    var idEl = gate.querySelector("#login-id");
    var pwEl = gate.querySelector("#login-pw");
    var btn = gate.querySelector(".login-btn");
    var errEl = gate.querySelector("#login-error");

    function fail(msg) {
        errEl.textContent = msg;
        btn.disabled = false;
        btn.textContent = "로그인";
    }

    form.addEventListener("submit", function (e) {
        e.preventDefault();
        errEl.textContent = "";

        if (LOGIN_URL.indexOf("YOUR-LOGIN") >= 0) {
            fail("로그인 서버 주소(login.js의 LOGIN_URL)를 설정해 주세요.");
            return;
        }
        if (!idEl.value.trim() || !pwEl.value) {
            fail("아이디와 비밀번호를 입력해 주세요.");
            return;
        }

        btn.disabled = true;
        btn.textContent = "확인 중...";

        post("/login", { id: idEl.value.trim(), pw: pwEl.value }).then(function (r) {
            if (r.status === 200 && r.json && r.json.ok && r.json.token) {
                saveAuth({ token: r.json.token, name: r.json.name, exp: r.json.exp });
                unlock(r.json.name);
            } else if (r.status === 429) {
                pwEl.value = "";
                fail("너무 여러 번 틀렸어요. 잠시 후(약 10분) 다시 시도해 주세요.");
            } else if (r.status === 401) {
                pwEl.value = "";
                pwEl.focus();
                fail("아이디 또는 비밀번호가 맞지 않아요.");
            } else {
                fail("로그인 서버에 문제가 있어요. 잠시 후 다시 시도해 주세요.");
            }
        }, function () {
            fail("로그인 서버에 연결하지 못했어요.");
        });
    });

    idEl.focus();
})();
