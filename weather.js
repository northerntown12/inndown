window.T = window.T || function (ko) { return ko; };   /* lang.js가 없어도 한국어로 동작 */
/* ===== 날씨 정보 (Open-Meteo, API 키 필요 없음) ===== */
(function () {
    "use strict";

    /* 2026-11-13: 회사망 등에서 날씨 서버(api.open-meteo.com)가 막힐 때를 대비해,
       직접 받아오기가 실패하면 Cloudflare Worker를 거쳐 다시 받아와요 (코드: worker-weather.js).
       Worker를 만든 뒤 나온 주소를 아래에 넣어 주세요 (끝에 / 포함). 비워 두면 예전처럼 직접만 받아와요. */
    var WEATHER_PROXY = "";

    function fetchJson(url) {
        function get(u) {
            return fetch(u).then(function (res) {
                if (!res.ok) throw new Error("HTTP " + res.status);
                return res.json();
            });
        }
        return get(url).catch(function (err) {
            if (!WEATHER_PROXY) throw err;
            return get(WEATHER_PROXY + "?url=" + encodeURIComponent(url));
        });
    }

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
    var laterEl = document.getElementById("weather-later");
    var tipEl = document.getElementById("weather-tip");
    var tipTimer = null;
    var tipOwner = null;
    var DEFAULT_NOTE = T("업데이트 주기: 10분", "Updates every 10 min");
    var INPUT_HINT = T("도시 입력 (예: 뉴욕)", "City (e.g. New York)");

    // 검색창이 비어 있을 때는 항상 이 안내문이 보여요.
    inputEl.placeholder = INPUT_HINT;
    inputEl.setAttribute("aria-label", INPUT_HINT);

    function normalize(text) {
        return String(text).toLowerCase().replace(/\s+/g, "");
    }

    /* 목록에 나오는 지역들 (맨 위: 경기 포천, 강원 인제 / 그 아래: 인구 많은 대도시 + 천안 수신면, 제주) */
    var PRESETS = [
        { label: "포천", en: "Pocheon",   lat: 37.8949, lon: 127.2002, aliases: ["경기포천", "경기도포천", "pocheon"] },
        { label: "인제", en: "Inje",   lat: 38.0697, lon: 128.1706, aliases: ["인제군", "강원인제", "강원도인제", "inje"] },
        { label: "서울", en: "Seoul",   lat: 37.5665, lon: 126.9780 },
        { label: "부산", en: "Busan",   lat: 35.1796, lon: 129.0756 },
        { label: "인천", en: "Incheon",   lat: 37.4563, lon: 126.7052 },
        { label: "대구", en: "Daegu",   lat: 35.8714, lon: 128.6014 },
        { label: "대전", en: "Daejeon",   lat: 36.3504, lon: 127.3845 },
        { label: "광주", en: "Gwangju",   lat: 35.1595, lon: 126.8526 },
        { label: "울산", en: "Ulsan",   lat: 35.5384, lon: 129.3114 },
        { label: "수원", en: "Suwon",   lat: 37.2636, lon: 127.0286 },
        { label: "창원", en: "Changwon",   lat: 35.2279, lon: 128.6811 },
        { label: "고양", en: "Goyang",   lat: 37.6584, lon: 126.8320 },
        { label: "용인", en: "Yongin",   lat: 37.2411, lon: 127.1776 },
        { label: "성남", en: "Seongnam",   lat: 37.4200, lon: 127.1265 },
        { label: "청주", en: "Cheongju",   lat: 36.6424, lon: 127.4890 },
        { label: "부천", en: "Bucheon",   lat: 37.5034, lon: 126.7660 },
        { label: "화성", en: "Hwaseong",   lat: 37.1996, lon: 126.8312 },
        { label: "안산", en: "Ansan",   lat: 37.3219, lon: 126.8309 },
        { label: "남양주", en: "Namyangju", lat: 37.6360, lon: 127.2165 },
        { label: "안양", en: "Anyang",   lat: 37.3943, lon: 126.9568 },
        { label: "전주", en: "Jeonju",   lat: 35.8242, lon: 127.1480 },
        { label: "천안", en: "Cheonan",   lat: 36.8151, lon: 127.1139, aliases: ["cheonan"] },
        // ※ 수신면 좌표는 장산리(홍대용과학관) 부근 값이라 대략적이에요. 정확히 바꾸려면 lat, lon을 수정하세요.
        { label: "천안 수신면", en: "Susin-myeon, Cheonan", lat: 36.7396, lon: 127.2960, aliases: ["수신면", "천안시수신면", "충남천안수신면"] },
        { label: "제주", en: "Jeju",   lat: 33.4996, lon: 126.5312, aliases: ["제주도", "제주시"] }
    ];

    /* 검색용 이름(공백 제거)을 미리 만들어 둬요: 이름, 이름+시, 별칭 */
    PRESETS.forEach(function (p) {
        var base = normalize(p.label);
        p.keys = [base, base + "시"];
        (p.aliases || []).forEach(function (a) { p.keys.push(normalize(a)); });
        if (p.en) p.keys.push(normalize(p.en));        // 영어 이름으로도 찾기
    });

    /* 화면에 보일 이름: 영문 페이지에서는 영어 이름 (목록에 있는 도시·현재 위치) */
    function nameOf(place) {
        if (!place) return "";
        if (!window.SITE_EN) return place.label;
        if (place.en) return place.en;
        for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].label === place.label) return PRESETS[i].en || place.label;
        if (place.label === "📍 현재 위치") return "📍 My location";
        return place.label;
    }

    var STORAGE_KEY = "weatherPlace";
    var DEFAULT_PLACE = PRESETS.filter(function (p) { return p.label === "천안"; })[0];
    var currentPlace = DEFAULT_PLACE;
    var requestId = 0;

    /* WMO 날씨 코드 -> 설명, 아이콘, 배경 종류 */
    function describe(code, isDay) {
        var day = !!isDay;
        switch (code) {
            case 0:  return { text: T("맑음", "Clear"), icon: day ? "☀️" : "🌙", cond: "clear" };
            case 1:  return { text: T("대체로 맑음", "Mostly clear"), icon: day ? "🌤️" : "🌙", cond: "clear" };
            case 2:  return { text: T("구름 조금", "Partly cloudy"), icon: day ? "⛅" : "☁️", cond: "partly" };
            case 3:  return { text: T("흐림", "Cloudy"), icon: "☁️", cond: "cloudy" };
            case 45:
            case 48: return { text: T("안개", "Fog"), icon: "🌫️", cond: "fog" };
            case 51:
            case 53:
            case 55: return { text: T("이슬비", "Drizzle"), icon: "🌦️", cond: "rain" };
            case 56:
            case 57: return { text: T("어는 이슬비", "Freezing drizzle"), icon: "🌧️", cond: "rain" };
            case 61: return { text: T("약한 비", "Light rain"), icon: "🌧️", cond: "rain" };
            case 63: return { text: T("비", "Rain"), icon: "🌧️", cond: "rain" };
            case 65: return { text: T("강한 비", "Heavy rain"), icon: "🌧️", cond: "rain" };
            case 66:
            case 67: return { text: T("어는 비", "Freezing rain"), icon: "🌧️", cond: "rain" };
            case 71: return { text: T("약한 눈", "Light snow"), icon: "🌨️", cond: "snow" };
            case 73: return { text: T("눈", "Snow"), icon: "🌨️", cond: "snow" };
            case 75: return { text: T("강한 눈", "Heavy snow"), icon: "❄️", cond: "snow" };
            case 77: return { text: T("싸락눈", "Snow grains"), icon: "❄️", cond: "snow" };
            case 80:
            case 81: return { text: T("소나기", "Showers"), icon: "🌦️", cond: "rain" };
            case 82: return { text: T("강한 소나기", "Heavy showers"), icon: "🌧️", cond: "rain" };
            case 85:
            case 86: return { text: T("소낙눈", "Snow showers"), icon: "🌨️", cond: "snow" };
            case 95: return { text: T("천둥번개", "Thunderstorm"), icon: "⛈️", cond: "storm" };
            case 96:
            case 99: return { text: T("우박 동반 천둥번개", "Thunderstorm with hail"), icon: "⛈️", cond: "storm" };
            default: return { text: T("날씨 정보 없음", "No weather data"), icon: "🌡️", cond: "partly" };
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

    /* 맨 아래 줄: 왼쪽 = 출처(가운데 근처까지), 오른쪽 끝 = 업데이트 주기/안내 문구 */
    var msgSrcEl = document.createElement("a");
    msgSrcEl.className = "wm-src";
    msgSrcEl.href = "https://open-meteo.com/";
    msgSrcEl.target = "_blank";
    msgSrcEl.rel = "noopener noreferrer";
    msgSrcEl.textContent = T("출처: Open-Meteo·CAMS", "Source: Open-Meteo·CAMS");
    msgSrcEl.title = T("날씨: Open-Meteo.com / 대기질: CAMS (Copernicus) via Open-Meteo", "Weather: Open-Meteo.com / Air quality: CAMS (Copernicus) via Open-Meteo");

    var msgNoteEl = document.createElement("span");
    msgNoteEl.className = "wm-note";

    msgEl.textContent = "";
    msgEl.appendChild(msgSrcEl);
    msgEl.appendChild(msgNoteEl);

    function setMessage(text) {
        msgNoteEl.textContent = text || DEFAULT_NOTE;
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

    function toggleTip(box, text, side) {
        if (!tipEl.hidden && tipOwner === box) {
            hideTip();
            return;
        }

        hideTip();
        tipOwner = box;
        tipEl.textContent = text;
        tipEl.hidden = false;

        // 눌린 칸 옆, 세로 가운데에 붙여요. (기본: 칸의 왼쪽 / side가 "right"면 칸의 오른쪽)
        var w = widget.getBoundingClientRect();
        var b = box.getBoundingClientRect();
        if (side === "up") {
            // 칸 위쪽 가운데에 띄워요 (아래 줄 칸용)
            tipEl.style.transform = "translate(-50%, -100%)";
            tipEl.style.left = (b.left - w.left + b.width / 2) + "px";
            tipEl.style.right = "auto";
            tipEl.style.top = (b.top - w.top - 4) + "px";
            tipTimer = setTimeout(hideTip, 3000);
            return;
        }
        tipEl.style.transform = "";
        if (side === "right") {
            tipEl.style.left = (b.right - w.left + 4) + "px";
            tipEl.style.right = "auto";
        } else {
            tipEl.style.right = (w.right - b.left + 4) + "px";
            tipEl.style.left = "auto";
        }
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
        if (!isNaN(hour) && hour < 6) days.push({ label: T("오늘", "Today"), date: today });
        days.push({ label: T("내일", "Tomorrow"), date: addDays(today, 1) });
        days.push({ label: T("모레", "In 2 days"), date: addDays(today, 2) });

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

            var tipText = T("예보를 받아오지 못했어요", "Couldn't get the forecast");

            if (idx === -1) {
                icon.textContent = "-";
                temp.textContent = "--";
            } else {
                var info = describe(hourly.weather_code[idx], hourly.is_day ? hourly.is_day[idx] : 1);
                icon.textContent = info.icon;
                temp.textContent = Math.round(hourly.temperature_2m[idx]) + "°";
                box.title = day.label + T(" 오전 6시: ", " 6 AM: ") + info.text;
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

    /* 3시간 후 / 6시간 후 / 9시간 후 예보 (현재 시각의 정시 기준, 지역 현지 시각)
       - 해당 시각을 못 찾으면 "--"로 보여줘요. */
    function renderLater(current, hourly) {
        if (!laterEl) return;
        laterEl.innerHTML = "";

        var nowText = String(current.time || "");
        var m = nowText.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})/);
        if (!m) return;

        [3, 6, 9].forEach(function (h) {
            var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] + h));
            var key = d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()) +
                      "T" + pad2(d.getUTCHours()) + ":00";
            var idx = hourly && hourly.time ? hourly.time.indexOf(key) : -1;
            var hh = d.getUTCHours();
            var clock = window.SITE_EN ? (hh % 12 === 0 ? 12 : hh % 12) + (hh < 12 ? " AM" : " PM")
                                    : (hh < 12 ? "오전 " : "오후 ") + (hh % 12 === 0 ? 12 : hh % 12) + "시";

            var box = document.createElement("div");
            box.className = "weather-fbox";

            var label = document.createElement("span");
            label.className = "fb-label";
            label.textContent = T(h + "시간 후", "In " + h + "h");

            var row = document.createElement("span");
            row.className = "fb-row";

            var icon = document.createElement("span");
            icon.className = "fb-icon";

            var temp = document.createElement("span");
            temp.className = "fb-temp";

            var tipText = T("예보를 받아오지 못했어요", "Couldn't get the forecast");

            if (idx === -1) {
                icon.textContent = "-";
                temp.textContent = "--";
            } else {
                var info = describe(hourly.weather_code[idx], hourly.is_day ? hourly.is_day[idx] : 1);
                icon.textContent = info.icon;
                temp.textContent = Math.round(hourly.temperature_2m[idx]) + "°";
                tipText = clock + " " + info.text;
                box.title = T(h + "시간 후(" + tipText + ")", "In " + h + " hours (" + tipText + ")");
            }

            box.setAttribute("role", "button");
            box.tabIndex = 0;
            box.addEventListener("click", function () { toggleTip(box, tipText, "up"); });
            box.addEventListener("keydown", function (e) {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleTip(box, tipText, "up");
                }
            });

            row.appendChild(icon);
            row.appendChild(temp);
            box.appendChild(label);
            box.appendChild(row);
            laterEl.appendChild(box);
        });
    }

    /* ===== 미세먼지 / 초미세먼지 (Open-Meteo 대기질 API, 한국 환경부 등급 기준) =====
       현재 날씨 왼쪽에 작은 칸 두 개를 만들어요. 칸을 누르면 수치(μg/m³)가 말풍선으로 나와요. */
    var AIR_GRADES = [T("좋음", "Good"), T("보통", "Fair"), T("나쁨", "Poor"), T("매우나쁨", "V. poor")];
    var AIR_ITEMS = [
        { key: "pm10",  label: T("미세먼지", "PM10"),   name: T("미세먼지(PM10)", "Fine dust (PM10)"),    short: "PM10",  limits: [30, 80, 150] },
        { key: "pm2_5", label: T("초미세먼지", "PM2.5"), name: T("초미세먼지(PM2.5)", "Ultrafine dust (PM2.5)"), short: "PM2.5", limits: [15, 35, 75] }
    ];
    var airRequestId = 0;
    var airBoxes = [];

    (function buildAirBoxes() {
        var midEl = widget.querySelector(".weather-mid");
        if (!midEl) return;

        var airEl = document.createElement("div");
        airEl.className = "weather-air";
        airEl.setAttribute("aria-label", T("미세먼지", "PM10"));

        AIR_ITEMS.forEach(function (item) {
            var box = document.createElement("div");
            box.className = "weather-abox";
            box.setAttribute("role", "button");
            box.tabIndex = 0;

            var label = document.createElement("span");
            label.className = "ab-label";
            label.textContent = item.label;

            var grade = document.createElement("span");
            grade.className = "ab-grade g0";
            grade.textContent = "…";

            box.appendChild(label);
            box.appendChild(grade);
            box._tip = item.name + T(" 불러오는 중...", " loading...");

            box.addEventListener("click", function () {
                toggleTip(box, box._tip, "right");
            });
            box.addEventListener("keydown", function (e) {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleTip(box, box._tip, "right");
                }
            });

            airEl.appendChild(box);
            airBoxes.push({ item: item, box: box, gradeEl: grade });
        });

        midEl.insertBefore(airEl, midEl.firstChild);
    })();

    function setAirBox(entry, value) {
        var item = entry.item;
        var v = (value === null || value === undefined) ? NaN : Number(value);

        if (isNaN(v)) {
            entry.gradeEl.className = "ab-grade g0";
            entry.gradeEl.textContent = "-";
            entry.box._tip = item.name + T(" 정보 없음", ": no data");
            entry.box.title = entry.box._tip;
            return;
        }

        var r = Math.round(v);
        var idx = r <= item.limits[0] ? 0 : r <= item.limits[1] ? 1 : r <= item.limits[2] ? 2 : 3;

        entry.gradeEl.className = "ab-grade g" + (idx + 1);
        entry.gradeEl.textContent = AIR_GRADES[idx];
        entry.box._tip = item.short + " " + r + "μg/m³";
        entry.box.title = entry.box._tip;
    }

    function loadAir(place) {
        var myId = ++airRequestId;

        airBoxes.forEach(function (entry) {
            entry.gradeEl.className = "ab-grade g0";
            entry.gradeEl.textContent = "…";
            entry.box._tip = entry.item.name + T(" 불러오는 중...", " loading...");
        });

        var url = "https://air-quality-api.open-meteo.com/v1/air-quality" +
            "?latitude=" + place.lat +
            "&longitude=" + place.lon +
            "&current=pm10,pm2_5&timezone=auto";

        fetchJson(url)
            .then(function (data) {
                if (myId !== airRequestId) return;      // 오래된 요청은 무시
                if (!data || !data.current) throw new Error("no data");
                airBoxes.forEach(function (entry) {
                    setAirBox(entry, data.current[entry.item.key]);
                });
            })
            .catch(function () {
                if (myId !== airRequestId) return;
                airBoxes.forEach(function (entry) { setAirBox(entry, null); });
            });
    }

    function render(place, current, hourly) {
        var info = describe(current.weather_code, current.is_day);

        widget.setAttribute("data-cond", info.cond);
        widget.setAttribute("data-night", current.is_day ? "0" : "1");
        setParticles(info.cond);

        placeEl.textContent = nameOf(place);
        iconEl.textContent = info.icon;
        tempEl.textContent = Math.round(current.temperature_2m) + "°";
        descEl.textContent = info.text;
        feelEl.textContent = Math.round(current.apparent_temperature) + "°";
        humEl.textContent = Math.round(current.relative_humidity_2m) + "%";
        windEl.textContent = Number(current.wind_speed_10m).toFixed(1) + "m/s";
        renderForecast(current, hourly);
        renderLater(current, hourly);
        setMessage("");
    }

    function loadWeather(place) {
        var myId = ++requestId;
        currentPlace = place;
        placeEl.textContent = nameOf(place);
        setMessage(T("불러오는 중...", "Loading..."));
        loadAir(place);

        var url = "https://api.open-meteo.com/v1/forecast" +
            "?latitude=" + place.lat +
            "&longitude=" + place.lon +
            "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day" +
            "&hourly=temperature_2m,weather_code,is_day&forecast_days=3" +
            "&wind_speed_unit=ms&timezone=auto";

        fetchJson(url)
            .then(function (data) {
                if (myId !== requestId) return;      // 오래된 요청은 무시
                if (!data || !data.current) throw new Error("no data");
                render(place, data.current, data.hourly);
            })
            .catch(function () {
                if (myId !== requestId) return;
                setMessage(T("날씨를 불러오지 못했어요.", "Couldn't load the weather."));
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

        if (!key) {
            var here = document.createElement("button");
            here.type = "button";
            here.className = "weather-option weather-option-loc" + (currentPlace.auto ? " current" : "");
            here.textContent = "📍 " + LOC_LABEL;
            here.addEventListener("click", function () { useMyLocation(false); });
            dropdownEl.appendChild(here);
            count++;
        }

        PRESETS.forEach(function (p) {
            if (key) {
                var match = p.keys.some(function (k) { return k.indexOf(key) !== -1; });
                if (!match) return;
            }

            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "weather-option" + (p.label === currentPlace.label ? " current" : "");
            btn.textContent = nameOf(p);
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
        inputEl.value = nameOf(place);
        closeDropdown();
        savePlace(place);
        loadWeather(place);
    }

    /* ===== 현재 위치 (📍 버튼 / 목록 맨 위) =====
       - 브라우저에 위치 권한을 물어보고, 허락하면 그 자리의 날씨를 보여줘요.
       - 한 번 고르면 기억해서, 다음에 들어올 때도 현재 위치로 자동으로 찾아요. */
    var LOC_LABEL = T("현재 위치", "My location");

    function reverseName(lat, lon) {
        // 좌표 → 동네 이름 (키 필요 없음). 실패하면 "현재 위치"로 보여줘요.
        var url = "https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=" + lat +
                  "&longitude=" + lon + "&localityLanguage=" + T("ko", "en");
        return fetch(url)
            .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
            .then(function (d) {
                var name = d.city || d.locality || d.principalSubdivision || "";
                if (d.city && d.locality && d.locality !== d.city) name = d.city + " " + d.locality;
                return name ? "📍 " + name : "📍 " + LOC_LABEL;
            })
            .catch(function () { return "📍 " + LOC_LABEL; });
    }

    function useMyLocation(quiet) {
        closeDropdown();
        if (!navigator.geolocation) {
            if (!quiet) setMessage(T("이 브라우저는 위치 찾기를 지원하지 않아요.", "This browser doesn't support location."));
            return;
        }
        var myId = ++requestId;
        if (!quiet) setMessage(T("현재 위치 찾는 중...", "Finding your location..."));
        if (locBtn) locBtn.classList.add("busy");

        navigator.geolocation.getCurrentPosition(function (pos) {
            if (locBtn) locBtn.classList.remove("busy");
            if (myId !== requestId) return;
            var lat = Math.round(pos.coords.latitude * 10000) / 10000;
            var lon = Math.round(pos.coords.longitude * 10000) / 10000;
            var place = { label: "📍 " + LOC_LABEL, lat: lat, lon: lon, auto: true };
            inputEl.value = "";
            savePlace(place);
            loadWeather(place);
            reverseName(lat, lon).then(function (name) {
                if (currentPlace !== place) return;          // 그새 다른 도시를 골랐으면 그대로 둬요
                place.label = name;
                placeEl.textContent = name;
                savePlace(place);
            });
        }, function (err) {
            if (locBtn) locBtn.classList.remove("busy");
            if (myId !== requestId) return;
            if (quiet) { loadWeather(currentPlace); return; }
            setMessage(err && err.code === 1 ? T("위치 권한이 꺼져 있어요.", "Location permission is off.") : T("위치를 찾지 못했어요.", "Couldn't find your location."));
        }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 });
    }

    // 검색창 왼쪽에 📍 버튼
    var locBtn = document.createElement("button");
    locBtn.type = "button";
    locBtn.className = "weather-loc";
    locBtn.setAttribute("aria-label", T("현재 위치 날씨", "Weather at my location"));
    locBtn.title = T("현재 위치 날씨", "Weather at my location");
    locBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7z" fill="currentColor"/><circle cx="12" cy="9" r="2.6" fill="#fff"/></svg>';
    locBtn.addEventListener("click", function () { useMyLocation(false); });
    searchRow.insertBefore(locBtn, searchRow.firstChild);

    /* ===== 검색 ===== */
    function searchPlace() {
        closeDropdown();

        var query = inputEl.value.trim();
        if (!query) {
            setMessage(T("도시 이름을 입력해 주세요.", "Please enter a city name."));
            return;
        }

        var preset = findPreset(query);
        if (preset) {
            savePlace(preset);
            loadWeather(preset);
            return;
        }

        var myId = ++requestId;
        setMessage(T("검색 중...", "Searching..."));

        var url = "https://geocoding-api.open-meteo.com/v1/search?name=" +
            encodeURIComponent(query) + "&count=1&language=" + T("ko", "en") + "&format=json";

        fetchJson(url)
            .then(function (data) {
                if (myId !== requestId) return;

                if (!data || !data.results || data.results.length === 0) {
                    setMessage(T("'" + query + "'을(를) 찾지 못했어요.", "Couldn't find '" + query + "'."));
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
                setMessage(T("검색에 실패했어요.", "Search failed."));
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
    var justFocused = false;
    inputEl.addEventListener("focus", function () {
        justFocused = true;
        // 이전 도시가 적혀 있으면 전체 선택해서, 바로 새 도시를 덮어쓸 수 있게 해요.
        try { inputEl.select(); } catch (err) { /* 무시 */ }
        setTimeout(function () {
            try { inputEl.select(); } catch (err) { /* 무시 */ }
        }, 0);
        openDropdown("");
    });
    // 마우스를 뗄 때 선택이 풀리는 것을 막아요. (처음 누를 때 한 번만)
    inputEl.addEventListener("mouseup", function (e) {
        if (justFocused) {
            e.preventDefault();
            justFocused = false;
        }
    });
    inputEl.addEventListener("blur", function () { justFocused = false; });
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
        if (e.target.closest && e.target.closest(".weather-fbox, .weather-abox")) return;
        hideTip();
    });

    /* 시작: 저장된 지역이 있으면 그곳, 없으면 천안 */
    var startPlace = DEFAULT_PLACE;
    try {
        var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved && typeof saved.lat === "number" && typeof saved.lon === "number" && saved.label) {
            // 목록에 있는 지역이면 항상 최신 좌표를 사용해요.
            startPlace = findPreset(saved.label) || saved;
            // 이전에 검색한 도시를 검색창에도 바로 보여줘요.
            inputEl.value = nameOf(startPlace);
        }
    } catch (e) { /* 무시 */ }

    if (startPlace.auto) inputEl.value = "";
    loadWeather(startPlace);

    // 지난번에 "현재 위치"를 골랐다면, 권한이 이미 허락된 경우 조용히 위치를 다시 찾아요.
    if (startPlace.auto && navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: "geolocation" }).then(function (st) {
            if (st.state === "granted") useMyLocation(true);
        }).catch(function () {});
    }

    /* 10분마다 자동 새로고침 */
    setInterval(function () {
        loadWeather(currentPlace);
    }, 10 * 60 * 1000);
})();
