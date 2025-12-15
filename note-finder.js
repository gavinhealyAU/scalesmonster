// note-finder.js
// Note Finder - Fretboard drag marker + staff click
// Plain JS, no frameworks, uses VexFlow for staff rendering

const VF = (window.VexFlow && window.VexFlow.Flow) || (window.Vex && window.Vex.Flow);
if (!VF) throw new Error("VexFlow UMD not available.");

const { Renderer, Stave, StaveConnector } = VF;

// ---------------------------
// Constants + App State
// ---------------------------

const PC_NAMES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

let currentMode = "tab";
let currentMidi = null;
let isPlaying = false;

// ---------------------------
// Helpers
// ---------------------------

function noteNameFromMidi(midi) {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return { name: PC_NAMES_SHARP[pc], octave };
}

// ---------------------------
// Audio Engine (Sustain)
// ---------------------------

const AudioEngine = (() => {
  let audioCtx = null;
  let oscillator = null;
  let gainNode = null;

  function ensureAudioContext() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function midiToFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function startSustain(midi) {
    stopSustain();

    const ctx = ensureAudioContext();
    const freq = midiToFrequency(midi);

    oscillator = ctx.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = freq;

    gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start(ctx.currentTime);
  }

  function stopSustain() {
    if (oscillator && gainNode && audioCtx) {
      const now = audioCtx.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0, now + 0.05);
      oscillator.stop(now + 0.05);
    }
    oscillator = null;
    gainNode = null;
  }

  return { startSustain, stopSustain };
})();

// ---------------------------
// UI Updates
// ---------------------------

function updateNoteDisplay(midi) {
  currentMidi = midi;

  const { name, octave } = noteNameFromMidi(midi);
  const nameEl = document.getElementById("noteName");
  const infoEl = document.getElementById("noteInfo");
  const playBtn = document.getElementById("playBtn");

  if (nameEl) nameEl.textContent = name;
  if (infoEl) infoEl.textContent = `MIDI ${midi} (Octave ${octave})`;
  if (playBtn) playBtn.disabled = false;
}

function clearNoteDisplay() {
  currentMidi = null;

  const nameEl = document.getElementById("noteName");
  const infoEl = document.getElementById("noteInfo");
  const playBtn = document.getElementById("playBtn");

  if (nameEl) nameEl.textContent = "Click a note";
  if (infoEl) infoEl.textContent = "Tap any fret or staff position";
  if (playBtn) playBtn.disabled = true;

  stopPlayback();
}

function updatePlayButton(playing) {
  const btn = document.getElementById("playBtn");
  if (!btn) return;
  btn.textContent = playing ? "⏸" : "▶";
}

function startPlayback() {
  if (!currentMidi) return;
  isPlaying = true;
  AudioEngine.startSustain(currentMidi);
  updatePlayButton(true);
}

function stopPlayback() {
  isPlaying = false;
  AudioEngine.stopSustain();
  updatePlayButton(false);
}

// ---------------------------
// Fretboard Rendering (SVG)
// ---------------------------

function renderFretboard() {
  const mount = document.getElementById("fretboardMount");
  if (!mount) return;
  mount.innerHTML = "";

  // SVG setup
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "260");
  svg.setAttribute("viewBox", "0 0 1000 260");
  svg.setAttribute("preserveAspectRatio", "xMinYMin meet");

  // Background
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", "0");
  bg.setAttribute("y", "0");
  bg.setAttribute("width", "1000");
  bg.setAttribute("height", "260");
  bg.setAttribute("fill", "#3b2618");
  svg.appendChild(bg);

  // Geometry
  const xStart = 60;
  const xEnd = 980;
  const yStart = 30;
  const yEnd = 230;
  const fretCount = 24;
  const fretSpacing = (xEnd - xStart) / fretCount;

  // Strings top to bottom must be: E B G D A E
  // String numbers are standard: 1 = high E, 6 = low E
  const stringsTopToBottom = [
    { num: 1, label: "E", y: 30, openMidi: 64 },
    { num: 2, label: "B", y: 70, openMidi: 59 },
    { num: 3, label: "G", y: 110, openMidi: 55 },
    { num: 4, label: "D", y: 150, openMidi: 50 },
    { num: 5, label: "A", y: 190, openMidi: 45 },
    { num: 6, label: "E", y: 230, openMidi: 40 },
  ];

  const gBoard = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.appendChild(gBoard);

  // Frets
  for (let f = 0; f <= fretCount; f++) {
    const x = xStart + f * fretSpacing;
    const fret = document.createElementNS("http://www.w3.org/2000/svg", "line");
    fret.setAttribute("x1", String(x));
    fret.setAttribute("y1", String(yStart));
    fret.setAttribute("x2", String(x));
    fret.setAttribute("y2", String(yEnd));
    fret.setAttribute("stroke", "#aaaaaa");
    fret.setAttribute("stroke-width", f === 0 ? "3" : "2");
    gBoard.appendChild(fret);
  }

  // Strings + labels
  const stringStrokeWidths = [2, 2.5, 3, 3.5, 4, 4.5];
  for (let i = 0; i < stringsTopToBottom.length; i++) {
    const s = stringsTopToBottom[i];

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(xStart));
    line.setAttribute("y1", String(s.y));
    line.setAttribute("x2", String(xEnd));
    line.setAttribute("y2", String(s.y));
    line.setAttribute("stroke", "#dddddd");
    line.setAttribute("stroke-width", String(stringStrokeWidths[i]));
    gBoard.appendChild(line);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(xStart - 10));
    label.setAttribute("y", String(s.y + 5));
    label.setAttribute("font-size", "13");
    label.setAttribute("fill", "#dddddd");
    label.setAttribute("font-family", "system-ui, -apple-system, sans-serif");
    label.setAttribute("text-anchor", "end");
    label.setAttribute("pointer-events", "none");
    label.textContent = s.label;
    gBoard.appendChild(label);
  }

  // Position markers
  const markerFretsSingle = [3, 5, 7, 9, 15, 17, 19, 21];
  const markerFretsDouble = [12, 24];
  const ySingle = (stringsTopToBottom[2].y + stringsTopToBottom[3].y) / 2;
  const yDouble1 = (stringsTopToBottom[1].y + stringsTopToBottom[2].y) / 2;
  const yDouble2 = (stringsTopToBottom[3].y + stringsTopToBottom[4].y) / 2;

  function fretCenterX(fret) {
    const cx = xStart + fretSpacing * (fret + 0.5);
    const maxCx = xEnd - fretSpacing * 0.5;
    return Math.max(xStart + fretSpacing * 0.5, Math.min(maxCx, cx));
  }

  for (const f of markerFretsSingle) {
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", String(fretCenterX(f)));
    dot.setAttribute("cy", String(ySingle));
    dot.setAttribute("r", "8");
    dot.setAttribute("fill", "#b3a89b");
    dot.setAttribute("opacity", "0.32");
    gBoard.appendChild(dot);
  }

  for (const f of markerFretsDouble) {
    for (const y of [yDouble1, yDouble2]) {
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", String(fretCenterX(f)));
      dot.setAttribute("cy", String(y));
      dot.setAttribute("r", "7");
      dot.setAttribute("fill", "#b3a89b");
      dot.setAttribute("opacity", "0.32");
      gBoard.appendChild(dot);
    }
  }

  // Draggable marker (snaps to string and fret center)
  const gMarker = document.createElementNS("http://www.w3.org/2000/svg", "g");

  const markerOuter = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  markerOuter.setAttribute("r", "10");
  markerOuter.setAttribute("fill", "none");
  markerOuter.setAttribute("stroke", "#d69e2e");
  markerOuter.setAttribute("stroke-width", "6");
  markerOuter.setAttribute("opacity", "0.25");

  const markerInner = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  markerInner.setAttribute("r", "7");
  markerInner.setAttribute("fill", "#d69e2e");
  markerInner.setAttribute("stroke", "#33230a");
  markerInner.setAttribute("stroke-width", "2");

  gMarker.appendChild(markerOuter);
  gMarker.appendChild(markerInner);
  svg.appendChild(gMarker);

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function toSVGPoint(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    return pt.matrixTransform(m.inverse());
  }

  function snapStringIndex(py) {
    let idx = 0;
    let best = Math.abs(py - stringsTopToBottom[0].y);
    for (let i = 1; i < stringsTopToBottom.length; i++) {
      const d = Math.abs(py - stringsTopToBottom[i].y);
      if (d < best) { best = d; idx = i; }
    }
    return idx;
  }

  // Fret is 0..24, based on the fret space, not the fret line
  function snapFret(px) {
    const raw = (px - xStart) / fretSpacing;
    const f = Math.floor(raw);
    return clamp(f, 0, fretCount);
  }

  let activeStringIdx = 0;
  let activeFret = 0;
  let dragging = false;

  function updateMarker() {
    const y = stringsTopToBottom[activeStringIdx].y;
    const x = fretCenterX(activeFret);
    gMarker.setAttribute("transform", `translate(${x},${y})`);
  }

  function applySelection(stringIdx, fret, notify = true) {
    activeStringIdx = clamp(stringIdx, 0, 5);
    activeFret = clamp(fret, 0, fretCount);
    updateMarker();

    if (notify) {
      const openMidi = stringsTopToBottom[activeStringIdx].openMidi;
      updateNoteDisplay(openMidi + activeFret);
    }
  }

  function selectFromEvent(evt, notify = true) {
    const p = toSVGPoint(evt);
    const sIdx = snapStringIndex(p.y);
    const fret = snapFret(p.x);
    applySelection(sIdx, fret, notify);
  }

  svg.addEventListener("pointerdown", (e) => {
    dragging = true;
    try { svg.setPointerCapture(e.pointerId); } catch (_) {}
    selectFromEvent(e, true);
  });

  svg.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    selectFromEvent(e, true);
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    try { svg.releasePointerCapture(e.pointerId); } catch (_) {}
    selectFromEvent(e, true);
  }

  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);

  // Mount and initial selection
  mount.appendChild(svg);
  applySelection(0, 0, true);
}

// ---------------------------
// Staff Rendering (VexFlow)
// ---------------------------

function renderStaff() {
  const mount = document.getElementById("staffMount");
  if (!mount) return;
  mount.innerHTML = "";

  const width = 800;
  const height = 260;

  const renderer = new Renderer(mount, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();

  const svg = mount.querySelector("svg");
  if (svg) {
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
    svg.style.width = "100%";
    svg.style.height = "auto";
  }

  const treble = new Stave(50, 20, 700).addClef("treble");
  treble.setContext(ctx).draw();

  const bass = new Stave(50, 140, 700).addClef("bass");
  bass.setContext(ctx).draw();

  const brace = new StaveConnector(treble, bass);
  brace.setType(StaveConnector.type.BRACE);
  brace.setContext(ctx).draw();

  const left = new StaveConnector(treble, bass);
  left.setType(StaveConnector.type.SINGLE_LEFT);
  left.setContext(ctx).draw();

  const right = new StaveConnector(treble, bass);
  right.setType(StaveConnector.type.SINGLE_RIGHT);
  right.setContext(ctx).draw();

  if (!svg) return;

  svg.addEventListener("click", (e) => {
    const rect = svg.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const midi = hitTestStaffToMidi(x, y);
    if (midi !== null) updateNoteDisplay(midi);
  });
}

function hitTestStaffToMidi(x, y) {
  const lineSpacing = 10;

  const trebleCenterY = 70;
  const trebleMidiCenter = 71; // B4

  const bassCenterY = 190;
  const bassMidiCenter = 50; // D3

  let midi = null;

  if (y >= 20 && y <= 120) {
    const offset = (y - trebleCenterY) / lineSpacing;
    midi = Math.round(trebleMidiCenter - offset);
  } else if (y >= 140 && y <= 240) {
    const offset = (y - bassCenterY) / lineSpacing;
    midi = Math.round(bassMidiCenter - offset);
  }

  if (midi !== null) midi = Math.max(40, Math.min(88, midi));
  return midi;
}

// ---------------------------
// Mode Switching
// ---------------------------

function setMode(mode) {
  currentMode = mode;

  const modeSwitch = document.getElementById("modeSwitch");
  const fretboard = document.getElementById("fretboardMount");
  const staff = document.getElementById("staffMount");

  if (modeSwitch) modeSwitch.setAttribute("data-mode", mode);

  clearNoteDisplay();

  if (mode === "tab") {
    if (fretboard) fretboard.style.display = "block";
    if (staff) staff.style.display = "none";
    renderFretboard();
  } else {
    if (fretboard) fretboard.style.display = "none";
    if (staff) staff.style.display = "block";
    renderStaff();
  }
}

// ---------------------------
// Boot
// ---------------------------

window.addEventListener("DOMContentLoaded", () => {
  const modeSwitch = document.getElementById("modeSwitch");
  const printBtn = document.getElementById("printBtn");
  const playBtn = document.getElementById("playBtn");

  if (modeSwitch) {
    const buttons = modeSwitch.querySelectorAll(".mode-btn");
    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        const mode = btn.getAttribute("data-mode") === "standard" ? "standard" : "tab";
        setMode(mode);
      });
    });
  }

  if (printBtn) {
    printBtn.addEventListener("click", () => window.print());
  }

  if (playBtn) {
    playBtn.addEventListener("click", () => {
      if (isPlaying) stopPlayback();
      else startPlayback();
    });
  }

  setMode("tab");
});
