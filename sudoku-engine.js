/* =========================================================
   스도쿠 엔진 (sudoku.html / sudoku-en.html, 2026-11-27)
   - 문제 만들기: 씨앗(seed)이 같으면 언제나 같은 문제 → "오늘의 문제"는 날짜를 씨앗으로 써서 모두에게 같은 문제
   - 답이 딱 하나인 문제만 만듦 (풀이 개수 세기)
   - 난이도: 사람이 쓰는 풀이 기술로 판정
       1 = 하나만 남은 칸 / 하나만 남은 자리 (naked·hidden single)
       2 = 줄과 상자 겹치기(pointing·claiming), 짝 숫자(naked pair)
       3 = X-윙
       4 = 위 기술로 안 풀림 (전문가)
   - 이 파일은 화면과 상관없이 window.SudokuEngine 으로만 쓰여요
   ========================================================= */
(function () {
    "use strict";
    const ROW = [], COL = [], BOX = [], PEERS = [], UNITS = [];
    for (let i = 0; i < 81; i++) { ROW[i] = (i / 9) | 0; COL[i] = i % 9; BOX[i] = ((ROW[i] / 3) | 0) * 3 + ((COL[i] / 3) | 0); }
    for (let k = 0; k < 9; k++) {
        const r = [], c = [], b = [];
        for (let i = 0; i < 81; i++) { if (ROW[i] === k) r.push(i); if (COL[i] === k) c.push(i); if (BOX[i] === k) b.push(i); }
        UNITS.push(r, c, b);
    }
    for (let i = 0; i < 81; i++) {
        const s = new Set();
        for (let j = 0; j < 81; j++) if (j !== i && (ROW[j] === ROW[i] || COL[j] === COL[i] || BOX[j] === BOX[i])) s.add(j);
        PEERS[i] = Array.from(s);
    }
    const ALL = 0x3fe;                         // 비트 1~9
    const bit = d => 1 << d;
    function popcnt(m) { let n = 0; while (m) { m &= m - 1; n++; } return n; }
    function digits(m) { const out = []; for (let d = 1; d <= 9; d++) if (m & (1 << d)) out.push(d); return out; }

    /* 씨앗 있는 난수 (mulberry32) */
    function rngFrom(seed) {
        let h = 1779033703 ^ seed.length;
        for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
        let a = h >>> 0;
        return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }
    function shuffle(a, rnd) { for (let i = a.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

    /* 풀이 개수 세기 (limit개 찾으면 멈춤) */
    function countSolutions(g, limit) {
        const grid = g.slice(), rm = new Array(9).fill(0), cm = new Array(9).fill(0), bm = new Array(9).fill(0);
        for (let i = 0; i < 81; i++) { const v = grid[i]; if (v) { const b = bit(v); if ((rm[ROW[i]] | cm[COL[i]] | bm[BOX[i]]) & b) return 0; rm[ROW[i]] |= b; cm[COL[i]] |= b; bm[BOX[i]] |= b; } }
        let count = 0;
        (function go() {
            if (count >= limit) return;
            let best = -1, bestM = 0, bestN = 10;
            for (let i = 0; i < 81; i++) {
                if (grid[i]) continue;
                const m = ALL & ~(rm[ROW[i]] | cm[COL[i]] | bm[BOX[i]]), n = popcnt(m);
                if (n < bestN) { best = i; bestM = m; bestN = n; if (n <= 1) break; }
            }
            if (best < 0) { count++; return; }
            if (!bestN) return;
            for (let d = 1; d <= 9; d++) {
                if (!(bestM & bit(d))) continue;
                const b = bit(d);
                grid[best] = d; rm[ROW[best]] |= b; cm[COL[best]] |= b; bm[BOX[best]] |= b;
                go();
                grid[best] = 0; rm[ROW[best]] &= ~b; cm[COL[best]] &= ~b; bm[BOX[best]] &= ~b;
                if (count >= limit) return;
            }
        })();
        return count;
    }
    function solve(g) {
        const grid = g.slice();
        const ok = (function go() {
            let best = -1, bestM = 0, bestN = 10;
            for (let i = 0; i < 81; i++) {
                if (grid[i]) continue;
                let m = ALL; for (const p of PEERS[i]) if (grid[p]) m &= ~bit(grid[p]);
                const n = popcnt(m); if (n < bestN) { best = i; bestM = m; bestN = n; if (n <= 1) break; }
            }
            if (best < 0) return true;
            for (const d of digits(bestM)) { grid[best] = d; if (go()) return true; }
            grid[best] = 0; return false;
        })();
        return ok ? grid : null;
    }

    /* 꽉 찬 정답판 */
    function fullGrid(rnd) {
        const grid = new Array(81).fill(0);
        (function go(i) {
            if (i === 81) return true;
            let m = ALL; for (const p of PEERS[i]) if (grid[p]) m &= ~bit(grid[p]);
            for (const d of shuffle(digits(m), rnd)) { grid[i] = d; if (go(i + 1)) return true; }
            grid[i] = 0; return false;
        })(0);
        return grid;
    }

    /* 숫자 지우기 (대칭으로), 답이 하나일 때만 */
    function dig(sol, rnd, minClues) {
        const g = sol.slice();
        const order = shuffle(Array.from({ length: 41 }, (_, i) => i), rnd);   // 0~40 (40은 가운데)
        let clues = 81;
        for (const i of order) {
            if (clues <= minClues) break;
            const j = 80 - i, a = g[i], b = g[j];
            g[i] = 0; g[j] = 0;
            if (countSolutions(g, 2) !== 1) { g[i] = a; g[j] = b; }
            else clues -= (i === j ? 1 : 2);
        }
        return g;
    }

    /* ---------- 사람 방식 풀이 (난이도 판정 + 힌트) ---------- */
    function candidates(g) {
        const c = new Array(81).fill(0);
        for (let i = 0; i < 81; i++) {
            if (g[i]) continue;
            let m = ALL; for (const p of PEERS[i]) if (g[p]) m &= ~bit(g[p]);
            c[i] = m;
        }
        return c;
    }
    /* 한 걸음: {type, i, d, unit?} 또는 후보 지우기 {type, elim:true} 또는 null */
    function step(g, c) {
        // 1) 하나만 남은 칸
        for (let i = 0; i < 81; i++) if (!g[i] && popcnt(c[i]) === 1) return { type: "naked", level: 1, i: i, d: digits(c[i])[0] };
        // 1) 하나만 남은 자리
        for (let u = 0; u < 27; u++) {
            for (let d = 1; d <= 9; d++) {
                let where = -1, n = 0;
                for (const i of UNITS[u]) { if (g[i] === d) { n = -1; break; } if (!g[i] && (c[i] & bit(d))) { where = i; n++; } }
                if (n === 1) return { type: "hidden", level: 1, i: where, d: d, unit: u };
            }
        }
        // 2) 줄·상자 겹치기 (pointing / claiming)
        for (let b = 0; b < 9; b++) {
            const box = UNITS[b * 3 + 2];
            for (let d = 1; d <= 9; d++) {
                const cells = box.filter(i => !g[i] && (c[i] & bit(d))); if (cells.length < 2) continue;
                const rows = new Set(cells.map(i => ROW[i])), cols = new Set(cells.map(i => COL[i]));
                let changed = false;
                if (rows.size === 1) { for (const i of UNITS[ROW[cells[0]] * 3]) if (BOX[i] !== b && !g[i] && (c[i] & bit(d))) { c[i] &= ~bit(d); changed = true; } }
                if (cols.size === 1) { for (const i of UNITS[COL[cells[0]] * 3 + 1]) if (BOX[i] !== b && !g[i] && (c[i] & bit(d))) { c[i] &= ~bit(d); changed = true; } }
                if (changed) return { type: "pointing", level: 2, elim: true };
            }
        }
        for (let u = 0; u < 27; u++) {
            if (u % 3 === 2) continue;           // 가로·세로 줄만
            for (let d = 1; d <= 9; d++) {
                const cells = UNITS[u].filter(i => !g[i] && (c[i] & bit(d))); if (cells.length < 2) continue;
                const boxes = new Set(cells.map(i => BOX[i]));
                if (boxes.size !== 1) continue;
                let changed = false;
                for (const i of UNITS[BOX[cells[0]] * 3 + 2]) if (UNITS[u].indexOf(i) < 0 && !g[i] && (c[i] & bit(d))) { c[i] &= ~bit(d); changed = true; }
                if (changed) return { type: "claiming", level: 2, elim: true };
            }
        }
        // 2) 짝 숫자 (naked pair)
        for (let u = 0; u < 27; u++) {
            const cells = UNITS[u].filter(i => !g[i] && popcnt(c[i]) === 2);
            for (let a = 0; a < cells.length; a++) for (let b2 = a + 1; b2 < cells.length; b2++) {
                if (c[cells[a]] !== c[cells[b2]]) continue;
                const m = c[cells[a]]; let changed = false;
                for (const i of UNITS[u]) if (i !== cells[a] && i !== cells[b2] && !g[i] && (c[i] & m)) { c[i] &= ~m; changed = true; }
                if (changed) return { type: "pair", level: 2, elim: true };
            }
        }
        // 3) X-윙
        for (let d = 1; d <= 9; d++) {
            for (const mode of [0, 1]) {   // 0: 가로 기준, 1: 세로 기준
                const lines = [];
                for (let k = 0; k < 9; k++) {
                    const pos = [];
                    for (let x = 0; x < 9; x++) { const i = mode ? x * 9 + k : k * 9 + x; if (!g[i] && (c[i] & bit(d))) pos.push(x); }
                    lines.push(pos);
                }
                for (let a = 0; a < 9; a++) for (let b2 = a + 1; b2 < 9; b2++) {
                    const A = lines[a], B = lines[b2];
                    if (A.length !== 2 || B.length !== 2 || A[0] !== B[0] || A[1] !== B[1]) continue;
                    let changed = false;
                    for (const x of A) for (let k = 0; k < 9; k++) {
                        if (k === a || k === b2) continue;
                        const i = mode ? x * 9 + k : k * 9 + x;
                        if (!g[i] && (c[i] & bit(d))) { c[i] &= ~bit(d); changed = true; }
                    }
                    if (changed) return { type: "xwing", level: 3, elim: true };
                }
            }
        }
        return null;
    }
    /* 난이도 판정: 1~3 = 쓴 기술 중 가장 어려운 것, 4 = 논리로 못 풂 */
    function grade(puzzle) {
        const g = puzzle.slice(), c = candidates(g);
        let level = 1, guard = 0;
        while (guard++ < 2000) {
            if (g.every(v => v)) return level;
            const s = step(g, c);
            if (!s) return 4;
            level = Math.max(level, s.level);
            if (!s.elim) {
                g[s.i] = s.d; c[s.i] = 0;
                for (const p of PEERS[s.i]) c[p] &= ~bit(s.d);
            }
        }
        return 4;
    }

    const LEVELS = {
        easy:   { min: 38, ok: (gr, cl) => gr === 1 && cl >= 36 },
        mid:    { min: 30, ok: (gr, cl) => gr <= 2 && cl <= 33 && cl >= 29 },
        hard:   { min: 25, ok: (gr, cl) => (gr === 2 || gr === 3) && cl <= 28 },
        expert: { min: 22, ok: (gr, cl) => gr >= 3 && cl <= 26 }
    };
    /* 문제 만들기 → {puzzle, solution, level, grade, clues} */
    function generate(level, seed) {
        const L = LEVELS[level] || LEVELS.mid, rnd = rngFrom(String(seed));
        let best = null;
        for (let t = 0; t < 60; t++) {
            const sol = fullGrid(rnd), puz = dig(sol, rnd, L.min);
            const cl = puz.filter(v => v).length, gr = grade(puz);
            const item = { puzzle: puz, solution: sol, level: level, grade: gr, clues: cl };
            if (L.ok(gr, cl)) return item;
            // 가장 가까운 것 기억 (못 찾을 때 대비)
            const want = level === "easy" ? 1 : level === "mid" ? 2 : level === "hard" ? 3 : 4;
            if (!best || Math.abs(gr - want) < Math.abs(best.grade - want)) best = item;
        }
        return best;
    }

    window.SudokuEngine = { generate, grade, step, candidates, solve, countSolutions, ROW, COL, BOX, PEERS, UNITS, digits, bit, popcnt, rngFrom };
})();
