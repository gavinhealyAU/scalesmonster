// Minimal browser-based guitar scale rendering with VexFlow (UMD)
// - No frameworks, no build tools
// - Minor Pentatonic renders all 5 boxes, ordered low to high on the neck
// - Other scales render a true 2-octave run (exact pitches) up then down
// - Data objects: { string, fret, isRoot }

const VF = (window.VexFlow && window.VexFlow.Flow) || (window.Vex && window.Vex.Flow);
if (!VF) {
  throw new Error("VexFlow UMD not available. Ensure vexflow.js loads before tab.js.");
}

const {
  Formatter,
  Renderer,
  TabStave,
  TabNote,
  Voice,
  Stave,
  StaveNote,
  StaveConnector,
  Accidental
} = VF;

// ---------------------------
// Constants
// ---------------------------

const STRING_OPEN_MIDI = { 6: 40, 5: 45, 4: 50, 3: 55, 2: 59, 1: 64 }; // E2 A2 D3 G3 B3 E4

const PC_NAMES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const PC_TO_INDEX = Object.fromEntries(PC_NAMES_SHARP.map((n, i) => [n, i]));

const KEY_TO_SEMITONE_FROM_E = {
  C: 8, "C#": 9, D: 10, "D#": 11, E: 0, F: 1, "F#": 2, G: 3, "G#": 4, A: 5, "A#": 6, B: 7
};

const SCALE_DEFINITIONS = {
  "Major": [0,2,4,5,7,9,11],
  "Minor": [0,2,3,5,7,8,10],
  "Melodic Minor": [0,2,3,5,7,9,11],
  "Harmonic Minor": [0,2,3,5,7,8,11],
  "Major Pentatonic": [0,2,4,7,9],
  "Minor Pentatonic": [0,3,5,7,10],
  "Blues": [0,3,5,6,7,10],
  "Rock 'n' roll": [0,3,4,5,7,9,10],
  "Ionian": [0,2,4,5,7,9,11],
  "Dorian": [0,2,3,5,7,9,10],
  "Phrygian": [0,1,3,5,7,8,10],
  "Lydian": [0,2,4,6,7,9,11],
  "Mixolydian": [0,2,4,5,7,9,10],
  "Aeolian": [0,2,3,5,7,8,10],
  "Locrian": [0,1,3,5,6,8,10],
  "Dorian Bebop": [0,2,3,5,7,9,10,11],
  "Mixolydian Bebop": [0,2,4,5,7,9,10,11],
  "Whole Tone": [0,2,4,6,8,10],
  "Half Whole Diminished": [0,1,3,4,6,7,9,10],
  "Whole Half Diminished": [0,2,3,5,6,8,9,11],
  "Spanish Major": [0,1,4,5,7,8,10],
  "Persian": [0,1,4,5,6,8,11],
  "Gypsy Major": [0,2,3,6,7,8,10],
};

// Minor pentatonic box templates (2 notes per string pattern, relative to a "position root")
const MIN_PENT_BOX_TEMPLATES = [
  { id: 1, frets: { 6:[0,3], 5:[0,2], 4:[0,2], 3:[0,2], 2:[0,3], 1:[0,3] } },
  { id: 2, frets: { 6:[3,5], 5:[2,5], 4:[2,5], 3:[2,5], 2:[3,5], 1:[3,5] } },
  { id: 3, frets: { 6:[5,7], 5:[5,7], 4:[5,7], 3:[5,7], 2:[5,8], 1:[5,8] } },
  { id: 4, frets: { 6:[7,10], 5:[7,10], 4:[7,9], 3:[7,9], 2:[8,10], 1:[8,10] } },
  { id: 5, frets: { 6:[10,12], 5:[9,12], 4:[9,12], 3:[9,12], 2:[10,12], 1:[10,12] } },
];

// ---------------------------
// Helpers
// ---------------------------

function clampFret(f) { return Math.max(0, Math.min(24, f)); }

function midiToPcName(midi) {
  return PC_NAMES_SHARP[((midi % 12) + 12) % 12];
}

function isRootForKey(string, fret, keyName) {
  const midi = STRING_OPEN_MIDI[string] + fret;
  return midiToPcName(midi) === keyName;
}

function pickLowERootFret(keyName) {
  const base = KEY_TO_SEMITONE_FROM_E[keyName];
  if (base === undefined) throw new Error("Unknown key: " + keyName);
  return base % 12;
}

function midiToVexKeySharp(midi) {
  const pcs = ["c","c#","d","d#","e","f","f#","g","g#","a","a#","b"];
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1; // MIDI 60 => C4
  return pcs[pc] + "/" + octave;
}

function addAccidentalsIfNeeded(staveNote) {
  if (!staveNote.keys) return;
  staveNote.keys.forEach((key, idx) => {
    if (key.includes("#")) staveNote.addModifier(new Accidental("#"), idx);
    if (key.includes("b")) staveNote.addModifier(new Accidental("b"), idx);
  });
}

// ---------------------------
// Scale pitch generation (exact MIDI, 2 octaves)
// ---------------------------

function buildScaleMidiSequence(rootPcName, intervals) {
  const rootPc = PC_TO_INDEX[rootPcName];
  if (rootPc === undefined) throw new Error("Unknown key: " + rootPcName);

  // Anchor root around E2..E3 area on string 6 for practical guitar range
  // String 6 open is E2 (40). If root is F# (pc=6), the first root on string 6 is fret 2 => midi 42.
  const rootFret6 = pickLowERootFret(rootPcName);
  const rootMidi = STRING_OPEN_MIDI[6] + rootFret6; // exact root pitch on string 6 within first octave

  const up = [];
  for (let oct = 0; oct < 2; oct++) {
    for (let i = 0; i < intervals.length; i++) {
      up.push(rootMidi + intervals[i] + 12 * oct);
    }
  }
  // add top root to complete 2 octaves
  up.push(rootMidi + 24);

  // remove potential duplicates if an interval set already ended on octave
  const uniqUp = [];
  for (const m of up) {
    if (uniqUp.length === 0 || uniqUp[uniqUp.length - 1] !== m) uniqUp.push(m);
  }

  const down = uniqUp.slice(0, -1).reverse();
  return { up: uniqUp, full: [...uniqUp, ...down], rootMidi };
}

// ---------------------------
// Map MIDI sequence to guitar positions (exact pitch)
// ---------------------------

function allPositionsForMidi(targetMidi) {
  const positions = [];
  for (let s = 6; s >= 1; s--) {
    const fret = targetMidi - STRING_OPEN_MIDI[s];
    if (fret >= 0 && fret <= 24) {
      positions.push({ string: s, fret });
    }
  }
  return positions;
}

function chooseBestPosition(prev, candidates) {
  // Cost function: prefer small fret moves, prefer not jumping strings wildly
  let best = null;
  let bestCost = Infinity;

  for (const c of candidates) {
    const fretJump = prev ? Math.abs(c.fret - prev.fret) : 0;
    const stringJump = prev ? Math.abs(c.string - prev.string) : 0;

    // Encourage moving to higher strings as we ascend (6 -> 1), but do not force it
    const directionPenalty = prev ? (c.string > prev.string ? 2 : 0) : 0;

    const cost = fretJump * 1.2 + stringJump * 2.2 + directionPenalty;

    if (cost < bestCost) {
      bestCost = cost;
      best = c;
    }
  }
  return best || candidates[0];
}

function mapMidiToTabNotes(keyName, midiSeq) {
  const notes = [];
  let prevPos = null;

  for (const midi of midiSeq) {
    const candidates = allPositionsForMidi(midi);
    if (!candidates.length) continue;

    const chosen = chooseBestPosition(prevPos, candidates);
    prevPos = chosen;

    notes.push({
      string: chosen.string,
      fret: chosen.fret,
      isRoot: midiToPcName(midi) === keyName
    });
  }

  return notes;
}

function generateTabForScale(keyName, scaleName) {
  const intervals = SCALE_DEFINITIONS[scaleName];
  if (!intervals) return [];

  const { full } = buildScaleMidiSequence(keyName, intervals);
  return mapMidiToTabNotes(keyName, full);
}

// 3NPS positions for non-pentatonic scales
function buildPcSetForScale(keyName, intervals) {
  const rootPc = PC_TO_INDEX[keyName];
  if (rootPc === undefined) throw new Error("Unknown key: " + keyName);
  const pcs = new Set();
  intervals.forEach(iv => pcs.add((rootPc + iv) % 12));
  return pcs;
}

function fretsForStringPcSet(string, pcSet) {
  const frets = [];
  for (let f = 0; f <= 24; f++) {
    const pc = (STRING_OPEN_MIDI[string] + f) % 12;
    if (pcSet.has(pc)) frets.push(f);
  }
  return frets;
}

function generate3NPSPositionsForScale(keyName, scaleName) {
  const intervals = SCALE_DEFINITIONS[scaleName];
  if (!intervals) return [];

  const pcSet = buildPcSetForScale(keyName, intervals);
  const stringFrets = {
    6: fretsForStringPcSet(6, pcSet),
    5: fretsForStringPcSet(5, pcSet),
    4: fretsForStringPcSet(4, pcSet),
    3: fretsForStringPcSet(3, pcSet),
    2: fretsForStringPcSet(2, pcSet),
    1: fretsForStringPcSet(1, pcSet),
  };

  const positions = [];
  const base = pickLowERootFret(keyName);
  for (let start = Math.max(0, base - 2); start <= 24; start += 2) {
    let ok = true;
    const notesAsc = [];
    let minF = Infinity;
    let maxF = -Infinity;

    for (let s = 6; s >= 1; s--) {
      const frets = stringFrets[s].filter(f => f >= start && f <= start + 6);
      if (frets.length < 3) { ok = false; break; }
      const chosen = frets.slice(0, 3); // lowest three within window for this string
      for (const f of chosen) {
        const n = { string: s, fret: f, isRoot: isRootForKey(s, f, keyName) };
        notesAsc.push(n);
        if (f < minF) minF = f;
        if (f > maxF) maxF = f;
      }
    }

    if (ok) {
      const desc = notesAsc.slice(0, -1).reverse();
      const notes = [...notesAsc, ...desc];
      // Avoid duplicates by min/max matching an existing position
      if (!positions.some(p => p.minFret === minF && p.maxFret === maxF)) {
        positions.push({ minFret: minF, maxFret: maxF, notesData: notes });
      }
    }
  }

  positions.sort((a, b) => (a.minFret - b.minFret) || (a.maxFret - b.maxFret));
  return positions;
}

// ---------------------------
// Minor pentatonic boxes
// ---------------------------

function pickBaseFretForBox(keyName, template) {
  const rootFret = pickLowERootFret(keyName);

  // Prefer the correct "root position" first (F# => 2 so Box 1 becomes 2–5),
  // then try the octave up, then octave down as last resort.
  const candidates = [rootFret, rootFret + 12, rootFret - 12];

  function boxFits(base) {
    for (let s = 6; s >= 1; s--) {
      for (const off of template.frets[s]) {
        const f = base + off;
        if (f < 0 || f > 24) return false;
      }
    }
    return true;
  }

  for (const c of candidates) {
    if (boxFits(c)) return c;
  }

  return clampFret(rootFret);
}

function generateBoxNotes(template, baseFretS6, keyName) {
  const asc = [];
  for (let s = 6; s >= 1; s--) {
    const offs = template.frets[s];
    for (const off of offs) {
      const fret = clampFret(baseFretS6 + off);
      asc.push({ string: s, fret, isRoot: isRootForKey(s, fret, keyName) });
    }
  }
  const desc = asc.slice(0, -1).reverse();
  return [...asc, ...desc];
}

function generateAllMinorPentBoxes(keyName) {
  const boxes = MIN_PENT_BOX_TEMPLATES.map((tpl) => {
    const base = pickBaseFretForBox(keyName, tpl);
    const notesData = generateBoxNotes(tpl, base, keyName);
    const frets = notesData.map(n => n.fret);
    const minFret = Math.min(...frets);
    const maxFret = Math.max(...frets);
    return { id: tpl.id, minFret, maxFret, notesData };
  });

  // Order by fret position, but keep Box id for label
  boxes.sort((a, b) => (a.minFret - b.minFret) || (a.maxFret - b.maxFret) || (a.id - b.id));
  return boxes;
}

// ---------------------------
// Rendering
// ---------------------------

function renderTab(containerEl, notesData) {
  containerEl.innerHTML = "";

  const renderer = new Renderer(containerEl, Renderer.Backends.SVG);
  renderer.resize(860, 190);

  const ctx = renderer.getContext();
  const stave = new TabStave(10, 18, 840).setNumLines(6);
  stave.addClef("tab");
  stave.setContext(ctx).draw();

  const tabNotes = notesData.map(n => {
    const tn = new TabNote({
      positions: [{ str: n.string, fret: n.fret }],
      duration: "q"
    });
    tn._isRoot = !!n.isRoot;
    return tn;
  });

  const voice = new Voice({ num_beats: tabNotes.length, beat_value: 4 }).setStrict(false);
  voice.addTickables(tabNotes);

  new Formatter().joinVoices([voice]).format([voice], 800);
  voice.draw(ctx, stave);

  const svg = containerEl.querySelector("svg");
  if (svg) {
    const groups = svg.querySelectorAll(".vf-note");
    groups.forEach((g, i) => {
      if (tabNotes[i] && tabNotes[i]._isRoot) g.classList.add("vf-root-note");
    });
  }
}

function renderGrandStaff(containerEl, notesData) {
  containerEl.innerHTML = "";

  const renderer = new Renderer(containerEl, Renderer.Backends.SVG);
  renderer.resize(860, 260);

  const ctx = renderer.getContext();

  const treble = new Stave(10, 20, 840).addClef("treble");
  treble.setContext(ctx).draw();

  const bass = new Stave(10, 140, 840).addClef("bass");
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

  const trebleNotes = [];
  const bassNotes = [];

  for (const n of notesData) {
    const midi = STRING_OPEN_MIDI[n.string] + n.fret;
    const key = midiToVexKeySharp(midi);

    if (midi >= 60) {
      const t = new StaveNote({ keys: [key], duration: "q", clef: "treble" });
      addAccidentalsIfNeeded(t);
      t._isRoot = !!n.isRoot;

      trebleNotes.push(t);
      bassNotes.push(new StaveNote({ keys: ["b/3"], duration: "qr", clef: "bass" }));
    } else {
      trebleNotes.push(new StaveNote({ keys: ["b/4"], duration: "qr", clef: "treble" }));

      const b = new StaveNote({ keys: [key], duration: "q", clef: "bass" });
      addAccidentalsIfNeeded(b);
      b._isRoot = !!n.isRoot;

      bassNotes.push(b);
    }
  }

  const vT = new Voice({ num_beats: trebleNotes.length, beat_value: 4 }).setStrict(false).addTickables(trebleNotes);
  const vB = new Voice({ num_beats: bassNotes.length, beat_value: 4 }).setStrict(false).addTickables(bassNotes);

  new Formatter().format([vT, vB], 800);
  vT.draw(ctx, treble);
  vB.draw(ctx, bass);

  const svg = containerEl.querySelector("svg");
  if (svg) {
    const groups = svg.querySelectorAll(".vf-note");
    const total = trebleNotes.length + bassNotes.length;
    const limit = Math.min(groups.length, total);
    for (let i = 0; i < limit; i++) {
      const isRoot = i < trebleNotes.length ? !!trebleNotes[i]._isRoot : !!bassNotes[i - trebleNotes.length]._isRoot;
      if (isRoot) groups[i].classList.add("vf-root-note");
    }
  }
}

function renderSection(parent, title, notesData, mode) {
  const section = document.createElement("div");
  section.className = "section";

  const header = document.createElement("div");
  header.className = "section-header";
  const label = document.createElement("div");
  label.textContent = title;
  header.appendChild(label);
  const copy = document.createElement("div");
  copy.className = "copy-btn";
  copy.textContent = "⧉";
  header.appendChild(copy);
  section.appendChild(header);

  const body = document.createElement("div");
  body.className = "section-body";
  const mount = document.createElement("div");
  body.appendChild(mount);
  section.appendChild(body);

  parent.appendChild(section);

  if (mode === "standard") renderGrandStaff(mount, notesData);
  else renderTab(mount, notesData);
}

function updateBadge(key, scale) {
  const badge = document.getElementById("keyScaleBadge");
  if (badge) badge.textContent = `${key} · ${scale}`;
}

function renderApp() {
  const keySelect = document.getElementById("keySelect");
  const scaleSelect = document.getElementById("scaleSelect");
  const output = document.getElementById("output");
  const modeInput = Array.from(document.querySelectorAll('input[name="mode"]')).find(r => r.checked);

  if (!keySelect || !scaleSelect || !output) {
    throw new Error("Missing required elements: keySelect, scaleSelect, output.");
  }

  const key = keySelect.value;
  const scale = scaleSelect.value;
  const mode = modeInput ? modeInput.value : "tab";

  const segmented = document.getElementById("modeSegmented");
  if (segmented) segmented.setAttribute("data-active", mode === "standard" ? "standard" : "tab");
  updateBadge(key, scale);

  output.innerHTML = "";

  if (scale === "Minor Pentatonic") {
    const boxes = generateAllMinorPentBoxes(key);

    boxes.forEach((b, idx) => {
      renderSection(
        output,
        `Box ${b.id}  |  Position ${idx + 1}  |  frets ${b.minFret} to ${b.maxFret}`,
        b.notesData,
        mode
      );
    });
    return;
  }

  const positions = generate3NPSPositionsForScale(key, scale);
  if (positions.length === 0) {
    throw new Error(`No 3NPS positions found for ${key} ${scale}.`);
  }
  positions.forEach((p, idx) => {
    renderSection(
      output,
      `Position ${idx + 1} | frets ${p.minFret}–${p.maxFret}`,
      p.notesData,
      mode
    );
  });
}

// ---------------------------
// Boot
// ---------------------------

window.addEventListener("DOMContentLoaded", () => {
  const keySelect = document.getElementById("keySelect");
  const scaleSelect = document.getElementById("scaleSelect");
  const modeRadios = document.querySelectorAll('input[name="mode"]');

  renderApp();

  if (keySelect) keySelect.addEventListener("change", renderApp);
  if (scaleSelect) scaleSelect.addEventListener("change", renderApp);
  if (modeRadios && modeRadios.length) modeRadios.forEach(r => r.addEventListener("change", renderApp));
});
