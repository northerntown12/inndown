/* =========================================================
   장기 규칙 + 컴퓨터 (janggi-engine.js) — 2026-11-18
   - 판: 가로 9줄 × 세로 10줄, 칸 번호 i = y * 9 + x (y 0 = 위쪽 한, y 9 = 아래쪽 초)
   - 말 번호: 1 궁(왕) · 2 사 · 3 상 · 4 마 · 5 차 · 6 포 · 7 졸(병)
     초(아래, 먼저 둠) = 양수, 한(위) = 음수
   - 궁성: x 3~5, y 0~2(한) / y 7~9(초), 가운데와 네 귀를 잇는 대각선
   - 포: 다른 말 하나를 넘어서만 움직임, 포는 넘을 수도 잡을 수도 없음
   - 졸: 앞·옆 한 칸, 상대 궁성 안에서는 대각선 앞으로도
   - 컴퓨터: 알파베타 탐색 + 잡기 수 끝까지 보기(quiescence)
   ========================================================= */
(function (global) {
    "use strict";

    var K = 1, A = 2, E = 3, H = 4, R = 5, C = 6, P = 7;
    var VAL = [0, 0, 300, 300, 500, 1300, 700, 200];   // 차 13 · 포 7 · 마 5 · 상 3 · 사 3 · 졸 2 (점수 계산과 같은 비율)
    var SCORE = [0, 0, 3, 3, 5, 13, 7, 2];               // 수가 다 찼을 때 점수 비교용
    var MATE = 100000;

    function X(i) { return i % 9; }
    function Y(i) { return (i / 9) | 0; }
    function I(x, y) { return y * 9 + x; }
    function on(x, y) { return x >= 0 && x < 9 && y >= 0 && y < 10; }
    function inPalace(x, y) { return x >= 3 && x <= 5 && (y <= 2 || y >= 7); }
    function ownPalace(x, y, side) { return x >= 3 && x <= 5 && (side > 0 ? y >= 7 && y <= 9 : y >= 0 && y <= 2); }

    /* 궁성 대각선 이웃 (가운데 ↔ 네 귀) */
    var DIAG = {};
    [[4, 1], [4, 8]].forEach(function (c) {
        var ci = I(c[0], c[1]); DIAG[ci] = [];
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (d) {
            var k = I(c[0] + d[0], c[1] + d[1]);
            DIAG[ci].push(k); DIAG[k] = [ci];
        });
    });
    /* 귀 → 가운데 → 맞은편 귀 (차·포가 대각선으로 길게 갈 때) */
    function diagLines(i) {
        var out = [];
        if (!DIAG[i]) return out;
        var x = X(i), y = Y(i);
        var cy = y <= 2 ? 1 : 8, cx = 4;
        if (x === 4 && y === cy) {   // 가운데: 네 귀 한 칸씩
            DIAG[i].forEach(function (k) { out.push([k]); });
        } else {                     // 귀: 가운데 → 맞은편 귀
            out.push([I(cx, cy), I(2 * cx - x, 2 * cy - y)]);
        }
        return out;
    }

    /* ---------------- 첫 배치 ----------------
       setup: 내 쪽에서 볼 때 왼쪽부터 b·c·g·h 줄에 놓을 말 (예: "HEHE" = 마상마상) */
    var SETUPS = { HEHE: [H, E, H, E], EHEH: [E, H, E, H], HEEH: [H, E, E, H], EHHE: [E, H, H, E] };
    function initialBoard(choSetup, hanSetup) {
        var b = new Int8Array(90);
        function place(side, setup) {
            var back = side > 0 ? 9 : 0, palC = side > 0 ? 8 : 1, cann = side > 0 ? 7 : 2, pawn = side > 0 ? 6 : 3;
            var s = SETUPS[setup] || SETUPS.HEHE;
            /* 내 쪽에서 본 왼쪽 → 초는 x 작은 쪽, 한은 x 큰 쪽 */
            var files = side > 0 ? [1, 2, 6, 7] : [7, 6, 2, 1];
            b[I(0, back)] = R * side; b[I(8, back)] = R * side;
            for (var k = 0; k < 4; k++) b[I(files[k], back)] = s[k] * side;
            b[I(3, back)] = A * side; b[I(5, back)] = A * side;
            b[I(4, palC)] = K * side;
            b[I(1, cann)] = C * side; b[I(7, cann)] = C * side;
            [0, 2, 4, 6, 8].forEach(function (x) { b[I(x, pawn)] = P * side; });
        }
        place(1, choSetup); place(-1, hanSetup);
        return b;
    }

    /* ---------------- 수 만들기 (자기 궁이 잡히는지는 아직 안 봄) ---------------- */
    var ORTH = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    function genMoves(b, side, capturesOnly) {
        var mv = [];
        for (var i = 0; i < 90; i++) {
            var p = b[i];
            if (!p || (p > 0) !== (side > 0)) continue;
            pieceMoves(b, i, side, mv, capturesOnly);
        }
        return mv;
    }
    function add(b, side, from, to, mv, capOnly) {
        var t = b[to];
        if (t && (t > 0) === (side > 0)) return;
        if (capOnly && !t) return;
        mv.push(from * 100 + to);
    }
    function pieceMoves(b, i, side, mv, capOnly) {
        var t = Math.abs(b[i]), x = X(i), y = Y(i), d, k, nx, ny, j;
        if (t === A) {
            /* 2026-11-19 사용자 요청: 사는 자기 궁성 안에서 8방향(앞·뒤·옆·대각선) 어디로든 한 칸 (양쪽 같음) */
            for (var ax = -1; ax <= 1; ax++) for (var ay = -1; ay <= 1; ay++) {
                if (!ax && !ay) continue;
                nx = x + ax; ny = y + ay;
                if (ownPalace(nx, ny, side)) add(b, side, i, I(nx, ny), mv, capOnly);
            }
        } else if (t === K) {
            for (d = 0; d < 4; d++) {
                nx = x + ORTH[d][0]; ny = y + ORTH[d][1];
                if (ownPalace(nx, ny, side)) add(b, side, i, I(nx, ny), mv, capOnly);
            }
            if (DIAG[i]) DIAG[i].forEach(function (q) { add(b, side, i, q, mv, capOnly); });
        } else if (t === H) {
            for (d = 0; d < 4; d++) {
                var dx = ORTH[d][0], dy = ORTH[d][1];
                nx = x + dx; ny = y + dy;
                if (!on(nx, ny) || b[I(nx, ny)]) continue;
                for (k = -1; k <= 1; k += 2) {
                    var tx = nx + dx + (dx ? 0 : k), ty = ny + dy + (dy ? 0 : k);
                    if (on(tx, ty)) add(b, side, i, I(tx, ty), mv, capOnly);
                }
            }
        } else if (t === E) {
            for (d = 0; d < 4; d++) {
                var ex = ORTH[d][0], ey = ORTH[d][1];
                nx = x + ex; ny = y + ey;
                if (!on(nx, ny) || b[I(nx, ny)]) continue;
                for (k = -1; k <= 1; k += 2) {
                    var sx = ex ? ex : k, sy = ey ? ey : k;          // 바깥쪽 대각선 방향
                    var m1x = nx + sx, m1y = ny + sy;
                    if (!on(m1x, m1y) || b[I(m1x, m1y)]) continue;
                    var tx2 = m1x + sx, ty2 = m1y + sy;
                    if (on(tx2, ty2)) add(b, side, i, I(tx2, ty2), mv, capOnly);
                }
            }
        } else if (t === R) {
            for (d = 0; d < 4; d++) {
                nx = x + ORTH[d][0]; ny = y + ORTH[d][1];
                while (on(nx, ny)) {
                    j = I(nx, ny);
                    if (b[j]) { add(b, side, i, j, mv, capOnly); break; }
                    if (!capOnly) mv.push(i * 100 + j);
                    nx += ORTH[d][0]; ny += ORTH[d][1];
                }
            }
            diagLines(i).forEach(function (line) {
                for (var n = 0; n < line.length; n++) {
                    var q = line[n];
                    if (b[q]) { add(b, side, i, q, mv, capOnly); break; }
                    if (!capOnly) mv.push(i * 100 + q);
                }
            });
        } else if (t === C) {
            for (d = 0; d < 4; d++) {
                nx = x + ORTH[d][0]; ny = y + ORTH[d][1];
                var jumped = false;
                while (on(nx, ny)) {
                    j = I(nx, ny);
                    if (!jumped) {
                        if (b[j]) { if (Math.abs(b[j]) === C) break; jumped = true; }
                    } else {
                        if (b[j]) { if (Math.abs(b[j]) !== C) add(b, side, i, j, mv, capOnly); break; }
                        if (!capOnly) mv.push(i * 100 + j);
                    }
                    nx += ORTH[d][0]; ny += ORTH[d][1];
                }
            }
            diagLines(i).forEach(function (line) {
                if (line.length !== 2) return;                 // 가운데에서는 넘을 말이 없음
                var mid = b[line[0]], to = line[1];
                if (!mid || Math.abs(mid) === C) return;
                if (b[to] && Math.abs(b[to]) === C) return;
                add(b, side, i, to, mv, capOnly);
            });
        } else if (t === P) {
            var fwd = side > 0 ? -1 : 1;
            if (on(x, y + fwd)) add(b, side, i, I(x, y + fwd), mv, capOnly);
            if (on(x - 1, y)) add(b, side, i, I(x - 1, y), mv, capOnly);
            if (on(x + 1, y)) add(b, side, i, I(x + 1, y), mv, capOnly);
            if (DIAG[i] && inPalace(x, y) && !ownPalace(x, y, side)) {
                DIAG[i].forEach(function (q) { if (Y(q) - y === fwd) add(b, side, i, q, mv, capOnly); });
            }
        }
    }

    /* ---------------- 장군인지 ---------------- */
    function kingSq(b, side) {
        var want = K * side;
        for (var i = 0; i < 90; i++) if (b[i] === want) return i;
        return -1;
    }
    function attacked(b, sq, bySide) {
        var mv = genMoves(b, bySide, true);
        for (var n = 0; n < mv.length; n++) if (mv[n] % 100 === sq) return true;
        return false;
    }
    function inCheck(b, side) {
        var k = kingSq(b, side);
        return k < 0 || attacked(b, k, -side);
    }
    function makeMove(b, m) {
        var f = (m / 100) | 0, t = m % 100, cap = b[t];
        b[t] = b[f]; b[f] = 0;
        return cap;
    }
    function undoMove(b, m, cap) {
        var f = (m / 100) | 0, t = m % 100;
        b[f] = b[t]; b[t] = cap;
    }
    /* 둘 수 있는 수 (자기 궁이 잡히게 되는 수는 뺌) */
    function legalMoves(b, side) {
        var mv = genMoves(b, side, false), out = [];
        for (var n = 0; n < mv.length; n++) {
            var cap = makeMove(b, mv[n]);
            if (!inCheck(b, side)) out.push(mv[n]);
            undoMove(b, mv[n], cap);
        }
        return out;
    }
    function material(b, side) {
        var s = 0;
        for (var i = 0; i < 90; i++) if (b[i] && (b[i] > 0) === (side > 0)) s += SCORE[Math.abs(b[i])];
        return s;
    }

    /* ---------------- 판 평가 (둘 차례인 쪽에서 본 점수) ---------------- */
    function evaluate(b, side) {
        var s = 0;
        for (var i = 0; i < 90; i++) {
            var p = b[i]; if (!p) continue;
            var t = Math.abs(p), own = p > 0 ? 1 : -1, x = X(i), y = Y(i);
            var v = VAL[t];
            var adv = own > 0 ? 9 - y : y;                    // 앞으로 나간 정도 (0~9)
            if (t === P) {
                v += adv >= 4 ? 18 + (adv - 4) * 12 : 0;      // 강 건넌 졸은 조금 더
                if (adv >= 7 && x >= 3 && x <= 5) v += 25;    // 상대 궁성 근처
            } else if (t === H || t === E) {
                v += (4 - Math.abs(4 - x)) * 4 + Math.min(adv, 5) * 4;
            } else if (t === R) {
                v += Math.min(adv, 6) * 3;
            } else if (t === C) {
                v += (adv >= 2 && adv <= 6 ? 15 : 0);
            } else if (t === A) {
                v += (x === 4 ? 10 : 0);
            }
            s += own * v;
        }
        return side > 0 ? s : -s;
    }

    /* ---------------- 탐색 ---------------- */
    function Searcher(opts) {
        this.deadline = 0; this.nodes = 0; this.stop = false;
        this.noise = opts && opts.noise || 0;
    }
    function ordered(b, mv) {
        /* 잡는 수 먼저 (비싼 말을 싼 말로 잡는 순서) */
        var sc = mv.map(function (m) {
            var f = (m / 100) | 0, t = m % 100, cap = b[t];
            return cap ? 10000 + VAL[Math.abs(cap)] * 10 - VAL[Math.abs(b[f])] : 0;
        });
        var idx = mv.map(function (_, k) { return k; }).sort(function (a, c) { return sc[c] - sc[a]; });
        return idx.map(function (k) { return mv[k]; });
    }
    Searcher.prototype.quiesce = function (b, side, alpha, beta, depth) {
        this.nodes++;
        var mv = ordered(b, genMoves(b, side, true));
        /* 궁을 잡을 수 있음 = 바로 전에 상대가 둔 수는 둘 수 없는 수 (먼저 확인) */
        for (var q = 0; q < mv.length; q++) if (Math.abs(b[mv[q] % 100]) === K) return MATE;
        var stand = evaluate(b, side);
        if (stand >= beta) return stand;
        if (stand > alpha) alpha = stand;
        if (depth <= 0) return alpha;
        for (var n = 0; n < mv.length; n++) {
            var cap = b[mv[n] % 100];
            makeMove(b, mv[n]);
            var sc = -this.quiesce(b, -side, -beta, -alpha, depth - 1);
            undoMove(b, mv[n], cap);
            if (sc >= beta) return sc;
            if (sc > alpha) alpha = sc;
        }
        return alpha;
    };
    Searcher.prototype.search = function (b, side, depth, alpha, beta, ply) {
        if ((++this.nodes & 1023) === 0 && this.deadline && Date.now() > this.deadline) this.stop = true;
        if (this.stop) return 0;
        if (depth <= 0) return this.quiesce(b, side, alpha, beta, 4);
        var mv = ordered(b, genMoves(b, side, false));
        var any = false, best = -MATE - 1;
        for (var n = 0; n < mv.length; n++) {
            var cap = b[mv[n] % 100];
            if (Math.abs(cap) === K) return MATE - ply;
            makeMove(b, mv[n]);
            var sc = -this.search(b, -side, depth - 1, -beta, -alpha, ply + 1);
            undoMove(b, mv[n], cap);
            if (this.stop) return 0;
            if (sc <= -MATE + 500) continue;                   // 이 수를 두면 내 궁이 잡힘 → 둘 수 없는 수
            any = true;
            if (sc > best) best = sc;
            if (sc > alpha) alpha = sc;
            if (alpha >= beta) break;
        }
        if (!any) {
            /* 둘 수가 없음: 장군이면 외통(짐), 아니면 한 수 쉼과 비슷하게 0점 */
            return inCheck(b, side) ? -MATE + ply : 0;
        }
        return best;
    };
    /* 컴퓨터가 둘 수 고르기
       level: "easy" | "normal" | "hard" */
    function bestMove(board, side, level) {
        var b = new Int8Array(board);
        var legal = legalMoves(b, side);
        if (!legal.length) return null;
        var conf = level === "easy" ? { depth: 1, time: 400, noise: 140 }
                 : level === "hard" ? { depth: 5, time: 1600, noise: 0 }
                 : { depth: 2, time: 800, noise: 25 };
        var s = new Searcher(conf);
        s.deadline = Date.now() + conf.time;
        var best = legal[0], bestScore = -Infinity;
        for (var d = 1; d <= conf.depth; d++) {
            var scores = [], localBest = null, localScore = -Infinity;
            var order = ordered(b, legal);
            if (best) order = [best].concat(order.filter(function (m) { return m !== best; }));
            for (var n = 0; n < order.length; n++) {
                var m = order[n], cap = makeMove(b, m);
                var sc = -s.search(b, -side, d - 1, -MATE - 1, MATE + 1, 1);
                undoMove(b, m, cap);
                if (s.stop) break;
                sc += conf.noise ? (Math.random() * 2 - 1) * conf.noise : 0;
                scores.push([m, sc]);
                if (sc > localScore) { localScore = sc; localBest = m; }
            }
            if (s.stop && d > 1) break;                          // 시간이 다 됐으면 바로 전 깊이 결과로
            if (localBest !== null) { best = localBest; bestScore = localScore; }
            if (bestScore >= MATE - 50) break;                    // 외통수를 찾았음
        }
        return best;
    }

    global.Janggi = {
        K: K, A: A, E: E, H: H, R: R, C: C, P: P, SCORE: SCORE,
        X: X, Y: Y, I: I, initialBoard: initialBoard, SETUPS: SETUPS,
        legalMoves: legalMoves, inCheck: inCheck, makeMove: makeMove, undoMove: undoMove,
        material: material, bestMove: bestMove, inPalace: inPalace, DIAG: DIAG
    };
})(typeof window !== "undefined" ? window : globalThis);

/* 웹 워커로 불렸을 때: 컴퓨터 수를 따로 계산해서 화면이 멈추지 않게 (janggi.js가 씀) */
if (typeof importScripts === "function" && typeof window === "undefined") {
    self.onmessage = function (e) {
        var d = e.data || {};
        var m = Janggi.bestMove(new Int8Array(d.board), d.side, d.level);
        self.postMessage({ id: d.id, move: m });
    };
}
