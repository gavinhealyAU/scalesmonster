  // Fretboard position markers (dots)
  // Standard: single dot at 3, 5, 7, 9, 15, 17, 19, 21; double at 12, 24
  const markerFretsSingle = [3, 5, 7, 9, 15, 17, 19, 21];
  const markerFretsDouble = [12, 24];
  // For y, use between strings 3 and 4 (center), for double: offset up/down
  const ySingle = (stringsTopToBottom[2].y + stringsTopToBottom[3].y) / 2;
  const yDouble1 = stringsTopToBottom[1].y + (stringsTopToBottom[2].y - stringsTopToBottom[1].y) / 2; // between 2-3
  const yDouble2 = stringsTopToBottom[3].y + (stringsTopToBottom[4].y - stringsTopToBottom[3].y) / 2; // between 4-5
  // Draw single dot markers
  for (const f of markerFretsSingle) {
    const x = Math.min(xEnd - fretSpacing * 0.5, xStart + fretSpacing * (f + 0.5));
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", x);
    dot.setAttribute("cy", ySingle);
    dot.setAttribute("r", "8");
    dot.setAttribute("fill", "#b3a89b");
    dot.setAttribute("opacity", "0.32");
    svg.appendChild(dot);
  }
  // Draw double dot markers
  for (const f of markerFretsDouble) {
    const x = Math.min(xEnd - fretSpacing * 0.5, xStart + fretSpacing * (f + 0.5));
    for (const y of [yDouble1, yDouble2]) {
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", x);
      dot.setAttribute("cy", y);
      dot.setAttribute("r", "7");
      dot.setAttribute("fill", "#b3a89b");
      dot.setAttribute("opacity", "0.32");
      svg.appendChild(dot);
    }
  }
// Note Finder - Click fretboard or staff to identify and play notes
// Plain JS, no frameworks, uses VexFlow for staff rendering

const VF = (window.VexFlow && window.VexFlow.Flow) || (window.Vex && window.Vex.Flow);
if (!VF) {
  throw new Error("VexFlow UMD not available.");
}

const { Renderer, Stave, StaveConnector } = VF;

// ---------------------------
// Constants
// ---------------------------

const STRING_OPEN_MIDI = { 6: 40, 5: 45, 4: 50, 3: 55, 2: 59, 1: 64 }; // E2 A2 D3 G3 B3 E4
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

function midiFromStringFret(stringNumber, fret) {
  return STRING_OPEN_MIDI[stringNumber] + fret;
}

// ---------------------------
// Audio Engine (Sustain)
// ---------------------------

const AudioEngine = (() => {
  let audioCtx = null;
  let oscillator = null;
  let gainNode = null;

  function ensureAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function midiToFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function startSustain(midi) {
    stopSustain(); // ensure clean state

    const ctx = ensureAudioContext();
    const freq = midiToFrequency(midi);

    oscillator = ctx.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = freq;

    gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05); // attack

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start(ctx.currentTime);
  }

  function stopSustain() {
    if (oscillator && gainNode && audioCtx) {
      const now = audioCtx.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0, now + 0.05); // release
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
  document.getElementById("noteName").textContent = name;
  document.getElementById("noteInfo").textContent = `MIDI ${midi} (Octave ${octave})`;
  document.getElementById("playBtn").disabled = false;
}

function clearNoteDisplay() {
  currentMidi = null;
  document.getElementById("noteName").textContent = "Click a note";
  document.getElementById("noteInfo").textContent = "Tap any fret or staff position";
  document.getElementById("playBtn").disabled = true;
  stopPlayback();
}

function updatePlayButton(playing) {
  const btn = document.getElementById("playBtn");
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

  // Geometry + fret math
  const xStart = 60;
  const xEnd = 980;
  const yStart = 30;
  const yEnd = 230;
  const fretCount = 24;
  const fretSpacing = (xEnd - xStart) / fretCount;

  // Strings top-to-bottom (1..6)
  const stringsTopToBottom = [
    { num: 1, label: "E", y: 30 },
    { num: 2, label: "B", y: 70 },
    { num: 3, label: "G", y: 110 },
    { num: 4, label: "D", y: 150 },
    { num: 5, label: "A", y: 190 },
    { num: 6, label: "E", y: 230 },
  ];

  const gStrings = document.createElementNS("http://www.w3.org/2000/svg", "g");
  gStrings.setAttribute("pointer-events", "none");
  svg.appendChild(gStrings);

  // Draw frets (nut = 0)
  for (let f = 0; f <= fretCount; f++) {
    const x = xStart + f * fretSpacing;
    const fret = document.createElementNS("http://www.w3.org/2000/svg", "line");
    fret.setAttribute("x1", String(x));
    fret.setAttribute("y1", String(yStart));
    fret.setAttribute("x2", String(x));
    fret.setAttribute("y2", String(yEnd));
    fret.setAttribute("stroke", "#aaaaaa");
    fret.setAttribute("stroke-width", f === 0 ? "3" : "2");
    gStrings.appendChild(fret);
  }

  // Draw strings and labels
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
    gStrings.appendChild(line);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(xStart - 10));
    label.setAttribute("y", String(s.y + 5));
    label.setAttribute("font-size", "13");
    label.setAttribute("fill", "#dddddd");
    label.setAttribute("font-family", "system-ui, -apple-system, sans-serif");
    label.setAttribute("text-anchor", "end");
    label.setAttribute("pointer-events", "none");
    label.textContent = `${s.label} (${s.num})`;
    gStrings.appendChild(label);
  }

  // Marker (persistent)
  const gMarker = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const markerOuter = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  markerOuter.setAttribute("r", "9");
  markerOuter.setAttribute("fill", "none");
  markerOuter.setAttribute("stroke", "#d69e2e");
  markerOuter.setAttribute("stroke-width", "6");
  markerOuter.setAttribute("opacity", "0.25");
  const marker = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  marker.setAttribute("r", "7");
  marker.setAttribute("fill", "#d69e2e");
  marker.setAttribute("stroke", "#33230a");
  marker.setAttribute("stroke-width", "2");
  gMarker.appendChild(markerOuter);
  gMarker.appendChild(marker);
  svg.appendChild(gMarker);

  // Helpers
  function toSVGPoint(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const m = svg.getScreenCTM();
    const i = m ? m.inverse() : null;
    return i ? pt.matrixTransform(i) : { x: 0, y: 0 };
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function snapFret(px) {
    if (px <= xStart) return 0;
    if (px >= xEnd) return fretCount;
    return clamp(Math.round((px - xStart) / fretSpacing), 0, fretCount);
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

  // State + movement
  let activeStringIdx = 0; // 0..5 (top to bottom)
  let activeFret = 0;      // 0..24
  function positionFor(stringIdx, fret) {
    const y = stringsTopToBottom[stringIdx].y;
    const markerX = Math.min(
      xEnd - fretSpacing * 0.5,
      xStart + fretSpacing * (fret + 0.5)
    );
    return { x: markerX, y };
  }
  function updateMarker() {
    const { x, y } = positionFor(activeStringIdx, activeFret);
    gMarker.setAttribute("transform", `translate(${x},${y})`);
  }
  function applySelection(stringIdx, fret, notify = true) {
    activeStringIdx = clamp(stringIdx, 0, 5);
    activeFret = clamp(fret, 0, fretCount);
    updateMarker();
    if (notify) {
      const stringNum = stringsTopToBottom[activeStringIdx].num;
      const midi = midiFromStringFret(stringNum, activeFret);
      updateNoteDisplay(midi);
    }
  }
  function selectFromPointerEvent(evt, notify = true) {
    const pt = toSVGPoint(evt);
    const sIdx = snapStringIndex(pt.y);
    const fret = snapFret(pt.x);
    applySelection(sIdx, fret, notify);
  }

  // Pointer interactions
  let dragging = false;
  svg.addEventListener("pointerdown", (e) => {
    dragging = true;
    try { svg.setPointerCapture(e.pointerId); } catch (_) {}
    selectFromPointerEvent(e, true);
  });
  svg.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    selectFromPointerEvent(e, true);
  });
  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    try { svg.releasePointerCapture(e.pointerId); } catch (_) {}
    // Finalize selection (already updated live)
    const stringNum = stringsTopToBottom[activeStringIdx].num;
    const midi = midiFromStringFret(stringNum, activeFret);
    updateNoteDisplay(midi);
  }
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);

  // Click convenience (also covered by pointerdown but kept explicit)
  svg.addEventListener("click", (e) => {
    selectFromPointerEvent(e, true);
  });

  // Mount
  mount.appendChild(svg);

  // Initial marker: string 1 (top), fret 0 -> MIDI 64
  applySelection(0, 0, true);
}

// ---------------------------
// Staff Rendering (VexFlow)
// ---------------------------

function renderStaff() {
  const mount = document.getElementById("staffMount");
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

  // Click detection: map y-coordinate to MIDI pitch
  // Treble staff: line spacing ~10px, starting at y=20, covering C4 to A5
  // Bass staff: starting at y=140, covering E2 to C4
  svg.addEventListener("click", (e) => {
    const rect = svg.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const midi = hitTestStaffToMidi(x, y);
    if (midi !== null) {
      updateNoteDisplay(midi);
    }
  });
}

/**
 * Hit-test staff coordinates to determine MIDI pitch.
 * Assumptions:
 * - Treble clef center (B4) is at y ≈ 70 (line 3 from top at y=20)
 * - Bass clef center (D3) is at y ≈ 190 (line 3 from top at y=140)
 * - Each staff line/space represents one scale degree (~10px per line)
 * - Clicking on/near a line/space snaps to nearest chromatic pitch
 * - Returns MIDI number or null if outside reasonable range
 */
function hitTestStaffToMidi(x, y) {
  const lineSpacing = 10;

  // Treble staff: B4 (MIDI 71) is the middle line (y ≈ 70)
  const trebleCenter = 70;
  const trebleMidiCenter = 71; // B4

  // Bass staff: D3 (MIDI 50) is the middle line (y ≈ 190)
  const bassCenter = 190;
  const bassMidiCenter = 50; // D3

  let midi = null;

  if (y >= 20 && y <= 120) {
    // Treble range
    const offsetLines = (y - trebleCenter) / lineSpacing;
    midi = Math.round(trebleMidiCenter - offsetLines); // invert: higher y = lower pitch
  } else if (y >= 140 && y <= 240) {
    // Bass range
    const offsetLines = (y - bassCenter) / lineSpacing;
    midi = Math.round(bassMidiCenter - offsetLines);
  }

  // Clamp to reasonable guitar range (E2 = 40 to E6 = 88)
  if (midi !== null) {
    midi = Math.max(40, Math.min(88, midi));
  }

  return midi;
}

// ---------------------------
// Mode Switching
// ---------------------------

function setMode(mode) {
  currentMode = mode;
  const modeSwitch = document.getElementById("modeSwitch");
  modeSwitch.setAttribute("data-mode", mode);

  const fretboard = document.getElementById("fretboardMount");
  const staff = document.getElementById("staffMount");

  clearNoteDisplay();

  if (mode === "tab") {
    fretboard.style.display = "block";
    staff.style.display = "none";
    renderFretboard();
  } else {
    fretboard.style.display = "none";
    staff.style.display = "block";
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
  const yearEl = document.getElementById("year");

  // Mode switch listeners
  if (modeSwitch) {
    const buttons = modeSwitch.querySelectorAll(".mode-btn");
    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        const mode = btn.getAttribute("data-mode") === "standard" ? "standard" : "tab";
        setMode(mode);
      });
    });
  }

  // Print button
  if (printBtn) {
    printBtn.addEventListener("click", () => window.print());
  }

  // Footer year
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  // Floating logo shrink on scroll
  const handleScroll = () => {
    document.body.classList.toggle("is-scrolled", window.scrollY > 20);
  };
  window.addEventListener("scroll", handleScroll, { passive: true });
  handleScroll();

  // Play/Pause button
  if (playBtn) {
    playBtn.addEventListener("click", () => {
      if (isPlaying) {
        stopPlayback();
      } else {
        startPlayback();
      }
    });
  }

  // Initial render
  setMode("tab");
});
