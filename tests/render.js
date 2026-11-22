// Run with: node tests/render.js [outdir]   — renders the panel offscreen (needs Omarchy's shell and qs).
// Prints each view's state and fails on QML errors. PNGs go to outdir (default: a temp folder).
const fs = require("fs"), os = require("os"), path = require("path"), {spawnSync} = require("child_process")
const repo = path.join(__dirname, ".."), shellSrc = process.env.OMARCHY_SHELL || "/usr/share/omarchy/shell"
const work = fs.mkdtempSync(path.join(os.tmpdir(), "beancount-bar-render-"))
const outDir = process.argv[2] || work
const shell = path.join(work, "shell"), ledger = path.join(work, "ledger")
for (const dir of ["Commons", "Ui"]) fs.cpSync(path.join(shellSrc, dir), path.join(shell, dir), {recursive: true})
fs.copyFileSync(path.join(__dirname, "render", "shell.qml"), path.join(shell, "shell.qml"))
fs.mkdirSync(path.join(shell, "plugin"))
for (const file of fs.readdirSync(repo)) if (/\.(qml|js)$/.test(file)) fs.copyFileSync(path.join(repo, file), path.join(shell, "plugin", file))
fs.cpSync(path.join(repo, "i18n"), path.join(shell, "plugin", "i18n"), {recursive: true})
fs.cpSync(path.join(repo, "cli", "example"), ledger, {recursive: true})
const empty = path.join(work, "empty")
fs.cpSync(path.join(repo, "cli", "example"), empty, {recursive: true})
fs.writeFileSync(path.join(empty, "ledger", "2026", "2026-11.bean"), "")
fs.writeFileSync(path.join(empty, "README.md"), "# guide\n")

const cases = [
  {name: "freedom", env: {VIEW: "freedom"}},
  {name: "month", env: {VIEW: "month"}},
  {name: "business", env: {VIEW: "month", SCOPE: "business"}},
  {name: "entry", env: {VIEW: "freedom", INPUT: "450 кофе"}},
  {name: "markup", env: {VIEW: "freedom", INPUT: "450 <img src=x> кофе"}},
  {name: "missing", env: {VIEW: "freedom"}, settings: {command: "no-such-fin-command"}},
  {name: "help", env: {VIEW: "help"}},
  {name: "empty", env: {VIEW: "freedom", FIN_ROOT: empty}},
  {name: "ru", env: {VIEW: "freedom"}, settings: {language: "ru"}},
  {name: "ru-help", env: {VIEW: "help"}, settings: {language: "ru"}},
]
let failed = false
for (const c of cases) {
  const out = path.join(outDir, `panel-${c.name}.png`)
  const settings = {command: path.join(repo, "cli", "fin"), ...(c.settings || {})}
  const r = spawnSync("qs", ["-p", shell], {encoding: "utf8", timeout: 30000,
    env: {...process.env, QT_QPA_PLATFORM: "offscreen", QT_QUICK_BACKEND: "software", FIN_ROOT: ledger, LANG: process.env.RENDER_LANG || process.env.LANG, OUT: out, SETTINGS: JSON.stringify(settings), ...c.env}})
  const text = (r.stdout || "") + (r.stderr || "")
  const state = (text.match(/STATE (\{.*\})/) || [])[1]
  const problem = text.match(/.*(TypeError|ReferenceError|Unable to assign|is not a function|is not defined|Cannot assign|Type .* unavailable|module .* is not installed).*/)
  console.log(c.name.padEnd(9), state || "NO STATE", problem ? "\n  QML ERROR: " + problem[0] : "")
  if (!state || problem || !fs.existsSync(out)) { failed = true; console.log(text.slice(-2500)) }
}
console.log(failed ? "render FAILED" : "render passed, images in " + outDir)
process.exit(failed ? 1 : 0)
