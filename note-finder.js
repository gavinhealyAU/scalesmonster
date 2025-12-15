// note-finder.js
// Fretboard chord toggles + TAB + Standard notation rendering (always visible)
// Plain JS, no frameworks, uses VexFlow for rendering

const VF = (window.VexFlow && window.VexFlow.Flow) || (window.Vex && window.Vex.Flow);
if (!VF) throw new Error("VexFlow UMD not available.");

const {
  Renderer,
  Stave,
  StaveConnector,
  TabStave,
  TabNote,
  StaveNote,
  Voice,
  Formatter,
  Accidental,
} = VF;

const PC_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

let currentMidi = null;
let lastClickedStringIdx = 5; // default to low E (idx 5) so display starts at 6
let isPlaying = false;

// One note per string (stringIdx 0..5). Only ACTIVE notes are rendered (green).
// stringIdx: 0 = high E, 5 = low E
let chordSelections = new Map();

// ---------------------------
// Helpers
// ---------------------------

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function noteNameFromMidi(midi) {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return { name: PC_NAMES_SHARP[pc], octave };
}

function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function midiToVexKey(midi) {
  const { name, octave } = noteNameFromMidi(midi);
  return `${name.toLowerCase()}/${octave}`;
}

// idx 0..5 (high E..low E) -> display 1..6 (top..bottom)
function idxToDisplayStringNumberTopDown(stringIdx) {
  return stringIdx + 1;
}

// idx 0..5 (high E..low E) -> display 1..6 but bottom should read 6
// That is already true in the fretboard model (low E idx5 => 6).
function idxToDisplayStringNumberBottomUp(stringIdx) {
  return stringIdx + 1;
}

function getChordMidisLowToHigh() {
  // low-to-high: string 6 (idx 5) to string 1 (idx 0)
  const entries = Array.from(chordSelections.entries()).sort((a, b) => b[0] - a[0]);
  return entries.map(([, v]) => v.midi);
}

function formatChordHeader() {
  if (chordSelections.size === 0) return "";

  // Display bottom-up: 6..1 (idx5..idx0)
  const ordered = Array.from(chordSelections.entries()).sort((a, b) => b[0] - a[0]);
  const parts = [];

  for (const [stringIdx, v] of ordered) {
    const stringNumber = idxToDisplayStringNumberBottomUp(stringIdx); // idx5 => 6, idx0 => 1
    parts.push(`${stringNumber}:${v.name}${v.octave} F${v.fret}`);
  }

  return parts.join("  ");
}

// ---------------------------
// Audio Engine (Chord Playback)
// ---------------------------

const AudioEngine = (() => {
  let audioCtx = null;
  let gainNode = null;
  let oscillators = [];

  function ensureAudioContext() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function stopAll() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;

    if (gainNode) {
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0, now + 0.06);
    }

    oscillators.forEach((osc) => {
      try { osc.stop(now + 0.07); } catch (_) {}
    });

    oscillators = [];
    gainNode = null;
  }

  function playChord(midis) {
    stopAll();
    if (!midis || midis.length === 0) return;

    const ctx = ensureAudioContext();
    const now = ctx.currentTime;

    gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.28, now + 0.05);
    gainNode.connect(ctx.destination);

    oscillators = midis.map((m) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(midiToFrequency(m), now);
      osc.connect(gainNode);
      osc.start(now);
      return osc;
    });
  }

  return { playChord, stopAll };
})();

// ---------------------------
// UI Updates
// ---------------------------

function updatePlayButton(playing) {
  const btn = document.getElementById("playBtn");
  if (!btn) return;
  btn.textContent = playing ? "&#9208;" : "&#9654;";
}

function stopPlayback() {
  isPlaying = false;
  AudioEngine.stopAll();
  updatePlayButton(false);
}

function startPlayback() {
  const midis = getChordMidisLowToHigh();
  if (midis.length === 0) return;

  isPlaying = true;
  AudioEngine.playChord(midis);
  updatePlayButton(true);
}

function clearNoteDisplay() {
  currentMidi = null;

  const nameEl = document.getElementById("noteName");
  const infoEl = document.getElementById("noteInfo");
  const playBtn = document.getElementById("playBtn");

  if (nameEl) {
    nameEl.innerHTML = `<span class="string-num">6</span><span class="note-text">Click</span>`;
  }
  if (infoEl) infoEl.textContent = "Tap any fret";
  if (playBtn) playBtn.disabled = true;

  stopPlayback();
}

function updateNoteDisplay(midi) {
  currentMidi = midi;

  const { name, octave } = noteNameFromMidi(midi);
  const nameEl = document.getElementById("noteName");
  const infoEl = document.getElementById("noteInfo");
  const playBtn = document.getElementById("playBtn");

  const stringNumber = idxToDisplayStringNumberBottomUp(lastClickedStringIdx);

  if (nameEl) {
    nameEl.innerHTML = `<span class="string-num">${stringNumber}</span><span class="note-text">${name}</span>`;
  }

  const chordText = formatChordHeader();
  if (infoEl) {
    const base = `MIDI ${midi} (Octave ${octave})`;
    infoEl.textContent = chordText ? `${base}  |  ${chordText}` : base;
  }

  if (playBtn) playBtn.disabled = getChordMidisLowToHigh().length === 0;
}

// ---------------------------
// Ensure notation mounts exist
// ---------------------------

function ensureNotationMounts() {
  const outputContainer = document.querySelector(".output-container") || document.body;

  outputContainer.style.display = "flex";
  outputContainer.style.flexDirection = "column";
  outputContainer.style.alignItems = "stretch";
  outputContainer.style.gap = "4px";
  outputContainer.style.minHeight = "unset";
  outputContainer.style.paddingTop = "12px";
  outputContainer.style.paddingBottom = "12px";

  let notationWrap = document.getElementById("notationWrap");
  if (!notationWrap) {
    notationWrap = document.createElement("div");
    notationWrap.id = "notationWrap";
    notationWrap.style.display = "flex";
    notationWrap.style.flexDirection = "column";
    notationWrap.style.alignItems = "stretch";
    notationWrap.style.gap = "6px";
    notationWrap.style.width = "100%";
    notationWrap.style.margin = "0";
    outputContainer.appendChild(notationWrap);
  } else {
    notationWrap.style.gap = "6px";
    notationWrap.style.margin = "0";
  }

  let tabMount = document.getElementById("tabMount");
  if (!tabMount) {
    tabMount = document.createElement("div");
    tabMount.id = "tabMount";
    tabMount.style.width = "100%";
    notationWrap.appendChild(tabMount);
  } else if (tabMount.parentElement !== notationWrap) {
    notationWrap.appendChild(tabMount);
  }

  let staffMount = document.getElementById("staffMount");
  if (!staffMount) {
    staffMount = document.createElement("div");
    staffMount.id = "staffMount";
    staffMount.style.width = "100%";
    notationWrap.appendChild(staffMount);
  } else if (staffMount.parentElement !== notationWrap) {
    notationWrap.appendChild(staffMount);
  }

  staffMount.style.display = "block";
  tabMount.style.display = "block";
  tabMount.style.margin = "0";
  staffMount.style.margin = "0";

  return { tabMount, staffMount };
}

// ---------------------------
// TAB Rendering (VexFlow)
// ---------------------------

function renderTab(tabMount) {
  tabMount.innerHTML = "";

  const width = 980;

  // Ensure bottom string is never clipped
  const height = 190;

  const renderer = new Renderer(tabMount, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();

  const svg = tabMount.querySelector("svg");
  if (svg) {
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
    svg.style.width = "100%";
    svg.style.height = "auto";
    svg.style.display = "block";
    svg.style.margin = "0";
  }

  // Stave higher so the bottom line has padding
  const stave = new TabStave(20, 10, width - 40);
  stave.setContext(ctx).draw();

  // All 6 strings: missing string shows X
  const positions = [];
  for (let stringIdx = 0; stringIdx < 6; stringIdx++) {
    const v = chordSelections.get(stringIdx);
    positions.push({
      str: stringIdx + 1, // VexFlow: 1 is high E
      fret: v ? v.fret : "x",
    });
  }

  const tabNote = new TabNote({ positions, duration: "q" });

  const voice = new Voice({ num_beats: 1, beat_value: 4 });
  voice.addTickables([tabNote]);

  new Formatter().joinVoices([voice]).format([voice], width - 80);
  voice.draw(ctx, stave);
}

// ---------------------------
// Standard Notation Rendering (VexFlow)
// ---------------------------

function renderStandard(staffMount) {
  staffMount.innerHTML = "";

  const width = 980;
  const height = 240;

  const renderer = new Renderer(staffMount, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();

  const svg = staffMount.querySelector("svg");
  if (svg) {
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
    svg.style.width = "100%";
    svg.style.height = "auto";
    svg.style.display = "block";
    svg.style.margin = "0";
  }

  const treble = new Stave(20, 20, width - 40).addClef("treble");
  treble.setContext(ctx).draw();

  const bass = new Stave(20, 130, width - 40).addClef("bass");
  bass.setContext(ctx).draw();

  const brace = new StaveConnector(treble, bass);
  brace.setType(StaveConnector.type.BRACE);
  brace.setContext(ctx).draw();

  const left = new StaveConnector(treble, bass);
  left.setType(StaveConnector.type.SINGLE_LEFT);
  left.setContext(ctx).draw();

  const selected = Array.from(chordSelections.entries()).sort((a, b) => b[0] - a[0]);
  if (selected.length === 0) return;

  const trebleMidis = [];
  const bassMidis = [];

  for (const [, v] of selected) {
    if (v.midi >= 60) trebleMidis.push(v.midi);
    else bassMidis.push(v.midi);
  }

  const voices = [];

  if (trebleMidis.length > 0) {
    const keys = trebleMidis.map(midiToVexKey);
    const note = new StaveNote({ clef: "treble", keys, duration: "q" });

    keys.forEach((k, idx) => {
      if (k.includes("#")) note.addModifier(new Accidental("#"), idx);
    });

    const voice = new Voice({ num_beats: 1, beat_value: 4 });
    voice.addTickables([note]);
    voices.push({ voice, stave: treble });
  }

  if (bassMidis.length > 0) {
    const keys = bassMidis.map(midiToVexKey);
    const note = new StaveNote({ clef: "bass", keys, duration: "q" });

    keys.forEach((k, idx) => {
      if (k.includes("#")) note.addModifier(new Accidental("#"), idx);
    });

    const voice = new Voice({ num_beats: 1, beat_value: 4 });
    voice.addTickables([note]);
    voices.push({ voice, stave: bass });
  }

  const formatter = new Formatter();
  formatter.joinVoices(voices.map(v => v.voice)).format(voices.map(v => v.voice), width - 120);

  voices.forEach(({ voice, stave }) => voice.draw(ctx, stave));
}

function renderTabAndStandard() {
  const { tabMount, staffMount } = ensureNotationMounts();
  renderTab(tabMount);
  renderStandard(staffMount);
}

// ---------------------------
// Fretboard Rendering (SVG)
// ---------------------------

function renderFretboard() {
  const mount = document.getElementById("fretboardMount");
  if (!mount) return;
  mount.innerHTML = "";

  mount.style.margin = "0";
  mount.style.padding = "0";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "260");
  svg.setAttribute("viewBox", "0 0 1000 260");
  svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
  svg.style.display = "block";
  svg.style.margin = "0";
  svg.style.padding = "0";

  // Override the CSS clamp so it does not leave extra space below
  svg.style.height = "260px";

  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", "0");
  bg.setAttribute("y", "0");
  bg.setAttribute("width", "1000");
  bg.setAttribute("height", "260");
  bg.setAttribute("fill", "#3b2618");
  svg.appendChild(bg);

  const xStart = 60;
  const xEnd = 980;
  const yStart = 30;
  const yEnd = 230;
  const fretCount = 24;
  const fretSpacing = (xEnd - xStart) / fretCount;

  const stringsTopToBottom = [
    { label: "E", y: 30, openMidi: 64 }, // idx0 = string 1
    { label: "B", y: 70, openMidi: 59 },
    { label: "G", y: 110, openMidi: 55 },
    { label: "D", y: 150, openMidi: 50 },
    { label: "A", y: 190, openMidi: 45 },
    { label: "E", y: 230, openMidi: 40 }, // idx5 = string 6
  ];

  const gBoard = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.appendChild(gBoard);

  function fretCenterX(fret) {
    if (fret === 0) return xStart - fretSpacing * 0.5;
    return xStart + (fret - 0.5) * fretSpacing;
  }

  for (let f = 0; f <= fretCount; f++) {
    const x = xStart + f * fretSpacing;
    const fretLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    fretLine.setAttribute("x1", String(x));
    fretLine.setAttribute("y1", String(yStart));
    fretLine.setAttribute("x2", String(x));
    fretLine.setAttribute("y2", String(yEnd));
    fretLine.setAttribute("stroke", "#aaaaaa");
    fretLine.setAttribute("stroke-width", f === 0 ? "3" : "2");
    gBoard.appendChild(fretLine);
  }

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

    const labelNumber = i + 1;

    const labelGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    labelGroup.setAttribute("cursor", "pointer");

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", String(xStart - 58));
    rect.setAttribute("y", String(s.y - 12));
    rect.setAttribute("rx", "7");
    rect.setAttribute("ry", "7");
    rect.setAttribute("width", "50");
    rect.setAttribute("height", "22");
    rect.setAttribute("fill", "#2a1b12");
    rect.setAttribute("stroke", "#4a3323");
    rect.setAttribute("stroke-width", "1");

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(xStart - 33));
    text.setAttribute("y", String(s.y + 5));
    text.setAttribute("font-size", "13");
    text.setAttribute("fill", "#f7fafc");
    text.setAttribute("font-family", "system-ui, -apple-system, sans-serif");
    text.setAttribute("text-anchor", "middle");
    text.textContent = `${labelNumber}·${s.label}`;

    labelGroup.appendChild(rect);
    labelGroup.appendChild(text);

    labelGroup.addEventListener("click", (evt) => {
      evt.stopPropagation();
      lastClickedStringIdx = i;
      toggleChordSelection(i, 0, s.openMidi);
    });

    gBoard.appendChild(labelGroup);
  }

  const markerFretsSingle = [3, 5, 7, 9, 15, 17, 19, 21];
  const markerFretsDouble = [12, 24];

  const ySingle = (stringsTopToBottom[2].y + stringsTopToBottom[3].y) / 2;
  const yDouble1 = (stringsTopToBottom[1].y + stringsTopToBottom[2].y) / 2;
  const yDouble2 = (stringsTopToBottom[3].y + stringsTopToBottom[4].y) / 2;

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

  const gChordDots = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.appendChild(gChordDots);

  function renderChordDots() {
    while (gChordDots.firstChild) gChordDots.removeChild(gChordDots.firstChild);

    for (const [stringIdx, v] of chordSelections.entries()) {
      const y = stringsTopToBottom[stringIdx].y;
      const x = fretCenterX(v.fret);

      const outer = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      outer.setAttribute("cx", String(x));
      outer.setAttribute("cy", String(y));
      outer.setAttribute("r", "11");
      outer.setAttribute("fill", "none");
      outer.setAttribute("stroke", "#38a169");
      outer.setAttribute("stroke-width", "5");
      outer.setAttribute("opacity", "0.25");

      const inner = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      inner.setAttribute("cx", String(x));
      inner.setAttribute("cy", String(y));
      inner.setAttribute("r", "7");
      inner.setAttribute("fill", "#38a169");
      inner.setAttribute("stroke", "#0f2a17");
      inner.setAttribute("stroke-width", "2");

      gChordDots.appendChild(outer);
      gChordDots.appendChild(inner);
    }
  }

  function toggleChordSelection(stringIdx, fret, openMidi) {
    const midi = openMidi + fret;
    const { name, octave } = noteNameFromMidi(midi);

    const existing = chordSelections.get(stringIdx);
    const same = existing && existing.fret === fret;

    if (same) chordSelections.delete(stringIdx);
    else chordSelections.set(stringIdx, { fret, midi, name, octave });

    renderChordDots();
    updateNoteDisplay(midi);
    renderTabAndStandard();

    if (isPlaying) startPlayback();
  }

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
      if (d < best) {
        best = d;
        idx = i;
      }
    }
    return idx;
  }

  function snapFret(px) {
    if (px < xStart) return 0;
    const raw = (px - xStart) / fretSpacing;
    const fret = Math.floor(raw) + 1;
    return clamp(fret, 0, fretCount);
  }

  svg.addEventListener("click", (e) => {
    const p = toSVGPoint(e);
    const sIdx = snapStringIndex(p.y);
    const fret = snapFret(p.x);
    lastClickedStringIdx = sIdx;
    toggleChordSelection(sIdx, fret, stringsTopToBottom[sIdx].openMidi);
  });

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

  mount.appendChild(svg);
  renderChordDots();

  // Initial display
  updateNoteDisplay(stringsTopToBottom[5].openMidi);
  renderTabAndStandard();
}

// ---------------------------
// Boot
// ---------------------------

window.addEventListener("DOMContentLoaded", () => {
  const playBtn = document.getElementById("playBtn");
  if (playBtn) {
    playBtn.addEventListener("click", () => {
      if (isPlaying) stopPlayback();
      else startPlayback();
    });
  }

  renderFretboard();
});
