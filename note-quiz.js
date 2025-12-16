// note-quiz.js
// Guitar fretboard note quiz with retro arcade/8bit feel

// --- Constants ---
const STRING_OPEN_MIDI = [64, 59, 55, 50, 45, 40]; // 1 (high E) to 6 (low E)
const PC_NAMES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const PC_NAMES_FLAT = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
const TOTAL_QUESTIONS = 10;
const FRETBOARD_STRINGS = 6;
const FRETBOARD_FRETS = 24;
  const LOGO_SHRINK_DISTANCE = 240;
  const LOGO_MIN_SCALE_DESKTOP = 0.6;
  const LOGO_MIN_SCALE_MOBILE = 0.65;

// --- State ---
let quizState = {
  questions: [], // {stringIdx, fret, midi, answerNames[]}
  current: 0,
  score: 0,
  startTime: 0,
  timerInterval: null,
  timeElapsed: 0,
  accepting: false,
  highScores: [],
};

// --- Utility Functions ---
function pcNameFromMidi(midi, flats, sharps) {
  const pc = ((midi % 12) + 12) % 12;
  if (flats && sharps) return [PC_NAMES_SHARP[pc], PC_NAMES_FLAT[pc]];
  if (flats) return [PC_NAMES_FLAT[pc]];
  if (sharps) return [PC_NAMES_SHARP[pc]];
  return [PC_NAMES_SHARP[pc]].filter(n => !n.includes("#"));
}
function normalizeInput(str) {
  return str.trim().replace(/\s+/g, "").replace(/b/g, "b").replace(/#/g, "#").toUpperCase();
}
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function formatDate(d) {
  return d.toISOString().split("T")[0];
}

// --- Fretboard Rendering ---
function renderFretboard(target) {
  const mount = document.getElementById("fretboardMount");
  mount.innerHTML = "";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "260");
  svg.setAttribute("viewBox", "0 0 1000 260");
  svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
  svg.style.display = "block";
  svg.style.background = "transparent";

  // Geometry
  const xStart = 60, xEnd = 980, yStart = 30, yEnd = 230;
  const fretCount = FRETBOARD_FRETS;
  const fretSpacing = (xEnd - xStart) / fretCount;
  const stringsY = [30, 70, 110, 150, 190, 230];

  // Frets
  for (let f = 0; f <= fretCount; f++) {
    const x = xStart + f * fretSpacing;
    const fretLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    fretLine.setAttribute("x1", String(x));
    fretLine.setAttribute("y1", String(yStart));
    fretLine.setAttribute("x2", String(x));
    fretLine.setAttribute("y2", String(yEnd));
    fretLine.setAttribute("stroke", "#aaaaaa");
    fretLine.setAttribute("stroke-width", f === 0 ? "3" : "2");
    svg.appendChild(fretLine);
  }
  // Strings
  const stringStrokeWidths = [2, 2.5, 3, 3.5, 4, 4.5];
  for (let i = 0; i < FRETBOARD_STRINGS; i++) {
    const y = stringsY[i];
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(xStart));
    line.setAttribute("y1", String(y));
    line.setAttribute("x2", String(xEnd));
    line.setAttribute("y2", String(y));
    line.setAttribute("stroke", "#dddddd");
    line.setAttribute("stroke-width", String(stringStrokeWidths[i]));
    svg.appendChild(line);
  }
  // Inlays
  const markerFretsSingle = [3, 5, 7, 9, 15, 17, 19, 21];
  const markerFretsDouble = [12, 24];
  const ySingle = (stringsY[2] + stringsY[3]) / 2;
  const yDouble1 = (stringsY[1] + stringsY[2]) / 2;
  const yDouble2 = (stringsY[3] + stringsY[4]) / 2;
  function fretCenterX(fret) {
    if (fret === 0) return xStart - fretSpacing * 0.5;
    return xStart + (fret - 0.5) * fretSpacing;
  }
  for (const f of markerFretsSingle) {
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", String(fretCenterX(f)));
    dot.setAttribute("cy", String(ySingle));
    dot.setAttribute("r", "8");
    dot.setAttribute("fill", "#b3a89b");
    dot.setAttribute("opacity", "0.32");
    svg.appendChild(dot);
  }
  for (const f of markerFretsDouble) {
    for (const y of [yDouble1, yDouble2]) {
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", String(fretCenterX(f)));
      dot.setAttribute("cy", String(y));
      dot.setAttribute("r", "7");
      dot.setAttribute("fill", "#b3a89b");
      dot.setAttribute("opacity", "0.32");
      svg.appendChild(dot);
    }
  }
  // Fret numbers
  const fretLabelY = yEnd + 28;
  {
    const x0 = xStart - 33;
    const label0 = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label0.setAttribute("x", String(x0));
    label0.setAttribute("y", String(fretLabelY));
    label0.setAttribute("font-size", "11");
    label0.setAttribute("fill", "#b3a89b");
    label0.setAttribute("font-family", "system-ui, -apple-system, sans-serif");
    label0.setAttribute("text-anchor", "middle");
    label0.setAttribute("pointer-events", "none");
    label0.textContent = "0";
    svg.appendChild(label0);
  }
  for (let f = 1; f <= fretCount; f++) {
    const x = xStart + (f - 0.5) * fretSpacing;
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(x));
    label.setAttribute("y", String(fretLabelY));
    label.setAttribute("font-size", "11");
    label.setAttribute("fill", "#b3a89b");
    label.setAttribute("font-family", "system-ui, -apple-system, sans-serif");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("pointer-events", "none");
    label.textContent = String(f);
    svg.appendChild(label);
  }
  // Highlight target
  if (target) {
    const { stringIdx, fret } = target;
    const y = stringsY[stringIdx];
    const x = fretCenterX(fret);
    // Neon dot
    const neon = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    neon.setAttribute("cx", String(x));
    neon.setAttribute("cy", String(y));
    neon.setAttribute("r", "13");
    neon.setAttribute("fill", "none");
    neon.setAttribute("stroke", "#39ff14");
    neon.setAttribute("stroke-width", "4");
    neon.setAttribute("opacity", "0.7");
    neon.style.filter = "drop-shadow(0 0 12px #39ff14)";
    neon.style.animation = "pulseRing 1.1s infinite alternate";
    svg.appendChild(neon);
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", String(x));
    dot.setAttribute("cy", String(y));
    dot.setAttribute("r", "8");
    dot.setAttribute("fill", "#39ff14");
    dot.setAttribute("stroke", "#fff200");
    dot.setAttribute("stroke-width", "2");
    dot.setAttribute("opacity", "0.98");
    dot.style.filter = "drop-shadow(0 0 8px #fff200)";
    svg.appendChild(dot);
  }
  // Pulse ring animation
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `@keyframes pulseRing { 0% { r: 13; opacity: 0.7; } 100% { r: 18; opacity: 0.25; } }`;
  svg.appendChild(style);
  mount.appendChild(svg);
}

// --- Quiz Logic ---
function buildQuestions(stringRange, fretRange, flats, sharps) {
  let stringIdxs;
  if (stringRange === "all") stringIdxs = [0,1,2,3,4,5];
  else if (stringRange === "treble") stringIdxs = [0,1,2];
  else stringIdxs = [3,4,5];
  let [fretMin, fretMax] = fretRange.split("-").map(Number);
  const pool = [];
  for (const s of stringIdxs) {
    for (let f = fretMin; f <= fretMax; f++) {
      const midi = STRING_OPEN_MIDI[s] + f;
      const names = pcNameFromMidi(midi, flats, sharps);
      pool.push({ stringIdx: s, fret: f, midi, answerNames: names });
    }
  }
  return shuffle(pool).slice(0, TOTAL_QUESTIONS);
}
function startQuiz() {
  const stringRange = document.getElementById("stringRange").value;
  const fretRange = document.getElementById("fretRange").value;
  const flats = document.getElementById("acceptFlats").checked;
  const sharps = document.getElementById("acceptSharps").checked;
  quizState.questions = buildQuestions(stringRange, fretRange, flats, sharps);
  quizState.current = 0;
  quizState.score = 0;
  quizState.timeElapsed = 0;
  quizState.startTime = Date.now();
  quizState.accepting = true;
  updateUI();
  renderFretboard(quizState.questions[0]);
  showInputRow(true);
  startTimer();
  showFeedback("");
}
function resetQuiz() {
  quizState.questions = [];
  quizState.current = 0;
  quizState.score = 0;
  quizState.timeElapsed = 0;
  quizState.accepting = false;
  stopTimer();
  updateUI();
  renderFretboard();
  showInputRow(false);
  showFeedback("");
}
function submitAnswer() {
  if (!quizState.accepting) return;
  const input = document.getElementById("noteInput").value;
  const flats = document.getElementById("acceptFlats").checked;
  const sharps = document.getElementById("acceptSharps").checked;
  const q = quizState.questions[quizState.current];
  const answers = q.answerNames.map(normalizeInput);
  const user = normalizeInput(input);
  let correct = answers.includes(user);
  if (!correct && flats && sharps) {
    // Accept enharmonic
    const enharmonic = answers[0] === PC_NAMES_SHARP[q.midi % 12] ? PC_NAMES_FLAT[q.midi % 12] : PC_NAMES_SHARP[q.midi % 12];
    correct = user === normalizeInput(enharmonic);
  }
  if (correct) {
    quizState.score++;
    showFeedback("Correct!", true);
    playBeep(true);
  } else {
    showFeedback(`Incorrect! Answer: ${answers[0]}`, false);
    playBeep(false);
  }
  quizState.accepting = false;
  stopTimer();
  setTimeout(() => {
    quizState.current++;
    if (quizState.current < TOTAL_QUESTIONS) {
      quizState.accepting = true;
      updateUI();
      renderFretboard(quizState.questions[quizState.current]);
      showInputRow(true);
      document.getElementById("noteInput").value = "";
      document.getElementById("noteInput").focus();
      startTimer();
      showFeedback("");
    } else {
      endQuiz();
    }
  }, 900);
}
function endQuiz() {
  showInputRow(false);
  showFeedback(`Quiz complete! Score: ${quizState.score}/${TOTAL_QUESTIONS}`);
  renderFretboard();
  updateUI();
  promptHighScore();
}
function showInputRow(show) {
  document.getElementById("quizInputRow").style.display = show ? "flex" : "none";
}
function showFeedback(msg, correct) {
  const el = document.getElementById("feedback");
  el.textContent = msg;
  el.className = "feedback" + (correct === true ? " correct" : correct === false ? " incorrect" : "");
}
function updateUI() {
  let qNum = quizState.questions.length ? quizState.current + 1 : 1;
  if (!quizState.accepting && quizState.current >= TOTAL_QUESTIONS) qNum = TOTAL_QUESTIONS;
  document.getElementById("questionNum").textContent = `Question ${qNum}/${TOTAL_QUESTIONS}`;
  document.getElementById("score").textContent = quizState.score;
  document.getElementById("timer").textContent = quizState.timeElapsed.toFixed(1) + "s";
}
function startTimer() {
  quizState.startTime = Date.now();
  quizState.timerInterval = setInterval(() => {
    quizState.timeElapsed = (Date.now() - quizState.startTime) / 1000;
    document.getElementById("timer").textContent = quizState.timeElapsed.toFixed(1) + "s";
  }, 100);
}
function stopTimer() {
  if (quizState.timerInterval) clearInterval(quizState.timerInterval);
  quizState.timerInterval = null;
}
// --- Beep SFX ---
function playBeep(success) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = success ? 880 : 120;
    g.gain.value = 0.18;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + (success ? 0.13 : 0.22));
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + (success ? 0.13 : 0.22));
    setTimeout(() => ctx.close(), 300);
  } catch (e) {}
}
// --- High Scores ---
function loadHighScores() {
  try {
    const raw = localStorage.getItem("noteQuizHighScores");
    quizState.highScores = raw ? JSON.parse(raw) : [];
  } catch (e) { quizState.highScores = []; }
}
function saveHighScores() {
  localStorage.setItem("noteQuizHighScores", JSON.stringify(quizState.highScores));
}
function promptHighScore() {
  loadHighScores();
  const score = quizState.score;
  if (score === 0) return showHighScores();
  let initials = prompt("Enter your initials (max 3 chars):", "");
  if (!initials) initials = "---";
  initials = initials.trim().toUpperCase().slice(0,3);
  quizState.highScores.push({
    name: initials,
    score,
    date: formatDate(new Date()),
  });
  quizState.highScores.sort((a,b) => b.score - a.score || a.date.localeCompare(b.date));
  quizState.highScores = quizState.highScores.slice(0,10);
  saveHighScores();
  showHighScores();
}
function showHighScores() {
  const panel = document.getElementById("highScoresPanel");
  panel.style.display = "block";
  let html = '<h3>High Scores</h3><ul class="high-scores-list">';
  for (const s of quizState.highScores) {
    html += `<li><span>${s.name}</span><span>${s.score}</span><span class="score-date">${s.date}</span></li>`;
  }
  html += '</ul>';
  html += '<button class="clear-high-scores" id="clearHighScoresBtn">Clear High Scores</button>';
  html += '<button class="clear-high-scores" id="playAgainBtn">Play Again</button>';
  panel.innerHTML = html;
  document.getElementById("clearHighScoresBtn").onclick = () => {
    quizState.highScores = [];
    saveHighScores();
    showHighScores();
  };
  document.getElementById("playAgainBtn").onclick = () => {
    panel.style.display = "none";
    resetQuiz();
  };
}
// --- Event Listeners ---
document.addEventListener("DOMContentLoaded", () => {
  renderFretboard();
  loadHighScores();
  showHighScores();
  document.getElementById("startQuizBtn").onclick = startQuiz;
  document.getElementById("resetBtn").onclick = resetQuiz;
  document.getElementById("submitBtn").onclick = submitAnswer;
  document.getElementById("noteInput").onkeydown = (e) => {
    if (e.key === "Enter") submitAnswer();
  };
function applyLogoScale() {
    const y = window.scrollY;
    const minScale = window.matchMedia("(max-width: 640px)").matches ? LOGO_MIN_SCALE_MOBILE : LOGO_MIN_SCALE_DESKTOP;
    const clamped = Math.max(0, Math.min(LOGO_SHRINK_DISTANCE, y));
    const t = clamped / LOGO_SHRINK_DISTANCE;
    const scale = 1 - (1 - minScale) * t; // linear falloff from 1 -> minScale

    rootStyle.setProperty("--logo-scale", scale.toFixed(3));
    document.body.classList.toggle("is-scrolled", y > SCROLL_Y);
  }

  applyLogoScale();
  window.addEventListener("scroll", applyLogoScale, { passive: true });
  window.addEventListener("resize", rerender, { passive: true });
});

