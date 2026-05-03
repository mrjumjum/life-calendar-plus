# Life Calendar

Life Calendar is an Obsidian plugin for rendering a life-in-weeks calendar. It shows completed weeks, the current week, planning phases, category filters, and linked events from either inline code block configuration or vault notes.

In this plugin, *memento mori* means representing a lifespan as a week-by-week calendar. The format is useful because it turns abstract dates and age ranges into a single visual map: completed weeks, the current week, future planning phases, and dated events can all be read in context.

## Status

This plugin is packaged as a standard Obsidian community plugin bundle. The current release version is `1.0.0`.

## Screenshots

| Light mode | Dark mode |
| --- | --- |
| ![Life Calendar in Obsidian light mode](screenshots/light-bg.png) | ![Life Calendar in Obsidian dark mode](screenshots/dark-bg.png) |

## Features

- Renders one row per age-year and 52 squares per row.
- Shows completed weeks, the current week, and remaining weeks to the configured planning horizon.
- Uses responsive 52-week rows to avoid routine horizontal scrolling.
- Shows age labels on the right-hand side at a configurable interval.
- Adds optional visual spacing between decades.
- Supports planning phases by age range or date range.
- Supports phase categories such as life, work, education, and sport.
- Adds in-calendar category toggles when multiple categories are visible.
- Cycles phases through a 12-colour palette tuned for light and dark mode.
- Supports optional phase colour overrides.
- Supports event markers from inline code block configuration or from vault notes with frontmatter.
- Opens linked event notes from the calendar.
- Keeps all data local to the vault.
- Does not require `data.json` or any other local settings file in the release package.

## Installation

### Manual installation

Until the plugin is available through Obsidian's community plugin directory:

1. Download the release assets for the plugin.
2. Create `.obsidian/plugins/life-calendar/` inside the target vault if it does not already exist.
3. Copy these files into that folder:
   - `manifest.json`
   - `main.js`
   - `styles.css`
4. Restart Obsidian or reload community plugins.
5. Enable **Life Calendar** in **Settings → Community plugins**.

`versions.json` is required for the plugin repository and release process, but it does not need to be copied manually into a local vault installation.

## Usage

Add a `life-calendar` code block to any note:

````markdown
```life-calendar
title: Life calendar
birthDate: YYYY-MM-DD
lifeExpectancy: 85
includeVaultEvents: true
visibleCategories: []
hiddenCategories: []
phases:
  - label: Education chapter
    category: education
    startAge: 18
    endAge: 22
    description: Example education phase.
  - label: Career chapter
    category: work
    startAge: 22
    endAge: 55
    description: Example primary career phase.
  - label: Portfolio chapter
    category: work
    startAge: 55
    endAge: 65
    description: Example independent, advisory, or portfolio work phase.
  - label: Example dated chapter
    category: life
    startDate: 2030-01-01
    endDate: 2032-12-31
    paletteIndex: 3
    description: Date-based ranges are useful for specific life chapters.
# Add enabled: false to suppress one phase.
# Add colour: "#7a5aa6" to any phase if you want to override the default palette.
```
````

The command palette also includes:

- `Life Calendar: Open life calendar`
- `Life Calendar: Insert life calendar block`

The ribbon icon opens a dedicated Life Calendar view using the plugin settings.

## Code block options

| Option | Type | Description |
| --- | --- | --- |
| `title` | string | Calendar title shown above the grid. |
| `birthDate` | `YYYY-MM-DD` | Date used to calculate completed weeks and age rows. |
| `lifeExpectancy` | number | Number of age rows to render. |
| `showLabelsEvery` | number | Interval for right-hand age labels. Defaults to `5`. |
| `showDecadeGaps` | boolean | Adds larger spacing between decades when enabled. |
| `includeVaultEvents` | boolean | Includes event notes found in the vault. |
| `eventProperty` | string | Frontmatter property that marks event notes. Defaults to `life-calendar-event`. |
| `eventDateProperty` | string | Frontmatter property used as the event date. Defaults to `date`. |
| `eventTitleProperty` | string | Frontmatter property used as the event title. Defaults to `title`. |
| `visibleCategories` | list | Optional allow-list of phase categories to render. |
| `hiddenCategories` | list | Optional block-list of phase categories to hide. |
| `phases` | list | Planning phases to render on the calendar. |
| `events` | list | Inline events to render as linked or unlinked markers. |

## Planning phases

Each phase can use either an age range or a date range:

```yaml
hiddenCategories:
  - sport
phases:
  - label: Career chapter
    category: work
    startAge: 22
    endAge: 55
  - label: Example job
    category: work
    startDate: 2016-03-01
    endDate: 2021-10-31
    paletteIndex: 3
  - label: Dormant experiment
    category: life
    startDate: 2021-01-01
    endDate: 2021-06-01
    enabled: false
```

Age ranges are useful for forward planning. Date ranges are better for schools, jobs, house moves, and other historical chapters where the actual dates matter.

Colours are optional. Phases automatically cycle through 12 palette colours that adapt to light and dark mode. Add `paletteIndex` to choose one of the default palette slots, or add `colour` / `color` to override a specific phase.

Categories are optional. Use `category` to group phases, `enabled: false` to suppress an individual phase, `visibleCategories` as an allow-list, and `hiddenCategories` as a block-list. When more than one category is visible, the rendered calendar also shows category checkboxes for quick local toggling.

## Vault-backed event notes

Any Markdown note can appear as a life calendar event if it has frontmatter like this:

```yaml
---
life-calendar-event: true
date: 2026-05-03
title: Example event
category: planning
---
```

The plugin also recognises `type: life-event` and the tag `life-calendar/event`.

## Inline events

Inline events can be added directly in the code block:

```yaml
events:
  - title: Example event
    date: 2026-05-03
    link: [[Example Life Event]]
```

## Privacy and data handling

Life Calendar runs entirely inside Obsidian. It does not make network requests, does not use telemetry, and does not send vault content to external services.

If vault-backed events are enabled, the plugin reads Markdown file metadata from the local vault to find matching event notes. Plugin settings are stored by Obsidian in the local plugin data file for that vault.

## Release package contents

A public release should include these files at the repository root:

- `manifest.json`
- `main.js`
- `styles.css`
- `README.md`
- `versions.json`
- `LICENSE`

Do not include local vault state such as `data.json`, `.DS_Store`, test vaults, screenshots containing private notes, or other generated local files. `data.json` is created by Obsidian for local plugin settings and is intentionally excluded from the release package.
