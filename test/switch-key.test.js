import { test, mock } from "node:test";
import assert from "node:assert/strict";
import * as realWifi from "../src/wifi.js";
import { drawKey } from "../src/draw.js";

// index.js is the one file that talks to Stream Deck, so to try it
// without a deck I swap in a stand-in for the SDK and for the two
// functions that touch the Mac (readWifi and join). Everything else in
// the file is the real code.
const deck = { keys: [], errors: [], instances: [] };
const mac = { read: null, join: null, reads: 0 };

class SingletonAction {
  get actions() {
    return deck.keys;
  }
}
mock.module("@elgato/streamdeck", {
  namedExports: { action: () => (cls) => cls, SingletonAction },
  defaultExport: {
    logger: { setLevel() {}, error: (line) => deck.errors.push(line), warn() {}, info() {} },
    actions: { registerAction: (it) => deck.instances.push(it) },
    devices: [],
    connect() {},
  },
});
mock.module(new URL("../src/wifi.js", import.meta.url).href, {
  namedExports: {
    ...realWifi,
    readWifi: async () => {
      mac.reads++;
      return mac.read();
    },
    join: async (name) => mac.join(name),
  },
});
await import("../src/index.js");
const switchKey = deck.instances[0];

// The scan record the way wifi.test.js builds it: the name, tagged as text.
const onNetwork = (name) => ({
  power: true,
  connected: true,
  record: Buffer.concat([Buffer.from("bplist00"), Buffer.from([0x50 + name.length]), Buffer.from(name, "latin1")]),
});

// A key that remembers every picture it was given.
function fakeKey(id) {
  const key = { id, pictures: [], alerts: 0, broken: false };
  key.setImage = async (picture) => {
    if (key.broken) throw new Error(`key ${id} is gone`);
    key.pictures.push(picture);
  };
  key.showAlert = async () => key.alerts++;
  return key;
}

const appear = (key, networks = "Upstairs\nDownstairs") =>
  switchKey.onWillAppear({ action: key, payload: { settings: { networks } } });
const settle = () => new Promise((done) => setImmediate(done));

function start(t) {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  deck.keys = [fakeKey("a"), fakeKey("b")];
  deck.errors.length = 0;
  mac.reads = 0;
  mac.read = async () => onNetwork("Upstairs");
  mac.join = async () => {};
  // Whatever a test leaves running is stopped here, so one test's
  // timer can't wake up inside the next one.
  t.after(() => {
    for (const key of deck.keys) switchKey.onWillDisappear({ action: key });
    switchKey.notice = null;
    switchKey.joining = null;
    switchKey.wifi = undefined;
  });
}

// The plain case: every key on screen gets drawn from one look at the Wi-Fi.
test("a key that appears is drawn, and so is every other key", async (t) => {
  start(t);
  await appear(deck.keys[0]);
  await appear(deck.keys[1]);
  await settle();
  for (const key of deck.keys) assert.ok(key.pictures.length > 0 && key.pictures.at(-1).startsWith("data:image/svg+xml;base64,"));
});

// A key can vanish in the middle of a redraw (I move to another page).
// Its setImage fails, and that mustn't stop the keys after it or end the plugin.
test("a key that is gone mid-draw doesn't stop the others", async (t) => {
  start(t);
  deck.keys[0].broken = true;
  await appear(deck.keys[0]);
  await appear(deck.keys[1]);
  await settle();
  assert.ok(deck.keys[1].pictures.length > 0, "the second key still got its picture");
});

// A read that fails is not the same as Wi-Fi being off. The key keeps
// the last picture it had, and the log hears about it once.
test("a failed read keeps the last picture and logs once", async (t) => {
  start(t);
  await appear(deck.keys[0]);
  await settle();
  const before = [...deck.keys[0].pictures];
  assert.ok(before.length > 0);

  mac.read = async () => {
    throw new Error("scutil hung");
  };
  for (let i = 0; i < 3; i++) {
    t.mock.timers.tick(5000);
    await settle();
  }
  assert.deepEqual(deck.keys[0].pictures, before, "nothing new was drawn, least of all 'Wi-Fi off'");
  assert.equal(deck.errors.length, 1);
});

// A press looks at the Wi-Fi to know where it is, and once more to see
// the join land. Redrawing in between uses what it already knows.
test("a press that joins on the first try reads the Wi-Fi twice", async (t) => {
  start(t);
  await appear(deck.keys[0]);
  await settle();
  mac.reads = 0;
  // Starts on Upstairs, and is on Downstairs after the join.
  let joined = false;
  mac.join = async () => (joined = true);
  mac.read = async () => onNetwork(joined ? "Downstairs" : "Upstairs");
  await switchKey.onKeyDown({ action: deck.keys[0] });
  assert.equal(mac.reads, 2);
});

// A join that fails shows its notice, and two seconds later the notice
// goes. That redraw must not need a fresh read to work.
test("the notice clears with the Wi-Fi unreadable, and shows the last known picture", async (t) => {
  start(t);
  await appear(deck.keys[0]);
  await settle();
  mac.join = async () => {
    throw new Error("Could not find network");
  };
  await switchKey.onKeyDown({ action: deck.keys[0] });
  const withNotice = deck.keys[0].pictures.at(-1);

  mac.read = async () => {
    throw new Error("scutil hung");
  };
  t.mock.timers.tick(2000);
  await settle();
  const after = deck.keys[0].pictures.at(-1);
  assert.notEqual(after, withNotice, "the notice is gone");
  const networks = realWifi.parseNetworks("Upstairs\nDownstairs");
  const expected = drawKey({ networks, wifi: { ...onNetwork("Upstairs"), name: "Upstairs" }, joining: null, notice: null });
  assert.equal(after, `data:image/svg+xml;base64,${Buffer.from(expected).toString("base64")}`);
});
