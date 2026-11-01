
(function () {
    "use strict";

    var root = document.getElementById("memo-widget");
    if (!root) return;

    /* ---------- 설정 ---------- */
    var STORAGE_KEY = "homepageMemo.v1";
    var MAX_TODOS = 100;       // 할 일 최대 개수
    var MAX_TODO_LEN = 60;     // 할 일 한 줄 최대 글자 수
    var MAX_MEMO_LEN = 3000;   // 메모 최대 글자 수
    var MAX_IMPORT_BYTES = 1000000;

    /* ---------- 요소 ---------- */
    var pad = root.querySelector(".memo-pad");
    var tabTodo = document.getElementById("memo-tab-todo");
    var tabNote = document.getElementById("memo-tab-note");
    var panelTodo = document.getElementById("memo-panel-todo");
    var panelNote = document.getElementById("memo-panel-note");
    var listEl = document.getElementById("memo-list");
    var inputEl = document.getElementById("memo-input");
    var addBtn = document.getElementById("memo-add-btn");
    var textEl = document.getElementById("memo-text");
    var exportBtn = document.getElementById("memo-export");
    var importBtn = document.getElementById("memo-import");
    var fileEl = document.getElementById("memo-file");
    var toastEl = document.getElementById("memo-toast");

    /* ---------- 상태 ---------- */
    var state = { todos: [], memo: "", tab: "todo" };
    var storageWarned = false;
    var saveTimer = null;
    var toastTimer = null;

    /* ---------- 도우미 ---------- */
    function newId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function cleanTodos(arr) {
        var out = [];
        if (!Array.isArray(arr)) return out;
        for (var i = 0; i < arr.length && out.length < MAX_TODOS; i++) {
            var t = arr[i];
            if (!t || typeof t.text !== "string") continue;
            var text = t.text.replace(/\s+/g, " ").trim().slice(0, MAX_TODO_LEN);
            if (!text) continue;
            out.push({ id: newId() + i, text: text, done: t.done === true });
        }
        return out;
    }

    function cleanMemo(s) {
        return typeof s === "string" ? s.slice(0, MAX_MEMO_LEN) : "";
    }

    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2600);
    }

    /* ---------- 저장 / 불러오기 ---------- */
    function save() {
        clearTimeout(saveTimer);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            if (!storageWarned) {
                storageWarned = true;
                toast("저장 공간을 쓸 수 없어요. 창을 닫으면 사라져요.");
            }
        }
    }

    function saveSoon() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(save, 300);
    }

    function load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            var d = JSON.parse(raw);
            if (!d || typeof d !== "object") return;
            state.todos = cleanTodos(d.todos);
            // 저장된 id와 완료 상태를 그대로 쓰기 위해 id 복원
            if (Array.isArray(d.todos)) {
                var k = 0;
                for (var i = 0; i < d.todos.length && k < state.todos.length; i++) {
                    var t = d.todos[i];
                    if (t && typeof t.text === "string" && t.text.replace(/\s+/g, " ").trim() && typeof t.id === "string") {
                        state.todos[k].id = t.id;
                        k++;
                    }
                }
            }
            state.memo = cleanMemo(d.memo);
            state.tab = d.tab === "note" ? "note" : "todo";
        } catch (e) { /* 저장된 값이 깨졌으면 빈 상태로 시작 */ }
    }

    /* ---------- 그리기 ---------- */
    function render() {
        var scrollTop = listEl.scrollTop;
        listEl.textContent = "";

        state.todos.forEach(function (todo) {
            var li = document.createElement("li");
            li.className = "memo-item" + (todo.done ? " done" : "");
            li.setAttribute("data-id", todo.id);

            var label = document.createElement("label");
            label.className = "memo-check";
            var cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = todo.done;
            cb.setAttribute("aria-label", todo.text + " 완료");
            var box = document.createElement("span");
            box.className = "memo-box";
            box.setAttribute("aria-hidden", "true");
            label.appendChild(cb);
            label.appendChild(box);

            var txt = document.createElement("span");
            txt.className = "memo-txt";
            txt.textContent = todo.text;
            txt.title = todo.text;

            var del = document.createElement("button");
            del.type = "button";
            del.className = "memo-del";
            del.setAttribute("aria-label", todo.text + " 삭제");
            del.textContent = "\u2715";

            li.appendChild(label);
            li.appendChild(txt);
            li.appendChild(del);
            listEl.appendChild(li);
        });

        listEl.scrollTop = scrollTop;

        var left = state.todos.filter(function (t) { return !t.done; }).length;
        tabTodo.textContent = left > 0 ? "할 일 " + left : "할 일";
    }

    function setTab(name, focus) {
        state.tab = name === "note" ? "note" : "todo";
        var isTodo = state.tab === "todo";

        tabTodo.setAttribute("aria-selected", isTodo ? "true" : "false");
        tabNote.setAttribute("aria-selected", isTodo ? "false" : "true");
        panelTodo.hidden = !isTodo;
        panelNote.hidden = isTodo;

        if (focus) (isTodo ? inputEl : textEl).focus();
    }

    /* ---------- 할 일 ---------- */
    function addTodo() {
        var text = inputEl.value.replace(/\s+/g, " ").trim().slice(0, MAX_TODO_LEN);
        if (!text) { inputEl.value = ""; inputEl.focus(); return; }

        if (state.todos.length >= MAX_TODOS) {
            toast("할 일은 최대 " + MAX_TODOS + "개까지 적을 수 있어요.");
            return;
        }

        state.todos.unshift({ id: newId(), text: text, done: false });
        inputEl.value = "";
        listEl.scrollTop = 0;
        render();
        listEl.scrollTop = 0;
        save();
        inputEl.focus();
    }

    function findIndex(id) {
        for (var i = 0; i < state.todos.length; i++) {
            if (state.todos[i].id === id) return i;
        }
        return -1;
    }

    listEl.addEventListener("change", function (e) {
        if (!e.target || e.target.type !== "checkbox") return;
        var li = e.target.closest(".memo-item");
        if (!li) return;
        var i = findIndex(li.getAttribute("data-id"));
        if (i < 0) return;
        state.todos[i].done = e.target.checked;
        render();
        save();
    });

    listEl.addEventListener("click", function (e) {
        var del = e.target.closest ? e.target.closest(".memo-del") : null;
        if (!del) return;
        var li = del.closest(".memo-item");
        if (!li) return;
        var i = findIndex(li.getAttribute("data-id"));
        if (i < 0) return;
        state.todos.splice(i, 1);
        render();
        save();
    });

    addBtn.addEventListener("click", addTodo);
    inputEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.isComposing) {
            e.preventDefault();
            addTodo();
        }
    });

    /* ---------- 메모 ---------- */
    textEl.addEventListener("input", function () {
        state.memo = cleanMemo(textEl.value);
        saveSoon();
    });
    textEl.addEventListener("blur", save);

    /* ---------- 탭 ---------- */
    tabTodo.addEventListener("click", function () { setTab("todo", true); save(); });
    tabNote.addEventListener("click", function () { setTab("note", true); save(); });

    [tabTodo, tabNote].forEach(function (tab) {
        tab.addEventListener("keydown", function (e) {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                var next = tab === tabTodo ? tabNote : tabTodo;
                next.focus();
                next.click();
            }
        });
    });

    /* ---------- 내보내기 ---------- */
    function pad2(n) { return (n < 10 ? "0" : "") + n; }

    exportBtn.addEventListener("click", function () {
        var now = new Date();
        var payload = {
            app: "homepage-memo",
            version: 1,
            exportedAt: now.toISOString(),
            todos: state.todos.map(function (t) { return { text: t.text, done: t.done }; }),
            memo: state.memo
        };

        try {
            var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url;
            a.download = "memo-backup-" + now.getFullYear() + pad2(now.getMonth() + 1) + pad2(now.getDate()) + ".json";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            toast("파일로 저장했어요.");
        } catch (e) {
            toast("내보내기에 실패했어요.");
        }
    });

    /* ---------- 가져오기 ---------- */
    importBtn.addEventListener("click", function () { fileEl.click(); });

    fileEl.addEventListener("change", function () {
        var file = fileEl.files && fileEl.files[0];
        fileEl.value = "";
        if (!file) return;

        if (file.size > MAX_IMPORT_BYTES) {
            toast("파일이 너무 커요. (1MB 이하)");
            return;
        }

        var reader = new FileReader();
        reader.onerror = function () { toast("파일을 읽지 못했어요."); };
        reader.onload = function () {
            var data;
            try { data = JSON.parse(String(reader.result)); } catch (e) { data = null; }

            if (!data || typeof data !== "object" || (!Array.isArray(data.todos) && typeof data.memo !== "string")) {
                toast("불러올 수 없는 파일이에요. 기존 내용은 그대로예요.");
                return;
            }

            applyImport(cleanTodos(data.todos), cleanMemo(data.memo));
        };
        reader.readAsText(file);
    });

    function applyImport(todos, memo) {
        var hasCurrent = state.todos.length > 0 || state.memo.trim() !== "";
        var overwrite = false;

        if (hasCurrent) {
            if (!window.confirm("가져온 내용을 지금 내용에 합칠까요?\n[확인] 합치기   [취소] 다음 단계")) {
                if (!window.confirm("지금 내용을 모두 지우고, 가져온 내용으로 바꿀까요?\n[확인] 덮어쓰기   [취소] 가져오기 중단")) {
                    toast("가져오기를 취소했어요.");
                    return;
                }
                overwrite = true;
            }
        }

        if (overwrite || !hasCurrent) {
            state.todos = todos;
            state.memo = memo;
        } else {
            // 합치기: 이미 있는 항목(같은 글, 같은 완료 상태)은 건너뛰어요.
            var seen = {};
            state.todos.forEach(function (t) { seen[t.text + "|" + t.done] = true; });
            var added = todos.filter(function (t) { return !seen[t.text + "|" + t.done]; });
            state.todos = added.concat(state.todos).slice(0, MAX_TODOS);

            if (memo && state.memo.indexOf(memo) === -1) {
                state.memo = cleanMemo(state.memo ? state.memo + "\n\n" + memo : memo);
            }
        }

        textEl.value = state.memo;
        render();
        save();
        toast("가져왔어요. (할 일 " + state.todos.length + "개)");
    }

    /* ---------- 왼쪽 스프링 코일 그리기 ---------- */
    function drawCoil() {
        var NS = "http://www.w3.org/2000/svg";
        var loops = 21, pitch = 14.3, a = 5, b = 9, cx = 11, y0 = 12, steps = 20;
        var d = "";
        var holes = "";
        var i, t, x, y;

        for (i = 0; i <= loops * steps; i++) {
            t = 2 * Math.PI * i / steps;
            x = cx + b * Math.cos(t);
            y = y0 + pitch * t / (2 * Math.PI) + a * Math.sin(t);
            d += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
        }

        var svg = document.createElementNS(NS, "svg");
        svg.setAttribute("class", "memo-coil");
        svg.setAttribute("viewBox", "0 0 30 320");
        svg.setAttribute("preserveAspectRatio", "none");   // 메모지 높이에 맞춰 끝까지 이어져요
        svg.setAttribute("aria-hidden", "true");

        for (i = 0; i <= loops; i++) {
            var hole = document.createElementNS(NS, "ellipse");
            hole.setAttribute("cx", String(cx + 7.8));
            hole.setAttribute("cy", (y0 + pitch * i).toFixed(1));
            hole.setAttribute("rx", "2.3");
            hole.setAttribute("ry", "3");
            hole.setAttribute("fill", "#4a3d10");
            svg.appendChild(hole);
        }

        var dark = document.createElementNS(NS, "path");
        dark.setAttribute("d", d);
        dark.setAttribute("fill", "none");
        dark.setAttribute("stroke", "#6f757d");
        dark.setAttribute("stroke-width", "2.6");
        dark.setAttribute("stroke-linejoin", "round");
        dark.setAttribute("stroke-linecap", "round");
        svg.appendChild(dark);

        var light = document.createElementNS(NS, "path");
        light.setAttribute("d", d);
        light.setAttribute("fill", "none");
        light.setAttribute("stroke", "#e6e9ed");
        light.setAttribute("stroke-width", "0.9");
        light.setAttribute("stroke-linejoin", "round");
        light.setAttribute("stroke-linecap", "round");
        light.setAttribute("transform", "translate(-0.5,-0.5)");
        svg.appendChild(light);

        pad.insertBefore(svg, pad.firstChild);
    }

    /* ---------- 시작 ---------- */
    drawCoil();
    load();
    textEl.value = state.memo;
    render();
    setTab(state.tab, false);

    // 창을 닫거나 다른 탭으로 가기 전에 마지막으로 저장
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") save();
    });
})();
