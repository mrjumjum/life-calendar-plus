const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPlugin, FakeElement } = require("./harness");

function makeApp(notes) {
  return {
    vault: { getMarkdownFiles: () => notes.map((n) => n.file) },
    metadataCache: { getFileCache: (file) => ({ frontmatter: notes.find((n) => n.file === file).frontmatter }) },
    workspace: { openLinkText() {} }
  };
}

test("command and processor register even if loadData rejects", async () => {
  const { PluginClass, internals } = loadPlugin({ loadData: () => Promise.reject(new SyntaxError("bad json")) });
  const plugin = new PluginClass(makeApp([]), { id: "life-calendar-plus" });
  const origError = console.error;
  console.error = () => {};
  try {
    await plugin.onload();
  } finally {
    console.error = origError;
  }
  assert.equal(plugin.commands.length, 1);
  const [cmd] = plugin.commands;
  assert.equal(cmd.id, "insert-life-calendar-block");
  assert.equal(cmd.name, "Insert life calendar block");
  assert.equal(typeof cmd.editorCallback, "function");
  assert.equal(typeof plugin.processors["life-calendar"], "function");
  assert.equal(plugin.settings.showLabelsEvery, 5);

  let inserted = null;
  const editorAt = (ch) => ({ getCursor: () => ({ line: 0, ch }), replaceSelection: (t) => { inserted = t; } });
  cmd.editorCallback(editorAt(0));
  assert.equal(inserted, `${internals.INSERT_BLOCK_TEMPLATE}\n`);
  cmd.editorCallback(editorAt(4));
  assert.equal(inserted, `\n${internals.INSERT_BLOCK_TEMPLATE}\n`);
  assert.match(internals.INSERT_BLOCK_TEMPLATE, /^```life-calendar\ntitle: Life calendar\nbirthDate: YYYY-MM-DD\nlifeExpectancy: 85\nshowLabelsEvery: 5\nshowDecadeGaps: true\nincludeVaultEvents: true\n```$/);
});

test("renders emoji overlays on event weeks only", async () => {
  const notes = [
    { file: { path: "a.md", basename: "Moved house" }, frontmatter: { "life-calendar-event": true, date: "2015-05-02", title: "Moved house" } },
    { file: { path: "b.md", basename: "b" }, frontmatter: { "life-calendar-event": true, date: "2015-05-03", title: "Wedding 💍" } },
    { file: { path: "c.md", basename: "🎂 Birthday" }, frontmatter: { type: "life-event", date: "2000-03-01" } },
    { file: { path: "d.md", basename: "d" }, frontmatter: { "life-calendar-event": true, date: "2005-07-01", title: "No emoji here" } },
    { file: { path: "e.md", basename: "e" }, frontmatter: { "life-calendar-event": true, date: "2008-07-01", title: "Trip", emoji: "✈️" } },
    { file: { path: "f.md", basename: "f" }, frontmatter: { tags: ["other"], date: "2009-01-01", title: "🚫 not an event" } }
  ];
  const { PluginClass } = loadPlugin();
  const plugin = new PluginClass(makeApp(notes), { id: "life-calendar-plus" });
  await plugin.onload();

  const el = new FakeElement("div");
  const config = {
    title: "Test",
    birthDate: "1990-01-01",
    lifeExpectancy: 85,
    phases: [{ label: "Work", category: "work", startAge: 18, endAge: 30 }],
    events: [{ title: "🎓 Graduation", date: "2012-06-01" }]
  };
  await plugin.processors["life-calendar"](JSON.stringify(config), el, { sourcePath: "note.md" });

  const all = [...el.walk()];
  const cells = all.filter((e) => e.hasClass("life-calendar-week"));
  assert.equal(cells.length, 85 * 52);

  const emojiCells = cells.filter((c) => c.hasClass("has-event-emoji"));
  const overlays = all.filter((e) => e.hasClass("life-calendar-week-emoji"));
  assert.equal(emojiCells.length, 4, "4 event weeks with an emoji (two events share one week)");
  assert.equal(overlays.length, 4);
  for (const cell of emojiCells) {
    assert.equal(cell.tagName, "BUTTON");
    assert.ok(cell.hasClass("has-event"));
    const [overlay] = cell.children;
    assert.equal(overlay.attrs["aria-hidden"], "true");
  }
  const glyphs = emojiCells.map((c) => c.children[0].text).sort();
  assert.deepEqual(glyphs, ["✈️", "🎂", "🎓", "💍"].sort());

  const shared = emojiCells.find((c) => c.hasClass("has-multiple-events"));
  assert.equal(shared.children[0].text, "💍", "first event *with* an emoji wins");
  assert.equal(shared.attrs["data-event-count"], "2");
  assert.ok(shared.hasClass("has-phase"), "emoji cell keeps its phase class/background");

  // No emoji: the week stays a normal event square (upstream accent dot, no overlay).
  const noEmoji = cells.find((c) => /No emoji here/.test(c.attrs["aria-label"] || ""));
  assert.ok(noEmoji.hasClass("has-event"));
  assert.ok(!noEmoji.hasClass("has-event-emoji"));
  assert.equal(noEmoji.children.length, 0);

  const plain = cells.filter((c) => !c.hasClass("has-event"));
  assert.ok(plain.every((c) => c.children.length === 0 && c.tagName === "DIV"));
});

test("inline-only calendars still sort events by date", async () => {
  const { PluginClass } = loadPlugin();
  const plugin = new PluginClass(makeApp([]), { id: "life-calendar-plus" });
  await plugin.onload();
  const events = plugin.collectEvents({
    includeVaultEvents: false,
    events: [{ title: "late 🅱️", date: "2020-01-02" }, { title: "early 🅰️", date: "2020-01-01" }]
  }, "", new Date(Date.UTC(1990, 0, 1, 12)));
  assert.deepEqual(events.map((e) => e.emoji), ["🅰️", "🅱️"]);
});

test("fullWidth is on by default and can be turned off per block", async () => {
  const { PluginClass } = loadPlugin();
  const plugin = new PluginClass(makeApp([]), { id: "life-calendar-plus" });
  await plugin.onload();
  const rootOf = async (config) => {
    const el = new FakeElement("div");
    await plugin.processors["life-calendar"](JSON.stringify(config), el, { sourcePath: "note.md" });
    return [...el.walk()].find((e) => e.hasClass("life-calendar"));
  };
  assert.ok((await rootOf({ birthDate: "1990-01-01" })).hasClass("life-calendar-full-width"));
  assert.ok(!(await rootOf({ birthDate: "1990-01-01", fullWidth: false })).hasClass("life-calendar-full-width"));
});

test("open calendars redraw when event notes are deleted, added or renamed", async () => {
  const notes = [
    { file: { path: "a.md", basename: "a" }, frontmatter: { "life-calendar-event": true, date: "2010-05-03", title: "A", emoji: "🎓" } },
    { file: { path: "b.md", basename: "b" }, frontmatter: { "life-calendar-event": true, date: "2010-05-04", title: "B dup" } }
  ];
  const handlers = {};
  const on = (name, fn) => { handlers[name] = fn; return { name }; };
  const app = {
    vault: { getMarkdownFiles: () => notes.map((n) => n.file), on },
    metadataCache: { getFileCache: (f) => ({ frontmatter: (notes.find((n) => n.file === f) || {}).frontmatter }), on },
    workspace: { openLinkText() {} }
  };
  const { PluginClass } = loadPlugin();
  const plugin = new PluginClass(app, { id: "life-calendar-plus" });
  await plugin.onload();
  const el = new FakeElement("div");
  await plugin.processors["life-calendar"](JSON.stringify({ birthDate: "1990-01-01" }), el, { sourcePath: "cal.md" });
  const shared = () => [...el.walk()].filter((e) => e.hasClass("has-multiple-events")).length;
  const eventWeeks = () => [...el.walk()].filter((e) => e.hasClass("has-event")).length;
  assert.equal(shared(), 1, "two events in one week");

  // A sync deletes the duplicate.
  const dup = notes.pop();
  handlers.delete(dup.file);
  await new Promise((r) => setTimeout(r, 450));
  assert.equal(shared(), 0, "redrawn without the deleted note");

  // A new event note arrives.
  const c = { file: { path: "c.md", basename: "c" }, frontmatter: { "life-calendar-event": true, date: "2015-01-05", title: "C" } };
  notes.push(c);
  handlers.changed(c.file, "", { frontmatter: c.frontmatter });
  await new Promise((r) => setTimeout(r, 450));
  assert.equal(eventWeeks(), 2);

  // Unrelated notes don't trigger a redraw.
  let renders = 0;
  const orig = plugin.renderCodeBlock.bind(plugin);
  plugin.renderCodeBlock = (...args) => { renders++; return orig(...args); };
  handlers.changed({ path: "todo.md" }, "", { frontmatter: { tags: ["todo"] } });
  handlers.delete({ path: "other.md" });
  await new Promise((r) => setTimeout(r, 450));
  assert.equal(renders, 0);
});
