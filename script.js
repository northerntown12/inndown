window.T = window.T || function (ko) { return ko; };   /* lang.js가 없어도 한국어로 동작 */
/* ===== 계산기 버튼 소리 ===== */
let calculatorAudioContext;

/* 키소리 끄기 (스피커 버튼) - 이 기기에서 기억해요 */
let calculatorMuted = false;
try { calculatorMuted = localStorage.getItem("calcMuted.v1") === "1"; } catch (e) {}

function playCalculatorSound(type) {
    if (calculatorMuted) return;
    try {
        if (!calculatorAudioContext) {
            calculatorAudioContext = new (
                window.AudioContext || window.webkitAudioContext
            )();
        }

        const ctx = calculatorAudioContext;

        if (ctx.state === "suspended") {
            ctx.resume();
        }

        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();

        const sounds = {
            number:   { frequency: 1200, duration: 0.045, volume: 0.07 },
            operator: { frequency: 720,  duration: 0.075, volume: 0.08 },
            equals:   { frequency: 1500, duration: 0.19,  volume: 0.09 },
            clear:    { frequency: 420,  duration: 0.10,  volume: 0.07 },
            delete:   { frequency: 560,  duration: 0.06,  volume: 0.06 }
        };

        const sound = sounds[type] || sounds.number;
        const now = ctx.currentTime;

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(sound.frequency, now);

        gain.gain.setValueAtTime(sound.volume, now);
        gain.gain.exponentialRampToValueAtTime(
            0.001,
            now + sound.duration
        );

        oscillator.connect(gain);
        gain.connect(ctx.destination);

        oscillator.start(now);
        oscillator.stop(now + sound.duration);

    } catch (error) {
        console.warn("계산기 소리를 재생하지 못했어요.", error);
    }
}


/* ===== 계산기 ===== */
const calculatorElement = document.querySelector('.calculator');
const previousOperandElement = document.querySelector('.previous-operand');
const currentOperandElement = document.querySelector('.current-operand');

if (calculatorElement && previousOperandElement && currentOperandElement) {

    /* 2026-11-15: 네이버 계산기처럼 — = 를 누를 때까지 지금까지의 식(예: 12 + 5 ×)을 숫자 위에 보여 주고,
       연산 기호를 누르면 아래 숫자판은 0으로. = 를 누르면 위에 "12 + 5 × 3 =", 아래에 답.
       계산 순서는 수학 규칙대로 (× ÷ 먼저, + - 나중) */
    let tokens = [];            // ["12", "+", "5", "×"] 처럼 숫자와 기호가 번갈아
    let currentOperand = '0';   // 지금 입력 중인 숫자
    let fresh = false;          // 기호를 막 눌러서 아직 새 숫자를 안 친 상태
    let justEvaluated = false;  // 방금 = 를 눌렀음
    let lastExpr = '';          // = 뒤에 위에 보여 줄 식

    function exprText(list) {
        return list.map(function (t) {
            return /^[+\-×÷]$/.test(t) ? t : formatNumber(t);
        }).join(' ');
    }

    /* 위 줄이 칸보다 길면 앞부분을 "…"로 줄여 끝부분(최근 입력)이 보이게 */
    function fitPrevious(text) {
        previousOperandElement.textContent = text;
        if (!text) return;
        let cut = 0;
        while (previousOperandElement.scrollWidth > previousOperandElement.clientWidth + 1 && cut < text.length) {
            cut += 1;
            previousOperandElement.textContent = '…' + text.slice(cut);
        }
    }

    function updateDisplay() {
        currentOperandElement.textContent = formatNumber(currentOperand);
        fitPrevious(justEvaluated ? lastExpr : exprText(tokens));
    }

    function formatNumber(number) {
        const parts = String(number).split('.');
        const integerPart = Number(parts[0]);

        const formattedInteger = Number.isNaN(integerPart)
            ? '0'
            : integerPart.toLocaleString('ko-KR');

        return parts.length > 1
            ? formattedInteger + '.' + parts[1]
            : formattedInteger;
    }

    function clearCalculator() {
        tokens = [];
        currentOperand = '0';
        fresh = false;
        justEvaluated = false;
        lastExpr = '';
    }

    function deleteNumber() {
        if (justEvaluated) {            // 답이 나온 뒤에는 위의 식만 지움
            justEvaluated = false;
            lastExpr = '';
            return;
        }
        if (fresh) return;              // 기호만 누른 상태에서는 지울 숫자가 없음
        currentOperand = currentOperand.slice(0, -1);

        if (currentOperand === '' || currentOperand === '-') {
            currentOperand = '0';
        }
    }

    function appendNumber(number) {
        if (justEvaluated) {            // 답이 나온 뒤 숫자를 누르면 새 계산
            clearCalculator();
        }
        if (fresh) {
            currentOperand = '0';
            fresh = false;
        }
        if (number === '.' && currentOperand.includes('.')) {
            return;
        }
        if (currentOperand.replace(/[^0-9]/g, '').length >= 15 && number !== '.') {
            return;                     // 너무 긴 숫자는 그만
        }

        if (currentOperand === '0' && number !== '.') {
            currentOperand = number;
        } else {
            currentOperand += number;
        }
    }

    function chooseOperation(selectedOperation) {
        const op = selectedOperation === '*' ? '×' : selectedOperation === '/' ? '÷' : selectedOperation;
        if (justEvaluated) {            // 답에 이어서 계산
            tokens = [currentOperand, op];
            justEvaluated = false;
            lastExpr = '';
        } else if (fresh && tokens.length) {
            tokens[tokens.length - 1] = op;   // 기호를 연달아 누르면 마지막 기호만 바꿈
        } else {
            tokens.push(currentOperand, op);
        }
        currentOperand = '0';           // 숫자판은 0으로
        fresh = true;
    }

    /* × ÷ 먼저, + - 나중 */
    function evaluate(list) {
        const nums = [parseFloat(list[0])];
        const ops = [];
        for (let i = 1; i < list.length; i += 2) {
            const op = list[i];
            const n = parseFloat(list[i + 1]);
            if (op === '×') {
                nums[nums.length - 1] *= n;
            } else if (op === '÷') {
                if (n === 0) return null;
                nums[nums.length - 1] /= n;
            } else {
                ops.push(op);
                nums.push(n);
            }
        }
        let result = nums[0];
        for (let j = 0; j < ops.length; j++) {
            result = ops[j] === '+' ? result + nums[j + 1] : result - nums[j + 1];
        }
        return result;
    }

    function calculate() {
        if (justEvaluated || tokens.length === 0) return;

        const list = fresh ? tokens.slice(0, -1) : tokens.concat([currentOperand]);
        if (list.length < 3) {          // 예: "5 +" 다음 바로 = → 5
            currentOperand = list[0] || currentOperand;
            lastExpr = exprText(list) + ' =';
            tokens = [];
            fresh = false;
            justEvaluated = true;
            return;
        }

        const result = evaluate(list);
        if (result === null || !Number.isFinite(result)) {
            alert(T('0으로 나눌 수 없습니다!', 'Cannot divide by zero!'));
            return;
        }

        lastExpr = exprText(list) + ' =';
        currentOperand = String(Number(result.toFixed(8)));
        tokens = [];
        fresh = false;
        justEvaluated = true;
    }

    calculatorElement.addEventListener("click", function(event) {
        const button = event.target.closest("button");

        if (!button || !calculatorElement.contains(button)) {
            return;
        }

        const value = button.textContent.trim();

        if (value === "AC") {
            playCalculatorSound("clear");
            clearCalculator();

        } else if (value === "DEL") {
            playCalculatorSound("delete");
            deleteNumber();

        } else if (value === "=") {
            playCalculatorSound("equals");
            calculate();

        } else if (["+", "-", "×", "*", "÷", "/"].includes(value)) {
            playCalculatorSound("operator");
            chooseOperation(value);

        } else if (/^\d+$/.test(value) || value === ".") {
            playCalculatorSound("number");
            appendNumber(value);
        }

        updateDisplay();
    });

    updateDisplay();

    /* 스피커 버튼: 누르면 키소리 켜기/끄기 */
    const soundButton = document.getElementById("calc-sound");
    if (soundButton) {
        const showSoundState = function () {
            soundButton.setAttribute("aria-pressed", calculatorMuted ? "true" : "false");
            soundButton.setAttribute("aria-label", calculatorMuted ? T("키소리 켜기", "Turn key sounds on") : T("키소리 끄기", "Turn key sounds off"));
        };
        soundButton.addEventListener("click", function () {
            calculatorMuted = !calculatorMuted;
            try { localStorage.setItem("calcMuted.v1", calculatorMuted ? "1" : "0"); } catch (e) {}
            showSoundState();
        });
        showSoundState();
    }
}


/* ===== 로또 효과음 ===== */
const audioCtx = new (
    window.AudioContext || window.webkitAudioContext
)();

/* 로또 소리 끄기·켜기 (로또 칸 아래 유리 버튼) - 이 기기에서 기억해요.
   로또 소리는 모두 lottoOut을 거쳐 나가요. 음소거면 크기를 0으로 만들어요. (팡파레가 끝나는 시점은 그대로) */
const lottoOut = audioCtx.createGain();
lottoOut.connect(audioCtx.destination);
let lottoMuted = false;
try { lottoMuted = localStorage.getItem("lottoMuted.v1") === "1"; } catch (e) {}
lottoOut.gain.value = lottoMuted ? 0 : 1;
window.lottoSound = {
    isMuted: function () { return lottoMuted; },
    setMuted: function (m) {
        lottoMuted = !!m;
        lottoOut.gain.setValueAtTime(lottoMuted ? 0 : 1, audioCtx.currentTime);
        try { localStorage.setItem("lottoMuted.v1", lottoMuted ? "1" : "0"); } catch (e) {}
    }
};

function playFlipSound() {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
        500,
        audioCtx.currentTime + 0.015
    );

    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1000, audioCtx.currentTime);

    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
        0.001,
        audioCtx.currentTime + 0.015
    );

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(lottoOut);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.015);
}


/* ===== 팡파레 ===== */
// 팡파레의 마지막 음이 끝나면 onComplete를 실행해요.
function playOlympicsFanfare(onComplete) {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const fanfareNotes = [
        { freq: 293.66, duration: 0.2 },
        { freq: 392.00, duration: 0.2 },
        { freq: 440.00, duration: 0.2 },
        { freq: 493.88, duration: 0.2 },
        { freq: 587.33, duration: 0.6 },
        { freq: 493.88, duration: 0.2 },
        { freq: 587.33, duration: 0.9 }
    ];

    let time = audioCtx.currentTime;

    fanfareNotes.forEach((note, index) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(note.freq, time);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1600, time);

        gain.gain.setValueAtTime(0.01, time);
        gain.gain.linearRampToValueAtTime(0.22, time + 0.04);
        gain.gain.exponentialRampToValueAtTime(
            0.001,
            time + note.duration
        );

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(lottoOut);

        // 마지막 음이 끝나는 순간 완료 처리를 실행해요.
        if (
            index === fanfareNotes.length - 1 &&
            typeof onComplete === 'function'
        ) {
            osc.addEventListener('ended', onComplete, { once: true });
        }

        osc.start(time);
        osc.stop(time + note.duration);

        time += note.duration + 0.04;
    });
}


/* ===== 로또 추첨기 ===== */
document.addEventListener("DOMContentLoaded", () => {
    const lottoBtn = document.getElementById("lotto-btn");
    const ballEls = Array.from(
        document.querySelectorAll("#lotto-balls .ball")
    );

    if (!lottoBtn || ballEls.length === 0) {
        return;
    }

    let isRolling = false;
    let canStop = false;
    let rollIntervals = [];
    let stopTimeout = null;
    let revealTimeouts = [];
    let finalNumbers = [];
    let runId = 0;
    let flipDelays = [];
    let revealed = [];

    // 스핀 전: 무지개색 공 + 물음표 (빨주노초파남보)
    const rainbowClasses = ["num-1", "num-8", "num-15", "num-22", "num-29", "num-36", "num-43"];
    ballEls.forEach((ball, i) => {
        ball.classList.add(rainbowClasses[i % rainbowClasses.length]);
    });

    function clearRollIntervals() {
        rollIntervals.forEach(t => clearTimeout(t));
        rollIntervals = [];
    }

    function clearPendingTimers() {
        if (stopTimeout !== null) {
            clearTimeout(stopTimeout);
            stopTimeout = null;
        }

        revealTimeouts.forEach(timeout => clearTimeout(timeout));
        revealTimeouts = [];
    }

    function setBallColor(ballEl, num) {
        ballEl.className = "ball";

        if (num <= 7) {
            ballEl.classList.add("num-1");
        } else if (num <= 14) {
            ballEl.classList.add("num-8");
        } else if (num <= 21) {
            ballEl.classList.add("num-15");
        } else if (num <= 28) {
            ballEl.classList.add("num-22");
        } else if (num <= 35) {
            ballEl.classList.add("num-29");
        } else if (num <= 42) {
            ballEl.classList.add("num-36");
        } else {
            ballEl.classList.add("num-43");
        }
    }

    function generateLottoNumbers() {
        const numbers = Array.from(
            { length: 45 },
            (_, i) => i + 1
        );

        for (let i = numbers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
        }

        const mainNumbers = numbers
            .slice(0, 6)
            .sort((a, b) => a - b);

        const bonusNumber = numbers[6];

        return [...mainNumbers, bonusNumber];
    }

    function stopRolling() {
        if (!isRolling || !canStop) {
            return;
        }

        isRolling = false;
        canStop = false;
        runId++;

        clearPendingTimers();
        clearRollIntervals();

        ballEls.forEach(ball => {
            ball.classList.remove("rolling");
        });

        lottoBtn.innerText = "STOP!";
        lottoBtn.style.opacity = "1";

        const stoppedRunId = runId;

        const timeout = setTimeout(() => {
            if (runId === stoppedRunId && !isRolling) {
                lottoBtn.innerText = "AGAIN!";
            }
        }, 150);

        revealTimeouts.push(timeout);
    }

  
    function revealNumbersSequentially(currentRunId) {
        // 오른쪽 공일수록 공개 간격이 길어져서 긴장감이 커져요. (ms)
        const gaps = [0, 400, 500, 650, 850, 1100, 150];
        let elapsed = 0;

        ballEls.forEach((ball, idx) => {
            elapsed += gaps[idx] !== undefined ? gaps[idx] : 1400;

            const timeout = setTimeout(() => {
                if (runId !== currentRunId || !isRolling) {
                    return;
                }

                // 이 공의 회전만 멈춰요.
                revealed[idx] = true;
                clearTimeout(rollIntervals[idx]);
                rollIntervals[idx] = undefined;
                ball.classList.remove("rolling");

                const num = finalNumbers[idx];
                ball.innerText = num;
                setBallColor(ball, num);

                // 아직 도는 공들은 점점 느리게 돌아요.
                for (let j = idx + 1; j < ballEls.length; j++) {
                    flipDelays[j] = 45 + (idx + 1) * 45;
                }

                // 마지막 공이 공개된 직후 팡파레 시작
                if (idx === ballEls.length - 1) {
                    lottoBtn.innerText = "👍";
                    lottoBtn.style.opacity = "1";
                    lottoBtn.style.backgroundColor = "#0057D9";
                    lottoBtn.style.color = "#FFFFFF";
                    lottoBtn.style.fontSize = "28px";
                    lottoBtn.style.fontWeight = "bold";

                    // 마지막 공이 바뀐 뒤 0.5초 후에 팡파레 시작
                    const fanfareTimeout = setTimeout(() => {
                        if (runId !== currentRunId) {
                            return;
                        }

                        playOlympicsFanfare(() => {
                            if (runId !== currentRunId) {
                                return;
                            }

                            isRolling = false;
                            canStop = false;

                            lottoBtn.innerText = "AGAIN!";
                            lottoBtn.style.color = "#000000";
                            lottoBtn.style.opacity = "1";
                            lottoBtn.style.backgroundColor = "";
                            lottoBtn.style.fontSize = "";
                        });
                    }, 600);

                    revealTimeouts.push(fanfareTimeout);
                }
            }, elapsed);

            revealTimeouts.push(timeout);
        });
    }


    function startRolling() {
        runId++;
        const currentRunId = runId;

        isRolling = true;
        canStop = true;

        finalNumbers = generateLottoNumbers();

        clearPendingTimers();
        clearRollIntervals();

        lottoBtn.innerText = "Wait!";
        lottoBtn.style.color = "#000000";
        lottoBtn.style.opacity = "0.7";

        flipDelays = ballEls.map(() => 45);
        revealed = ballEls.map(() => false);

        function scheduleFlip(ball, idx) {
            rollIntervals[idx] = setTimeout(() => {
                if (runId !== currentRunId || !isRolling || revealed[idx]) {
                    return;
                }

                const randomNum = Math.floor(Math.random() * 45) + 1;

                ball.innerText = randomNum;
                setBallColor(ball, randomNum);
                playFlipSound();

                scheduleFlip(ball, idx);
            }, flipDelays[idx]);
        }

        ballEls.forEach((ball, idx) => {
            ball.classList.add("rolling");
            scheduleFlip(ball, idx);
        });

        // 6초 회전한 뒤 번호를 왼쪽부터 차례대로 공개해요. (2026-11-09 4초→6초)
        stopTimeout = setTimeout(() => {
            if (runId !== currentRunId || !isRolling) {
                return;
            }

            stopTimeout = null;
            canStop = false;

        revealNumbersSequentially(currentRunId);
        }, 6000);
    }

    lottoBtn.addEventListener("click", () => {
        if (isRolling) {
            // 회전 중에는 STOP!을 허용하고,
            // 결과 공개 중에는 중복 클릭을 막아요.
            if (canStop) {
                stopRolling();
            }

            return;
        }

        startRolling();
    });
});

/* ===== 왼쪽 그림 클릭 → 새 창에서 크게 보기 (마우스 휠 위로 = 확대, 아래로 = 축소, 드래그 = 이동) ===== */
(function () {
    const img = document.querySelector(".tree-panel img");
    if (!img) return;

    img.addEventListener("click", function () {
        const src = img.currentSrc || img.src;
        const nw = img.naturalWidth || 800;
        const nh = img.naturalHeight || 600;
        const ratio = Math.min(
            (screen.availWidth * 0.9) / nw,
            (screen.availHeight * 0.9) / nh,
            1
        );
        const w = Math.max(320, Math.round(nw * ratio));
        const h = Math.max(240, Math.round(nh * ratio));

        const win = window.open(
            "",
            "imageViewer",
            "width=" + w + ",height=" + h + ",resizable=yes,scrollbars=no"
        );

        if (!win) {
            alert(T("팝업이 차단되었어요. 주소창의 팝업 허용을 눌러주세요.", "The pop-up was blocked. Please allow pop-ups in the address bar."));
            return;
        }

        const page =
            '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">' +
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
            "<title>그림 보기</title><style>" +
            "html,body{margin:0;height:100%;background:#111;overflow:hidden}" +
            "#stage{position:absolute;top:0;left:0;width:100vw;height:100vh;" +
            "display:flex;align-items:center;justify-content:center;" +
            "transform-origin:0 0;cursor:zoom-in}" +
            "#stage.zoomed{cursor:grab}#stage.drag{cursor:grabbing}" +
            "img{max-width:100%;max-height:100%;object-fit:contain;" +
            "user-select:none;-webkit-user-drag:none}" +
            "</style></head><body>" +
            '<div id="stage"><img id="pic" alt="커피이미지"></div>' +
            "<script>" +
            "var stage=document.getElementById('stage');" +
            "document.getElementById('pic').src=" + JSON.stringify(src) + ";" +
            "var s=1,tx=0,ty=0,MIN=1,MAX=8,drag=null;" +
            "function apply(){" +
            "if(s<=1){s=1;tx=0;ty=0;}" +
            "stage.style.transform='translate('+tx+'px,'+ty+'px) scale('+s+')';" +
            "stage.classList.toggle('zoomed',s>1);}" +
            "window.addEventListener('wheel',function(e){" +
            "e.preventDefault();" +
            "var f=e.deltaY<0?1.15:1/1.15;" +
            "var ns=Math.min(MAX,Math.max(MIN,s*f));" +
            "if(ns===s)return;" +
            "var k=ns/s;" +
            "tx=e.clientX-(e.clientX-tx)*k;" +
            "ty=e.clientY-(e.clientY-ty)*k;" +
            "s=ns;apply();},{passive:false});" +
            "stage.addEventListener('mousedown',function(e){" +
            "if(s<=1)return;e.preventDefault();" +
            "drag={x:e.clientX-tx,y:e.clientY-ty};stage.classList.add('drag');});" +
            "window.addEventListener('mousemove',function(e){" +
            "if(!drag)return;tx=e.clientX-drag.x;ty=e.clientY-drag.y;apply();});" +
            "window.addEventListener('mouseup',function(){" +
            "drag=null;stage.classList.remove('drag');});" +
            "stage.addEventListener('dblclick',function(){s=1;apply();});" +
            "<\/script></body></html>";

        win.document.open();
        win.document.write(page);
        win.document.close();
        win.focus();
    });
})();


/* ===== 맨 위 배너 동영상: 오른쪽 위 재생/정지 버튼 (유리 버튼) - 이 기기에서 기억해요 ===== */
(function () {
    const banner = document.querySelector(".main-banner");
    const video = banner && banner.querySelector("video");
    if (!video) return;

    const PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
    const PAUSE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>';

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "glass-btn banner-play";
    banner.appendChild(btn);

    function show() {
        const paused = video.paused;
        btn.innerHTML = paused ? PLAY_SVG : PAUSE_SVG;
        btn.setAttribute("aria-label", paused ? T("배너 동영상 재생", "Play banner video") : T("배너 동영상 정지", "Pause banner video"));
        btn.title = paused ? T("재생", "Play") : T("정지", "Pause");
    }

    let wantPaused = false;
    try { wantPaused = localStorage.getItem("bannerPaused.v1") === "1"; } catch (e) {}
    if (wantPaused) {
        video.removeAttribute("autoplay");
        video.autoplay = false;
        video.pause();
    }

    btn.addEventListener("click", function () {
        if (video.paused) {
            const p = video.play();
            if (p && p.catch) p.catch(function () {});
        } else {
            video.pause();
        }
        try { localStorage.setItem("bannerPaused.v1", video.paused ? "1" : "0"); } catch (e) {}
        show();
    });
    video.addEventListener("play", show);
    video.addEventListener("pause", show);
    show();
})();


/* ===== 맨 위 배너: 왼쪽 위 작은 화살표 = 새 배너(가을 숲) ↔ 옛 배너(하늘) 바꾸기 (2026-11-17) =====
   고른 것은 이 기기에 기억해요 (bannerOld.v1). 동영상 파일 이름을 바꾸려면 아래 두 줄만 */
(function () {
    const NEW_SRC = "fall-banner.mp4";
    const OLD_SRC = "sunmovingpic.mp4";
    const NEW_TITLE = "Fall takes us back.";       // 배너 위 문구 (모양은 그대로 .banner-title)
    const OLD_TITLE = "Look up to the sky.";
    const banner = document.querySelector(".main-banner");
    const video = banner && banner.querySelector("video");
    if (!video) return;
    const T2 = window.T || function (ko) { return ko; };
    const NEW_POSTER = video.getAttribute("poster") || "";   // 2026-11-18: 영상이 뜨기 전 보이는 첫 장면 사진 (가을 배너용)

    function curSrc() {
        const s = video.querySelector("source");
        return (s && s.getAttribute("src")) || video.getAttribute("src") || "";
    }
    function isOld() { return curSrc().indexOf(OLD_SRC) !== -1; }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "glass-btn banner-swap";
    banner.appendChild(btn);

    const titleEl = banner.querySelector(".banner-title");
    function show() {
        const old = isOld();
        if (titleEl) titleEl.textContent = old ? OLD_TITLE : NEW_TITLE;
        /* 화살표는 늘 오른쪽(›) — 누를 때마다 새 배너 ↔ 옛 배너 */
        btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        const label = old ? T2("새 배너 보기", "Show new banner") : T2("옛 배너 보기", "Show previous banner");
        btn.title = label;
        btn.setAttribute("aria-label", label);
    }

    let firstLoad = true;
    function swapTo(src, animate) {
        const wasPaused = video.paused;               // 정지해 둔 상태면 바꾼 뒤에도 정지 (처음 열 때는 autoplay가 알아서 재생)
        const go = function () {
            let s = video.querySelector("source");
            if (!s) { s = document.createElement("source"); s.type = "video/mp4"; video.appendChild(s); }
            s.setAttribute("src", src);
            video.removeAttribute("src");
            if (NEW_POSTER) { if (src === NEW_SRC) video.setAttribute("poster", NEW_POSTER); else video.removeAttribute("poster"); }
            video.preload = "auto";
            if (wasPaused && !firstLoad) { video.autoplay = false; video.removeAttribute("autoplay"); }
            video.load();
            if (!wasPaused) { const p = video.play(); if (p && p.catch) p.catch(function () {}); }
            show();
        };
        if (!animate) { go(); return; }
        video.classList.add("banner-fading");
        if (titleEl) titleEl.classList.add("banner-fading");
        setTimeout(function () {
            go();
            const done = function () { video.removeEventListener("loadeddata", done); video.classList.remove("banner-fading"); if (titleEl) titleEl.classList.remove("banner-fading"); };
            video.addEventListener("loadeddata", done);
            setTimeout(done, 1500);                    // 늦게 와도 화면이 흐린 채로 남지 않게
        }, 250);
    }

    let wantOld = false;
    try { wantOld = localStorage.getItem("bannerOld.v1") === "1"; } catch (e) {}
    if (wantOld && !isOld()) swapTo(OLD_SRC, false);
    else show();
    firstLoad = false;

    btn.addEventListener("click", function () {
        const toOld = !isOld();
        try { localStorage.setItem("bannerOld.v1", toOld ? "1" : "0"); } catch (e) {}
        swapTo(toOld ? OLD_SRC : NEW_SRC, true);
    });
})();
