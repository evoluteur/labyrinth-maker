/* Labyrinth Maker: draws one-axis circular labyrinths (the classical Cretan
   type and its relatives) from a path sequence, with a walk animation and
   PNG/SVG export. Plain JS, no dependencies.

   A labyrinth here is a list of circuits, numbered 1 (outermost) to n,
   in the order the path visits them. The path enters on the axis at the
   bottom, runs almost all the way round each circuit, and turns into the
   next one next to the axis, alternately on its right and on its left.
   A sequence draws a real labyrinth (no crossings) when, on each side of
   the axis, the turns nest inside each other like brackets. */

const $ = (id) => document.getElementById(id);

const PRESETS = [
  { id: "cretan7", label: "Cretan, 7 circuits", seq: [3, 2, 1, 4, 7, 6, 5],
    note: "The classical labyrinth of the Cretan coins and of rock carvings all over Europe, a pattern at least 3,000 years old." },
  { id: "troy11", label: "Troy Town, 11", seq: [5, 2, 3, 4, 1, 6, 11, 8, 9, 10, 7],
    note: "The 11-circuit classical labyrinth, grown from a larger seed pattern. Turf mazes in Britain and stone labyrinths in Scandinavia were often called Troy Towns." },
  { id: "chartres11", label: "Chartres sequence, 11", seq: [5, 4, 3, 2, 1, 6, 11, 10, 9, 8, 7],
    note: "The circuit order of the Chartres labyrinth, drawn here on a single axis. The real one at Chartres splits its circuits into quarters, with turns on four axes." },
  { id: "serpentine5", label: "Serpentine, 5", seq: [1, 2, 3, 4, 5],
    note: "The simplest possible labyrinth: the path steps in one circuit at a time. Walk it and you cover every ring in order." },
  { id: "cretan7rev", label: "Backward Cretan, 7", seq: [5, 6, 7, 4, 1, 2, 3],
    note: "The Cretan order walked backwards, from the center out. Entered from outside, it makes a labyrinth of its own." },
];

const LOOKS = [
  { id: "stone", label: "Stone", bg: "#1c2230", wall: "#c9c2b1", floor: "#2c3446", center: "#3a4560", walk: "#ffb13b" },
  { id: "turf", label: "Turf", bg: "#20351f", wall: "#6b9a4b", floor: "#d9c9a0", center: "#e8dcb7", walk: "#b3261e" },
  { id: "sand", label: "Sand", bg: "#e9dcc0", wall: "#8a6a3c", floor: "#f5ecd6", center: "#fbf5e6", walk: "#c0392b" },
  { id: "ink", label: "Ink", bg: "#ffffff", wall: "#141414", floor: "#ffffff", center: "#ffffff", walk: "#e0533d" },
  { id: "night", label: "Night", bg: "#0e1020", wall: "#6f8dff", floor: "#141833", center: "#1d2350", walk: "#ffd76a" },
];

const DEFAULTS = {
  preset: "cretan7",
  seq: "3 2 1 4 7 6 5",
  look: "stone",
  wall: 18, // wall thickness, in percent of the lane width
  line: true, // the walking line along the path
  numbers: false,
  speed: 5,
};
let S = { ...DEFAULTS };
try {
  Object.assign(S, JSON.parse(localStorage.getItem("labyrinth-settings") || "{}"));
} catch (e) {}
const save = () => {
  try {
    localStorage.setItem("labyrinth-settings", JSON.stringify(S));
  } catch (e) {}
};

const W = 20; // lane width
const f2 = (v) => v.toFixed(2);

// ---------------------------------------------------------------- geometry

const parseSeq = (text) =>
  String(text)
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number);

// Check a sequence and work out where every turn goes.
const build = (seq) => {
  const n = seq.length;
  if (n < 1) return { error: "Type a sequence of circuit numbers, like 3 2 1 4 7 6 5." };
  if (n > 21) return { error: "Keep it to 21 circuits or fewer." };
  const sorted = [...seq].sort((a, b) => a - b);
  if (sorted.some((v, i) => v !== i + 1)) {
    return { error: `Use each circuit from 1 to ${n} exactly once.` };
  }

  // Transitions: index 0 is the entrance (from outside, circuit 0), then
  // one turn between each pair of circuits, then the way into the center.
  const full = [0, ...seq, n + 1];
  const turns = [];
  for (let i = 0; i <= n; i++) {
    const a = full[i], b = full[i + 1];
    // the entrance sits on the axis; after it, turns alternate right (+1), left (-1)
    const side = i === 0 ? 0 : i % 2 === 1 ? 1 : -1;
    turns.push({ i, a, b, lo: Math.min(a, b), hi: Math.max(a, b), side });
  }

  // On each side, turns must nest like brackets.
  const crossing = (s, t) => s.lo < t.lo && t.lo < s.hi && s.hi < t.hi;
  const name = (x) => (x.b === n + 1 ? "the way into the center" : `the turn from ${x.a} to ${x.b}`);
  for (const s of turns) {
    for (const t of turns) {
      if (s === t || s.side === 0 || t.side === 0 || s.side !== t.side) continue;
      if (crossing(s, t)) {
        return { error: `The walls would cross: ${name(s)} and ${name(t)} overlap on the same side of the axis. Try another order.` };
      }
    }
  }
  // The first circuit leaves the entrance to the left, so no turn on the
  // left may reach across it.
  const s0 = seq[0];
  const blocker = turns.find((t) => t.side === -1 && t.lo < s0 && s0 < t.hi);
  if (blocker) {
    return { error: `The walls would cross: ${name(blocker)} cuts across circuit ${s0} as it leaves the entrance. Try another order.` };
  }

  // Radii: circuit 1 is outermost, the center is a disk inside circuit n.
  // Start with a small center and grow it until the turns fit comfortably.
  let Rc = W * 1.6;
  let phi = [];
  for (let tries = 0; tries < 40; tries++) {
    const r = (c) => Rc + (n - c + 0.5) * W; // radius of circuit c's center line
    const rIn = (t) => (t.hi > n ? Rc : r(t.hi) - W / 2); // innermost edge of the turn's span
    phi = new Array(turns.length).fill(0);
    // parents first: sort by span width, widest first
    const order = [...turns].sort((x, y) => y.hi - y.lo - (x.hi - x.lo));
    for (const t of order) {
      if (t.side === 0) continue; // entrance, on the axis
      const parents = turns.filter(
        (p) => p !== t && p.side === t.side && p.lo <= t.lo && t.hi <= p.hi && p.hi - p.lo > t.hi - t.lo
      );
      let base, gap;
      if (parents.length) {
        const p = parents.reduce((m, q) => (q.hi - q.lo < m.hi - m.lo ? q : m));
        base = phi[p.i];
        gap = W;
      } else {
        // next to the axis: a full lane away if the entrance runs alongside
        base = 0;
        gap = t.lo < s0 ? W : W / 2;
      }
      phi[t.i] = base + gap / Math.max(rIn(t), 1);
    }
    const worst = Math.max(...phi);
    if (worst < 0.9) break;
    Rc *= 1.18;
  }
  const r = (c) => Rc + (n - c + 0.5) * W;
  const Rout = Rc + n * W;

  // Path: entrance up the axis, then each circuit the long way round.
  // Angles are measured from the bottom axis; +x is to the right.
  const pt = (rad, th) => [rad * Math.sin(th), rad * Math.cos(th)];
  const P = (p) => `${f2(p[0])} ${f2(p[1])}`;
  let d = `M${P(pt(Rout + W * 1.2, 0))} L${P(pt(r(seq[0]), 0))}`;
  let th = 0; // current angle
  for (let k = 0; k < n; k++) {
    const c = seq[k];
    const t = turns[k + 1]; // the turn that ends this circuit
    const end = t.side === 1 ? phi[t.i] : -phi[t.i];
    // go the long way: if we end on the right, travel through the left (decreasing angle)
    const target = t.side === 1 ? end - 2 * Math.PI : end + 2 * Math.PI;
    const startTh = th;
    const sweep = target - startTh;
    const rad = r(c);
    // split into arcs of less than 180 degrees
    const parts = Math.ceil(Math.abs(sweep) / (Math.PI * 0.9));
    for (let j = 1; j <= parts; j++) {
      const a = startTh + (sweep * j) / parts;
      d += ` A${f2(rad)} ${f2(rad)} 0 0 ${sweep < 0 ? 1 : 0} ${P(pt(rad, a))}`;
    }
    th = end; // normalized: the far side of the axis is the same point
    const next = k + 1 < n ? r(seq[k + 1]) : Math.max(Rc - W * 0.9, 0);
    d += ` L${P(pt(next, end))}`;
  }
  return { n, seq, turns, phi, Rc, Rout, r, d };
};

// ---------------------------------------------------------------- drawing

const lookOf = () => LOOKS.find((l) => l.id === S.look) || LOOKS[0];

const labyrinthSVG = (L, forExport) => {
  const c = lookOf();
  const V = L.Rout + W * 1.6;
  const ww = Math.max(1, (S.wall / 100) * W);
  let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f2(-V)} ${f2(-V)} ${f2(2 * V)} ${f2(2 * V)}"${forExport ? "" : ' class="plain"'} role="img" aria-label="Labyrinth with ${L.n} circuits">`;
  o += `<rect x="${f2(-V)}" y="${f2(-V)}" width="${f2(2 * V)}" height="${f2(2 * V)}" fill="${c.bg}"/>`;
  // everything inside the outer wall starts as wall...
  o += `<circle r="${f2(L.Rout + ww / 2)}" fill="${c.wall}"/>`;
  // ...then the path is carved out of it
  o += `<path id="lab-path" d="${L.d}" fill="none" stroke="${c.floor}" stroke-width="${f2(W - ww)}" stroke-linejoin="round" stroke-linecap="butt"/>`;
  o += `<circle r="${f2(L.Rc - ww / 2)}" fill="${c.center}"/>`;
  if (S.line) {
    o += `<path d="${L.d}" fill="none" stroke="${c.walk}" stroke-opacity="0.35" stroke-width="1.2" stroke-dasharray="3 4" stroke-linejoin="round"/>`;
  }
  if (S.numbers) {
    const fs = Math.min(10, W * 0.5);
    for (let k = 1; k <= L.n; k++) {
      o += `<text x="0" y="${f2(-L.r(k))}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-family="Georgia, serif" fill="${c.wall}" opacity="0.9">${k}</text>`;
    }
  }
  // walked part and walker, driven by the animation
  if (!forExport) {
    o += `<path id="walked" d="${L.d}" fill="none" stroke="${c.walk}" stroke-width="${f2((W - ww) * 0.35)}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.8" style="display:none"/>`;
    o += `<circle id="walker" r="${f2((W - ww) * 0.32)}" fill="${c.walk}" style="display:none"/>`;
  }
  return o + "</svg>";
};

// ---------------------------------------------------------------- state and UI

let L = null;

const setPressed = (id, items, cur) => {
  document.querySelectorAll(`#${id} button`).forEach((b, i) => {
    const on = items[i].id === cur;
    b.className = on ? "selected" : "";
    b.setAttribute("aria-pressed", on);
  });
};

const pathLength = () => {
  const p = document.getElementById("lab-path");
  return p ? p.getTotalLength() : 0;
};

const render = () => {
  stopWalk();
  const seq = parseSeq(S.seq);
  const built = build(seq);
  const err = $("seq-error");
  if (built.error) {
    err.textContent = built.error;
    err.hidden = false;
    $("seq").setAttribute("aria-invalid", "true");
    if (!L) return;
  } else {
    err.hidden = true;
    $("seq").removeAttribute("aria-invalid");
    L = built;
  }
  $("labyrinth").innerHTML = labyrinthSVG(L, false);
  const preset = PRESETS.find((p) => p.seq.join(" ") === L.seq.join(" "));
  S.preset = preset ? preset.id : "custom";
  setPressed("preset-chips", PRESETS, S.preset);
  setPressed("look-chips", LOOKS, S.look);
  $("preset-note").textContent = preset ? preset.note : "Your own sequence.";
  const len = pathLength();
  const around = len / (2 * Math.PI * (L.Rout - W / 2));
  $("stats").innerHTML = [
    ["Circuits", L.n],
    ["Turns", L.n - 1],
    ["Sequence", L.seq.join("-")],
    ["Path", `${around.toFixed(1)}× around`],
  ]
    .map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`)
    .join("");
  $("wall-val").textContent = S.wall + "%";
  $("speed-val").textContent = S.speed;
};

// ---------------------------------------------------------------- walk

let raf = null;
let walkPos = 0;
const stopWalk = () => {
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  const b = $("walk");
  if (b) b.textContent = "Walk it";
};
const walk = () => {
  if (raf) return stopWalk();
  const path = document.getElementById("lab-path");
  const walked = document.getElementById("walked");
  const dot = document.getElementById("walker");
  if (!path) return;
  const len = path.getTotalLength();
  if (walkPos >= len - 1) walkPos = 0;
  walked.style.display = "";
  dot.style.display = "";
  walked.setAttribute("stroke-dasharray", `${len} ${len}`);
  $("walk").textContent = "Pause";
  let last = performance.now();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const step = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    walkPos = reduce ? len : Math.min(len, walkPos + dt * S.speed * 18);
    walked.setAttribute("stroke-dashoffset", len - walkPos);
    const p = path.getPointAtLength(walkPos);
    dot.setAttribute("cx", p.x);
    dot.setAttribute("cy", p.y);
    const pct = Math.round((100 * walkPos) / len);
    $("walk-note").textContent = walkPos >= len ? "You have reached the center." : `${pct}% of the way.`;
    if (walkPos < len) raf = requestAnimationFrame(step);
    else stopWalk();
  };
  raf = requestAnimationFrame(step);
};
const resetWalk = () => {
  stopWalk();
  walkPos = 0;
  $("walk-note").textContent = "";
  render();
};

// ---------------------------------------------------------------- export

const download = (blob, name) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
const fileName = (ext) => `labyrinth-${L.seq.join("-")}.${ext}`;
const exportSVG = () => download(new Blob([labyrinthSVG(L, true)], { type: "image/svg+xml" }), fileName("svg"));
const exportPNG = () => {
  const px = 2000;
  const svg = labyrinthSVG(L, true).replace("<svg ", `<svg width="${px}" height="${px}" `);
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = px;
    cv.getContext("2d").drawImage(img, 0, 0, px, px);
    cv.toBlob((b) => download(b, fileName("png")));
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
};

// A random valid sequence, for exploring. Valid orders get rare fast
// (about 1 in 1,000 for nine circuits), so this stays at 5 to 9.
const randomSeq = () => {
  const cur = parseSeq(S.seq).join();
  const n = [5, 7, 7, 9, 9][Math.floor(Math.random() * 5)];
  for (let tries = 0; tries < 30000; tries++) {
    const s = Array.from({ length: n }, (_, i) => i + 1);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [s[i], s[j]] = [s[j], s[i]];
    }
    const key = s.join();
    if (key === cur || key === [...s].sort((a, b) => a - b).join()) continue;
    if (!build(s).error) return s;
  }
  return PRESETS[0].seq;
};

const chips = (id, items, pick) => {
  const box = $(id);
  box.innerHTML = "";
  items.forEach((it) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = it.label;
    b.onclick = () => pick(it);
    box.appendChild(b);
  });
};

const initLabyrinth = () => {
  if (!LOOKS.some((l) => l.id === S.look)) S.look = "stone";
  if (build(parseSeq(S.seq)).error) S.seq = DEFAULTS.seq;
  const seqIn = $("seq");
  seqIn.value = S.seq;
  const setSeq = (s) => {
    S.seq = s.join(" ");
    seqIn.value = S.seq;
    walkPos = 0;
    $("walk-note").textContent = "";
    save();
    render();
  };
  chips("preset-chips", PRESETS, (p) => setSeq(p.seq));
  chips("look-chips", LOOKS, (l) => { S.look = l.id; save(); render(); });
  seqIn.oninput = () => {
    S.seq = seqIn.value;
    walkPos = 0;
    if (!build(parseSeq(S.seq)).error) save();
    render();
  };
  $("random").onclick = () => setSeq(randomSeq());
  const wall = $("wall");
  wall.value = S.wall;
  wall.oninput = () => { S.wall = +wall.value; save(); render(); };
  const speed = $("speed");
  speed.value = S.speed;
  speed.oninput = () => { S.speed = +speed.value; save(); $("speed-val").textContent = S.speed; };
  ["line", "numbers"].forEach((k) => {
    const el = $("l-" + k);
    el.checked = !!S[k];
    el.onchange = () => { S[k] = el.checked; save(); render(); };
  });
  $("walk").onclick = walk;
  $("reset").onclick = resetWalk;
  $("export-png").onclick = exportPNG;
  $("export-svg").onclick = exportSVG;
  render();
};
