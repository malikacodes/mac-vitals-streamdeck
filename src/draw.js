// Draws the keys as SVG text. It only draws: no Stream Deck, no Wi-Fi
// and no clock in here, so the tests can read what it made.

const FONT = "-apple-system, Helvetica, sans-serif";

// Pure black, to match the deck. Anything lighter shows up as a gray
// square next to the keys around it.
const BLACK = "#000000";
const WHITE = "#ffffff";
const DIM = "#5c5c62";
// The same pink as my Pomodoro heat map and my audio dial, so the
// graphs match when the keys sit next to them.
const PINK = "#f2a7c3";

// Where a stat key's graph sits, and how many readings wide it is. At
// one reading every 2 seconds, 30 of them is the last minute.
const GRAPH = { left: 14, right: 130, top: 96, bottom: 128 };
export const HISTORY = 30;

// The widest a line of text can be before the bezel eats it, and the
// sizes a name is allowed to be drawn at.
const TEXT_WIDTH = 128;
const BIGGEST = 24;
const SMALLEST = 17;
// Roughly how wide one letter is compared to the font size. The key
// can't measure text, so this is an estimate that runs a little wide.
const LETTER = 0.58;

// Text I typed can have a & or a < in it, and in SVG those mean
// something. This swaps them for their safe spellings.
function safe(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Shrinks a name until it fits on one line. If it still doesn't fit at
// the smallest size, the end is cut off and gets a "…".
export function fit(text) {
  const size = Math.max(SMALLEST, Math.min(BIGGEST, Math.floor(TEXT_WIDTH / (text.length * LETTER))));
  const room = Math.floor(TEXT_WIDTH / (size * LETTER));
  return { size, text: text.length > room ? `${text.slice(0, room - 1)}…` : text };
}

// The Wi-Fi symbol: a dot with three arcs fanning up from it.
function symbol(color) {
  const cx = 72;
  const cy = 64;
  // Each arc is a quarter of a circle, so its ends sit 45 degrees
  // either side of straight up.
  const arcs = [16, 30, 44].map((r) => {
    const reach = r * Math.SQRT1_2;
    const top = (cy - reach).toFixed(1);
    return `<path d="M${(cx - reach).toFixed(1)} ${top} A${r} ${r} 0 0 1 ${(cx + reach).toFixed(1)} ${top}"/>`;
  });
  return [
    `<g fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round">${arcs.join("")}</g>`,
    `<circle cx="${cx}" cy="${cy}" r="5.5" fill="${color}"/>`,
  ].join("");
}

// One dot per network along the bottom, with the current one lit. It's
// how I can tell where I am in the list and what a press comes to next.
function dots(count, lit) {
  const gap = 16;
  const start = 72 - ((count - 1) * gap) / 2;
  return Array.from({ length: count }, (_, i) =>
    `<circle cx="${start + i * gap}" cy="126" r="4" fill="${i === lit ? WHITE : DIM}"/>`,
  ).join("");
}

// A key, 144 by 144 pixels.
//   networks  my list, each one { name, label }
//   wifi      { power, connected, name }, where name is the network
//             from my list the Mac is on, or null
//   joining   the name of the network a press is on its way to
//   notice    a short message that takes over the words
export function drawKey({ networks = [], wifi = {}, joining, notice } = {}) {
  // A press on another key could be joining a network that isn't in
  // this key's list. Then this key has nothing to say about it.
  const going = networks.some((n) => n.name === joining);
  const at = networks.findIndex((n) => n.name === (going ? joining : wifi.name));

  // What the key says, and whether the symbol and the words are lit.
  let words;
  let symbolOn = false;
  let wordsOn = false;
  if (notice) {
    words = notice;
    wordsOn = true;
  } else if (networks.length === 0) {
    words = "Add networks";
  } else if (going) {
    // The name shows straight away and the symbol lights up when the
    // Mac is really on it.
    words = networks[at].label;
    wordsOn = true;
  } else if (!wifi.power) {
    words = "Wi-Fi off";
  } else if (!wifi.connected) {
    words = "No Wi-Fi";
  } else if (at === -1) {
    // Connected, but to something that isn't in my list.
    words = "Other Wi-Fi";
    symbolOn = true;
  } else {
    words = networks[at].label;
    symbolOn = true;
    wordsOn = true;
  }

  const line = fit(words);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144" font-family="${FONT}">`,
    `<rect width="144" height="144" fill="${BLACK}"/>`,
    symbol(symbolOn ? WHITE : DIM),
    `<text x="72" y="104" font-size="${line.size}" font-weight="600" text-anchor="middle" fill="${wordsOn ? WHITE : DIM}">${safe(line.text)}</text>`,
    // A lit dot means "the Mac is here", so it stays dark until it is.
    dots(networks.length, symbolOn && !notice ? at : -1),
    `</svg>`,
  ].join("");
}

// A stat key, 144 by 144 pixels: what it is, the number right now, and
// a line of the last minute underneath.
//   label    "CPU"
//   value    the number as words, "23"
//   unit     "%"
//   history  the last readings, oldest first, null for a missed one
//   top      the reading that touches the top of the graph
export function drawStat({ label = "", value = "–", unit = "", history = [], top = 100 } = {}) {
  // The newest reading is pinned to the right edge and older ones trail
  // off to the left, so a key that just appeared draws a short line
  // that grows, and doesn't stretch two readings across the whole key.
  const step = (GRAPH.right - GRAPH.left) / (HISTORY - 1);
  const recent = history.slice(-HISTORY);
  const points = [];
  recent.forEach((reading, i) => {
    if (reading == null) return;
    const x = GRAPH.right - (recent.length - 1 - i) * step;
    const share = Math.max(0, Math.min(1, top > 0 ? reading / top : 0));
    points.push(`${x.toFixed(1)} ${(GRAPH.bottom - share * (GRAPH.bottom - GRAPH.top)).toFixed(1)}`);
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144" font-family="${FONT}">`,
    `<rect width="144" height="144" fill="${BLACK}"/>`,
    `<text x="14" y="32" font-size="19" font-weight="600" fill="${DIM}">${safe(label)}</text>`,
    `<text x="14" y="78" font-size="40" font-weight="700" fill="${WHITE}">${safe(value)}<tspan font-size="19" font-weight="600" fill="${DIM}" dx="4">${safe(unit)}</tspan></text>`,
    // One reading can't make a line, so it waits for the second.
    points.length > 1
      ? `<path d="M${points.join(" L")}" fill="none" stroke="${PINK}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`
      : "",
    `</svg>`,
  ].join("");
}
