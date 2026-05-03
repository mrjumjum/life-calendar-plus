const {
  Plugin,
  ItemView,
  PluginSettingTab,
  Setting,
  Notice,
  Menu,
  parseYaml,
  setTooltip,
  debounce
} = require("obsidian");

const VIEW_TYPE_LIFE_CALENDAR = "life-calendar-view";
const WEEKS_PER_YEAR = 52;

const DEFAULT_PHASES = [
  {
    label: "Education chapter",
    category: "education",
    startAge: 18,
    endAge: 22,
    description: "Example education phase."
  },
  {
    label: "Career chapter",
    category: "work",
    startAge: 22,
    endAge: 55,
    description: "Example primary career phase."
  },
  {
    label: "Portfolio chapter",
    category: "work",
    startAge: 55,
    endAge: 65,
    description: "Example independent, advisory, or portfolio work phase."
  },
  {
    label: "Later-life chapter",
    category: "life",
    startAge: 65,
    endAge: 85,
    description: "Example later-life planning phase."
  }
];

const DEFAULT_SETTINGS = {
  title: "Life calendar",
  birthDate: "",
  lifeExpectancy: 85,
  showLabelsEvery: 5,
  showDecadeGaps: true,
  includeVaultEvents: true,
  eventProperty: "life-calendar-event",
  eventDateProperty: "date",
  eventTitleProperty: "title",
  visibleCategories: [],
  hiddenCategories: [],
  phases: DEFAULT_PHASES
};

module.exports = class LifeCalendarPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.registerView(VIEW_TYPE_LIFE_CALENDAR, (leaf) => new LifeCalendarView(leaf, this));

    this.addRibbonIcon("calendar-days", "Open life calendar", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-life-calendar",
      name: "Open life calendar",
      callback: () => this.activateView()
    });

    this.addCommand({
      id: "insert-life-calendar-block",
      name: "Insert life calendar block",
      editorCallback: (editor) => {
        editor.replaceSelection(this.createExampleCodeBlock());
      }
    });

    this.registerMarkdownCodeBlockProcessor("life-calendar", async (source, el, ctx) => {
      await this.renderCodeBlock(source, el, ctx);
    });


    this.addSettingTab(new LifeCalendarSettingTab(this.app, this));

    this.refreshViewsDebounced = debounce(() => this.refreshViews(), 250, true);
    this.registerEvent(this.app.metadataCache.on("changed", () => this.refreshViewsDebounced()));
    this.registerEvent(this.app.vault.on("rename", () => this.refreshViewsDebounced()));
    this.registerEvent(this.app.vault.on("delete", () => this.refreshViewsDebounced()));
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_LIFE_CALENDAR);
  }

  async loadSettings() {
    const saved = await this.loadData();
    this.settings = mergeSettings(DEFAULT_SETTINGS, saved || {});
  }

  async saveSettings() {
    await this.saveData(this.settings);
    await this.refreshViews();
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_LIFE_CALENDAR)[0];

    if (!leaf) {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_LIFE_CALENDAR, active: true });
    }

    workspace.revealLeaf(leaf);
  }

  async refreshViews() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_LIFE_CALENDAR);
    for (const leaf of leaves) {
      if (leaf.view instanceof LifeCalendarView) {
        await leaf.view.render();
      }
    }
  }

  async renderCodeBlock(source, el, ctx) {
    el.empty();
    const sourcePath = ctx && ctx.sourcePath ? ctx.sourcePath : "";

    let inlineConfig = {};
    try {
      inlineConfig = parseSourceConfig(source);
    } catch (error) {
      this.renderError(el, "Could not parse life calendar configuration.", error.message);
      return;
    }

    await this.renderCalendar(el, inlineConfig, sourcePath);
  }

  async renderCalendar(containerEl, inlineConfig = {}, sourcePath = "") {
    containerEl.empty();
    containerEl.addClass("life-calendar-container");

    const config = normaliseCalendarConfig(mergeSettings(this.settings, inlineConfig));
    const birthDate = parseDateOnly(config.birthDate);

    if (!birthDate) {
      this.renderSetup(containerEl, config);
      return;
    }

    const totalWeeks = config.lifeExpectancy * WEEKS_PER_YEAR;
    const today = todayDateOnly();
    const terminalDate = addYears(birthDate, config.lifeExpectancy);
    const currentAge = Math.max(0, getWholeAgeAt(today, birthDate));
    const completedWeeks = getCompletedWeeks(today, birthDate, config.lifeExpectancy);
    const remainingWeeks = Math.max(0, totalWeeks - completedWeeks);
    const events = this.collectEvents(config, sourcePath, birthDate);
    const eventMap = groupEventsByPosition(events, birthDate, config.lifeExpectancy);

    const root = containerEl.createDiv({ cls: "life-calendar" });
    root.style.setProperty("--life-calendar-weeks", String(WEEKS_PER_YEAR));

    const header = root.createDiv({ cls: "life-calendar-header" });
    header.createEl("h3", { text: config.title || "Life calendar" });

    const meta = header.createDiv({ cls: "life-calendar-meta" });
    meta.createSpan({ text: `Age ${currentAge}` });
    meta.createSpan({ text: `${formatNumber(completedWeeks)} of ${formatNumber(totalWeeks)} weeks completed` });
    meta.createSpan({ text: `${formatNumber(remainingWeeks)} weeks remaining to ${config.lifeExpectancy}` });
    meta.createSpan({ text: `Planning horizon ends ${formatDate(terminalDate)}` });

    this.renderCategoryControls(root, config.phases);
    this.renderLegend(root, config, events.length);

    const grid = root.createDiv({ cls: "life-calendar-grid" });

    for (let age = 0; age < config.lifeExpectancy; age += 1) {
      const row = grid.createDiv({ cls: "life-calendar-row" });
      if (config.showDecadeGaps && age > 0 && age % 10 === 0) {
        row.addClass("life-calendar-decade-start");
      }

      const weeks = row.createDiv({ cls: "life-calendar-weeks" });

      for (let week = 0; week < WEEKS_PER_YEAR; week += 1) {
        const key = positionKey(age, week);
        const weekEvents = eventMap.get(key) || [];
        const range = getWeekRange(birthDate, age, week);
        const isCompleted = range.end <= today;
        const isCurrent = range.start <= today && today < range.end;
        const phase = findPhaseForWeek(config.phases, age, week, range.start, range.end);
        const cell = weeks.createEl(weekEvents.length ? "button" : "div", {
          cls: "life-calendar-week"
        });

        cell.setAttr("aria-label", this.describeWeek(age, week, range, phase, weekEvents));
        cell.setAttr("data-age", String(age));
        cell.setAttr("data-week", String(week + 1));

        if (isCompleted) cell.addClass("is-completed");
        if (isCurrent) cell.addClass("is-current");
        if (phase) {
          cell.addClass("has-phase");
          applyPhaseStyle(cell, phase);
          cell.setAttr("data-phase", phase.label || "Phase");
          cell.setAttr("data-phase-category", phase.category || "uncategorised");
        }
        if (phase || weekEvents.length) {
          setElementTooltip(cell, this.describeWeek(age, week, range, phase, weekEvents));
        }
        if (weekEvents.length) {
          cell.setAttr("type", "button");
          cell.addClass("has-event");
          if (weekEvents.length > 1) cell.addClass("has-multiple-events");
          this.attachEventInteraction(cell, weekEvents, sourcePath);
        }
      }

      const rightLabel = row.createDiv({ cls: "life-calendar-age-label life-calendar-age-label-right" });
      const completedAgeYear = age + 1;
      if (completedAgeYear % config.showLabelsEvery === 0) {
        rightLabel.setText(String(completedAgeYear));
      }
    }
  }

  renderCategoryControls(root, phases) {
    const categories = uniquePhaseCategories(phases);
    if (categories.length <= 1) return;

    const controls = root.createDiv({ cls: "life-calendar-category-controls" });
    controls.createSpan({ cls: "life-calendar-category-controls-label", text: "Categories" });

    for (const category of categories) {
      const label = controls.createEl("label", { cls: "life-calendar-category-toggle" });
      const checkbox = label.createEl("input", { type: "checkbox" });
      checkbox.checked = true;
      label.createSpan({ text: category });
      checkbox.addEventListener("change", () => {
        setCategoryVisible(root, category, checkbox.checked);
      });
    }
  }

  renderLegend(root, config, eventCount) {
    const legend = root.createDiv({ cls: "life-calendar-legend" });
    createLegendItem(legend, "Completed", "life-calendar-legend-completed");
    createLegendItem(legend, "Current week", "life-calendar-legend-current");

    for (const phase of config.phases) {
      if (!phase || !phase.label) continue;
      const item = createLegendItem(legend, phase.label, "life-calendar-legend-phase");
      applyPhaseStyle(item, phase);
      item.setAttr("data-phase-category", phase.category || "uncategorised");
      setElementTooltip(item, describePhase(phase));
    }

    if (eventCount > 0) {
      createLegendItem(legend, `${formatNumber(eventCount)} linked event${eventCount === 1 ? "" : "s"}`, "life-calendar-legend-event");
    }
  }

  renderSetup(containerEl, config) {
    const setup = containerEl.createDiv({ cls: "life-calendar-setup" });
    setup.createEl("h3", { text: config.title || "Life calendar" });
    setup.createEl("p", {
      text: "Set a date of birth in the Life Calendar settings, or add birthDate: YYYY-MM-DD to the code block."
    });

    const actions = setup.createDiv({ cls: "life-calendar-setup-actions" });
    const settingsButton = actions.createEl("button", { text: "Open settings" });
    settingsButton.addEventListener("click", () => this.openSettings());

    const help = setup.createEl("details");
    help.createEl("summary", { text: "Example code block" });
    help.createEl("pre", { text: this.createExampleCodeBlock() });
  }

  renderError(containerEl, title, detail) {
    const error = containerEl.createDiv({ cls: "life-calendar-error" });
    error.createEl("strong", { text: title });
    if (detail) error.createEl("p", { text: detail });
  }

  openSettings() {
    if (this.app.setting && typeof this.app.setting.open === "function") {
      this.app.setting.open();
      if (typeof this.app.setting.openTabById === "function") {
        this.app.setting.openTabById(this.manifest.id);
      }
    } else {
      new Notice("Open Settings, then Community plugins, then Life Calendar.");
    }
  }

  collectEvents(config, sourcePath, birthDate) {
    const events = [];

    if (Array.isArray(config.events)) {
      for (const eventConfig of config.events) {
        const event = normaliseInlineEvent(eventConfig, sourcePath);
        if (event && parseDateOnly(event.date)) {
          events.push(event);
        }
      }
    }

    if (!config.includeVaultEvents) {
      return events;
    }

    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = cache && cache.frontmatter;
      if (!frontmatter || !isLifeCalendarEvent(frontmatter, config)) continue;

      const rawDate = frontmatter[config.eventDateProperty] || frontmatter.date || frontmatter.startDate;
      const eventDate = parseDateOnly(rawDate);
      if (!eventDate) continue;

      const title = String(frontmatter[config.eventTitleProperty] || frontmatter.title || file.basename);
      events.push({
        title,
        date: rawDate,
        parsedDate: eventDate,
        description: frontmatter.description || frontmatter.summary || "",
        category: frontmatter.category || frontmatter.type || "",
        colour: frontmatter.colour || frontmatter.color || "",
        linkText: file.path,
        sourcePath: file.path,
        origin: "vault"
      });
    }

    events.sort((a, b) => parseDateOnly(a.date) - parseDateOnly(b.date));
    return events;
  }

  describeWeek(age, week, range, phase, events) {
    const lines = [`Age ${age}, week ${week + 1}`, `${formatDate(range.start)} to ${formatDate(addDays(range.end, -1))}`];
    if (phase) {
      lines.push(`Phase: ${phase.label || "Phase"}`);
      if (phase.category) lines.push(`Category: ${phase.category}`);
      lines.push(`Range: ${formatPhaseRange(phase)}`);
      if (phase.description) lines.push(phase.description);
    }
    for (const event of events) {
      lines.push(`${formatDate(parseDateOnly(event.date))} — ${event.title}`);
    }
    return lines.join("\n");
  }

  attachEventInteraction(cell, events, sourcePath) {
    cell.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();

      if (events.length === 1) {
        this.openEvent(events[0], sourcePath, evt);
        return;
      }

      const menu = new Menu();
      for (const event of events) {
        menu.addItem((item) => {
          item
            .setTitle(`${formatDate(parseDateOnly(event.date))} — ${event.title}`)
            .setIcon(event.linkText ? "file-text" : "circle")
            .onClick(() => this.openEvent(event, sourcePath, evt));
        });
      }
      menu.showAtMouseEvent(evt);
    });
  }

  openEvent(event, sourcePath, evt) {
    const newLeaf = !!(evt && (evt.metaKey || evt.ctrlKey));
    if (event.linkText) {
      this.app.workspace.openLinkText(event.linkText, sourcePath || event.sourcePath || "", newLeaf);
      return;
    }

    const parsedLink = parseWikiLink(event.link || "");
    if (parsedLink) {
      this.app.workspace.openLinkText(parsedLink.target, sourcePath || event.sourcePath || "", newLeaf);
      return;
    }

    new Notice(`${formatDate(parseDateOnly(event.date))}: ${event.title}`);
  }

  createExampleCodeBlock() {
    const birthDate = this.settings.birthDate || "YYYY-MM-DD";
    const phases = phasesToYaml(this.settings.phases && this.settings.phases.length ? this.settings.phases : DEFAULT_PHASES);

    return `\`\`\`life-calendar\ntitle: Life calendar\nbirthDate: ${birthDate}\nlifeExpectancy: ${this.settings.lifeExpectancy || 85}\nincludeVaultEvents: true\nphases:\n${phases}# Optional inline events can sit alongside vault-backed event notes.\n# events:\n#   - title: Example event\n#     date: 2026-05-03\n#     link: [[Example Life Event]]\n\`\`\``;
  }
};

class LifeCalendarView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_LIFE_CALENDAR;
  }

  getDisplayText() {
    return "Life Calendar";
  }

  getIcon() {
    return "calendar-days";
  }

  async onOpen() {
    await this.render();
  }

  async render() {
    const container = this.containerEl.children[1];
    container.empty();
    await this.plugin.renderCalendar(container, {}, "");
  }
}

class LifeCalendarSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("life-calendar-settings");

    containerEl.createEl("h2", { text: "Life Calendar" });
    containerEl.createEl("p", {
      text: "Configure the default life-in-weeks calendar. Individual code blocks can override these values."
    });

    new Setting(containerEl)
      .setName("Calendar title")
      .setDesc("Default title shown above the calendar.")
      .addText((text) => text
        .setValue(this.plugin.settings.title)
        .onChange(async (value) => {
          this.plugin.settings.title = value || DEFAULT_SETTINGS.title;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Date of birth")
      .setDesc("Use YYYY-MM-DD. This is needed to darken lived weeks accurately.")
      .addText((text) => text
        .setPlaceholder("YYYY-MM-DD")
        .setValue(this.plugin.settings.birthDate || "")
        .onChange(async (value) => {
          this.plugin.settings.birthDate = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Life expectancy")
      .setDesc("Number of age-years to render.")
      .addText((text) => text
        .setPlaceholder("85")
        .setValue(String(this.plugin.settings.lifeExpectancy || 85))
        .onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          if (Number.isFinite(parsed) && parsed > 0 && parsed <= 130) {
            this.plugin.settings.lifeExpectancy = parsed;
            await this.plugin.saveSettings();
          }
        }));

    new Setting(containerEl)
      .setName("Age labels")
      .setDesc("Show right-hand labels every N completed age-years.")
      .addText((text) => text
        .setPlaceholder("5")
        .setValue(String(this.plugin.settings.showLabelsEvery || 5))
        .onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          if (Number.isFinite(parsed) && parsed > 0 && parsed <= 25) {
            this.plugin.settings.showLabelsEvery = parsed;
            await this.plugin.saveSettings();
          }
        }));

    new Setting(containerEl)
      .setName("Decade spacing")
      .setDesc("Add visual space between decade rows.")
      .addToggle((toggle) => toggle
        .setValue(!!this.plugin.settings.showDecadeGaps)
        .onChange(async (value) => {
          this.plugin.settings.showDecadeGaps = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Vault-backed events")
      .setDesc("Read event notes from frontmatter and place them on the calendar.")
      .addToggle((toggle) => toggle
        .setValue(!!this.plugin.settings.includeVaultEvents)
        .onChange(async (value) => {
          this.plugin.settings.includeVaultEvents = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Event marker property")
      .setDesc("A note is included when this frontmatter property is truthy. type: life-event also works.")
      .addText((text) => text
        .setPlaceholder("life-calendar-event")
        .setValue(this.plugin.settings.eventProperty || DEFAULT_SETTINGS.eventProperty)
        .onChange(async (value) => {
          this.plugin.settings.eventProperty = value.trim() || DEFAULT_SETTINGS.eventProperty;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Event date property")
      .setDesc("Frontmatter property that contains the event date.")
      .addText((text) => text
        .setPlaceholder("date")
        .setValue(this.plugin.settings.eventDateProperty || DEFAULT_SETTINGS.eventDateProperty)
        .onChange(async (value) => {
          this.plugin.settings.eventDateProperty = value.trim() || DEFAULT_SETTINGS.eventDateProperty;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Event title property")
      .setDesc("Frontmatter property used as the marker title before falling back to note title.")
      .addText((text) => text
        .setPlaceholder("title")
        .setValue(this.plugin.settings.eventTitleProperty || DEFAULT_SETTINGS.eventTitleProperty)
        .onChange(async (value) => {
          this.plugin.settings.eventTitleProperty = value.trim() || DEFAULT_SETTINGS.eventTitleProperty;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Visible phase categories")
      .setDesc("Optional comma-separated allow-list, for example work, life. Leave blank to show all categories.")
      .addText((text) => text
        .setPlaceholder("work, life")
        .setValue(normaliseStringArray(this.plugin.settings.visibleCategories).join(", "))
        .onChange(async (value) => {
          this.plugin.settings.visibleCategories = normaliseStringArray(value);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Hidden phase categories")
      .setDesc("Optional comma-separated block-list. Useful for hiding categories by default.")
      .addText((text) => text
        .setPlaceholder("sports, experiments")
        .setValue(normaliseStringArray(this.plugin.settings.hiddenCategories).join(", "))
        .onChange(async (value) => {
          this.plugin.settings.hiddenCategories = normaliseStringArray(value);
          await this.plugin.saveSettings();
        }));

    const phasesSetting = new Setting(containerEl)
      .setName("Planning phases")
      .setDesc("JSON array. Each phase supports label, optional colour/color override, description, plus either startAge/endAge or startDate/endDate.")
      .addTextArea((text) => {
        text.inputEl.rows = 12;
        text.inputEl.addClass("life-calendar-settings-textarea");
        text.setValue(JSON.stringify(this.plugin.settings.phases || DEFAULT_PHASES, null, 2));
        text.onChange(async (value) => {
          try {
            const parsed = JSON.parse(value);
            if (!Array.isArray(parsed)) return;
            this.plugin.settings.phases = normalisePhases(parsed);
            text.inputEl.removeClass("is-invalid");
            await this.plugin.saveSettings();
          } catch (_error) {
            text.inputEl.addClass("is-invalid");
          }
        });
      });

    phasesSetting.addButton((button) => button
      .setButtonText("Reset")
      .onClick(async () => {
        this.plugin.settings.phases = clone(DEFAULT_PHASES);
        await this.plugin.saveSettings();
        this.display();
      }));

    containerEl.createEl("h3", { text: "Event note example" });
    containerEl.createEl("pre", {
      text: "---\nlife-calendar-event: true\ndate: 2026-05-03\ntitle: Example event\ncategory: planning\n---\n"
    });
  }
}

function parseSourceConfig(source) {
  const trimmed = (source || "").trim();
  if (!trimmed) return {};
  if (typeof parseYaml !== "function") {
    throw new Error("YAML parsing is not available in this Obsidian version.");
  }
  const parsed = parseYaml(trimmed);
  if (!parsed) return {};
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The code block must contain a YAML object.");
  }
  return parsed;
}

function mergeSettings(base, override) {
  const merged = Object.assign({}, clone(base), clone(override || {}));
  if (override && Object.prototype.hasOwnProperty.call(override, "phases")) {
    merged.phases = clone(override.phases);
  } else if (base && base.phases) {
    merged.phases = clone(base.phases);
  }
  if (override && Object.prototype.hasOwnProperty.call(override, "events")) {
    merged.events = clone(override.events);
  }
  return merged;
}

function normaliseCalendarConfig(config) {
  const normalised = mergeSettings(DEFAULT_SETTINGS, config || {});
  normalised.lifeExpectancy = clampInteger(normalised.lifeExpectancy, 1, 130, DEFAULT_SETTINGS.lifeExpectancy);
  normalised.showLabelsEvery = clampInteger(normalised.showLabelsEvery, 1, 25, DEFAULT_SETTINGS.showLabelsEvery);
  normalised.showDecadeGaps = normalised.showDecadeGaps !== false;
  normalised.includeVaultEvents = normalised.includeVaultEvents !== false;
  normalised.visibleCategories = normaliseStringArray(normalised.visibleCategories);
  normalised.hiddenCategories = normaliseStringArray(normalised.hiddenCategories);
  normalised.phases = filterPhasesByConfig(normalisePhases(normalised.phases), normalised);
  if (!Array.isArray(normalised.events)) normalised.events = [];
  return normalised;
}

function normalisePhases(phases) {
  if (!Array.isArray(phases)) return clone(DEFAULT_PHASES);
  return phases
    .map((phase, index) => {
      if (!phase || typeof phase !== "object") return null;
      const startAge = Number.parseFloat(phase.startAge ?? phase.start ?? phase.from);
      const endAge = Number.parseFloat(phase.endAge ?? phase.end ?? phase.to);
      const startDate = phase.startDate || phase.start_date || "";
      const endDate = phase.endDate || phase.end_date || "";
      const parsedStartDate = parseDateOnly(startDate);
      const parsedEndDate = parseDateOnly(endDate);
      const hasAgeRange = Number.isFinite(startAge) && Number.isFinite(endAge) && endAge > startAge;
      const hasDateRange = parsedStartDate && parsedEndDate && parsedEndDate > parsedStartDate;
      if (!hasAgeRange && !hasDateRange) return null;

      const rawColour = phase.colour || phase.color || "";
      const parsedPaletteIndex = Number.parseInt(phase.paletteIndex ?? phase.palette ?? index, 10);

      return {
        label: String(phase.label || phase.name || "Phase"),
        category: String(phase.category || phase.group || "uncategorised"),
        enabled: phase.enabled !== false && phase.disabled !== true,
        startAge: hasAgeRange ? startAge : null,
        endAge: hasAgeRange ? endAge : null,
        startDate: hasDateRange ? formatDate(parsedStartDate) : "",
        endDate: hasDateRange ? formatDate(parsedEndDate) : "",
        colour: rawColour ? String(rawColour) : "",
        paletteIndex: Number.isFinite(parsedPaletteIndex) ? parsedPaletteIndex : index,
        description: phase.description ? String(phase.description) : ""
      };
    })
    .filter(Boolean);
}

function filterPhasesByConfig(phases, config) {
  const visible = new Set((config.visibleCategories || []).map((category) => category.toLowerCase()));
  const hidden = new Set((config.hiddenCategories || []).map((category) => category.toLowerCase()));

  return phases.filter((phase) => {
    if (!phase || phase.enabled === false) return false;
    const category = String(phase.category || "uncategorised").toLowerCase();
    if (visible.size > 0 && !visible.has(category)) return false;
    if (hidden.has(category)) return false;
    return true;
  });
}

function normaliseStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value)
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normaliseInlineEvent(eventConfig, sourcePath) {
  if (!eventConfig || typeof eventConfig !== "object") return null;
  const rawDate = eventConfig.date || eventConfig.startDate;
  if (!rawDate) return null;
  const rawLink = eventConfig.link || "";
  const parsedLink = parseWikiLink(rawLink);
  return {
    title: String(eventConfig.title || eventConfig.name || (parsedLink && parsedLink.alias) || "Event"),
    date: rawDate,
    description: eventConfig.description ? String(eventConfig.description) : "",
    category: eventConfig.category ? String(eventConfig.category) : "",
    colour: eventConfig.colour || eventConfig.color || "",
    link: rawLink,
    linkText: parsedLink ? parsedLink.target : String(rawLink || "").trim(),
    sourcePath,
    origin: "inline"
  };
}

function isLifeCalendarEvent(frontmatter, config) {
  const configuredProperty = config.eventProperty || DEFAULT_SETTINGS.eventProperty;
  if (Object.prototype.hasOwnProperty.call(frontmatter, configuredProperty) && Boolean(frontmatter[configuredProperty])) {
    return true;
  }

  const type = String(frontmatter.type || "").toLowerCase();
  if (type === "life-event" || type === "life-calendar-event") return true;

  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : String(frontmatter.tags || "").split(/[\s,]+/);
  return tags.some((tag) => String(tag).replace(/^#/, "") === "life-calendar/event");
}

function groupEventsByPosition(events, birthDate, lifeExpectancy) {
  const map = new Map();
  for (const event of events) {
    const eventDate = event.parsedDate || parseDateOnly(event.date);
    if (!eventDate) continue;
    const position = dateToPosition(eventDate, birthDate, lifeExpectancy);
    if (!position) continue;
    const key = positionKey(position.age, position.week);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(event);
  }
  return map;
}

function dateToPosition(date, birthDate, lifeExpectancy) {
  if (date < birthDate) return null;
  const terminalDate = addYears(birthDate, lifeExpectancy);
  if (date >= terminalDate) return null;

  const age = getWholeAgeAt(date, birthDate);
  if (age < 0 || age >= lifeExpectancy) return null;

  const yearStart = addYears(birthDate, age);
  const yearEnd = addYears(birthDate, age + 1);
  const fraction = (date - yearStart) / (yearEnd - yearStart);
  const week = Math.min(WEEKS_PER_YEAR - 1, Math.max(0, Math.floor(fraction * WEEKS_PER_YEAR)));
  return { age, week };
}

function getWeekRange(birthDate, age, week) {
  const yearStart = addYears(birthDate, age);
  const yearEnd = addYears(birthDate, age + 1);
  const duration = yearEnd - yearStart;
  return {
    start: new Date(yearStart.getTime() + Math.floor((duration * week) / WEEKS_PER_YEAR)),
    end: new Date(yearStart.getTime() + Math.floor((duration * (week + 1)) / WEEKS_PER_YEAR))
  };
}

function findPhaseForWeek(phases, age, week, startDate, endDate) {
  const ageValue = age + week / WEEKS_PER_YEAR;
  return phases.find((phase) => {
    if (!phase) return false;
    if (Number.isFinite(phase.startAge) && Number.isFinite(phase.endAge)) {
      return ageValue >= phase.startAge && ageValue < phase.endAge;
    }
    const phaseStart = parseDateOnly(phase.startDate);
    const phaseEnd = parseDateOnly(phase.endDate);
    if (phaseStart && phaseEnd) {
      return startDate < phaseEnd && endDate > phaseStart;
    }
    return false;
  });
}

function getCompletedWeeks(today, birthDate, lifeExpectancy) {
  if (today <= birthDate) return 0;
  const terminalDate = addYears(birthDate, lifeExpectancy);
  const totalWeeks = lifeExpectancy * WEEKS_PER_YEAR;
  if (today >= terminalDate) return totalWeeks;
  const position = dateToPosition(today, birthDate, lifeExpectancy);
  if (!position) return 0;
  return position.age * WEEKS_PER_YEAR + position.week;
}

function getWholeAgeAt(date, birthDate) {
  let age = date.getUTCFullYear() - birthDate.getUTCFullYear();
  const birthdayThisYear = addYears(birthDate, age);
  if (date < birthdayThisYear) age -= 1;
  return age;
}

function addYears(date, years) {
  const result = new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate(), 12, 0, 0));
  if (result.getUTCMonth() !== date.getUTCMonth()) {
    result.setUTCDate(0);
    result.setUTCHours(12, 0, 0, 0);
  }
  return result;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function parseDateOnly(value) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 12, 0, 0));
  }

  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10) - 1;
    const day = Number.parseInt(match[3], 10);
    const parsed = new Date(Date.UTC(year, month, day, 12, 0, 0));
    if (parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month && parsed.getUTCDate() === day) {
      return parsed;
    }
    return null;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0));
}

function todayDateOnly() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0));
}

function formatDate(date) {
  if (!date) return "Unknown date";
  return date.toISOString().slice(0, 10);
}

function formatNumber(value) {
  return Number(value).toLocaleString();
}

function positionKey(age, week) {
  return `${age}:${week}`;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseWikiLink(value) {
  const text = String(value || "").trim();
  const match = text.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
  if (!match) return null;
  return {
    target: match[1].trim(),
    alias: match[2] ? match[2].trim() : match[1].trim()
  };
}

function phasesToYaml(phases) {
  return phases.map((phase) => {
    const lines = [`  - label: ${quoteYamlString(phase.label || "Phase")}`];
    if (phase.category && phase.category !== "uncategorised") lines.push(`    category: ${quoteYamlString(phase.category)}`);
    if (phase.enabled === false) lines.push("    enabled: false");
    if (Number.isFinite(phase.startAge) && Number.isFinite(phase.endAge)) {
      lines.push(`    startAge: ${phase.startAge}`);
      lines.push(`    endAge: ${phase.endAge}`);
    } else if (phase.startDate && phase.endDate) {
      lines.push(`    startDate: ${quoteYamlString(phase.startDate)}`);
      lines.push(`    endDate: ${quoteYamlString(phase.endDate)}`);
    }
    if (phase.colour || phase.color) lines.push(`    colour: ${quoteYamlString(phase.colour || phase.color)}`);
    if (Number.isFinite(phase.paletteIndex)) lines.push(`    paletteIndex: ${phase.paletteIndex}`);
    if (phase.description) lines.push(`    description: ${quoteYamlString(phase.description)}`);
    return lines.join("\n");
  }).join("\n") + "\n";
}

function quoteYamlString(value) {
  return JSON.stringify(String(value || ""));
}

function applyPhaseStyle(element, phase) {
  const customColour = phase && (phase.colour || phase.color);
  if (customColour) {
    element.style.setProperty("--life-calendar-phase-colour", String(customColour));
  }
  element.addClass(`life-calendar-phase-palette-${getPhasePaletteIndex(phase)}`);
}

function getPhasePaletteIndex(phase) {
  const parsed = Number.parseInt(phase && phase.paletteIndex, 10);
  if (!Number.isFinite(parsed)) return 0;
  return ((parsed % 12) + 12) % 12;
}

function uniquePhaseCategories(phases) {
  const categories = [];
  const seen = new Set();
  for (const phase of phases || []) {
    const category = String((phase && phase.category) || "uncategorised");
    const key = category.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    categories.push(category);
  }
  return categories;
}

function setCategoryVisible(root, category, isVisible) {
  const target = String(category || "uncategorised");
  const elements = root.querySelectorAll("[data-phase-category]");
  for (const element of elements) {
    if (element.getAttribute("data-phase-category") !== target) continue;
    element.classList.toggle("is-category-hidden", !isVisible);
  }
}

function describePhase(phase) {
  const lines = [`Phase: ${(phase && phase.label) || "Phase"}`];
  if (phase && phase.category) lines.push(`Category: ${phase.category}`);
  lines.push(`Range: ${formatPhaseRange(phase)}`);
  if (phase && phase.description) lines.push(phase.description);
  return lines.join("\n");
}

function formatPhaseRange(phase) {
  if (!phase) return "Unknown";
  if (Number.isFinite(phase.startAge) && Number.isFinite(phase.endAge)) {
    return `age ${phase.startAge} to ${phase.endAge}`;
  }
  if (phase.startDate && phase.endDate) {
    return `${phase.startDate} to ${phase.endDate}`;
  }
  return "Unknown";
}

function createLegendItem(legend, label, className) {
  const item = legend.createDiv({ cls: `life-calendar-legend-item ${className}` });
  item.createSpan({ cls: "life-calendar-legend-swatch" });
  item.createSpan({ text: label });
  return item;
}

function setElementTooltip(element, text) {
  if (!text) return;
  if (typeof setTooltip === "function") {
    setTooltip(element, text, { placement: "top" });
  } else {
    element.setAttr("title", text);
  }
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}
