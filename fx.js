/* ===== 환율 위젯 (오른쪽 광고칸 왼쪽 3칸) =====
   - 데이터: ExchangeRate-API 무료 공개 주소 (API 키 필요 없음, 출처 표기 필요)
     https://open.er-api.com/v6/latest/USD
   - 이 무료 주소는 하루 한 번 갱신
   - 서버에 부담을 주지 않도록, 받은 값을 이 브라우저(localStorage)에 저장해 두고
     다음 갱신 시각이 지났을 때만 다시 받아요.
   - 원화(KRW) 환산:  1 외화 = rates.KRW ÷ rates.외화  원  (엔은 100엔 기준) */
(function () {
    "use strict";

    var widget = document.getElementById("fx-widget");
    if (!widget) return;

    var API_URL = "https://open.er-api.com/v6/latest/USD";
    var STORAGE_KEY = "fxRates.v1";
    var MIN_GAP_MS = 60 * 60 * 1000;        // 아무리 늦게 갱신돼도 최소 1시간 간격
    var CHECK_EVERY_MS = 30 * 60 * 1000;    // 30분마다 '갱신할 때가 됐나' 확인

    // 표시할 통화: 코드 → 몇 단위 기준으로 보여줄지
    var UNITS = { USD: 1, JPY: 100, EUR: 1, CNY: 1, GBP: 1 };

    var dateEl = document.getElementById("fx-date");
    var rows = widget.querySelectorAll("li[data-code]");

    function readCache() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            var c = JSON.parse(raw);
            if (!c || !c.data || !c.data.rates) return null;
            return c;
        } catch (e) { return null; }
    }

    function writeCache(data) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                fetchedAt: Date.now(),
                nextAt: (data.time_next_update_unix || 0) * 1000,
                data: data
            }));
        } catch (e) { /* 저장 공간을 못 써도 화면 표시에는 문제 없어요 */ }
    }

    function fmt(n) {
        return n.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function render(data) {
        var r = data.rates;
        var krw = r.KRW;
        if (!(krw > 0)) return false;

        for (var i = 0; i < rows.length; i++) {
            var code = rows[i].getAttribute("data-code");
            var valEl = rows[i].querySelector(".fx-val");
            var rate = r[code];
            if (!valEl) continue;
            if (rate > 0) {
                valEl.textContent = fmt(krw / rate * (UNITS[code] || 1));
            } else {
                valEl.textContent = "--";
            }
        }

        var t = new Date((data.time_last_update_unix || 0) * 1000);
        if (!isNaN(t.getTime()) && data.time_last_update_unix) {
            dateEl.textContent = (t.getMonth() + 1) + "/" + t.getDate() + " 기준 (1일 1회 자동갱신)";
        } else {
            dateEl.textContent = "1일 1회 자동갱신";
        }
        return true;
    }

    function fetchRates(cache) {
        return fetch(API_URL)
            .then(function (res) {
                if (!res.ok) throw new Error("HTTP " + res.status);
                return res.json();
            })
            .then(function (data) {
                if (!data || data.result !== "success" || !data.rates) throw new Error("bad data");
                if (render(data)) writeCache(data);
            })
            .catch(function () {
                // 실패하면 저장해 둔 값을 계속 보여줘요. 저장된 값도 없으면 안내 문구만.
                if (!cache) dateEl.textContent = "환율을 불러오지 못했어요";
            });
    }

    function update() {
        var cache = readCache();
        var now = Date.now();

        if (cache) {
            render(cache.data);
            var dueByApi = now >= cache.nextAt;
            var enoughGap = now - cache.fetchedAt >= MIN_GAP_MS;
            if (!(dueByApi && enoughGap)) return;   // 아직 갱신할 때가 아니에요
        }
        fetchRates(cache);
    }

    update();
    setInterval(update, CHECK_EVERY_MS);
})();
