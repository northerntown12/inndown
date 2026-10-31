/* ===== 날씨 정보 (Open-Meteo, API 키 필요 없음) ===== */
(function () {
    "use strict";

    var widget = document.getElementById("weather-widget");
    if (!widget) return;

    var fxEl = document.getElementById("weather-fx");
    var inputEl = document.getElementById("weather-input");
    var toggleBtn = document.getElementById("weather-toggle");
    var searchBtn = document.getElementById("weather-search");
    var searchRow = document.getElementById("weather-searchrow");
    var dropdownEl = document.getElementById("weather-dropdown");
    var placeEl = document.getElementById("weather-place");
    var iconEl = document.getElementById("weather-icon");
    var tempEl = document.getElementById("weather-temp");
    var descEl = document.getElementById("weather-desc");
    var feelEl = document.getElementById("weather-feel");
    var humEl = document.getElementById("weather-hum");
    var windEl = document.getElementById("weather-wind");
    var msgEl = document.getElementById("weather-msg");
    var forecastEl = document.getElementById("weather-forecast-list");
    var tipEl = document.getElementById("weather-tip");
    var tipTimer = null;
    var tipOwner = null;
    var DEFAULT_NOTE = "업데이트 주기: 10분";

    function normalize(text) {
        return String(text).toLowerCase().replace(/\s+/g, "");
    }

    /* 목록에 나오는 지역들 (인구 많은 대도시 20곳 + 천안 수신면, 제주) */
    var PRESETS = [
        { label: "서울",   lat: 37.5665, lon: 126.9780 },
        { label: "부산",   lat: 35.1796, lon: 129.0756 },
        { label: "인천",   lat: 37.4563, lon: 126.7052 },
        { label: "대구",   lat: 35.8714, lon: 128.6014 },
        { label: "대전",   lat: 36.3504, lon: 127.3845 },
        { label: "광주",   lat: 35.1595, lon: 126.8526 },
        { label: "울산",   lat: 35.5384, lon: 129.3114 },
        { label: "수원",   lat: 37.2636, lon: 127.0286 },
        { label: "창원",   lat: 35.2279, lon: 128.6811 },
        { label: "고양",   lat: 37.6584, lon: 126.8320 },
        { label: "용인",   lat: 37.2411, lon: 127.1776 },
        { label: "성남",   lat: 37.4200, lon: 127.1265 },
        { label: "청주",   lat: 36.6424, lon: 127.4890 },
        { label: "부천",   lat: 37.5034, lon: 126.7660 },
        { label: "화성",   lat: 37.1996, lon: 126.8312 },
        { label: "안산",   lat: 37.3219, lon: 126.8309 },
        { label: "남양주", lat: 37.6360, lon: 127.2165 },
        { label: "안양",   lat: 37.3943, lon: 126.9568 },
        { label: "전주",   lat: 35.8242, lon: 127.1480 },
        { label: "천안",   lat: 36.8151, lon: 127.1139, aliases: ["cheonan"] },
        // ※ 수신면 좌표는 장산리(홍대용과학관) 부근 값이라 대략적이에요. 정확히 바꾸려면 lat, lon을 수정하세요.
        { label: "천안 수신면", lat: 36.7396, lon: 127.2960, aliases: ["수신면", "천안시수신면", "충남천안수신면"] },
        { label: "제주",   lat: 33.4996, lon: 126.5312, aliases: ["제주도", "제주시"] }
    ];

    /* 검색용 이름(공백 제거)을 미리 만들어 둬요: 이름, 이름+시, 별칭 */
    PRESETS.forEach(function (p) {
        var base = normalize(p.label);
        p.keys = [base, base + "시"];
        (p.aliases || []).forEach(function (a) { p.keys.push(normalize(a)); });
    });

    var STORAGE_KEY = "weatherPlace";
    var DEFAULT_PLACE = PRESETS.filter(function (p) { return p.label === "천안"; })[0];
    var currentPlace = DEFAULT_PLACE;
    var requestId = 0;

    /* WMO 날씨 코드 -> 설명, 아이콘, 배경 종류 */
    function describe(code, isDay) {
        var day = !!isDay;
        switch (code) {
            case 0:  return { text: "맑음", icon: day ? "☀️" : "🌙", cond: "clear" };
            case 1:  return { text: "대체로 맑음", icon: day ? "🌤️" : "🌙", cond: "clear" };
            case 2:  return { text: "구름 조금", icon: day ? "⛅" : "☁️", cond: "partly" };
            case 3:  return { text: "흐림", icon: "☁️", cond: "cloudy" };
            case 45:
            case 48: return { text: "안개", icon: "🌫️", cond: "fog" };
            case 51:
            case 53:
            case 55: return { text: "이슬비", icon: "🌦️", cond: "rain" };
            case 56:
            case 57: return { text: "어는 이슬비", icon: "🌧️", cond: "rain" };
            case 61: return { text: "약한 비", icon: "🌧️", cond: "rain" };
            case 63: return { text: "비", icon: "🌧️", cond: "rain" };
            case 65: return { text: "강한 비", icon: "🌧️", cond: "rain" };
            case 66:
            case 67: return { text: "어는 비", icon: "🌧️", cond: "rain" };
            case 71: return { text: "약한 눈", icon: "🌨️", cond: "snow" };
            case 73: return { text: "눈", icon: "🌨️", cond: "snow" };
            case 75: return { text: "강한 눈", icon: "❄️", cond: "snow" };
            case 77: return { text: "싸락눈", icon: "❄️", cond: "snow" };
            case 80:
            case 81: return { text: "소나기", icon: "🌦️", cond: "rain" };
            case 82: return { text: "강한 소나기", icon: "🌧️", cond: "rain" };
            case 85:
            case 86: return { text: "소낙눈", icon: "🌨️", cond: "snow" };
            case 95: return { text: "천둥번개", icon: "⛈️", cond: "storm" };
            case 96:
            case 99: return { text: "우박 동반 천둥번개", icon: "⛈️", cond: "storm" };
            default: return { text: "날씨 정보 없음", icon: "🌡️", cond: "partly" };
        }
    }

    /* 비 / 눈 입자 만들기 */
    function setParticles(cond) {
        fxEl.innerHTML = "";

        var type = null;
        var count = 0;

        if (cond === "rain")  { type = "drop";  count = 16; }
        if (cond === "storm") { type = "drop";  count = 22; }
        if (cond === "snow")  { type = "flake"; count = 20; }

        if (!type) return;

        for (var i = 0; i < count; i++) {
            var span = document.createElement("span");
            span.className = type;
            span.style.left = Math.random() * 100 + "%";
            span.style.animationDelay = (-Math.random() * 3).toFixed(2) + "s";

            if (type === "drop") {
                span.style.animationDuration = (0.7 + Math.random() * 0.5).toFixed(2) + "s";
            } else {
                span.style.animationDuration = (3 + Math.random() * 3).toFixed(2) + "s";
                var size = 3 + Math.random() * 4;
                span.style.width = span.style.height = size.toFixed(1) + "px";
            }

            fxEl.appendChild(span);
        }
    }

    function setMessage(text) {
        msgEl.textContent = text || DEFAULT_NOTE;
    }

    /* 예보 칸을 누르면(폰) 또는 키보드로 선택하면 간단한 설명을 말풍선으로 보여줘요. */
    function hideTip() {
        if (tipTimer !== null) {
            clearTimeout(tipTimer);
            tipTimer = null;
        }
        tipOwner = null;
        tipEl.hidden = true;
    }

    function toggleTip(box, text) {
        if (!tipEl.hidden && tipOwner === box) {
            hideTip();
            return;
        }

        hideTip();
        tipOwner = box;
        tipEl.textContent = text;
        tipEl.hidden = false;

        // 눌린 칸의 왼쪽, 세로 가운데에 붙여요.
        var w = widget.getBoundingClientRect();
        var b = box.getBoundingClientRect();
        tipEl.style.right = (w.right - b.left + 4) + "px";
        tipEl.style.top = (b.top - w.top + b.height / 2) + "px";

        tipTimer = setTimeout(hideTip, 3000);
    }

    function pad2(n) { return n < 10 ? "0" + n : String(n); }

    // "2026-11-01"에 n일을 더한 날짜 문자열
    function addDays(dateStr, n) {
        var p = dateStr.split("-");
        var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
        return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
    }

    /* 오른쪽 작은 네모칸: 해당 지역의 아침 6시 예보
       - 지역 현지 시각이 06시 이전(자정~새벽)이면 "오늘"도 함께 보여줘요.
       - 그 외에는 "내일", "모레"만 보여줘요. */
    function renderForecast(current, hourly) {
        hideTip();
        forecastEl.innerHTML = "";

        var nowText = String(current.time || "");
        var today = nowText.slice(0, 10);
        var hour = parseInt(nowText.slice(11, 13), 10);

        if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return;

        var days = [];
        if (!isNaN(hour) && hour < 6) days.push({ label: "오늘", date: today });
        days.push({ label: "내일", date: addDays(today, 1) });
        days.push({ label: "모레", date: addDays(today, 2) });

        days.forEach(function (day) {
            var idx = hourly && hourly.time ? hourly.time.indexOf(day.date + "T06:00") : -1;

            var box = document.createElement("div");
            box.className = "weather-fbox";

            var label = document.createElement("span");
            label.className = "fb-label";
            label.textContent = day.label;

            var row = document.createElement("span");
            row.className = "fb-row";

            var icon = document.createElement("span");
            icon.className = "fb-icon";

            var temp = document.createElement("span");
            temp.className = "fb-temp";

            var tipText = "예보를 받아오지 못했어요";

            if (idx === -1) {
                icon.textContent = "-";
                temp.textContent = "--";
            } else {
                var info = describe(hourly.weather_code[idx], hourly.is_day ? hourly.is_day[idx] : 1);
                icon.textContent = info.icon;
                temp.textContent = Math.round(hourly.temperature_2m[idx]) + "°";
                box.title = day.label + " 오전 6시: " + info.text;
                tipText = info.text;
            }

            box.setAttribute("role", "button");
            box.tabIndex = 0;
            box.addEventListener("click", function () {
                toggleTip(box, tipText);
            });
            box.addEventListener("keydown", function (e) {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleTip(box, tipText);
                }
            });

            row.appendChild(icon);
            row.appendChild(temp);
            box.appendChild(label);
            box.appendChild(row);
            forecastEl.appendChild(box);
        });
    }

    function render(place, current, hourly) {
        var info = describe(current.weather_code, current.is_day);

        widget.setAttribute("data-cond", info.cond);
        widget.setAttribute("data-night", current.is_day ? "0" : "1");
        setParticles(info.cond);

        placeEl.textContent = place.label;
        iconEl.textContent = info.icon;
        tempEl.textContent = Math.round(current.temperature_2m) + "°";
        descEl.textContent = info.text;
        feelEl.textContent = Math.round(current.apparent_temperature) + "°";
        humEl.textContent = Math.round(current.relative_humidity_2m) + "%";
        windEl.textContent = Number(current.wind_speed_10m).toFixed(1) + "m/s";
        renderForecast(current, hourly);
        setMessage("");
    }

    function loadWeather(place) {
        var myId = ++requestId;
        currentPlace = place;
        placeEl.textContent = place.label;
        setMessage("불러오는 중...");

        var url = "https://api.open-meteo.com/v1/forecast" +
            "?latitude=" + place.lat +
            "&longitude=" + place.lon +
            "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day" +
            "&hourly=temperature_2m,weather_code,is_day&forecast_days=3" +
            "&wind_speed_unit=ms&timezone=auto";

        fetch(url)
            .then(function (res) {
                if (!res.ok) throw new Error("HTTP " + res.status);
                return res.json();
            })
            .then(function (data) {
                if (myId !== requestId) return;      // 오래된 요청은 무시
                if (!data || !data.current) throw new Error("no data");
                render(place, data.current, data.hourly);
            })
            .catch(function () {
                if (myId !== requestId) return;
                setMessage("날씨를 불러오지 못했어요.");
            });
    }

    function findPreset(query) {
        var key = normalize(query);
        if (!key) return null;
        for (var i = 0; i < PRESETS.length; i++) {
            if (PRESETS[i].keys.indexOf(key) !== -1) return PRESETS[i];
        }
        return null;
    }

    function savePlace(place) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(place));
        } catch (e) { /* 저장 실패는 무시 */ }
    }

    /* ===== 지역 목록 (직접 만든 목록) =====
       브라우저 기본 목록(datalist)은 폰에서 열렸다가 바로 사라지는 문제가 있어서
       직접 만든 목록으로 바꿨어요. 선택하거나 바깥을 누를 때만 닫혀요. */
    function buildDropdown(filterText) {
        var key = normalize(filterText || "");
        var count = 0;

        dropdownEl.innerHTML = "";

        PRESETS.forEach(function (p) {
            if (key) {
                var match = p.keys.some(function (k) { return k.indexOf(key) !== -1; });
                if (!match) return;
            }

            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "weather-option" + (p.label === currentPlace.label ? " current" : "");
            btn.textContent = p.label;
            btn.addEventListener("click", function () {
                choosePreset(p);
            });

            dropdownEl.appendChild(btn);
            count++;
        });

        return count;
    }

    function openDropdown(filterText) {
        if (buildDropdown(filterText) === 0) {
            closeDropdown();
            return;
        }

        // 검색줄 바로 아래에서 시작해서 날씨 칸 안쪽에 꽉 차게 보여줘요.
        var w = widget.getBoundingClientRect();
        var r = searchRow.getBoundingClientRect();
        dropdownEl.style.top = (r.bottom - w.top + 3) + "px";

        dropdownEl.hidden = false;
        dropdownEl.scrollTop = 0;
        toggleBtn.setAttribute("aria-expanded", "true");
    }

    function closeDropdown() {
        dropdownEl.hidden = true;
        toggleBtn.setAttribute("aria-expanded", "false");
    }

    function choosePreset(place) {
        inputEl.value = place.label;
        closeDropdown();
        savePlace(place);
        loadWeather(place);
    }

    /* ===== 검색 ===== */
    function searchPlace() {
        closeDropdown();

        var query = inputEl.value.trim();
        if (!query) {
            setMessage("도시 이름을 입력해 주세요.");
            return;
        }

        var preset = findPreset(query);
        if (preset) {
            savePlace(preset);
            loadWeather(preset);
            return;
        }

        var myId = ++requestId;
        setMessage("검색 중...");

        var url = "https://geocoding-api.open-meteo.com/v1/search?name=" +
            encodeURIComponent(query) + "&count=1&language=ko&format=json";

        fetch(url)
            .then(function (res) {
                if (!res.ok) throw new Error("HTTP " + res.status);
                return res.json();
            })
            .then(function (data) {
                if (myId !== requestId) return;

                if (!data || !data.results || data.results.length === 0) {
                    setMessage("'" + query + "'을(를) 찾지 못했어요.");
                    return;
                }

                var r = data.results[0];
                var label = r.name + (r.admin1 && r.admin1 !== r.name ? ", " + r.admin1 : "");
                var place = { label: label, lat: r.latitude, lon: r.longitude };

                savePlace(place);
                loadWeather(place);
            })
            .catch(function () {
                if (myId !== requestId) return;
                setMessage("검색에 실패했어요.");
            });
    }

    searchBtn.addEventListener("click", searchPlace);

    inputEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            searchPlace();
        } else if (e.key === "Escape") {
            closeDropdown();
        }
    });

    // 검색창을 누르면 전체 목록을 보여줘요. (목록은 바깥을 누를 때까지 유지)
    inputEl.addEventListener("focus", function () { openDropdown(""); });
    inputEl.addEventListener("click", function () {
        if (dropdownEl.hidden) openDropdown("");
    });

    // 글자를 입력하면 일치하는 지역만 보여줘요.
    inputEl.addEventListener("input", function () {
        openDropdown(inputEl.value);
    });

    // 아래 화살표: 목록 열기/닫기
    toggleBtn.addEventListener("click", function () {
        if (dropdownEl.hidden) {
            openDropdown("");
        } else {
            closeDropdown();
        }
    });

    // 검색줄이나 목록 바깥을 누르면 닫아요. (화면 크기 변화나 키보드 때문에는 닫지 않아요)
    document.addEventListener("pointerdown", function (e) {
        if (dropdownEl.hidden) return;
        if (searchRow.contains(e.target) || dropdownEl.contains(e.target)) return;
        closeDropdown();
    });

    // 예보 칸 바깥을 누르면 말풍선을 닫아요.
    document.addEventListener("pointerdown", function (e) {
        if (tipEl.hidden) return;
        if (e.target.closest && e.target.closest(".weather-fbox")) return;
        hideTip();
    });

    /* 시작: 저장된 지역이 있으면 그곳, 없으면 천안 */
    var startPlace = DEFAULT_PLACE;
    try {
        var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved && typeof saved.lat === "number" && typeof saved.lon === "number" && saved.label) {
            // 목록에 있는 지역이면 항상 최신 좌표를 사용해요.
            startPlace = findPreset(saved.label) || saved;
        }
    } catch (e) { /* 무시 */ }

    loadWeather(startPlace);

    /* 10분마다 자동 새로고침 */
    setInterval(function () {
        loadWeather(currentPlace);
    }, 10 * 60 * 1000);
})();
