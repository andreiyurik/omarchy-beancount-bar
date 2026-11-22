.pragma library
// Pure logic, no QML: tests load this file in Node (tests/model.test.js).
// The authority is the `fin` command. Everything here is only a preview or formatting.

var SCHEMA = 1
var SYMBOLS = {"₽": "RUB", "$": "USD", "€": "EUR"}
var SIGNS = {RUB: "₽", USD: "$", EUR: "€", USDT: "USDT"}
var DATE_WORDS = {"вчера": 1, "yesterday": 1, "позавчера": 2}
var WEEK_WORDS = ["week", "неделя"]
var AMOUNT_RE = /^(\+?)([$€₽]?)(\d+(?:[.,]\d{1,2})?)([кkКK]?)([$€₽]?)$/
var MAX_TEXT = 200

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
              months: num(s.months), share: num(s.share), capital: num(s.capital)}
    }),
    tax: {rate: num((raw.tax || {}).rate), need: num((raw.tax || {}).need), reserved: num((raw.tax || {}).reserved)},
    bizMonth: {revenue: num((raw.bizMonth || {}).revenue), expenses: num((raw.bizMonth || {}).expenses), profit: num((raw.bizMonth || {}).profit)},
    months: (raw.months || []).slice(-12).map(function(m) {
      return {month: str(m.month, 7), income: num(m.income), living: num(m.living), bizRevenue: num(m.biz_revenue), bizExpenses: num(m.biz_expenses)}
    }),
    unprocessed: num(raw.unprocessed),
    warnings: (raw.warnings || []).slice(0, 10).map(function(w) {
      return {key: str(w.key, 40), count: num(w.count), days: num(w.days), amount: num(w.amount), share: num(w.share), limit: num(w.limit),
              currencies: (w.currencies || []).slice(0, 10).map(function(c) { return str(c, 12) })}
    }),
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
  var narration = words.join(" ").replace(/"/g, "'").trim()
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
  if (WEEK_WORDS.indexOf((tokens[0] || "").toLowerCase()) < 0) return null
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
  formatMoney: formatMoney, shortMoney: shortMoney, nextStep: nextStep, barText: barText, leaf: leaf, iso: iso}
