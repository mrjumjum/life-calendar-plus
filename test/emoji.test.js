const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPlugin } = require("./harness");

const { internals } = loadPlugin();
const { extractFirstEmoji, pickEventEmoji } = internals;

const cases = [
  ["ZWJ family stays whole", "Family trip 👨‍👩‍👧‍👦 to the coast", "👨‍👩‍👧‍👦"],
  ["ZWJ + skin tone", "👩🏽‍💻 new job", "👩🏽‍💻"],
  ["flag (regional indicator pair)", "Moved to 🇵🇹 Lisbon", "🇵🇹"],
  ["two adjacent flags -> first one", "🇩🇪🇫🇷 road trip", "🇩🇪"],
  ["subdivision tag flag", "🏴󠁧󠁢󠁳󠁣󠁴󠁿 Highlands", "🏴󠁧󠁢󠁳󠁣󠁴󠁿"],
  ["airplane with VS16", "✈️ First flight", "✈️"],
  ["bare airplane gets VS16", "✈ First flight", "✈️"],
  ["keycap with VS16", "Top 1️⃣ moment", "1️⃣"],
  ["keycap without VS16", "Number 5⃣", "5⃣"],
  ["hash keycap", "#️⃣ tagged", "#️⃣"],
  ["text without emoji", "Graduation day 2012", null],
  ["plain digits and # are not emoji", "#1 at 42 km", null],
  ["emoji at end", "Wedding 💍", "💍"],
  ["first of several", "🎓 then 🎉", "🎓"],
  ["skin-tone modifier stays attached", "👋🏻 hello", "👋🏻"],
  ["heart with VS16", "❤️ met", "❤️"],
  ["bare heart gets VS16", "❤ met", "❤️"],
  ["bare supplementary pictograph gets VS16", "🗺 atlas", "🗺️"],
  ["emoji-presentation char is unchanged", "☕ coffee", "☕"],
  ["© ® ™ are skipped as text symbols", "Acme® launch™ © 2020 🚀", "🚀"],
  ["arrows without VS16 are skipped", "Berlin ↔ Paris", null],
  ["arrow with VS16 counts", "↔️ swap", "↔️"],
  ["empty / nullish", "", null],
  ["combining marks are not emoji", "Café São Paulo", null]
];

for (const forceFallback of [false, true]) {
  const mode = forceFallback ? "regex fallback" : "Intl.Segmenter";
  for (const [name, input, expected] of cases) {
    test(`${mode}: ${name}`, () => {
      assert.equal(extractFirstEmoji(input, { forceFallback }), expected);
    });
  }
}

test("nullish input", () => {
  assert.equal(extractFirstEmoji(undefined), null);
  assert.equal(extractFirstEmoji(null), null);
});

test("pickEventEmoji: explicit emoji field, then title, then file name", () => {
  assert.equal(pickEventEmoji(["🏠", "Wedding 💍", "x"]), "🏠");
  assert.equal(pickEventEmoji([undefined, "Wedding 💍", "🎂 file"]), "💍");
  assert.equal(pickEventEmoji([undefined, "Wedding", "🎂 file"]), "🎂");
  assert.equal(pickEventEmoji([undefined, "Wedding", "file"]), "");
});
