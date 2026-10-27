// Loads main.js with a stubbed "obsidian" module and exposes internal helpers
// without shipping a test hook in the plugin itself.
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.classes = new Set();
    this.attrs = {};
    this.text = "";
    this.listeners = {};
    const props = {};
    this.style = { setProperty: (k, v) => { props[k] = v; }, props };
    this.classList = { toggle: (c, on) => (on ? this.classes.add(c) : this.classes.delete(c)) };
  }
  createEl(tag, opts = {}) {
    const el = new FakeElement(tag);
    if (opts.cls) for (const c of String(opts.cls).split(/\s+/).filter(Boolean)) el.classes.add(c);
    if (opts.text !== undefined) el.text = String(opts.text);
    if (opts.type) el.attrs.type = opts.type;
    if (opts.attr) for (const [k, v] of Object.entries(opts.attr)) el.attrs[k] = String(v);
    this.children.push(el);
    return el;
  }
  createDiv(opts) { return this.createEl("div", opts); }
  createSpan(opts) { return this.createEl("span", opts); }
  addClass(c) { this.classes.add(c); }
  hasClass(c) { return this.classes.has(c); }
  setAttr(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  setText(t) { this.text = String(t); }
  empty() { this.children = []; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  querySelectorAll() { return []; }
  *walk() { yield this; for (const c of this.children) yield* c.walk(); }
}

function loadPlugin({ loadData } = {}) {
  const notices = [];
  const obsidian = {
    Plugin: class {
      constructor(app, manifest) {
        this.app = app;
        this.manifest = manifest;
        this.commands = [];
        this.processors = {};
      }
      addCommand(cmd) { this.commands.push(cmd); return cmd; }
      registerMarkdownCodeBlockProcessor(lang, fn) { this.processors[lang] = fn; }
      addSettingTab() {}
      registerEvent() {}
      register() {}
      loadData() { return loadData ? loadData() : Promise.resolve(null); }
      saveData() { return Promise.resolve(); }
    },
    PluginSettingTab: class { constructor(app, plugin) { this.app = app; this.plugin = plugin; } },
    Setting: class {},
    Notice: class { constructor(msg) { notices.push(msg); } },
    Menu: class {},
    parseYaml: (text) => JSON.parse(text), // tests pass JSON, which is valid YAML
    setTooltip: (el, text) => el.setAttr("data-tooltip", text)
  };
  const source = readFileSync(join(__dirname, "..", "main.js"), "utf8");
  const module = { exports: {} };
  const factory = new Function("require", "module", "exports",
    `${source}\nreturn { extractFirstEmoji, emojiFromGrapheme, pickEventEmoji, INSERT_BLOCK_TEMPLATE };`);
  const internals = factory((name) => {
    if (name === "obsidian") return obsidian;
    throw new Error(`unexpected require(${name})`);
  }, module, module.exports);
  return { PluginClass: module.exports, internals, notices, FakeElement };
}

module.exports = { loadPlugin, FakeElement };
