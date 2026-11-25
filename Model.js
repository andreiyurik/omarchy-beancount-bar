.pragma library
// Pure logic, no QML: tests load this file in Node (tests/model.test.js).
// The authority is the `fin` command. Everything here is only a preview or formatting.

var SCHEMA = 1
var SYMBOLS = {"₽": "RUB", "$": "USD", "€": "EUR"}
var SIGNS = {RUB: "₽", USD: "$", EUR: "€", USDT: "USDT"}
var DATE_WORDS = {"вчера": 1, "yesterday": 1, "позавчера": 2}
var WEEK_WORDS = ["week", "неделя"]
var GOAL_WORDS = ["goal", "цель"]
var AMOUNT_RE = /^(\+?)([$€₽]?)(\d+(?:[.,]\d{1,2})?)([кkКK]?)([$€₽]?)$/
var MAX_TEXT = 200
var DOC_KEYS = ["guide", "constitution", "policy", "ladder"]

function num(value) { var n = Number(value); return isFinite(n) ? n : 0 }
function str(value, limit) { return String(value === undefined || value === null ? "" : value).slice(0, limit || MAX_TEXT) }

// Only what the panel needs, bounded, so a broken or hostile `fin` can't flood the UI.
function readStatus(text) {
  var raw
  try { raw = JSON.parse(String(text).slice(0, 4000000)) } catch (error) { return {ok: false, error: "bad-json"} }
  if (!raw || typeof raw !== "object") return {ok: false, error: "bad-json"}
  if (raw.schema !== SCHEMA) return {ok: false, error: "schema", schema: raw.schema}
  if (raw.ok === false) return {ok: false, error: str(raw.error, 40), message: str(raw.message, 2000)}
  var entry = raw.entry || {}
  var history = {}
  var keys = Object.keys(entry.history || {}).slice(0, 1000)
  keys.forEach(function(k) {
    var h = entry.history[k]
    if (h && typeof h === "object") history[str(k)] = {account: str(h.account), source: str(h.source)}
  })
  return {
    ok: true,
    date: str(raw.date, 10), currency: str(raw.currency, 10) || "RUB", dataDays: num(raw.dataDays),
    netWorth: num(raw.netWorth), liquid: num(raw.liquid), invest: num(raw.invest), crypto: num(raw.crypto),
    business: num(raw.business), income: num(raw.income), living: num(raw.living), fixed: num(raw.fixed),
    savingsRate: raw.savingsRate === null ? null : num(raw.savingsRate), savingsTarget: num(raw.savingsTarget),
    runway: raw.runway === null ? null : num(raw.runway), assetIncome: num(raw.assetIncome),
    ladder: (raw.ladder || []).slice(0, 12).map(function(s) {
      return {key: str(s.key, 40), done: s.done === true, progress: s.progress === null ? null : Math.max(0, Math.min(1, num(s.progress))),
              months: num(s.months), share: num(s.share), capital: num(s.capital),
              have: num(s.have), need: num(s.need), monthly: s.monthly === true}
    }),
    tax: {rate: num((raw.tax || {}).rate), need: num((raw.tax || {}).need), reserved: num((raw.tax || {}).reserved)},
    bizMonth: {revenue: num((raw.bizMonth || {}).revenue), expenses: num((raw.bizMonth || {}).expenses), profit: num((raw.bizMonth || {}).profit)},
    months: (raw.months || []).slice(-12).map(function(m) {
      return {month: str(m.month, 7), income: num(m.income), living: num(m.living), bizRevenue: num(m.biz_revenue), bizExpenses: num(m.biz_expenses)}
    }),
    unprocessed: num(raw.unprocessed),
    txCount: num(raw.txCount),
    docs: (raw.docs || []).slice(0, 10).filter(function(d) {
      return d && DOC_KEYS.indexOf(d.key) >= 0 && /^\/[^\0]*\.md$/.test(String(d.path)) && String(d.path).length < 500
    }).map(function(d) { return {key: d.key, path: String(d.path)} }),
    warnings: (raw.warnings || []).slice(0, 10).map(function(w) {
      return {key: str(w.key, 40), count: num(w.count), days: num(w.days), amount: num(w.amount), share: num(w.share), limit: num(w.limit),
              currencies: (w.currencies || []).slice(0, 10).map(function(c) { return str(c, 12) })}
    }),
    growth: readGrowth(raw.growth),
    week: raw.week ? {text: str(raw.week.text), target: Math.max(1, num(raw.week.target)), done: Math.max(0, num(raw.week.done))} : null,
    entry: {
      businessTag: str(entry.businessTag, 20) || "ип",
      defaultAccount: str(entry.defaultAccount), defaultBusinessAccount: str(entry.defaultBusinessAccount),
      currencies: (entry.currencies || []).slice(0, 50).map(function(c) { return str(c, 12) }),
      accounts: (entry.accounts || []).slice(0, 2000).map(function(a) { return {name: str(a.name), short: str(a.short, 40)} }),
      history: history
    }
  }
}

function readGrowth(g) {
  if (!g || typeof g !== "object") return null
  var goal = g.goal && typeof g.goal === "object" ? {
    target: num(g.goal.target), amount: num(g.goal.amount), currency: str(g.goal.currency, 10),
    stages: (g.goal.stages || []).slice(0, 12).map(num), passed: num(g.goal.passed), reached: g.goal.reached === true,
    progress: Math.max(0, Math.min(1, num(g.goal.progress))), over: num(g.goal.over), pace: num(g.goal.pace),
    stage: g.goal.stage ? {target: num(g.goal.stage.target), remaining: num(g.goal.stage.remaining)} : null
  } : null
  var f = g.freedom || {}
  return {
    month: str(g.month, 7), day: num(g.day), daysInMonth: num(g.daysInMonth) || 30, current: num(g.current),
    prevMonth: str(g.prevMonth, 7), prevSame: num(g.prevSame), prevTotal: num(g.prevTotal),
    delta: g.delta === null || g.delta === undefined ? null : num(g.delta),
    record: g.record ? {month: str(g.record.month, 7), amount: num(g.record.amount)} : null, isRecord: g.isRecord === true,
    goal: goal, lifetime: num(g.lifetime),
    milestones: (g.milestones || []).slice(0, 20).map(function(m) { return {target: num(m.target), date: str(m.date, 10)} }),
    next: g.next ? {target: num(g.next.target), remaining: num(g.next.remaining)} : null,
    steps: (g.steps || []).slice(0, 20).map(function(s) { return {target: num(s.target), done: s.done === true} }),
    sources: (g.sources || []).slice(0, 8).map(function(s) { return {name: str(s.name, 80), current: num(s.current), previous: num(s.previous)} }),
    wins: (g.wins || []).slice(0, 200).map(function(w) {
      return {key: str(w.key, 60), kind: str(w.kind || w.key, 30), amount: num(w.amount), month: str(w.month, 7), date: str(w.date, 10)}
    }),
    freedom: {monthNet: num(f.monthNet), monthsAdded: f.monthsAdded === null || f.monthsAdded === undefined ? null : num(f.monthsAdded),
              step: str(f.step, 40), monthsToStep: f.monthsToStep === null || f.monthsToStep === undefined ? null : num(f.monthsToStep)}
  }
}

// Wins that were not there before. The first look marks everything as seen, so nothing old is announced.
function freshWins(seen, wins) {
  if (!seen) return []
  return wins.filter(function(w) { return seen.indexOf(w.key) < 0 })
}

// The bar icon grows with everything earned, and never goes back: sprout, coins, gold, diamond.
// Glyphs are from the Nerd Font the shell already uses (md-sprout, fa-coins, md-gold, md-diamond_stone).
var WEALTH = [{from: 0, key: "sprout", glyph: "\u{F0E66}"}, {from: 100000, key: "coins", glyph: "\u{EDE8}"},
              {from: 1000000, key: "gold", glyph: "\u{F124F}"}, {from: 10000000, key: "diamond", glyph: "\u{F01C8}"}]
function wealthLevel(lifetime) {
  var level = WEALTH[0], next = null
  for (var i = 0; i < WEALTH.length; ++i) {
    if (num(lifetime) >= WEALTH[i].from) { level = WEALTH[i]; next = WEALTH[i + 1] || null }
  }
  return {key: level.key, glyph: level.glyph, next: next ? {key: next.key, from: next.from} : null}
}

// "105к · 70%" with a goal, "105к ▲150%" against last month, "105к ★" for a record month.
function growthBarText(g, format) {
  if (!g || (g.lifetime === 0 && g.current === 0 && !g.goal)) return "◎"
  var money = g.current > 0 ? shortMoney(g.current, format) : "0"
  if (g.goal) return money + " · " + (g.goal.reached ? "★" : Math.floor(g.goal.progress * 100) + "%")
  if (g.isRecord) return money + " ★"
  if (g.delta !== null) return money + " " + (g.delta >= 0 ? "▲" : "▼") + Math.abs(g.delta) + "%"
  return money
}

function matchAccount(query, accounts, roots, prefer) {
  var q = query.toLowerCase()
  var starts = function(name, list) { return list.some(function(r) { return name.indexOf(r) === 0 }) }
  var pool = accounts.filter(function(a) { return starts(a.name, roots) })
  if (prefer) {
    var preferred = pool.filter(function(a) { return a.name.indexOf(prefer) === 0 && a.name.toLowerCase().indexOf(q) >= 0 })
    if (preferred.length) pool = preferred
  }
  var exact = pool.filter(function(a) { return a.short.toLowerCase() === q })
  if (exact.length) return {ok: true, name: exact[0].name}
  var leaf = pool.filter(function(a) { var p = a.name.split(":"); return p[p.length - 1].toLowerCase() === q })
  if (leaf.length === 1) return {ok: true, name: leaf[0].name}
  var found = pool.filter(function(a) { return a.name.toLowerCase().indexOf(q) >= 0 })
  if (found.length === 1) return {ok: true, name: found[0].name}
  return {ok: false, error: found.length ? "ambiguous-account" : "unknown-account", query: query}
}

// Mirrors parse_entry in fin.py. tests/contract.test.js runs both on the same lines.
function parseEntry(line, today, ctx) {
  var tokens = String(line).trim().split(/\s+/).filter(function(t) { return t !== "" })
  if (!tokens.length) return {ok: false, error: "empty"}
  var m = AMOUNT_RE.exec(tokens[0])
  if (!m) return {ok: false, error: /^\+?[$€₽]?\d/.test(tokens[0]) ? "bad-amount" : "amount-first", amount: tokens[0]}
  var income = m[1] === "+"
  var amount = parseFloat(m[3].replace(",", ".")) * (m[4] ? 1000 : 1)
  if (!(amount > 0)) return {ok: false, error: "bad-amount", amount: tokens[0]}
  var sign = m[2] || m[5]
  var currency = SYMBOLS[sign] || "RUB"
  var rest = tokens.slice(1)
  if (rest.length && !sign && (ctx.currencies || []).indexOf(rest[0].toUpperCase()) >= 0) {
    currency = rest[0].toUpperCase()
    rest = rest.slice(1)
  }
  var btag = String(ctx.businessTag || "ип").toLowerCase()
  var business = false, sourceQ = "", accountQ = "", offset = 0, words = []
  rest.forEach(function(tok) {
    var low = tok.toLowerCase()
    if (low.charAt(0) === "#" && low.slice(1) === btag) business = true
    else if (low.charAt(0) === "@" && tok.length > 1) sourceQ = tok.slice(1)
    else if (low.charAt(0) === ">" && tok.length > 1) accountQ = tok.slice(1)
    else if (DATE_WORDS[low] !== undefined) offset = DATE_WORDS[low]
    else words.push(tok)
  })
  // Same as fin.py: quotes and backslashes can't break out of the Beancount string.
  var narration = words.join(" ").replace(/"/g, "'").replace(/\\/g, "/").trim()
  if (!narration) return {ok: false, error: "name-missing", amount: tokens[0]}

  var accounts = ctx.accounts || []
  var known = (ctx.history || {})[narration.toLowerCase()] || null
  var catRoot = income ? "Income:" : "Expenses:"
  var account
  if (accountQ) {
    var a = matchAccount(accountQ, accounts, [catRoot], business ? catRoot + "Business:" : "")
    if (!a.ok) return {ok: false, error: a.error, query: accountQ}
    account = a.name
  } else if (known && known.account.indexOf(catRoot) === 0) account = known.account
  else if (business) account = income ? "Income:Business:Revenue" : "Expenses:Business:Other"
  else account = income ? "Income:Uncategorized" : "Expenses:Uncategorized"

  var source
  if (sourceQ) {
    var s = matchAccount(sourceQ, accounts, ["Assets:", "Liabilities:"], "")
    if (!s.ok) return {ok: false, error: s.error, query: sourceQ}
    source = s.name
  } else if (known && known.account === account) source = known.source
  else if (business) source = ctx.defaultBusinessAccount || "Assets:Business:Checking"
  else source = ctx.defaultAccount || "Assets:Liquid:Cash"

  var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset)
  return {ok: true, date: iso(d), offset: offset, flag: /:Uncategorized$/.test(account) ? "!" : "*", narration: narration,
          amount: amount, currency: currency, account: account, source: source, income: income, business: business}
}

// "week 10 offers" / "неделя +1" → arguments for `fin week`.
function parseCommand(line) {
  var tokens = String(line).trim().split(/\s+/)
  var head = (tokens[0] || "").toLowerCase()
  if (GOAL_WORDS.indexOf(head) >= 0) {
    var g = tokens.slice(1)
    if (!g.length) return {ok: false, error: "goal-format"}
    if (["off", "выкл", "нет", "0"].indexOf(g[0].toLowerCase()) >= 0) return {ok: true, kind: "goal", args: ["off"], off: true}
    var m = AMOUNT_RE.exec(g[0])
    if (!m || m[1] || g.length > 2) return {ok: false, error: "goal-format"}
    var amount = parseFloat(m[3].replace(",", ".")) * (m[4] ? 1000 : 1)
    var cur = SYMBOLS[m[2] || m[5]] || (g[1] ? g[1].toUpperCase() : "RUB")
    return {ok: true, kind: "goal", args: g, amount: amount, currency: cur}
  }
  if (WEEK_WORDS.indexOf(head) < 0) return null
  var args = tokens.slice(1)
  if (!args.length) return {ok: false, error: "week-format"}
  if (/^[+-]\d+$/.test(args[0]) || args[0] === "clear") return {ok: true, kind: "week", args: [args[0]]}
  if (!/^\d+$/.test(args[0]) || args.length < 2 || num(args[0]) < 1 || num(args[0]) > 999) return {ok: false, error: "week-format"}
  return {ok: true, kind: "week", args: args, target: num(args[0]), text: args.slice(1).join(" ")}
}

function pad(n) { return n < 10 ? "0" + n : String(n) }
function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) }

function leaf(account) { var p = String(account).split(":"); return p.slice(-2).join(":") }

function formatMoney(value, currency, format) {
  var f = format || {}
  var group = f.group === undefined ? " " : f.group
  var n = Math.abs(num(value)), places = n >= 100 || n === Math.floor(n) ? 0 : 2
  var parts = n.toFixed(places).split("."), digits = parts[0], out = ""
  while (digits.length > 3) { out = group + digits.slice(-3) + out; digits = digits.slice(0, -3) }
  var body = digits + out + (parts[1] ? (f.decimal || ".") + parts[1] : "")
  var sign = num(value) < 0 && parseFloat(parts.join(".")) !== 0 ? "−" : ""
  var sym = SIGNS[currency] || String(currency || "")
  return currency === "USD" ? sign + "$" + body : sign + body + " " + sym
}

function shortMoney(value, format) {
  var f = format || {k: "%1k", m: "%1M", decimal: "."}
  var n = Math.abs(num(value)), sign = num(value) < 0 ? "−" : ""
  var text = function(x) { return String(x).replace(".", f.decimal) }
  if (n >= 1e6) return sign + f.m.replace("%1", text(Math.round(n / 1e5) / 10))
  if (n >= 1e4) return sign + f.k.replace("%1", text(Math.round(n / 1e3)))
  if (n >= 1e3) return sign + f.k.replace("%1", text(Math.round(n / 100) / 10))
  return sign + text(Math.round(n))
}

// CLDR plural category for the languages this plugin ships (others fall back to one/other).
function pluralCategory(lang, n) {
  var base = String(lang || "en").split("-")[0], i = Math.floor(Math.abs(n))
  if (base === "ru" || base === "uk") {
    if (n !== i) return "other"
    if (i % 10 === 1 && i % 100 !== 11) return "one"
    if (i % 10 >= 2 && i % 10 <= 4 && (i % 100 < 12 || i % 100 > 14)) return "few"
    return "many"
  }
  return n === 1 ? "one" : "other"
}

// A catalog lookup with English fallback, for when the plugin's language differs from the shell's.
function lookup(catalog, english, key, count, lang) {
  var layers = [[catalog, lang], [english, "en"]]
  for (var i = 0; i < layers.length; ++i) {
    var v = layers[i][0] ? layers[i][0][key] : undefined
    if (v && typeof v === "object") v = count === undefined ? v.other : (v[pluralCategory(layers[i][1], count)] || v.other)
    if (typeof v === "string" && v.length) return v
  }
  return key
}

// What is left to reach a step, in money; 0 when done or unknown.
function remaining(step) {
  if (!step || step.done || step.progress === null) return 0
  return Math.max(0, step.need - step.have)
}

// Obsidian opens a note by its absolute path when its folder is a vault (obsidian.md/help/uri).
function obsidianUrl(path) { return "obsidian://open?path=" + encodeURIComponent(path) }

// The step being climbed: the first one not done. -1 when every step is done.
function nextStep(ladder) {
  for (var i = 0; i < ladder.length; ++i) if (!ladder[i].done) return i
  return -1
}

// "1 · 81%": the step number and how far along it is. No red, no money in the bar.
function barText(status) {
  if (!status || !status.ok) return "◎"
  var i = nextStep(status.ladder)
  if (i < 0) return "★"
  var p = status.ladder[i].progress
  var base = p === null ? String(i) : i + " · " + Math.floor(p * 100) + "%"
  return status.unprocessed > 0 ? base + " •" : base
}

if (typeof module !== "undefined") module.exports = {readStatus: readStatus, parseEntry: parseEntry, parseCommand: parseCommand, matchAccount: matchAccount,
  formatMoney: formatMoney, shortMoney: shortMoney, nextStep: nextStep, barText: barText, leaf: leaf, iso: iso,
  remaining: remaining, obsidianUrl: obsidianUrl, pluralCategory: pluralCategory, lookup: lookup,
  readGrowth: readGrowth, freshWins: freshWins, growthBarText: growthBarText, wealthLevel: wealthLevel}
