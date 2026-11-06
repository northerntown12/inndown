/* ===== 로또 칸 아래: 지난 당첨 결과 (번호 + 1등 당첨금) =====
   - 로또 당첨 정보 중계 서버(lotto-worker.js)에서 가장 최근 회차를 받아 와요.
   - 한 번 받은 결과는 이 브라우저에 저장해 두고, 못 받을 땐 저장된 결과를 보여줘요.
   - 추첨 시간(토요일 저녁) 전후에 바뀌므로 열어 둔 채로 두면 1시간마다 다시 확인해요. */
(function () {
    "use strict";

    var box = document.querySelector(".lotto-container");
    if (!box) return;

    var WORKER_URL = "https://lottoinfo.sumerboy.workers.dev/";
    var OFFICIAL_URL = "https://www.dhlottery.co.kr/";
    var REFRESH_MS = 60 * 60 * 1000;
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
        fit();
    }

    /* 칸이 좁아서 SPIN 버튼과 겹치면 줄여요: 전체 → 공만 → 숨김 */
    function fit() {
        var btn = document.getElementById("lotto-btn");
        panel.classList.remove("ll-min", "ll-off");
        if (!btn) return;
        function overlaps() {
            return panel.getBoundingClientRect().top < btn.getBoundingClientRect().bottom + 2;
        }
        if (!overlaps()) return;
        panel.classList.add("ll-min");
        if (!overlaps()) return;
        panel.classList.remove("ll-min");
        panel.classList.add("ll-off");
    }
    window.addEventListener("load", function () { setTimeout(fit, 100); });
    var fitTimer = null;
    window.addEventListener("resize", function () {
        clearTimeout(fitTimer);
        fitTimer = setTimeout(fit, 150);
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

    setInterval(function () {
        if (!document.hidden) refresh();
    }, REFRESH_MS);
})();
