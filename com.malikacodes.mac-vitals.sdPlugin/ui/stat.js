// Fills in a stat key's settings page. The plugin knows which key this
// is and what its readings are, so the page asks it for the words and
// then keeps listening: the plugin sends them again after every reading.
const { streamDeckClient } = SDPIComponents;

const put = (id, text) => (document.getElementById(id).textContent = text ?? "");

streamDeckClient.sendToPropertyInspector.subscribe((message) => {
  const sent = message.payload ?? {};
  if (sent.event !== "explain") return;

  put("what", sent.what);
  put("now", sent.now);
  put("verdict", sent.word);
  // The tone is the word's color: good, watch or bad. "plain" has none.
  document.getElementById("verdict").className = sent.tone;
  put("means", sent.means);
  put("todo", sent.todo);

  // Everything goes in as text, never as HTML.
  const normal = document.getElementById("normal");
  normal.replaceChildren(
    ...(sent.normal ?? []).map((line) => {
      const item = document.createElement("li");
      item.textContent = line;
      return item;
    }),
  );
});

streamDeckClient.send("sendToPlugin", { event: "explain" });
