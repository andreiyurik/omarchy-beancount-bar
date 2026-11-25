// Run with: node tests/contract.test.js   (needs uv; downloads beancount once)
// The panel previews entries in JavaScript, fin.py writes them. Both must read a line the same way.
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path"), {execFileSync} = require("child_process")
const M = require("./load-model")

const repo = path.join(__dirname, "..")
const work = fs.mkdtempSync(path.join(os.tmpdir(), "beancount-bar-contract-"))
fs.cpSync(path.join(repo, "cli", "example"), work, {recursive: true})
// The example ledger is November 2026: pin the date so growth numbers do not drift with the calendar.
const env = {...process.env, FIN_ROOT: work, FIN_TODAY: "2026-11-22"}
const fin = (...args) => {
  try { return {code: 0, out: execFileSync(path.join(repo, "cli", "fin"), args, {env, encoding: "utf8"})} }
  catch (error) { return {code: error.status, out: error.stdout} }
}

const status = M.readStatus(fin("status", "--json").out)
assert.strictEqual(status.ok, true, "status")
assert.strictEqual(status.liquid, 242000)
assert.strictEqual(status.tax.reserved, 3000)
assert.strictEqual(status.ladder.length, 6)
assert.ok(status.warnings.some(w => w.key === "tax-gap"))
assert.ok(status.entry.accounts.some(a => a.short === "карта"))

const lines = ["2900 проездной", "1,5к что-то новое вчера", "+12к клиент #ип", "2000 хостинг #ип >Tools", "12 usd хостинг", "$12 хостинг",
  "2900 проездной @нал", "2900 проездной @карта", "проездной 2900", "2900", "12x проездной", "2900 проездной @нетакого", "2000 хостинг >Tools", '450 "проездной"', "100 такси позавчера", "450 a\\b\\", "٢٩٠٠ проездной"]
const py = `
import json, sys, datetime as dt
sys.path.insert(0, ${JSON.stringify(path.join(repo, "cli"))})
import fin
entries = fin.load_ok(); p = fin.params(entries, dt.date(2026, 11, 22))
cur = {e.currency for e in entries if type(e).__name__ == "Commodity"}
out = []
for line in json.loads(sys.argv[1]):
    try:
        e = fin.parse_entry(line, dt.date(2026, 11, 22), fin.open_accounts(entries), fin.history(entries), p, cur)
        out.append({"ok": True, **{k: (float(v) if k == "amount" else v) for k, v in e.items()}})
    except fin.FinError as err:
        out.append({"ok": False, "error": err.key})
print(json.dumps(out, ensure_ascii=False))`
const pyOut = JSON.parse(execFileSync("uv", ["run", "--quiet", "--no-project", "--with", "beancount==3.2.3", "python", "-c", py, JSON.stringify(lines)], {env, encoding: "utf8"}))
const keys = ["ok", "error", "date", "flag", "narration", "amount", "currency", "account", "source", "income", "business"]
lines.forEach((line, i) => {
  const js = M.parseEntry(line, new Date(2026, 10, 22), status.entry), pyE = pyOut[i]
  for (const k of keys) if (k in pyE || (k in js && js.ok)) assert.deepStrictEqual(js[k], pyE[k], `${line}: ${k} js=${js[k]} py=${pyE[k]}`)
})

// Write, undo and the week through the real command.
let r = JSON.parse(fin("add", "--json", "--", "2900 проездной").out)
assert.strictEqual(r.ok, true)
assert.strictEqual(M.readStatus(fin("status", "--json").out).liquid, 239100)
assert.strictEqual(JSON.parse(fin("undo", "--json", r.entry.id).out).narration, "проездной")
r = JSON.parse(fin("add", "--json", "--", "450 a\\b\\").out)  // a trailing backslash used to break the ledger
assert.strictEqual(r.ok, true)
assert.strictEqual(r.entry.narration, "a/b/")
fin("undo", "--json", r.entry.id)
assert.strictEqual(M.readStatus(fin("status", "--json").out).liquid, 242000)
r = fin("add", "--json", "--", "$20 хостинг #ип")          // a rouble account refuses dollars
assert.strictEqual(r.code, 1)
assert.strictEqual(JSON.parse(r.out).error, "ledger")
fin("week", "--json", "--", "10", "предложений")
fin("week", "--json", "--", "+2")
assert.deepStrictEqual(M.readStatus(fin("status", "--json").out).week, {text: "предложений", target: 10, done: 2})

// Growth: this month against October, the record, the goal from params.bean, lifetime milestones.
let g = M.readStatus(fin("status", "--json").out).growth
assert.strictEqual(g.current, 105000)
assert.strictEqual(g.record.amount, 87000)
assert.strictEqual(g.isRecord, true)
assert.deepStrictEqual(g.goal.stages, [40000, 80000, 120000, 150000])
assert.strictEqual(g.goal.passed, 2)
assert.strictEqual(g.lifetime, 192000)
assert.deepStrictEqual(g.next, {target: 300000, remaining: 108000})
assert.ok(g.wins.some(w => w.key === "two-sources"))
// The goal command writes params.bean, and an income moves the stage.
assert.strictEqual(JSON.parse(fin("goal", "--json", "--", "200000").out).ok, true)
fin("add", "--json", "--", "+20к клиент Гамма #ип")
g = M.readStatus(fin("status", "--json").out).growth
assert.strictEqual(g.goal.target, 200000)
assert.strictEqual(g.current, 125000)
assert.strictEqual(JSON.parse(fin("goal", "--json", "--", "много").out).error, "goal-format")
fin("goal", "--json", "--", "off")
assert.strictEqual(M.readStatus(fin("status", "--json").out).growth.goal, null)

// Writes keep the ledger file's permissions.
fs.chmodSync(path.join(work, "ledger", "inbox.bean"), 0o600)
r = JSON.parse(fin("add", "--json", "--", "100 такси").out)
assert.strictEqual(fs.statSync(path.join(work, "ledger", "inbox.bean")).mode & 0o777, 0o600)
fin("undo", "--json", r.entry.id)
// A month that does not exist is refused, not turned into a note.
assert.strictEqual(fin("review", "2026-13").code, 1)
assert.ok(!fs.existsSync(path.join(work, "20 Обзоры", "2026-13.md")))
// An unexpected error still answers in JSON, so the panel can show it.
fs.renameSync(path.join(work, "ledger", "inbox.bean"), path.join(work, "inbox.bean.away"))
r = fin("undo", "--json")
assert.strictEqual(r.code, 1)
assert.strictEqual(JSON.parse(r.out).error, "internal")
fs.renameSync(path.join(work, "inbox.bean.away"), path.join(work, "ledger", "inbox.bean"))

fs.rmSync(work, {recursive: true})
console.log("contract tests passed")
