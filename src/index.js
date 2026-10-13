// The only file that talks to Stream Deck. It hears the presses and
// sends pictures back. The Wi-Fi part is in wifi.js, the readings are in
// vitals.js and the drawing is in draw.js.
import streamDeck, { action, SingletonAction } from "@elgato/streamdeck";
import { drawKey, drawStat, HISTORY } from "./draw.js";
import { explain } from "./explain.js";
import { deckChoices, whereToOpen } from "./pages.js";
import { readVitals, STATS, words } from "./vitals.js";
import { join, nextNetwork, parseNetworks, readWifi, whichNetwork } from "./wifi.js";

// Keep this at "info". The "trace" level writes every message between the
// plugin and Stream Deck into the log file, and that includes the global
// settings, which is where a token or an API key would live.
streamDeck.logger.setLevel("info");

// How long "Can't join" or "No password" stays on the key.
const NOTICE_MS = 2000;
// How often the key looks at the Wi-Fi by itself, so it keeps up when I
// change network from the menu bar or walk out of range.
const LOOK_MS = 5000;
// After a join, the Mac takes a moment to admit which network it's on.
const SETTLE_TRIES = 12;
const SETTLE_MS = 500;
// How often the stat keys take a reading. Two seconds is quick enough
// to feel live and slow enough that the looking doesn't show up in the
// CPU number it's measuring.
const VITALS_MS = 2000;

// Stream Deck takes an image as a base64 "data URI", which is the whole
// picture packed into one long string.
function asImage(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

class SwitchKey extends SingletonAction {
  // Each key's list of networks, by the key's id.
  lists = new Map();
  // The Mac has one Wi-Fi card, so these are shared by every key.
  busy = false;
  joining = null;
  notice = null;
  looking = null;

  async onWillAppear(ev) {
    this.lists.set(ev.action.id, parseNetworks(ev.payload.settings?.networks));
    await this.render();
    this.looking ??= setInterval(() => this.render(), LOOK_MS);
  }

  onWillDisappear(ev) {
    this.lists.delete(ev.action.id);
    // No keys on screen, nothing to keep up to date.
    if (this.lists.size === 0) {
      clearInterval(this.looking);
      this.looking = null;
    }
  }

  // Runs when I change the list on the settings page.
  async onDidReceiveSettings(ev) {
    this.lists.set(ev.action.id, parseNetworks(ev.payload.settings?.networks));
    await this.render();
  }

  async onKeyDown(ev) {
    // One switch at a time. The flag goes up before anything that
    // waits, because a wait is a gap a second fast press can slip
    // through. Two presses in the gap would start two joins at once,
    // and the second would read the Wi-Fi while the first had it
    // halfway between networks.
    if (this.busy) return;
    this.busy = true;
    try {
      await this.switchFrom(ev.action);
    } finally {
      this.busy = false;
    }
  }

  async switchFrom(key) {
    const networks = this.lists.get(key.id) ?? [];
    if (networks.length === 0) return key.showAlert();

    try {
      const wifi = await readWifi();
      const next = nextNetwork(networks, whichNetwork(wifi.record, networks));
      this.joining = next.name;
      await this.render();
      await join(next.name);
      // Wait for the Mac to say it's on the new network before the key
      // lights up, so the key never claims a network too early.
      for (let i = 0; i < SETTLE_TRIES; i++) {
        const now = await readWifi();
        if (whichNetwork(now.record, networks) === next.name) break;
        await wait(SETTLE_MS);
      }
      this.joining = null;
    } catch (err) {
      streamDeck.logger.error(`Couldn't switch Wi-Fi: ${err.message}`);
      this.joining = null;
      // The two failures need different things from me: one is a
      // Terminal command, the other is being in range.
      this.notice = err.noPassword ? "No password" : "Can't join";
      setTimeout(() => {
        this.notice = null;
        this.render();
      }, NOTICE_MS);
    }
    await this.render();
  }

  // Looks at the Wi-Fi once and redraws every key from it.
  async render() {
    let wifi;
    try {
      wifi = await readWifi();
    } catch (err) {
      streamDeck.logger.error(`Couldn't read the Wi-Fi: ${err.message}`);
      wifi = { power: false, connected: false, record: null };
    }
    for (const key of this.actions) {
      const networks = this.lists.get(key.id) ?? [];
      const name = whichNetwork(wifi.record, networks);
      await key.setImage(asImage(drawKey({ networks, wifi: { ...wifi, name }, joining: this.joining, notice: this.notice })));
    }
  }
}

// The last minute of every stat, shared by all the stat keys. One
// timer feeds all five, so the Mac is asked once per tick however many
// keys are showing.
const history = Object.fromEntries(Object.keys(STATS).map((stat) => [stat, []]));
const statKeys = new Set();
let reading = null;
// The stat key whose settings page is open, if one is. Stream Deck
// shows one settings page at a time.
let explaining = null;

async function takeReading() {
  const vitals = await readVitals();
  for (const stat of Object.keys(STATS)) {
    history[stat].push(vitals[stat]);
    if (history[stat].length > HISTORY) history[stat].shift();
  }
  await Promise.all([...statKeys].map((key) => key.render()));
  // Keeps "Right now" on the open settings page in step with the key.
  explaining?.sendWords();
}

// One of these per stat. They're the same key showing a different
// reading, so the stat's name is handed in when it's made.
class StatKey extends SingletonAction {
  constructor(stat) {
    super();
    this.stat = stat;
  }

  // The ids of this stat's keys that are on screen right now.
  shown = new Set();

  async onWillAppear(ev) {
    this.shown.add(ev.action.id);
    statKeys.add(this);
    await this.render();
    if (!reading) {
      reading = setInterval(takeReading, VITALS_MS);
      takeReading();
    }
  }

  onWillDisappear(ev) {
    this.shown.delete(ev.action.id);
    if (this.shown.size === 0) statKeys.delete(this);
    // No stat keys on screen, nothing to keep reading.
    if (statKeys.size === 0) {
      clearInterval(reading);
      reading = null;
    }
  }

  // A press opens the whole Mac Vitals page. It's for a stat key living
  // on another page, like Memory on my Home page: one number to glance
  // at, and a press for the rest. The key's settings say which deck the
  // page opens on, so a key on my XL can bring it up on my +. A plugin
  // can only open pages it ships with, which is why it's always this
  // page and never one I pick.
  async onKeyDown(ev) {
    const where = whereToOpen(ev.payload.settings?.openOn, ev.action.device, [...streamDeck.devices]);
    if (!where) return ev.action.showAlert();
    try {
      await streamDeck.profiles.switchToProfile(where.deck, where.profile);
    } catch (err) {
      streamDeck.logger.error(`Couldn't open the Mac Vitals page: ${err.message}`);
      await ev.action.showAlert();
    }
  }

  // The settings page asks two things when it opens: "explain" for its
  // words, and "getDecks" for the rows of its "Open on" menu.
  onSendToPlugin(ev) {
    if (ev.payload?.event === "getDecks") {
      streamDeck.ui.sendToPropertyInspector({ event: "getDecks", items: deckChoices([...streamDeck.devices]) }).catch(() => {});
    }
    if (ev.payload?.event !== "explain") return;
    explaining = this;
    this.sendWords();
  }

  onPropertyInspectorDidDisappear() {
    if (explaining === this) explaining = null;
  }

  sendWords() {
    const words = explain(this.stat, history[this.stat], STATS[this.stat].top);
    // The page can close between the reading and the send. Then
    // there's nobody to tell, and that's fine.
    streamDeck.ui.sendToPropertyInspector({ event: "explain", ...words }).catch(() => {});
  }

  async render() {
    const past = history[this.stat];
    const { label, top, floor } = STATS[this.stat];
    const picture = drawStat({
      label,
      ...words(this.stat, past.at(-1)),
      history: past,
      top: top ?? Math.max(floor, ...past.map((r) => r ?? 0)),
    });
    for (const key of this.actions) await key.setImage(asImage(picture));
  }
}

streamDeck.actions.registerAction(new (action({ UUID: "com.malikacodes.mac-vitals.switch" })(SwitchKey))());
// The action() helper marks a class, and each stat needs its own, so
// each one gets a small class of its own made from StatKey.
for (const stat of Object.keys(STATS)) {
  const Key = action({ UUID: `com.malikacodes.mac-vitals.${stat}` })(class extends StatKey {});
  streamDeck.actions.registerAction(new Key(stat));
}

// connect() comes after the actions are registered.
streamDeck.connect();
