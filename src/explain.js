// The words for each stat key's settings page: what the key is, what
// the number means right now, what's normal, and what to do when it
// isn't. I forget which of these is which, so the key explains itself.
//
// Plain functions only. They're handed the last minute of readings and
// hand back words.
import { words } from "./vitals.js";

// The parts that never change. The cut-off numbers further down are
// rules of thumb, not laws: they're where a Mac or a connection usually
// starts to feel different.
const ABOUT = {
  cpu: {
    what: "How hard the Mac's brain is working. The CPU is the part that does the thinking, and this is how much of it is busy.",
    normal: ["Under 50%: calm", "50 to 85%: busy, fine while I'm doing something heavy", "Over 85% for a minute or more: something is hogging it"],
    todo: "Open Activity Monitor, click the % CPU column to sort, and quit the app at the top. If it stays high with nothing open, restart the Mac.",
  },
  memory: {
    what: "How full the Mac's desk is. Memory is the space where open apps and tabs are laid out. It isn't storage: closing an app frees it.",
    normal: ["Under 75% of the total: plenty of room", "75 to 90%: getting full", "Over 90%: full, and the Mac starts to feel slow"],
    todo: "Close apps and browser tabs I'm not using. Activity Monitor's Memory tab shows the biggest ones. If it's still full after that, restart the Mac.",
  },
  down: {
    what: "How much is coming in from the internet right now: videos, pages, downloads. It's the speedometer, not the top speed.",
    normal: ["Near zero when nothing is loading. That's normal, not slow", "A video in HD uses about 5 Mbps", "A video in 4K uses about 25 Mbps"],
    todo: "A low number only matters while something is loading. If a video is stuttering and this is low, look at the Ping key: that one says whether the internet itself is struggling.",
  },
  up: {
    what: "How much is going out to the internet right now: my camera on a call, files I'm sending, backups.",
    normal: ["Near zero most of the time", "A video call sends about 3 Mbps", "High for a long time means something is uploading, like a backup or a photo sync"],
    todo: "If a call is choppy for the other person and this is high, something else is uploading. Pause the backup or the sync until the call is over.",
  },
  ping: {
    what: "How long the internet takes to answer. The Mac sends a tiny hello to a server and times the reply. Lower is snappier.",
    normal: ["Under 40 ms: fast", "40 to 100 ms: fine", "100 to 250 ms: calls and games get laggy", "A dash: no answer at all"],
    todo: "Press the Wi-Fi key to try the other network. If both are slow or dead, turn the router off, wait 30 seconds, and turn it back on.",
  },
};

// The average of the readings that are there, or null if none are.
function average(readings) {
  const there = readings.filter((r) => r != null);
  return there.length ? there.reduce((sum, r) => sum + r, 0) / there.length : null;
}

// One word for how things are, a tone for its color, and a sentence on
// what that means for me.
//   tone  "good", "watch", "bad", or "plain" when there's no good or bad
function verdict(stat, history, top) {
  const latest = history.at(-1);

  if (stat === "ping") {
    // One lost hello happens. Most of the last five going missing is
    // the internet being down.
    const lately = history.slice(-5);
    if (lately.length >= 3 && lately.filter((r) => r == null).length >= 3) {
      return { word: "No answer", tone: "bad", means: "The internet isn't answering. This is the one to act on." };
    }
    const usual = average(history);
    if (usual == null) return { word: "Checking", tone: "plain", means: "Waiting for the first reply." };
    if (usual < 40) return { word: "Fast", tone: "good", means: "Nothing to do." };
    if (usual < 100) return { word: "Fine", tone: "good", means: "Nothing to do." };
    if (usual < 250) return { word: "Laggy", tone: "watch", means: "Pages still load, but calls and games will stutter." };
    return { word: "Very slow", tone: "bad", means: "The connection is struggling." };
  }

  if (latest == null) return { word: "Checking", tone: "plain", means: "Waiting for the first reading." };

  if (stat === "cpu") {
    // Judged on the whole minute. A spike when an app opens is normal
    // and gone in seconds.
    const usual = average(history);
    if (usual < 50) return { word: "Calm", tone: "good", means: "Nothing to do." };
    if (usual < 85) return { word: "Busy", tone: "watch", means: "Fine if I'm doing something heavy. If I'm not, something in the background is." };
    return { word: "Maxed out", tone: "bad", means: "It's been flat out for the last minute. The fans and the lag are this." };
  }

  if (stat === "memory") {
    const full = (latest / top) * 100;
    const share = `${Math.round(full)}% of ${words("memory", top).value} GB`;
    if (full < 75) return { word: "Plenty of room", tone: "good", means: `${share}. Nothing to do.` };
    if (full < 90) return { word: "Getting full", tone: "watch", means: `${share}. Still fine, but worth closing what I'm not using.` };
    return { word: "Full", tone: "bad", means: `${share}. The Mac is juggling to make room, which is why it feels slow.` };
  }

  // The speeds. There's no good or bad here, only how much is moving.
  if (latest < 0.1) return { word: "Quiet", tone: "plain", means: "Almost nothing is moving. Normal when nothing is loading." };
  if (latest < 5) return { word: "Light", tone: "plain", means: "A little is moving: pages, messages, music." };
  if (latest < 25) return { word: "Steady", tone: "plain", means: "About a video's worth is moving." };
  return { word: "Heavy", tone: "plain", means: "A lot is moving: a big download, 4K video, or a backup." };
}

// Everything the settings page shows for one stat.
//   history  the last minute of readings, oldest first
//   top      the most this stat can be (all the Mac's memory, for memory)
export function explain(stat, history = [], top) {
  const now = words(stat, history.at(-1));
  return {
    ...ABOUT[stat],
    now: `${now.value} ${now.unit}`.trim(),
    ...verdict(stat, history, top),
  };
}
