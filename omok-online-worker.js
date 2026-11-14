/* =========================================================
   오목 온라인 대결 서버 (Cloudflare Worker + D1 데이터베이스)  — 2026-11-14
   - Cloudflare에 이 파일 내용을 통째로 붙여넣기
   - Worker 설정 → 바인딩(Bindings)에 D1 데이터베이스를 이름 "DB"로 연결해야 함
     (표는 처음 요청 때 저절로 만들어져요. 따로 SQL을 칠 필요 없음)
   - 방 코드(친구와) + 빠른 매칭(아무나), 렌주룰 검사, 한 수 15초(넘기면 시간패),
     기권, 재대결(흑백 바꿔서)
   - 홈피(omok.html)는 이 주소로 POST 요청을 보내요: /create /join /quick /state /move /resign /rematch /leave
   ========================================================= */

/* 이 주소에서 온 요청만 받아요 (다른 사이트가 이 서버를 못 쓰게) */
const ALLOW_ORIGINS = [
    "https://northerntown12.github.io",
];

const TIME_LIMIT_MS = 15000;     // 한 수 15초
const GRACE_MS = 2000;           // 인터넷 지연을 생각한 여유
const HOLD_MS = 20000;           // 상대 수를 기다리며 연결을 붙잡는 최대 시간
const CHECK_MS = 600;            // 그동안 몇 ms마다 판을 확인할지
const WAIT_ALIVE_MS = 40000;     // 빠른 매칭: 이 시간 안에 신호가 있던 방만 짝지음
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // 헷갈리는 0·O·1·I 뺌

/* ---------- 오목 엔진 (omok-engine.js와 같은 내용: 렌주룰 판정) ---------- */
/* =========================================================
   오목 엔진 (렌주룰) — 판 판정 + 컴퓨터 수 고르기
   - 판: 15×15, 칸 값 0 빈칸 / 1 흑 / 2 백, 번호 = y*15 + x
   - 렌주룰: 흑만 3-3, 4-4, 장목(6개 이상) 금지. 흑은 정확히 5개여야 승리,
     백은 5개 이상이면 승리. 흑이 5를 만드는 수는 금수와 겹쳐도 승리.
   - 난이도: easy 쉬움 / normal 보통 / hard 어려움
   ========================================================= */
(function (root) {
    "use strict";

    var N = 15;
    var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

    function inb(x, y) { return x >= 0 && y >= 0 && x < N && y < N; }

    /* (x,y)를 지나는 c색 연속 개수 ((x,y)에 c가 있다고 보고 셈) */
    function run(b, x, y, dx, dy, c) {
        var n = 1, i = x + dx, j = y + dy;
        while (inb(i, j) && b[j * N + i] === c) { n++; i += dx; j += dy; }
        i = x - dx; j = y - dy;
        while (inb(i, j) && b[j * N + i] === c) { n++; i -= dx; j -= dy; }
        return n;
    }
    function fiveLen(n, c) { return c === 1 ? n === 5 : n >= 5; }

    /* 빈칸 (x,y)에 c를 두면 5가 되나 */
    function makesFive(b, x, y, c) {
        var id = y * N + x, r = false;
        b[id] = c;
        for (var d = 0; d < 4; d++) {
            if (fiveLen(run(b, x, y, DIRS[d][0], DIRS[d][1], c), c)) { r = true; break; }
        }
        b[id] = 0;
        return r;
    }

    /* (x,y)에 c가 놓인 상태에서, 그 줄의 어느 빈칸에 c를 더 두면 (x,y)를 포함한 5가 되는지 (오프셋 목록) */
    function fivePointsDir(b, x, y, dx, dy, c) {
        var pts = [];
        for (var k = -4; k <= 4; k++) {
            if (!k) continue;
            var i = x + k * dx, j = y + k * dy;
            if (!inb(i, j) || b[j * N + i] !== 0) continue;
            b[j * N + i] = c;
            var n = run(b, x, y, dx, dy, c);
            b[j * N + i] = 0;
            if (fiveLen(n, c)) pts.push(k);
        }
        return pts;
    }
    function isOpenPts(p) { return p.length === 2 && Math.abs(p[0] - p[1]) === 5; }
    /* 한 줄에서 4의 개수 (열린 4는 1개, 한 줄 안의 겹친 4는 2개) */
    function fourCountFromPts(p) {
        if (!p.length) return 0;
        if (isOpenPts(p)) return 1;
        return Math.min(p.length, 2);
    }

    /* 흑 금수 판정. (x,y)는 빈칸이어야 함 */
    function isForbidden(b, x, y, depth) {
        depth = depth || 0;
        var id = y * N + x;
        if (b[id] !== 0) return false;
        b[id] = 1;
        var five = false, over = false, d, n;
        for (d = 0; d < 4; d++) {
            n = run(b, x, y, DIRS[d][0], DIRS[d][1], 1);
            if (n === 5) five = true; else if (n > 5) over = true;
        }
        if (five) { b[id] = 0; return false; }
        if (over) { b[id] = 0; return true; }
        var fours = 0, threes = 0, f = [];
        for (d = 0; d < 4; d++) {
            f[d] = fourCountFromPts(fivePointsDir(b, x, y, DIRS[d][0], DIRS[d][1], 1));
            fours += f[d];
        }
        if (fours >= 2) { b[id] = 0; return true; }
        for (d = 0; d < 4 && threes < 2; d++) {
            if (f[d]) continue;
            if (isRealThree(b, x, y, DIRS[d][0], DIRS[d][1], depth)) threes++;
        }
        b[id] = 0;
        return threes >= 2;
    }
    /* (x,y)의 흑돌이 그 줄에서 '진짜 3'인가: 한 수 더 두면 열린 4가 되고, 그 수가 금수가 아님 */
    function isRealThree(b, x, y, dx, dy, depth) {
        for (var k = -4; k <= 4; k++) {
            if (!k) continue;
            var i = x + k * dx, j = y + k * dy;
            if (!inb(i, j) || b[j * N + i] !== 0) continue;
            b[j * N + i] = 1;
            var open = isOpenPts(fivePointsDir(b, x, y, dx, dy, 1));
            b[j * N + i] = 0;
            if (open && (depth >= 3 || !isForbidden(b, i, j, depth + 1))) return true;
        }
        return false;
    }

    /* 방금 둔 (x,y)로 이겼으면 5개 돌 좌표 목록, 아니면 null */
    function winLine(b, x, y) {
        var c = b[y * N + x];
        if (!c) return null;
        for (var d = 0; d < 4; d++) {
            var dx = DIRS[d][0], dy = DIRS[d][1];
            if (!fiveLen(run(b, x, y, dx, dy, c), c)) continue;
            var cells = [[x, y]], i = x + dx, j = y + dy;
            while (inb(i, j) && b[j * N + i] === c) { cells.push([i, j]); i += dx; j += dy; }
            i = x - dx; j = y - dy;
            while (inb(i, j) && b[j * N + i] === c) { cells.push([i, j]); i -= dx; j -= dy; }
            return cells;
        }
        return null;
    }

    /* ---------------- 컴퓨터: 모양 점수 ---------------- */
    var S = {
        FIVE: 10000000, OPEN4: 500000, FOUR: 12000, OPEN3: 10000,
        THREE: 1200, OPEN2: 800, TWO: 150, ONE: 20,
        DOUBLE4: 400000, FOUR3: 300000, DOUBLE3: 200000
    };
    var OPEN3_PAT = ["011100", "001110", "011010", "010110"];
    var OPEN2_PAT = ["011000", "001100", "000110", "010100", "001010", "010010"];

    /* 패턴이 가운데(5번)를 덮고, 그 자리가 '1'인 경우만 */
    function hasPat(s, pats) {
        for (var p = 0; p < pats.length; p++) {
            var pat = pats[p], L = pat.length;
            for (var st = Math.max(0, 5 - L + 1); st <= 5 && st + L <= 11; st++) {
                if (pat.charAt(5 - st) !== "1") continue;
                if (s.substr(st, L) === pat) return true;
            }
        }
        return false;
    }
    /* 가운데를 포함한 5칸 창에서 상대 돌 없이 내 돌 m개인 창이 있나 */
    function hasWin5(s, m) {
        for (var st = 1; st <= 5; st++) {
            var w = s.substr(st, 5);
            if (w.indexOf("2") >= 0) continue;
            var cnt = 0;
            for (var t = 0; t < 5; t++) if (w.charAt(t) === "1") cnt++;
            if (cnt === m) return true;
        }
        return false;
    }

    /* 빈칸 (x,y)에 c를 둔다고 할 때의 점수 (공격 관점) */
    function pointScore(b, x, y, c) {
        var id = y * N + x;
        b[id] = c;
        var score = 0, fours = 0, open4 = 0, open3 = 0, five = false;
        for (var d = 0; d < 4; d++) {
            var dx = DIRS[d][0], dy = DIRS[d][1];
            var n = run(b, x, y, dx, dy, c);
            if (fiveLen(n, c)) { five = true; break; }
            if (c === 1 && n > 5) continue;
            var pts = fivePointsDir(b, x, y, dx, dy, c);
            if (pts.length) {
                if (isOpenPts(pts)) { open4++; score += S.OPEN4; }
                else { var fc = Math.min(pts.length, 2); fours += fc; score += S.FOUR * fc; }
                continue;
            }
            var s = "";
            for (var k = -5; k <= 5; k++) {
                var i = x + k * dx, j = y + k * dy;
                if (!inb(i, j)) s += "2";
                else { var v = b[j * N + i]; s += v === 0 ? "0" : (v === c ? "1" : "2"); }
            }
            if (hasPat(s, OPEN3_PAT)) { open3++; score += S.OPEN3; }
            else if (hasWin5(s, 3)) score += S.THREE;
            else if (hasPat(s, OPEN2_PAT)) score += S.OPEN2;
            else if (hasWin5(s, 2)) score += S.TWO;
            else if (hasWin5(s, 1)) score += S.ONE;
        }
        b[id] = 0;
        if (five) return S.FIVE;
        var f = fours + open4;
        if (f >= 2) score += S.DOUBLE4;
        else if (f >= 1 && open3 >= 1) score += S.FOUR3;
        else if (open3 >= 2) score += S.DOUBLE3;
        return score;
    }

    function candidates(b, dist) {
        var out = [], any = false;
        for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
            if (b[y * N + x] !== 0) { any = true; continue; }
            var near = false;
            for (var j = y - dist; j <= y + dist && !near; j++)
                for (var i = x - dist; i <= x + dist; i++)
                    if (inb(i, j) && b[j * N + i] !== 0) { near = true; break; }
            if (near) out.push([x, y]);
        }
        if (!any) out.push([7, 7]);
        return out;
    }

    /* 점수 매긴 후보 목록 (높은 순) */
    function scoredMoves(b, me, wDef) {
        var opp = 3 - me, list = [], cand = candidates(b, 2);
        for (var t = 0; t < cand.length; t++) {
            var x = cand[t][0], y = cand[t][1];
            if (me === 1 && isForbidden(b, x, y)) continue;
            var atk = pointScore(b, x, y, me);
            var def = pointScore(b, x, y, opp);
            if (opp === 1 && def >= S.OPEN3 && def < S.FIVE && isForbidden(b, x, y)) def = 0;   // 사람(흑)이 둘 수 없는 금수 자리는 막을 필요 없음
            /* 가운데 쪽을 아주 조금 선호 */
            var center = (14 - Math.abs(x - 7) - Math.abs(y - 7)) * 0.5;
            list.push({ x: x, y: y, atk: atk, def: def, s: atk + def * wDef + center });
        }
        list.sort(function (a, c) { return c.s - a.s; });
        return list;
    }

    /* c가 지금 두면 5가 되는 자리들 */
    function fivePointsAll(b, c) {
        var out = [];
        for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
            if (b[y * N + x] !== 0) continue;
            if (makesFive(b, x, y, c)) out.push([x, y]);
        }
        return out;
    }

    /* ---------------- VCF: 4를 계속 만들어 이기는 수순 찾기 ---------------- */
    var vcfNodes = 0, VCF_LIMIT = 40000;
    function fourMoves(b, c) {
        var out = [];
        for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
            var id = y * N + x;
            if (b[id] !== 0) continue;
            /* 근처(같은 줄 4칸 안)에 내 돌이 2개 이상일 때만 */
            var near = 0;
            for (var d = 0; d < 4 && near < 3; d++) for (var k = -4; k <= 4; k++) {
                if (!k) continue;
                var i = x + k * DIRS[d][0], j = y + k * DIRS[d][1];
                if (inb(i, j) && b[j * N + i] === c) near++;
            }
            if (near < 3) continue;
            b[id] = c;
            var isFour = false;
            for (d = 0; d < 4; d++) {
                if (fivePointsDir(b, x, y, DIRS[d][0], DIRS[d][1], c).length) { isFour = true; break; }
            }
            b[id] = 0;
            if (isFour) out.push([x, y]);
        }
        return out;
    }
    function vcf(b, c, depth) {
        if (++vcfNodes > VCF_LIMIT) return null;
        var opp = 3 - c;
        var my5 = fivePointsAll(b, c);
        for (var a = 0; a < my5.length; a++) return my5[a];
        if (depth <= 0) return null;
        if (fivePointsAll(b, opp).length) return null;     // 상대가 먼저 5를 만들 수 있음
        var moves = fourMoves(b, c);
        for (var t = 0; t < moves.length; t++) {
            var x = moves[t][0], y = moves[t][1], id = y * N + x;
            if (c === 1 && isForbidden(b, x, y)) continue;
            b[id] = c;
            var threats = fivePointsAll(b, c);
            var ok = false;
            if (threats.length >= 2) {
                /* 막을 곳이 둘 이상: 상대가 5를 만들 수 없으면 이김 (흑 상대의 금수 자리 막기는 무시) */
                ok = !fivePointsAll(b, opp).length;
            } else if (threats.length === 1) {
                var q = threats[0], qid = q[1] * N + q[0];
                if (opp === 1 && isForbidden(b, q[0], q[1])) {
                    ok = !fivePointsAll(b, opp).length;            // 흑은 금수라 못 막음
                } else {
                    b[qid] = opp;
                    if (!winLine(b, q[0], q[1])) ok = !!vcf(b, c, depth - 1);
                    b[qid] = 0;
                }
            }
            b[id] = 0;
            if (ok) return [x, y];
            if (vcfNodes > VCF_LIMIT) return null;
        }
        return null;
    }
    function findVcf(b, c, depth) { vcfNodes = 0; return vcf(b, c, depth || 10); }

    /* 네가맥스: side 차례의 판 값 (클수록 side에게 좋음) */
    var BIG = 1e9, HARD_DEPTH = 3;   // 어려움이 더 읽는 깊이 (클수록 강하지만 느림)
    function nega(b, side, depth, alpha, beta) {
        var list = scoredMoves(b, side, 1.0);
        if (!list.length) return 0;
        if (list[0].atk >= S.FIVE) return BIG;                  // 바로 5
        var oppMax = 0;
        for (var t = 0; t < list.length; t++) if (list[t].def > oppMax) oppMax = list[t].def;
        if (oppMax >= S.FIVE) {                                  // 상대 5를 막아야 함: 그 수만
            list = list.filter(function (m) { return m.def >= S.FIVE; }).slice(0, 1);
            if (!list.length) return -BIG;
        } else if (list[0].atk >= S.OPEN4 || list[0].atk >= S.DOUBLE4) {
            return BIG / 2;                                     // 열린 4 / 4-4 → 사실상 승리
        }
        if (depth <= 0) return list[0].atk - oppMax * 0.85;
        var best = -Infinity, w = list.slice(0, 6);
        for (t = 0; t < w.length; t++) {
            var m = w[t], id = m.y * N + m.x;
            b[id] = side;
            var v = -nega(b, 3 - side, depth - 1, -beta, -alpha);
            b[id] = 0;
            if (v > best) best = v;
            if (best > alpha) alpha = best;
            if (alpha >= beta) break;
        }
        return best;
    }

    /* ---------------- 컴퓨터 수 고르기 ---------------- */
    function pickRandom(list, k) {
        k = Math.min(k, list.length);
        return list[Math.floor(Math.random() * k)];
    }

    function chooseMove(board, me, level) {
        var b = Int8Array.from(board);
        var opp = 3 - me, stones = 0;
        for (var t = 0; t < b.length; t++) if (b[t]) stones++;

        /* 첫 수 */
        if (stones === 0) return [7, 7];
        if (stones === 1) {
            var cx = 7, cy = 7;
            for (t = 0; t < b.length; t++) if (b[t]) { cx = t % N; cy = (t / N) | 0; }
            var opts = [];
            for (var j = -1; j <= 1; j++) for (var i = -1; i <= 1; i++) {
                if ((i || j) && inb(cx + i, cy + j)) opts.push([cx + i, cy + j]);
            }
            /* 가운데 쪽 우선 */
            opts.sort(function (p, q) {
                return (Math.abs(p[0] - 7) + Math.abs(p[1] - 7)) - (Math.abs(q[0] - 7) + Math.abs(q[1] - 7));
            });
            return pickRandom(opts, level === "easy" ? 8 : 4);
        }

        var legal = function (p) { return !(me === 1 && isForbidden(b, p[0], p[1])); };

        /* 1) 바로 이기기 */
        var win = fivePointsAll(b, me).filter(legal);
        var easy = level === "easy";
        if (win.length && (!easy || Math.random() < 0.9)) return win[0];
        /* 2) 상대 5 막기 */
        var block = fivePointsAll(b, opp).filter(function (p) {
            return !(opp === 1 && isForbidden(b, p[0], p[1]));
        }).filter(legal);
        if (block.length && (!easy || Math.random() < 0.85)) return block[0];

        if (level === "hard") {
            /* 3) 내 VCF */
            var v = findVcf(b, me, 12);
            if (v) return v;
            var list = scoredMoves(b, me, 1.0);
            if (!list.length) return null;
            /* 4) 상대 VCF가 있으면 그걸 깨는 수 */
            var ov = findVcf(b, opp, 10);
            if (ov) {
                var top = list.slice(0, 14);
                for (t = 0; t < top.length; t++) {
                    var m = top[t], mid = m.y * N + m.x;
                    b[mid] = me;
                    var still = findVcf(b, opp, 10);
                    b[mid] = 0;
                    if (!still) return [m.x, m.y];
                }
            }
            /* 5) 몇 수 앞까지 읽기 (상위 후보만, 네가맥스) */
            if (list[0].atk >= S.OPEN4) return [list[0].x, list[0].y];
            var best = null, bestVal = -Infinity, cands = list.slice(0, 9);
            for (t = 0; t < cands.length; t++) {
                var c0 = cands[t], id0 = c0.y * N + c0.x;
                b[id0] = me;
                var val = -nega(b, opp, HARD_DEPTH, -Infinity, -bestVal) + c0.s * 0.001;
                b[id0] = 0;
                if (val > bestVal) { bestVal = val; best = c0; }
            }
            return best ? [best.x, best.y] : [list[0].x, list[0].y];
        }

        if (level === "normal") {
            var ln = scoredMoves(b, me, 0.95);
            if (!ln.length) return null;
            var top0 = ln[0].s, near = ln.filter(function (m) { return m.s >= top0 * 0.97; });
            var pick = pickRandom(near, near.length);
            return [pick.x, pick.y];
        }

        /* easy: 수비 약하게 + 상위 후보 중 무작위 */
        var le = scoredMoves(b, me, 0.45);
        if (!le.length) return null;
        /* 가끔 상대 열린 3을 못 본 척 */
        var pool = le.slice(0, 6);
        var pe = Math.random() < 0.5 ? pool[0] : pickRandom(pool, pool.length);
        return [pe.x, pe.y];
    }

    /* 흑 금수 자리 전체 (돌 근처만) */
    function forbiddenPoints(board) {
        var b = Int8Array.from(board), out = [];
        var cand = candidates(b, 4);
        for (var t = 0; t < cand.length; t++) {
            if (isForbidden(b, cand[t][0], cand[t][1])) out.push(cand[t]);
        }
        return out;
    }
    /* 왜 금수인지 (안내용) */
    function forbiddenReason(board, x, y) {
        var b = Int8Array.from(board), id = y * N + x, d;
        b[id] = 1;
        for (d = 0; d < 4; d++) if (run(b, x, y, DIRS[d][0], DIRS[d][1], 1) > 5) { return (typeof window !== "undefined" && window.T ? T("장목(6목 이상)", "overline, 6+ in a row") : "장목(6목 이상)"); }
        var fours = 0;
        for (d = 0; d < 4; d++) fours += fourCountFromPts(fivePointsDir(b, x, y, DIRS[d][0], DIRS[d][1], 1));
        return fours >= 2 ? "4-4" : "3-3";
    }

    var api = {
        N: N, isForbidden: function (board, x, y) { return isForbidden(Int8Array.from(board), x, y); },
        winLine: winLine, chooseMove: chooseMove, forbiddenPoints: forbiddenPoints,
        forbiddenReason: forbiddenReason, findVcf: findVcf
    };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.OmokEngine = api;
})(globalThis);


const E = globalThis.OmokEngine, N = 15;

export default {
    async fetch(request, env) {
        const origin = request.headers.get("Origin") || "";
        const okOrigin = ALLOW_ORIGINS.includes(origin);
        const cors = {
            "Access-Control-Allow-Origin": okOrigin ? origin : ALLOW_ORIGINS[0],
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Vary": "Origin",
            "Cache-Control": "no-store",
        };
        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
        const reply = (obj, status) => new Response(JSON.stringify(obj), {
            status: status || 200, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
        });
        if (!okOrigin) return reply({ error: "origin" }, 403);
        if (request.method !== "POST") return reply({ error: "method" }, 405);
        if (!env.DB) return reply({ error: "nodb" }, 500);

        let body = {};
        try { body = JSON.parse((await request.text()) || "{}"); } catch (e) { return reply({ error: "json" }, 400); }
        const path = new URL(request.url).pathname.replace(/\/+$/, "");

        try {
            await ensureTable(env.DB);
            switch (path) {
                case "/create":  return reply(await createRoom(env.DB, false));
                case "/quick":   return reply(await quickMatch(env.DB));
                case "/join":    return reply(await joinRoom(env.DB, body.code));
                case "/state":   return reply(await getState(env.DB, body, true));
                case "/move":    return reply(await doMove(env.DB, body));
                case "/resign":  return reply(await doResign(env.DB, body));
                case "/rematch": return reply(await doRematch(env.DB, body));
                case "/leave":   return reply(await doLeave(env.DB, body));
                default:         return reply({ error: "path" }, 404);
            }
        } catch (e) {
            return reply({ error: "server", detail: String(e && e.message || e) }, 500);
        }
    },
};

/* ---------------- 표 ----------------
   rooms: 방 하나 = 한 줄
   p1/p2: 두 사람의 비밀 표(token), black: 흑이 누구인지(1=p1, 2=p2)
   moves: 둔 수 JSON [[x,y],...] (짝수 번째=흑), turn_at: 지금 차례가 시작된 시각(ms)
   status: waiting / playing / over, winner: 0 무승부 1 흑 2 백, reason: five/timeout/resign/left/full
   ver: 바뀔 때마다 1씩 올라감 (화면은 이 번호로 새 소식이 있는지 알아요) */
let tableReady = false;
async function ensureTable(db) {
    if (tableReady) return;
    await db.prepare(`CREATE TABLE IF NOT EXISTS rooms (
        code TEXT PRIMARY KEY, status TEXT NOT NULL, quick INTEGER NOT NULL DEFAULT 0,
        p1 TEXT, p2 TEXT, black INTEGER NOT NULL DEFAULT 1,
        moves TEXT NOT NULL DEFAULT '[]', turn_at INTEGER NOT NULL DEFAULT 0,
        winner INTEGER, reason TEXT, r1 INTEGER NOT NULL DEFAULT 0, r2 INTEGER NOT NULL DEFAULT 0,
        left1 INTEGER NOT NULL DEFAULT 0, left2 INTEGER NOT NULL DEFAULT 0,
        seen1 INTEGER NOT NULL DEFAULT 0, seen2 INTEGER NOT NULL DEFAULT 0,
        games INTEGER NOT NULL DEFAULT 0, ver INTEGER NOT NULL DEFAULT 1,
        created INTEGER NOT NULL, updated INTEGER NOT NULL)`).run();
    tableReady = true;
}

const now = () => Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function newCode() {
    let s = "";
    const a = new Uint8Array(4); crypto.getRandomValues(a);
    for (let i = 0; i < 4; i++) s += CODE_CHARS[a[i] % CODE_CHARS.length];
    return s;
}
function cleanCode(c) { return String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4); }
async function getRoom(db, code) { return await db.prepare("SELECT * FROM rooms WHERE code = ?").bind(code).first(); }
function whoAmI(room, token) {
    if (!token) return 0;
    if (room.p1 === token) return 1;
    if (room.p2 === token) return 2;
    return 0;
}

/* 방 만들기 (하루 넘은 방은 이때 정리) */
async function createRoom(db, quick) {
    const t = now();
    await db.prepare("DELETE FROM rooms WHERE updated < ?").bind(t - 86400000).run();
    const token = crypto.randomUUID();
    for (let i = 0; i < 12; i++) {
        const code = newCode();
        const r = await db.prepare(
            "INSERT OR IGNORE INTO rooms (code, status, quick, p1, seen1, created, updated) VALUES (?, 'waiting', ?, ?, ?, ?, ?)"
        ).bind(code, quick ? 1 : 0, token, t, t, t).run();
        if (r.meta && r.meta.changes) return { code, token, you: 1, quick: !!quick };
    }
    throw new Error("no free code");
}

/* 방 들어가기 → 흑백은 무작위 */
async function joinRoom(db, rawCode) {
    const code = cleanCode(rawCode);
    if (code.length !== 4) return { error: "badcode" };
    const room = await getRoom(db, code);
    if (!room) return { error: "noroom" };
    if (room.status !== "waiting" || room.p2) return { error: "full" };
    return await takeSeat(db, room);
}
async function takeSeat(db, room) {
    const t = now();
    const token = crypto.randomUUID();
    const black = (crypto.getRandomValues(new Uint8Array(1))[0] & 1) ? 1 : 2;
    const r = await db.prepare(
        "UPDATE rooms SET p2 = ?, seen2 = ?, status = 'playing', black = ?, moves = '[]', turn_at = ?, games = 1, ver = ver + 1, updated = ? WHERE code = ? AND status = 'waiting' AND p2 IS NULL"
    ).bind(token, t, black, t + 1500, t, room.code).run();      // 시작 전 1.5초 여유
    if (!r.meta || !r.meta.changes) return { error: "full" };
    return { code: room.code, token, you: 2 };
}

/* 빠른 매칭: 기다리는 방이 있으면 들어가고, 없으면 새로 만들어 기다림 */
async function quickMatch(db) {
    const t = now();
    const list = await db.prepare(
        "SELECT * FROM rooms WHERE status = 'waiting' AND quick = 1 AND p2 IS NULL AND left1 = 0 AND seen1 > ? ORDER BY created LIMIT 5"
    ).bind(t - WAIT_ALIVE_MS).all();
    for (const room of (list.results || [])) {
        const res = await takeSeat(db, room);
        if (!res.error) return res;
    }
    return await createRoom(db, true);
}

/* 시간 초과 판정 (누가 물어보든 서버 시각으로) */
async function settleTimeout(db, room) {
    if (room.status !== "playing") return room;
    const t = now();
    if (t <= room.turn_at + TIME_LIMIT_MS + GRACE_MS) return room;
    const moves = JSON.parse(room.moves);
    const toMove = moves.length % 2 === 0 ? 1 : 2;            // 1 흑 2 백
    const r = await db.prepare(
        "UPDATE rooms SET status = 'over', winner = ?, reason = 'timeout', ver = ver + 1, updated = ? WHERE code = ? AND status = 'playing' AND ver = ?"
    ).bind(3 - toMove, t, room.code, room.ver).run();
    return await getRoom(db, room.code);
}

/* 화면에 보낼 모양 */
function view(room, me) {
    const t = now();
    const moves = JSON.parse(room.moves);
    const myColor = me === 0 ? 0 : (room.black === me ? 1 : 2);
    const toMove = moves.length % 2 === 0 ? 1 : 2;
    const oppSeen = me === 1 ? room.seen2 : room.seen1;
    const oppLeft = me === 1 ? room.left2 : room.left1;
    return {
        code: room.code, status: room.status, ver: room.ver, you: myColor, quick: !!room.quick,
        moves, toMove,
        left: room.status === "playing" ? Math.max(0, room.turn_at + TIME_LIMIT_MS - t) : 0,
        startIn: room.status === "playing" ? Math.max(0, room.turn_at - t) : 0,
        limit: TIME_LIMIT_MS,
        winner: room.winner, reason: room.reason,
        oppHere: room.status !== "waiting" && !oppLeft && (t - oppSeen < 35000),
        oppLeft: !!oppLeft,
        rematchMe: !!(me === 1 ? room.r1 : room.r2),
        rematchOpp: !!(me === 1 ? room.r2 : room.r1),
        games: room.games,
    };
}

/* 판 상태 (ver가 같으면 바뀔 때까지 최대 HOLD_MS 기다렸다가 대답) */
async function getState(db, body, hold) {
    const code = cleanCode(body.code);
    let room = await getRoom(db, code);
    if (!room) return { error: "noroom" };
    const me = whoAmI(room, body.token);
    if (!me) return { error: "notyou" };

    const t0 = now();
    const seenCol = me === 1 ? "seen1" : "seen2";
    if (t0 - room[seenCol] > 8000) {
        await db.prepare(`UPDATE rooms SET ${seenCol} = ? WHERE code = ?`).bind(t0, code).run();
        room[seenCol] = t0;
    }
    const since = Number(body.ver) || 0;
    while (true) {
        room = await settleTimeout(db, room);
        if (!hold || room.ver !== since || now() - t0 > HOLD_MS) return view(room, me);
        /* 시간 초과 순간이 다가오면 그때 맞춰 다시 확인 */
        let wait = CHECK_MS;
        if (room.status === "playing") {
            const due = room.turn_at + TIME_LIMIT_MS + GRACE_MS - now() + 50;
            if (due > 0) wait = Math.min(wait, due);
        }
        await sleep(wait);
        room = await getRoom(db, code);
        if (!room) return { error: "noroom" };
    }
}

/* 수 두기: 차례·빈칸·렌주 금수·시간을 서버에서 다시 확인 */
async function doMove(db, body) {
    const code = cleanCode(body.code);
    let room = await getRoom(db, code);
    if (!room) return { error: "noroom" };
    const me = whoAmI(room, body.token);
    if (!me) return { error: "notyou" };
    room = await settleTimeout(db, room);
    if (room.status !== "playing") return { error: "notplaying", state: view(room, me) };

    const moves = JSON.parse(room.moves);
    const myColor = room.black === me ? 1 : 2;
    const toMove = moves.length % 2 === 0 ? 1 : 2;
    const x = body.x | 0, y = body.y | 0;
    if (toMove !== myColor) return { error: "notyourturn", state: view(room, me) };
    if (x < 0 || y < 0 || x >= N || y >= N) return { error: "bad", state: view(room, me) };

    const board = new Int8Array(N * N);
    moves.forEach((m, i) => { board[m[1] * N + m[0]] = i % 2 === 0 ? 1 : 2; });
    if (board[y * N + x]) return { error: "taken", state: view(room, me) };
    if (myColor === 1 && E.isForbidden(board, x, y)) return { error: "forbidden", state: view(room, me) };

    board[y * N + x] = myColor;
    moves.push([x, y]);
    const t = now();
    let status = "playing", winner = null, reason = null;
    if (E.winLine(board, x, y)) { status = "over"; winner = myColor; reason = "five"; }
    else if (moves.length >= N * N) { status = "over"; winner = 0; reason = "full"; }

    const r = await db.prepare(
        "UPDATE rooms SET moves = ?, turn_at = ?, status = ?, winner = ?, reason = ?, ver = ver + 1, updated = ? WHERE code = ? AND ver = ?"
    ).bind(JSON.stringify(moves), t, status, winner, reason, t, code, room.ver).run();
    room = await getRoom(db, code);
    if (!r.meta || !r.meta.changes) return { error: "busy", state: view(room, me) };
    return { ok: true, state: view(room, me) };
}

/* 기권 */
async function doResign(db, body) {
    const code = cleanCode(body.code);
    let room = await getRoom(db, code);
    if (!room) return { error: "noroom" };
    const me = whoAmI(room, body.token);
    if (!me) return { error: "notyou" };
    room = await settleTimeout(db, room);
    if (room.status === "playing") {
        const myColor = room.black === me ? 1 : 2;
        await db.prepare("UPDATE rooms SET status = 'over', winner = ?, reason = 'resign', ver = ver + 1, updated = ? WHERE code = ? AND status = 'playing'")
            .bind(3 - myColor, now(), code).run();
        room = await getRoom(db, code);
    }
    return { ok: true, state: view(room, me) };
}

/* 한 판 더: 둘 다 누르면 흑백 바꿔서 새 판 */
async function doRematch(db, body) {
    const code = cleanCode(body.code);
    let room = await getRoom(db, code);
    if (!room) return { error: "noroom" };
    const me = whoAmI(room, body.token);
    if (!me) return { error: "notyou" };
    if (room.status !== "over") return { error: "notover", state: view(room, me) };
    if ((me === 1 ? room.left2 : room.left1)) return { error: "oppleft", state: view(room, me) };
    const col = me === 1 ? "r1" : "r2";
    const t = now();
    await db.prepare(`UPDATE rooms SET ${col} = 1, ver = ver + 1, updated = ? WHERE code = ?`).bind(t, code).run();
    room = await getRoom(db, code);
    if (room.r1 && room.r2) {
        await db.prepare(
            "UPDATE rooms SET status = 'playing', moves = '[]', black = 3 - black, turn_at = ?, winner = NULL, reason = NULL, r1 = 0, r2 = 0, games = games + 1, ver = ver + 1, updated = ? WHERE code = ? AND r1 = 1 AND r2 = 1"
        ).bind(t + 1500, t, code).run();
        room = await getRoom(db, code);
    }
    return { ok: true, state: view(room, me) };
}

/* 나가기 (두는 중이면 기권으로) */
async function doLeave(db, body) {
    const code = cleanCode(body.code);
    let room = await getRoom(db, code);
    if (!room) return { ok: true };
    const me = whoAmI(room, body.token);
    if (!me) return { ok: true };
    const t = now();
    const col = me === 1 ? "left1" : "left2";
    if (room.status === "playing") {
        const myColor = room.black === me ? 1 : 2;
        await db.prepare(`UPDATE rooms SET status = 'over', winner = ?, reason = 'left', ${col} = 1, ver = ver + 1, updated = ? WHERE code = ?`)
            .bind(3 - myColor, t, code).run();
    } else if (room.status === "waiting") {
        await db.prepare("DELETE FROM rooms WHERE code = ? AND status = 'waiting'").bind(code).run();
    } else {
        await db.prepare(`UPDATE rooms SET ${col} = 1, ver = ver + 1, updated = ? WHERE code = ?`).bind(t, code).run();
    }
    return { ok: true };
}
