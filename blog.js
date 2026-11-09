// 블로그 화면 그리기 (글 목록은 posts.js)
//  - 홈 왼쪽 칸   : 슬라이드 메뉴 (최신 글 / 카테고리 → 작은 분류 → 글)
//  - blog.html    : 전체 글 목록 (카테고리 탭, 작은 분류 칩)
//  - 글 페이지     : 이전 글 / 다음 글, 주식 글 안내 문구
(function () {
    "use strict";

    var B = window.BLOG;
    if (!B) return;

    // 글 페이지는 posts 폴더 안에 있어서 주소 앞에 "../" 가 필요해요.
    var BASE = document.body.getAttribute("data-base") || "";

    var posts = B.posts.slice().sort(function (a, b) {
        return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
    });

    function cat(id) { return B.cats.find(function (c) { return c.id === id; }); }
    function subName(c, id) {
        var s = c && c.subs.find(function (x) { return x.id === id; });
        return s ? s.name : "";
    }
    function postUrl(p) { return BASE + "posts/" + p.id + ".html"; }
    function shortDate(d) { return d.slice(5).replace("-", "."); }
    function fullDate(d) { return d.replace(/-/g, "."); }

    function h(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    var CHEVRON = '<svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    /* =====================================================
       1) 홈 왼쪽 칸: 슬라이드 메뉴
       ===================================================== */
    var acc = document.getElementById("bb-acc");
    if (acc) {
        var uid = 0;

        // 막대 하나 + 펼쳐지는 내용 (level: 1 큰 막대, 2 작은 막대)
        function section(level, label, count, color, fillBody) {
            var sec = h("section", "bb-sec bb-l" + level);
            var bar = h("button", "bb-bar");
            bar.type = "button";
            var bodyId = "bb-body-" + (++uid);
            bar.setAttribute("aria-expanded", "false");
            bar.setAttribute("aria-controls", bodyId);
            if (color) {
                var dot = h("span", "bb-dot");
                dot.style.background = color;
                bar.appendChild(dot);
            }
            bar.appendChild(h("span", "bb-name", label));
            bar.appendChild(h("span", "bb-cnt", String(count)));
            var chev = h("span", "bb-chev");
            chev.innerHTML = CHEVRON;
            bar.appendChild(chev);

            var body = h("div", "bb-body");
            body.id = bodyId;
            var inner = h("div", "bb-body-in");
            body.appendChild(inner);
            fillBody(inner);

            sec.appendChild(bar);
            sec.appendChild(body);

            bar.addEventListener("click", function () {
                var open = !sec.classList.contains("open");
                // 같은 줄의 다른 막대는 닫아요 (한 번에 하나만 펼침)
                Array.prototype.forEach.call(sec.parentNode.children, function (s) {
                    if (s !== sec && s.classList.contains("bb-sec")) setOpen(s, false);
                });
                setOpen(sec, open);
            });
            return sec;
        }

        function setOpen(sec, open) {
            sec.classList.toggle("open", open);
            var bar = sec.querySelector(":scope > .bb-bar");
            if (bar) bar.setAttribute("aria-expanded", open ? "true" : "false");
        }

        function postList(list, max) {
            var ul = h("ul", "bb-posts");
            list.slice(0, max || 6).forEach(function (p) {
                var li = h("li");
                var a = h("a", "bb-post");
                a.href = postUrl(p);
                a.appendChild(h("span", "bb-date", shortDate(p.date)));
                a.appendChild(h("span", "bb-title", p.title));
                li.appendChild(a);
                ul.appendChild(li);
            });
            return ul;
        }

        function emptyNote(text) { return h("p", "bb-empty", text); }

        function moreLink(href, text) {
            var a = h("a", "bb-more", text);
            a.href = href;
            return a;
        }

        // 최신 글
        acc.appendChild(section(1, "최신 글", posts.length, null, function (inner) {
            if (posts.length) inner.appendChild(postList(posts, 6));
            else inner.appendChild(emptyNote("첫 글을 준비하고 있어요."));
            inner.appendChild(moreLink(BASE + "blog.html", "전체 글 보기 →"));
        }));

        // 카테고리 → 작은 분류 → 글
        B.cats.forEach(function (c) {
            var inCat = posts.filter(function (p) { return p.cat === c.id; });
            acc.appendChild(section(1, c.name, inCat.length, c.color, function (inner) {
                var subsWithPosts = c.subs.filter(function (s) {
                    return inCat.some(function (p) { return p.sub === s.id; });
                });
                if (!inCat.length) {
                    inner.appendChild(emptyNote("첫 글을 준비하고 있어요."));
                } else {
                    var box = h("div", "bb-subs");
                    subsWithPosts.forEach(function (s) {
                        var list = inCat.filter(function (p) { return p.sub === s.id; });
                        box.appendChild(section(2, s.name, list.length, null, function (sin) {
                            sin.appendChild(postList(list, 6));
                            if (list.length > 6) {
                                sin.appendChild(moreLink(BASE + "blog.html?cat=" + c.id + "&sub=" + s.id, "더 보기 →"));
                            }
                        }));
                    });
                    // 작은 분류가 없는 글
                    var loose = inCat.filter(function (p) { return !subName(c, p.sub); });
                    if (loose.length) box.appendChild(postList(loose, 6));
                    inner.appendChild(box);
                }
                inner.appendChild(moreLink(BASE + "blog.html?cat=" + c.id, c.name + " 전체 보기 →"));
            }));
        });

        // 처음에는 "최신 글"을 펼쳐 둬요.
        setOpen(acc.firstElementChild, true);
    }

    /* =====================================================
       2) blog.html: 전체 글 목록
       ===================================================== */
    var listEl = document.getElementById("blog-list");
    if (listEl) {
        var q = new URLSearchParams(location.search);
        var curCat = q.get("cat") || "all";
        var curSub = q.get("sub") || "all";
        var tabs = document.getElementById("blog-tabs");
        var chips = document.getElementById("blog-chips");
        var ink = h("span", "bt-ink");

        function go(c, s) {
            curCat = c; curSub = s || "all";
            var u = new URL(location.href);
            u.search = "";
            if (curCat !== "all") u.searchParams.set("cat", curCat);
            if (curSub !== "all") u.searchParams.set("sub", curSub);
            history.replaceState(null, "", u);
            render();
        }

        function tab(id, label, color) {
            var b = h("button", "bt-tab", label);
            b.type = "button";
            b.dataset.cat = id;
            if (color) b.style.setProperty("--c", color);
            b.addEventListener("click", function () { go(id); });
            return b;
        }

        tabs.appendChild(tab("all", "전체"));
        B.cats.forEach(function (c) { tabs.appendChild(tab(c.id, c.name, c.color)); });
        tabs.appendChild(ink);

        function moveInk() {
            var act = tabs.querySelector(".bt-tab.on");
            if (!act) return;
            ink.style.width = act.offsetWidth + "px";
            ink.style.transform = "translateX(" + act.offsetLeft + "px)";
            ink.style.background = getComputedStyle(act).getPropertyValue("--c") || "";
        }
        window.addEventListener("resize", moveInk);

        function render() {
            Array.prototype.forEach.call(tabs.querySelectorAll(".bt-tab"), function (b) {
                b.classList.toggle("on", b.dataset.cat === curCat);
            });
            moveInk();

            // 작은 분류 칩
            chips.innerHTML = "";
            var c = cat(curCat);
            if (c) {
                [{ id: "all", name: "전체" }].concat(c.subs).forEach(function (s) {
                    var n = posts.filter(function (p) { return p.cat === c.id && (s.id === "all" || p.sub === s.id); }).length;
                    var b = h("button", "bc-chip" + (curSub === s.id ? " on" : ""), s.name + " " + n);
                    b.type = "button";
                    b.addEventListener("click", function () { go(c.id, s.id); });
                    chips.appendChild(b);
                });
            }
            chips.hidden = !c;

            // 글 카드
            var list = posts.filter(function (p) {
                return (curCat === "all" || p.cat === curCat) && (curSub === "all" || p.sub === curSub);
            });
            listEl.innerHTML = "";
            if (!list.length) {
                listEl.appendChild(h("p", "bl-empty", "아직 글이 없어요. 곧 채워질 거예요."));
                return;
            }
            list.forEach(function (p) {
                var pc = cat(p.cat);
                var a = h("a", "bl-card" + (p.thumb ? " has-thumb" : ""));
                a.href = postUrl(p);
                if (p.thumb) {
                    var th = h("span", "bl-thumb");
                    th.style.backgroundImage = "url('" + BASE + p.thumb + "')";
                    a.appendChild(th);
                }
                var tx = h("span", "bl-text");
                var meta = h("span", "bl-meta");
                var tag = h("span", "bl-cat", pc ? pc.name + (subName(pc, p.sub) ? " · " + subName(pc, p.sub) : "") : "");
                if (pc) tag.style.setProperty("--c", pc.color);
                meta.appendChild(tag);
                meta.appendChild(h("span", "bl-date", fullDate(p.date)));
                tx.appendChild(meta);
                tx.appendChild(h("strong", "bl-title", p.title));
                if (p.summary) tx.appendChild(h("span", "bl-sum", p.summary));
                a.appendChild(tx);
                listEl.appendChild(a);
            });
        }
        render();
        // 글꼴이 늦게 불러와지면 밑줄 위치를 다시 맞춰요.
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveInk);
    }

    /* =====================================================
       3) 글 페이지: 분류 표시, 이전/다음 글, 주식 안내
       ===================================================== */
    var postId = document.body.getAttribute("data-post");
    if (postId) {
        var idx = posts.findIndex(function (p) { return p.id === postId; });
        var me = posts[idx];
        if (me) {
            var c2 = cat(me.cat);

            var crumb = document.getElementById("post-crumb");
            if (crumb && c2) {
                crumb.innerHTML = "";
                var parts = [
                    ["홈", BASE + "index.html"],
                    ["블로그", BASE + "blog.html"],
                    [c2.name, BASE + "blog.html?cat=" + c2.id]
                ];
                if (subName(c2, me.sub)) parts.push([subName(c2, me.sub), BASE + "blog.html?cat=" + c2.id + "&sub=" + me.sub]);
                parts.forEach(function (pt, i) {
                    if (i) crumb.appendChild(h("span", "pc-sep", "›"));
                    var a = h("a", null, pt[0]);
                    a.href = pt[1];
                    crumb.appendChild(a);
                });
            }

            var tagEl = document.getElementById("post-cat");
            if (tagEl && c2) {
                tagEl.textContent = c2.name + (subName(c2, me.sub) ? " · " + subName(c2, me.sub) : "");
                tagEl.style.setProperty("--c", c2.color);
            }
            var dateEl = document.getElementById("post-date");
            if (dateEl) dateEl.textContent = fullDate(me.date);

            if (me.cat === "stock") {
                var art = document.querySelector(".post-body");
                if (art) {
                    var note = h("p", "post-disclaimer",
                        "이 글은 개인적인 투자 기록과 생각을 적은 것이며, 특정 종목의 매수·매도를 권하는 글이 아닙니다. 투자 판단과 책임은 본인에게 있습니다.");
                    art.appendChild(note);
                }
            }

            var nav = document.getElementById("post-nav");
            if (nav) {
                var newer = posts[idx - 1], older = posts[idx + 1];
                function navLink(p, label, cls) {
                    var a = h("a", "pn-link " + cls);
                    if (p) { a.href = postUrl(p); } else { a.classList.add("off"); }
                    a.appendChild(h("span", "pn-label", label));
                    a.appendChild(h("span", "pn-title", p ? p.title : "없음"));
                    return a;
                }
                nav.appendChild(navLink(older, "← 이전 글", "pn-prev"));
                var mid = h("a", "pn-list", "목록");
                mid.href = BASE + "blog.html" + (c2 ? "?cat=" + c2.id : "");
                nav.appendChild(mid);
                nav.appendChild(navLink(newer, "다음 글 →", "pn-next"));
            }
        }
    }
})();
