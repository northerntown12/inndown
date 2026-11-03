/* ===== 시세 중계 서버 (Cloudflare Workers 무료 플랜용) =====
   - 홈페이지(stock.js)가 이 주소로 "?symbols=^KS11,005930.KS" 처럼 요청하면
     Yahoo Finance에서 시세를 받아 가볍게 정리해서 돌려줘요.
   - 브라우저에서 Yahoo를 직접 부르면 CORS 때문에 막히는 경우가 많아서 이 중계가 필요해요.
   - 허용된 사이트(ALLOWED_ORIGINS)에서 온 요청만 브라우저가 결과를 읽을 수 있어요.
   - Yahoo는 공식 공개 API가 아니라서, 나중에 막히거나 형식이 바뀔 수 있어요. */

var ALLOWED_ORIGINS = ["https://northerntown12.github.io"];
var MAX_SYMBOLS = 20;
var SYMBOL_RE = /^[\^A-Za-z0-9.\-=]{1,15}$/;   // 이상한 주소로 악용되지 않게 모양을 제한해요
var CACHE_SECONDS = 30;                        // 같은 시세는 30초 동안 재사용 (Yahoo 부담 줄이기)

async function fetchOne(symbol) {
    var hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
    for (var i = 0; i < hosts.length; i++) {
        try {
            var url = "https://" + hosts[i] + "/v8/finance/chart/" + encodeURIComponent(symbol) +
                      "?interval=1d&range=1d";
            var res = await fetch(url, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; HomepageQuotes/1.0)", "Accept": "application/json" },
                cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true }
            });
            if (!res.ok) continue;
            var json = await res.json();
            var r = json && json.chart && json.chart.result && json.chart.result[0];
            var m = r && r.meta;
            if (!m || typeof m.regularMarketPrice !== "number") continue;

            var prev = typeof m.previousClose === "number" ? m.previousClose : m.chartPreviousClose;
            return {
                p: m.regularMarketPrice,                         // 현재가
                c: typeof prev === "number" ? prev : null,       // 전일 종가
                t: (m.regularMarketTime || 0) * 1000             // 시세 기준 시각(ms)
            };
        } catch (e) { /* 다음 주소로 재시도 */ }
    }
    return null;
}

export default {
    async fetch(request) {
        var origin = request.headers.get("Origin") || "";
        var cors = {
            "Access-Control-Allow-Origin": ALLOWED_ORIGINS.indexOf(origin) >= 0 ? origin : ALLOWED_ORIGINS[0],
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Vary": "Origin"
        };

        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
        if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: cors });

        var raw = new URL(request.url).searchParams.get("symbols") || "";
        var symbols = raw.split(",").map(function (s) { return s.trim(); }).filter(Boolean);

        if (symbols.length === 0 || symbols.length > MAX_SYMBOLS || !symbols.every(function (s) { return SYMBOL_RE.test(s); })) {
            return new Response(JSON.stringify({ ok: false, error: "bad symbols" }), {
                status: 400, headers: Object.assign({ "Content-Type": "application/json" }, cors)
            });
        }

        var results = await Promise.all(symbols.map(fetchOne));
        var data = {};
        symbols.forEach(function (s, i) { data[s] = results[i]; });

        return new Response(JSON.stringify({ ok: true, fetchedAt: Date.now(), data: data }), {
            headers: Object.assign({
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "public, max-age=" + CACHE_SECONDS
            }, cors)
        });
    }
};
