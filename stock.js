window.T = window.T || function (ko) { return ko; };   /* lang.js가 없어도 한국어로 동작 */

(function () {
    "use strict";

    var widget = document.getElementById("stock-widget");
    if (!widget) return;

    /* ---------- 설정 ---------- */
    // ★ Cloudflare Worker를 만든 뒤 나온 주소로 바꿔 주세요.
    var WORKER_URL = "https://stockproxy.sumerboy.workers.dev/";

    var REFRESH_MS = 60 * 1000;
    var TIMEOUT_MS = 10 * 1000;
    var STORAGE_KEY = "stockQuotes.v1";

    var GROUPS = [
        { title: T("주요 지수", "Major indices"), items: [
            { sym: "^KS11",  name: T("코스피", "KOSPI"),     kind: "idx", url: "https://finance.naver.com/sise/sise_index.naver?code=KOSPI" },
            { sym: "^KQ11",  name: T("코스닥", "KOSDAQ"),     kind: "idx", url: "https://finance.naver.com/sise/sise_index.naver?code=KOSDAQ" },
            { sym: "^DJI",   name: T("다우존스", "Dow Jones"),   kind: "idx", url: "https://finance.naver.com/world/sise.naver?symbol=DJI@DJI" },
            { sym: "^IXIC",  name: T("나스닥", "Nasdaq"),     kind: "idx", url: "https://finance.naver.com/world/sise.naver?symbol=NAS@IXIC" },
            { sym: "^GSPC",  name: "S&P 500",    kind: "idx", url: "https://finance.naver.com/world/sise.naver?symbol=SPI@SPX" },
            { sym: "^N225",  name: T("닛케이225", "Nikkei 225"),  kind: "idx", url: "https://finance.naver.com/world/sise.naver?symbol=NII@NI225" }
        ]},
        { title: T("인기 종목", "Popular stocks"), items: [
            { sym: "005930.KS", name: T("삼성전자", "Samsung Elec."),   kind: "krw", url: "https://finance.naver.com/item/main.naver?code=005930" },
            { sym: "000660.KS", name: T("SK하이닉스", "SK hynix"), kind: "krw", url: "https://finance.naver.com/item/main.naver?code=000660" },
            { sym: "035420.KS", name: "NAVER",      kind: "krw", url: "https://finance.naver.com/item/main.naver?code=035420" },
            { sym: "NVDA",      name: T("엔비디아", "NVIDIA"),   kind: "usd", url: "https://m.stock.naver.com/worldstock/stock/NVDA.O/total" },
            { sym: "TSLA",      name: T("테슬라", "Tesla"),     kind: "usd", url: "https://m.stock.naver.com/worldstock/stock/TSLA.O/total" },
            { sym: "AAPL",      name: T("애플", "Apple"),       kind: "usd", url: "https://m.stock.naver.com/worldstock/stock/AAPL.O/total" }
        ]}
    ];

    /* ---------- 화면 만들기 ---------- */
    var cells = {};   // 심볼 → { price, chg }
    var allSymbols = [];

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    var title = el("h3", "stk-title", T("오늘의 주식시장", "Today's Stock Market"));
    widget.appendChild(title);

    GROUPS.forEach(function (g) {
        widget.appendChild(el("div", "stk-group", g.title));
        var ul = el("ul", "stk-list");
        g.items.forEach(function (it) {
            allSymbols.push(it.sym);
            var li = el("li");
            var name = el("a", "stk-name", it.name);
            name.href = it.url;
            name.target = "_blank";
            name.rel = "noopener noreferrer";
            name.title = T("네이버 증권에서 보기", "View on Naver Finance");
            var price = el("b", "stk-price", "--");
            var chg = el("span", "stk-chg", "--");
            li.appendChild(name);
            li.appendChild(price);
            li.appendChild(chg);
            ul.appendChild(li);
            cells[it.sym] = { price: price, chg: chg, item: it };
        });
        widget.appendChild(ul);
    });

    var foot = el("div", "stk-foot");
    var statusEl = el("span", "", T("불러오는 중...", "Loading..."));
    foot.appendChild(statusEl);
    foot.appendChild(el("span", "", T("시세는 지연될 수 있어요 · Yahoo Finance", "Quotes may be delayed · Yahoo Finance")));
    widget.appendChild(foot);

    /* ---------- 표시 ---------- */
    function fmtNum(n, digits) {
        return n.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }

    function fmtPrice(item, p) {
        if (item.kind === "krw") return fmtNum(p, 0) + T("원", " KRW");
        if (item.kind === "usd") return "$" + fmtNum(p, 2);
        return fmtNum(p, 2);
    }

    function paint(quotes) {
        allSymbols.forEach(function (sym) {
            var c = cells[sym];
            var q = quotes && quotes[sym];
            c.chg.className = "stk-chg";
            if (!q || typeof q.p !== "number") {
                c.price.textContent = "--";
                c.chg.textContent = "--";
                return;
            }
            c.price.textContent = fmtPrice(c.item, q.p);

            if (typeof q.c === "number" && q.c > 0) {
                var pct = (q.p - q.c) / q.c * 100;
                var abs = Math.abs(pct);
                if (abs < 0.005) {
                    c.chg.textContent = "- 0.00%";
                } else if (pct > 0) {
                    c.chg.textContent = "\u25B2 " + fmtNum(abs, 2) + "%";
                    c.chg.className = "stk-chg up";
                } else {
                    c.chg.textContent = "\u25BC " + fmtNum(abs, 2) + "%";
                    c.chg.className = "stk-chg down";
                }
            } else {
                c.chg.textContent = "--";
            }
        });
    }

    function pad2(n) { return (n < 10 ? "0" : "") + n; }

    function setStatus(ts, failed) {
        var d = new Date(ts);
        var t = pad2(d.getHours()) + ":" + pad2(d.getMinutes());
        statusEl.textContent = failed ? t + T(" 기준 (새로 받지 못했어요)", " (couldn't refresh)") : T(t + " 갱신", "Updated " + t);
    }

    /* ---------- 저장값 ---------- */
    function readCache() {
        try {
            var c = JSON.parse(localStorage.getItem(STORAGE_KEY));
            return c && c.data ? c : null;
        } catch (e) { return null; }
    }

    function writeCache(fetchedAt, data) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ fetchedAt: fetchedAt, data: data })); } catch (e) { /* 무시 */ }
    }

    /* ---------- 받아오기 ---------- */
    var lastTry = 0;
    var busy = false;

    function refresh() {
        if (busy) return;

        if (WORKER_URL.indexOf("YOUR-WORKER") >= 0) {
            statusEl.textContent = T("중계 서버 주소(stock.js의 WORKER_URL)를 설정해 주세요", "Please set the relay server address (WORKER_URL in stock.js)");
            return;
        }

        busy = true;
        lastTry = Date.now();

        var ctrl = typeof AbortController === "function" ? new AbortController() : null;
        var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;
        var url = WORKER_URL + "?symbols=" + encodeURIComponent(allSymbols.join(","));

        fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
            .then(function (res) {
                if (!res.ok) throw new Error("HTTP " + res.status);
                return res.json();
            })
            .then(function (json) {
                if (!json || !json.ok || !json.data) throw new Error("bad data");
                paint(json.data);
                writeCache(json.fetchedAt || Date.now(), json.data);
                setStatus(json.fetchedAt || Date.now(), false);
            })
            .catch(function () {
                var c = readCache();
                if (c) {
                    paint(c.data);
                    setStatus(c.fetchedAt, true);
                } else {
                    statusEl.textContent = T("시세를 불러오지 못했어요", "Couldn't load quotes");
                }
            })
            .then(function () {
                if (timer) clearTimeout(timer);
                busy = false;
            });
    }

    /* ---------- 시작 ---------- */
    var cached = readCache();
    if (cached) {
        paint(cached.data);
        setStatus(cached.fetchedAt, false);
    }

    refresh();

    setInterval(function () {
        if (!document.hidden) refresh();
    }, REFRESH_MS);

    document.addEventListener("visibilitychange", function () {
        if (!document.hidden && Date.now() - lastTry >= REFRESH_MS) refresh();
    });
})();
