// Run with: node tests/project.test.js
// Guards the rules that a reviewer would otherwise have to check by hand.
const fs = require("fs"), path = require("path"), assert = require("assert")
const root = path.join(__dirname, "..")
const read = file => fs.readFileSync(path.join(root, file), "utf8")
const qml = fs.readdirSync(root).filter(file => file.endsWith(".qml"))
const en = JSON.parse(read("i18n/en.json")), ru = JSON.parse(read("i18n/ru.json"))

// Catalogs stay in step, and plural entries have the forms their language needs.
assert.deepStrictEqual(Object.keys(ru).sort(), Object.keys(en).sort(), "en and ru have different keys")
for (const key of Object.keys(en)) {
  assert.strictEqual(typeof ru[key], typeof en[key], key)
  if (typeof en[key] === "object") {
    assert.deepStrictEqual(Object.keys(en[key]).sort(), ["one", "other"], key)
    assert.deepStrictEqual(Object.keys(ru[key]).sort(), ["few", "many", "one", "other"], key)
  }
  const holes = text => (typeof text === "string" ? text : text.other).match(/%\d/g) || []
  assert.deepStrictEqual(holes(ru[key]).sort(), holes(en[key]).sort(), "placeholders differ: " + key)
}

// Every key the code asks for exists, including the ones built from fin's codes.
for (const file of qml) {
  for (const match of read(file).matchAll(/\b(?:tn?)\("([a-z][a-z-]*\.[a-z.-]+)"/g)) if (!match[1].endsWith(".")) assert(match[1] in en, file + ": missing key " + match[1])
}
for (const key of ["empty", "amount-first", "bad-amount", "name-missing", "unknown-account", "ambiguous-account", "week-format"]) assert("entry." + key in en, key)
for (const key of ["no-debt", "reserve-min", "reserve-target", "asset-share", "asset-fixed", "freedom"]) {
  assert("step." + key in en, key)
  assert("freedom.why." + key in en, key)
}
for (const key of ["unprocessed", "tax-gap", "crypto-limit", "missing-price", "little-data"]) assert("warn." + key in en, key)
for (const key of ["spend", "inbox", "income", "goal", "category", "account", "currency", "week"]) for (const part of ["code", "text"]) assert(`help.ex.${key}.${part}` in en, key)
for (const key of ["enter", "tab", "esc", "arrows", "middle"]) for (const part of ["code", "text"]) assert(`help.key.${key}.${part}` in en, key)
for (const key of ["guide", "constitution", "ladder", "policy"]) assert("help.note." + key in en, key)
for (const key of ["growth", "freedom", "month"]) assert("view." + key in en, key)
for (const key of ["lifetime", "record", "growth3", "two-sources", "goal", "stage", "first-income"]) assert("win." + key in en, key)

// Text from the ledger must never be interpreted as rich text.
for (const file of qml) {
  const source = read(file)
  for (const match of source.matchAll(/(^|\n)\s*Text\s*\{/g)) {
    assert(source.slice(match.index, match.index + 200).includes("Text.PlainText"), file + ": Text without PlainText")
  }
  assert(!/Text\.(RichText|StyledText|AutoText)/.test(source), file + ": rich text")
}

// Colors come from the theme, and "Color" must be qualified: QtQuick has its own.
for (const file of qml) {
  const source = read(file)
  assert(!/(^|[^.\w])Color\./m.test(source), file + ": unqualified Color")
  assert(!/color:\s*"#/.test(source), file + ": hard-coded color")
}

// Commands go to fin as argument lists, never through a shell.
const service = read("Service.qml")
assert(!/"(?:sh|bash)",\s*"-c"/.test(service.replace(/PrivateFile[\s\S]*/, "")), "shell in Service.qml")
assert(read("PrivateFile.qml").includes('"sh", "-c"') && read("PrivateFile.qml").includes('"sh", path'), "PrivateFile passes the path as an argument")
assert(/"add", "--json", "--"/.test(service), "add separates options from the line")

// No personal paths in the repository.
for (const file of [...qml, "Model.js", "manifest.json", "README.md", "cli/fin.py", "cli/fin"]) {
  assert(!/\/home\/[a-z]/.test(read(file)), file + ": absolute home path")
}

// The widget and the manifest agree on the plugin id.
const manifest = JSON.parse(read("manifest.json"))
assert(read("BarWidget.qml").includes('moduleName: "' + manifest.id + '"'))
assert(service.includes('pluginId: "' + manifest.id + '"'))
for (const entry of Object.values(manifest.entryPoints)) assert(fs.existsSync(path.join(root, entry)), entry)

console.log("project tests passed")
