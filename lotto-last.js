/* ===== 로또 칸 아래: 지난 당첨 결과 (번호 + 1등 당첨금) =====
   - 로또 당첨 정보 중계 서버(lotto-worker.js)에서 가장 최근 회차를 받아 와요.
   - 한 번 받은 결과는 이 브라우저에 저장해 두고, 못 받을 땐 저장된 결과를 보여줘요.
   - 열어 둔 채로 두면 1시간마다 다시 확인해요.
     토요일 20:30 ~ 일요일 01:00(한국시간)에는 결과가 막 바뀌는 때라 5분마다 확인해요. */
(function () {
    "use strict";

    var box = document.querySelector(".lotto-container");
    if (!box) return;

    var WORKER_URL = "https://twilight-rain-db97.sumerboy.workers.dev/";   // Cloudflare 로또 Worker 주소
    var OFFICIAL_URL = "https://www.dhlottery.co.kr/";
    var REFRESH_MS = 60 * 60 * 1000;        // 평소 1시간
    var REFRESH_FAST_MS = 5 * 60 * 1000;    // 토요일 추첨 직후 5분
    var TIMEOUT_MS = 10 * 1000;
    var STORAGE_KEY = "lottoLast.v1";

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    /* ---------- 화면 ---------- */
    var panel = el("div", "lotto-last");

    var head = el("div", "ll-head");
    var left = el("span", "");
    var title = el("a", "ll-title", "지난 당첨 결과");
    title.href = OFFICIAL_URL;
    title.target = "_blank";
    title.rel = "noopener noreferrer";
    title.title = "동행복권 공식 사이트";
    var round = el("span", "ll-round", "");
    left.appendChild(title);
    left.appendChild(round);
    var prizeEl = el("span", "ll-prize", "불러오는 중...");
    head.appendChild(left);
    head.appendChild(prizeEl);

    var ballsEl = el("div", "ll-balls");

    panel.appendChild(head);
    panel.appendChild(ballsEl);
    box.appendChild(panel);

    /* 소리 끄기·켜기 유리 버튼: 아래 당첨 결과 창의 맨 오른쪽 위, 창 바로 위에 떠 있어요.
       음소거면 스피커에 빗금이 그어져요. (소리 처리는 script.js의 window.lottoSound) */
    var SPK_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    var SPK_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".45"/><path d="M3.5 20.5L20.5 3.5" fill="none" stroke="#ff4d4d" stroke-width="2.6" stroke-linecap="round"/></svg>';
    var muteBtn = null;
    if (window.lottoSound) {
        muteBtn = el("button", "glass-btn ll-mute");
        muteBtn.type = "button";
        panel.appendChild(muteBtn);
        var showMute = function () {
            var m = window.lottoSound.isMuted();
            muteBtn.innerHTML = m ? SPK_OFF : SPK_ON;
            muteBtn.setAttribute("aria-pressed", m ? "true" : "false");
            muteBtn.setAttribute("aria-label", m ? "로또 소리 켜기" : "로또 소리 끄기");
            muteBtn.title = m ? "소리 켜기" : "소리 끄기";
        };
        muteBtn.addEventListener("click", function () {
            window.lottoSound.setMuted(!window.lottoSound.isMuted());
            showMute();
        });
        showMute();
    }

    // 버튼은 아래 당첨 결과 창의 맨 오른쪽 위, 창 바로 위에 놓아요. (2026-11-11 SPIN 버튼과 멀리)
    function placeMute() {
        if (!muteBtn) return;
        var pr = panel.getBoundingClientRect();
        if (!pr.width) return;
        var x = pr.width - 14;                     // 버튼 가운데 = 창 오른쪽 끝에서 14px 안쪽
        muteBtn.style.left = (x - panel.clientLeft) + "px";
    }

    /* ---------- 표시 ---------- */
    function ballClass(n) {
        if (n <= 7) return "num-1";
        if (n <= 14) return "num-8";
        if (n <= 21) return "num-15";
        if (n <= 28) return "num-22";
        if (n <= 35) return "num-29";
        if (n <= 42) return "num-36";
        return "num-43";
    }

    // 1197250000 -> "11억 9,725만원"
    function fmtWon(n) {
        var eok = Math.floor(n / 100000000);
        var man = Math.floor((n % 100000000) / 10000);
        var manText = man.toLocaleString("ko-KR") + "만원";
        if (eok > 0) return eok.toLocaleString("ko-KR") + "억 " + (man > 0 ? manText : "원");
        return manText;
    }

    function shortDate(s) {          // "2026-10-31" -> "10/31"
        var m = /^\d{4}-(\d{2})-(\d{2})$/.exec(s || "");
        return m ? parseInt(m[1], 10) + "/" + parseInt(m[2], 10) : "";
    }

    function ball(n, extra) {
        var b = el("span", "ball " + ballClass(n) + (extra ? " " + extra : ""), String(n));
        return b;
    }

    function paint(d) {
        round.textContent = d.round + "회";
        ballsEl.innerHTML = "";
        d.nums.forEach(function (n) { ballsEl.appendChild(ball(n)); });
        ballsEl.appendChild(el("span", "plus-sign", "+"));
        ballsEl.appendChild(ball(d.bonus, "bonus"));

        var w = d.first && d.first.winners;
        prizeEl.textContent = "1등 " + fmtWon(d.first.amount);
        prizeEl.appendChild(el("span", "ll-more", w ? " · " + w + "명" : ""));
        panel.title = d.round + "회 (" + shortDate(d.date) + " 추첨)" + (w ? " · 1등 " + w + "명" : "");
        layout();
    }

    /* 칸이 좁아서 SPIN 버튼과 겹치면 줄여요: 전체 → 한 줄(회차·당첨금·명수) → 공만 → 숨김 */
    function fit() {
        var btn = document.getElementById("lotto-btn");
        panel.classList.remove("ll-tight", "ll-min", "ll-off");
        if (!btn) return;
        // 로그인 화면이 떠 있는 동안처럼 칸이 안 보일 때는 재지 않아요 (재면 0이라 겹친다고 착각해서 숨겨 버려요)
        if (!panel.getClientRects().length || !btn.getClientRects().length) return;
        function overlaps() {
            return panel.getBoundingClientRect().top < btn.getBoundingClientRect().bottom + 2;
        }
        if (!overlaps()) return;
        panel.classList.add("ll-tight");
        var hd = panel.querySelector(".ll-head");
        if (!overlaps() && hd.scrollWidth <= hd.clientWidth + 1) return;
        panel.classList.remove("ll-tight");
        panel.classList.add("ll-min");
        if (!overlaps()) return;
        panel.classList.remove("ll-min");
        panel.classList.add("ll-off");
    }
    function layout() { fit(); placeMute(); }
    window.addEventListener("load", function () { setTimeout(layout, 100); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { setTimeout(layout, 50); });
    // 로그인해서 화면이 열리면(html의 locked가 빠지면) 다시 맞춰요.
    if (typeof MutationObserver === "function") {
        new MutationObserver(function () { setTimeout(layout, 50); })
            .observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    }
    var fitTimer = null;
    window.addEventListener("resize", function () {
        clearTimeout(fitTimer);
        fitTimer = setTimeout(layout, 150);
    });

    /* ---------- 저장값 ---------- */
    function readCache() {
        try {
            var c = JSON.parse(localStorage.getItem(STORAGE_KEY));
            return c && c.nums && c.nums.length === 6 && c.first ? c : null;
        } catch (e) { return null; }
    }
    function writeCache(d) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch (e) { /* 무시 */ }
    }

    /* ---------- 받아오기 ---------- */
    var busy = false;
    var shown = null;

    function refresh() {
        if (busy) return;
        busy = true;

        var ctrl = typeof AbortController === "function" ? new AbortController() : null;
        var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;

        fetch(WORKER_URL, ctrl ? { signal: ctrl.signal } : undefined)
            .then(function (res) {
                if (!res.ok) throw new Error("HTTP " + res.status);
                return res.json();
            })
            .then(function (j) {
                if (!j || !j.ok || !j.nums || j.nums.length !== 6) throw new Error("bad data");
                var d = { round: j.round, date: j.date, nums: j.nums, bonus: j.bonus, first: j.first };
                paint(d);
                writeCache(d);
                shown = d;
            })
            .catch(function () {
                if (!shown) {
                    var c = readCache();
                    if (c) {
                        paint(c);
                        shown = c;
                    } else {
                        prizeEl.textContent = "당첨 정보를 불러오지 못했어요";
                        placeMute();
                    }
                }
            })
            .then(function () {
                if (timer) clearTimeout(timer);
                busy = false;
            });
    }

    var cached = readCache();
    if (cached) {
        paint(cached);
        shown = cached;
    }
    refresh();

    function isDrawWindow() {
        var k = new Date(Date.now() + 9 * 3600 * 1000);      // 한국시간
        var day = k.getUTCDay(), min = k.getUTCHours() * 60 + k.getUTCMinutes();
        return (day === 6 && min >= 20 * 60 + 30) || (day === 0 && min < 60);
    }
    function schedule() {
        setTimeout(function () {
            if (!document.hidden) refresh();
            schedule();
        }, isDrawWindow() ? REFRESH_FAST_MS : REFRESH_MS);
    }
    schedule();
    // 다른 탭을 보다가 돌아오면, 추첨 시간대에는 바로 한 번 확인해요.
    document.addEventListener("visibilitychange", function () {
        if (!document.hidden && isDrawWindow()) refresh();
    });
})();
