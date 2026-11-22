// Run with: node tests/model.test.js
const assert = require("assert"), M = require("./load-model")

const ctx = {
  businessTag: "ип", defaultAccount: "Assets:Liquid:Cash", defaultBusinessAccount: "Assets:Business:Checking",
  currencies: ["EUR", "RUB", "USD", "USDT"],
  accounts: [
    {name: "Assets:Liquid:Cash", short: "нал"}, {name: "Assets:Liquid:Tbank", short: "карта"},
    {name: "Assets:Business:Checking", short: "ип"}, {name: "Expenses:Life:EatingOut", short: ""},
    {name: "Expenses:Growth:Tools", short: ""}, {name: "Expenses:Business:Tools", short: ""},
    {name: "Expenses:Uncategorized", short: ""}, {name: "Income:Business:Revenue", short: ""}, {name: "Income:Uncategorized", short: ""}
  ],
  history: {"кофе": {account: "Expenses:Life:EatingOut", source: "Assets:Liquid:Tbank"}}
}
const today = new Date(2026, 10, 22)
const p = line => M.parseEntry(line, today, ctx)

// History decides the category and where the money came from.
assert.deepStrictEqual([p("450 кофе").account, p("450 кофе").source, p("450 кофе").flag], ["Expenses:Life:EatingOut", "Assets:Liquid:Tbank", "*"])
// Unknown goes to the inbox with "!".
assert.deepStrictEqual([p("1,5к что-то").account, p("1,5к что-то").amount, p("1,5к что-то").flag], ["Expenses:Uncategorized", 1500, "!"])
assert.strictEqual(p("100 такси вчера").date, "2026-11-21")
assert.strictEqual(p("100 такси позавчера").offset, 2)
// Business: tag picks business accounts; ">Tools" prefers the business one.
assert.deepStrictEqual([p("+12к клиент #ип").account, p("+12к клиент #ип").source], ["Income:Business:Revenue", "Assets:Business:Checking"])
assert.strictEqual(p("2000 хостинг #ип >Tools").account, "Expenses:Business:Tools")
assert.strictEqual(p("2000 хостинг >Tools").ok, false)  // two Tools without the tag
// Currency by code or sign.
assert.strictEqual(p("12 usd хостинг").currency, "USD")
assert.strictEqual(p("$12 хостинг").currency, "USD")
assert.strictEqual(p("12€ кофе").currency, "EUR")
assert.strictEqual(p("450 кофе @нал").source, "Assets:Liquid:Cash")
// Errors.
assert.strictEqual(p("").error, "empty")
assert.strictEqual(p("кофе 450").error, "amount-first")
assert.strictEqual(p("450").error, "name-missing")
assert.strictEqual(p("12x кофе").error, "bad-amount")
assert.strictEqual(p("450 кофе @нетакого").error, "unknown-account")
// Quotes can't break out of the Beancount string.
assert.strictEqual(p('450 "кофе"').narration, "'кофе'")

// Week commands.
assert.deepStrictEqual(M.parseCommand("неделя 10 предложений клиентам"), {ok: true, kind: "week", args: ["10", "предложений", "клиентам"], target: 10, text: "предложений клиентам"})
assert.deepStrictEqual(M.parseCommand("week +1"), {ok: true, kind: "week", args: ["+1"]})
assert.strictEqual(M.parseCommand("неделя много").ok, false)
assert.strictEqual(M.parseCommand("450 кофе"), null)

// Status is bounded and typed.
const raw = {schema: 1, ladder: [{key: "no-debt", done: true, progress: 1}, {key: "reserve-min", done: false, progress: 0.814, months: 6}],
  warnings: [{key: "unprocessed", count: 2}], months: [{month: "2026-11", income: 1, living: 2, biz_revenue: 3, biz_expenses: 4}],
  entry: {history: {"<b>x</b>": {account: "Expenses:X", source: "Assets:Y"}}}, unprocessed: 2, runway: null, savingsRate: 0.4}
const st = M.readStatus(JSON.stringify(raw))
assert.strictEqual(st.ok, true)
assert.strictEqual(M.barText(st), "1 · 81% •")
assert.strictEqual(st.runway, null)
assert.strictEqual(st.months[0].bizRevenue, 3)
assert.deepStrictEqual(M.readStatus("{\"schema\": 2}"), {ok: false, error: "schema", schema: 2})
assert.strictEqual(M.readStatus("not json").error, "bad-json")
assert.strictEqual(M.readStatus(JSON.stringify({schema: 1, ok: false, error: "ledger", message: "x"})).error, "ledger")
assert.strictEqual(M.barText(null), "◎")
assert.strictEqual(M.barText({ok: true, unprocessed: 0, ladder: [{done: true}]}), "★")

// Money.
assert.strictEqual(M.formatMoney(1234567, "RUB"), "1 234 567 ₽")
assert.strictEqual(M.formatMoney(-12.5, "USD"), "−$12.50")
assert.strictEqual(M.shortMoney(81500, {k: "%1к", m: "%1М", decimal: ","}), "82к")
assert.strictEqual(M.leaf("Expenses:Life:EatingOut"), "Life:EatingOut")

// Plurals and lookup for a language other than the shell's.
assert.deepStrictEqual([1, 2, 5, 11, 21, 22, 25].map(n => M.pluralCategory("ru", n)), ["one", "few", "many", "many", "one", "few", "many"])
const ru = {"a": {"one": "%1 операция", "few": "%1 операции", "many": "%1 операций", "other": "%1 операции"}}, enC = {"a": "x", "b": "only english"}
assert.strictEqual(M.lookup(ru, enC, "a", 5, "ru"), "%1 операций")
assert.strictEqual(M.lookup(ru, enC, "b", undefined, "ru"), "only english")
assert.strictEqual(M.lookup(ru, enC, "zzz", undefined, "ru"), "zzz")
assert.strictEqual(M.remaining({done: false, progress: 0.4, have: 40, need: 100}), 60)
assert.strictEqual(M.remaining({done: true, progress: 1, have: 100, need: 100}), 0)
assert.strictEqual(M.obsidianUrl("/x/00 Конституция.md"), "obsidian://open?path=%2Fx%2F00%20%D0%9A%D0%BE%D0%BD%D1%81%D1%82%D0%B8%D1%82%D1%83%D1%86%D0%B8%D1%8F.md")

// Growth.
const fmt = {k: "%1к", m: "%1М", decimal: ","}
assert.strictEqual(M.growthBarText({current: 105000, goal: {progress: 0.7, reached: false}}, fmt), "105к · 70%")
assert.strictEqual(M.growthBarText({current: 105000, goal: null, isRecord: true, delta: 150}, fmt), "105к ★")
assert.strictEqual(M.growthBarText({current: 42000, goal: null, isRecord: false, delta: -12}, fmt), "42к ▼12%")
assert.deepStrictEqual(M.freshWins(null, [{key: "a"}]), [])
assert.deepStrictEqual(M.freshWins(["a"], [{key: "a"}, {key: "b"}]).map(w => w.key), ["b"])
assert.deepStrictEqual(M.parseCommand("цель 7000 usd"), {ok: true, kind: "goal", args: ["7000", "usd"], amount: 7000, currency: "USD"})
assert.strictEqual(M.parseCommand("цель 500к").amount, 500000)
assert.strictEqual(M.parseCommand("цель выкл").off, true)
assert.strictEqual(M.parseCommand("цель много").ok, false)
assert.strictEqual(M.readGrowth({current: "5", wins: [{key: "x"}]}).wins[0].kind, "x")

console.log("model tests passed")
