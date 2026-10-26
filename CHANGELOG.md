# Changelog

## 1.1.0 (Life Calendar Plus)

First release of the fork, based on Life Calendar 1.0.1 by Paulo Ferreira.

- New plugin identity: id `life-calendar-plus`, name **Life Calendar Plus**.
- Event weeks show the first emoji from the event's `emoji` field, title or note file name, drawn as a click-through overlay on top of the phase colour. Weeks with no emoji show `•`.
- The insert-block command, code block processor and settings tab are registered before plugin data loads, and a broken `data.json` falls back to defaults instead of aborting `onload()`.
- The inserted block is the minimal starter block and always starts on its own line.
- Inline-only calendars sort events by date.
- Added a node test suite, a typecheck against the `obsidian` typings, and a tag-triggered GitHub release workflow.

## 1.0.1

- Updated installation copy now that Life Calendar is available from Obsidian's Community Plugins directory.
- Removed the separate global Life Calendar view and ribbon action.
- Kept calendars explicit: each calendar is configured in a `life-calendar` code block inside a note.
- Kept **Life Calendar: Insert life calendar block** and expanded the inserted starter block with example phases and optional event/category examples.
- Simplified plugin settings to global defaults only:
  - age label interval
  - decade spacing
  - vault-backed event frontmatter field names
- Cleaned up obsolete settings/view code and related CSS.

## 1.0.0

- Initial community plugin release.
