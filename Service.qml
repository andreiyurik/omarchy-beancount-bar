import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons as Commons
import "Model.js" as Model

// Talks to the `fin` command only. No network, no keys: the ledger stays where it is.
Item {
  id: root
  // Third-party services can't read shell.json, so the bar widget hands over its settings.
  property var widgetSettings: null
  property var overrides: null           // tests
  property bool silent: false            // tests: no desktop notifications
  property string lastNotice: ""

  property var status: null              // Model.readStatus() of the last good `fin status`
  property var problem: null             // {key, message} when the last refresh failed
  property bool busy: false
  property bool saving: false
  property var lastAdded: null           // {id, narration}
  property bool amountsHidden: false
  property date updatedAt: new Date(0)
  property date now: new Date()

  readonly property string pluginId: "andreiyurik.beancount-bar"
  readonly property var settings: overrides || widgetSettings || ({})
  readonly property string command: String(settings.command || "fin")
  readonly property string favaUrl: String(settings.favaUrl || "http://localhost:5000")
  readonly property bool autoRefresh: settings.autoRefresh !== false
  readonly property int refreshMinutes: Math.max(1, Math.min(120, Number(settings.refreshMinutes) || 10))
  readonly property string configDir: (Quickshell.env("HOME") || "") + "/.config/beancount-bar"
  readonly property int nextStepIndex: status ? Model.nextStep(status.ladder) : -1
  readonly property var entryContext: status ? status.entry : ({accounts: [], history: {}, currencies: []})

  Commons.Translations { id: catalog; directory: Qt.resolvedUrl("i18n") }
  function t(key) { return catalog.t(key) }
  function tn(key, count) { return catalog.tn(key, count) }

  readonly property var locale: Qt.locale(Commons.I18n.formatLocale)
  readonly property var moneyFormat: ({group: locale.groupSeparator === "," ? "," : " ", decimal: locale.decimalPoint})
  function number(value, decimals) { return Commons.I18n.formatNumber(value, decimals) }
  function plainMoney(value, code) { return Model.formatMoney(value, code || (status ? status.currency : "RUB"), moneyFormat) }
  function money(value, code) { return amountsHidden ? "•••" : plainMoney(value, code) }
  function signed(value) { return amountsHidden ? "•••" : (value > 0 ? "+" : "") + plainMoney(value) }
  function percent(ratio) { return ratio === null || ratio === undefined ? "—" : number(Math.round(ratio * 100), 0) + "%" }
  function monthShort(isoMonth) {
    var i = parseInt(String(isoMonth).slice(5, 7), 10) - 1
    return locale.standaloneMonthName(i, Locale.ShortFormat).replace(/\.$/, "")
  }
  function monthName(isoMonth) { return locale.standaloneMonthName(parseInt(String(isoMonth).slice(5, 7), 10) - 1) }

  function stepTitle(step) {
    if (!step) return ""
    if (step.key === "reserve-min" || step.key === "reserve-target") return t("step." + step.key).arg(number(step.months, 0))
    if (step.key === "asset-share") return t("step.asset-share").arg(percent(step.share))
    if (step.key === "freedom") return t("step.freedom").arg(money(step.capital))
    return t("step." + step.key)
  }
  function warningText(w) {
    if (w.key === "unprocessed") return tn("warn.unprocessed", w.count).arg(number(w.count, 0))
    if (w.key === "tax-gap") return t("warn.tax-gap").arg(money(w.amount))
    if (w.key === "crypto-limit") return t("warn.crypto-limit").arg(percent(w.share)).arg(percent(w.limit))
    if (w.key === "missing-price") return t("warn.missing-price").arg(w.currencies.join(", "))
    if (w.key === "little-data") return tn("warn.little-data", w.days).arg(number(w.days, 0))
    return ""
  }
  function problemText() {
    if (!problem) return ""
    if (problem.key === "not-found") return t("error.not-found").arg(command)
    if (problem.key === "ledger") return t("error.ledger")
    if (problem.key === "schema") return t("error.schema")
    return t("error.failed")
  }
  function barText() { return Model.barText(status) }
  function shortAccount(name) { return Model.leaf(name) }
  function updatedText() {
    if (updatedAt.getTime() === 0) return ""
    var minutes = Math.floor((now.getTime() - updatedAt.getTime()) / 60000)
    if (minutes < 1) return t("footer.updated-now")
    if (minutes < 60) return tn("footer.updated-min", minutes).arg(number(minutes, 0))
    var hours = Math.floor(minutes / 60)
    return tn("footer.updated-hours", hours).arg(number(hours, 0))
  }
  function parseInput(text) {
    var c = Model.parseCommand(text)
    if (c) return c
    if (String(text).trim() === "") return null
    var e = Model.parseEntry(text, new Date(), entryContext)
    e.kind = "entry"
    return e
  }

  // ---------- processes ----------

  // One reader and one writer: arguments go as a list, never through a shell.
  Process {
    id: reader
    property bool exitedOnce: false
    stdout: StdioCollector { id: readerOut }
    stderr: StdioCollector { id: readerErr }
    onExited: function(code) { exitedOnce = true; root.busy = false; root.finishRefresh(code, readerOut.text, readerErr.text) }
    // A command that can't start never exits: say so instead of waiting forever.
    onRunningChanged: if (!running && root.busy) Qt.callLater(function() {
      if (!reader.exitedOnce && root.busy) { root.busy = false; root.problem = {key: "not-found", message: ""} }
    })
  }
  Process {
    id: writer
    property var done: null
    stdout: StdioCollector { id: writerOut }
    onExited: function(code) {
      root.saving = false
      var r = Model.readStatus(writerOut.text)
      var cb = writer.done
      writer.done = null
      if (cb) cb(code === 0 && r.ok, writerOut.text)
    }
    onRunningChanged: if (!running && root.saving) Qt.callLater(function() {
      if (!root.saving || !writer.done) return
      var cb = writer.done
      writer.done = null
      root.saving = false
      cb(false, "")
    })
  }
  Process {
    id: entryNotice
    stdout: StdioCollector { onStreamFinished: if (text.trim() === "undo") root.undoLast() }
  }
  PrivateFile { id: prefsWriter; path: root.configDir + "/hide-amounts" }
  FileView {
    path: root.configDir + "/hide-amounts"
    printErrors: false
    onLoaded: root.amountsHidden = text().trim() === "1"
  }

  Timer { interval: root.refreshMinutes * 60000; running: root.autoRefresh; repeat: true; onTriggered: root.refresh() }
  // A large jump between ticks means the machine slept, so the numbers are old.
  Timer {
    interval: Number(root.settings.tickMs) || 30000; running: true; repeat: true
    onTriggered: {
      var tick = new Date(), slept = tick.getTime() - root.now.getTime() > 120000
      root.now = tick
      if (slept && root.autoRefresh) root.refresh()
    }
  }
  Component.onCompleted: refresh()
  onCommandChanged: refresh()

  function refresh() {
    if (reader.running) return
    busy = true
    reader.exitedOnce = false
    reader.command = [command, "status", "--json"]
    reader.running = true
  }
  function refreshIfStale() { if (now.getTime() - updatedAt.getTime() > 60000 || !status) refresh() }

  function finishRefresh(code, out, err) {
    var r = Model.readStatus(out)
    if (r.ok && code === 0) {
      status = r
      problem = null
      updatedAt = new Date()
      now = updatedAt
      return
    }
    if (code === 127 || (!out && /not found|No such file/i.test(err))) problem = {key: "not-found", message: ""}
    else problem = {key: r.error === "ledger" ? "ledger" : r.error === "schema" ? "schema" : "failed", message: r.message || String(err).slice(0, 2000)}
  }

  function write(args, done) {
    if (saving) return
    saving = true
    writer.done = done
    writer.command = [command].concat(args)
    writer.running = true
  }

  // done(ok, message)
  function addEntry(text, done) {
    var preview = parseInput(text)
    if (!preview || !preview.ok) { done(false, t("entry." + (preview ? preview.error : "empty"))); return }
    if (preview.kind === "week") { runWeek(preview.args, done); return }
    write(["add", "--json", "--", String(text).trim()], function(ok, out) {
      var r = parse(out)
      if (!ok || !r || !r.entry) { done(false, r && r.message ? String(r.message).split("\n")[0] : t("entry.failed")); return }
      lastAdded = {id: String(r.entry.id), narration: String(r.entry.narration).slice(0, 200)}
      var e = r.entry
      notifyEntry(t("notice.saved"), (e.income ? "+" : "−") + plainMoney(e.amount, e.currency) + " · " + lastAdded.narration + " · " + Model.leaf(e.account))
      done(true, "")
      refresh()
    })
  }
  function undoLast() {
    if (!lastAdded) return
    var gone = lastAdded
    write(["undo", "--json", gone.id], function(ok) {
      if (ok) { lastAdded = null; notify(t("notice.removed"), gone.narration); refresh() }
      else notify(t("notice.undo-failed"), gone.narration)
    })
  }
  function runWeek(args, done) {
    write(["week", "--json", "--"].concat(args), function(ok, out) {
      var r = parse(out)
      if (done) done(ok, ok ? "" : (r && r.message ? String(r.message) : t("entry.week-format")))
      if (ok) refresh()
    })
  }
  function bumpWeek(delta) { runWeek([delta > 0 ? "+" + delta : String(delta)], null) }

  function parse(text) { try { return JSON.parse(String(text).slice(0, 100000)) } catch (error) { return null } }

  function toggleAmounts() {
    amountsHidden = !amountsHidden
    prefsWriter.save(amountsHidden ? "1\n" : "0\n")
  }
  function openFava(path) {
    var url = favaUrl.replace(/\/$/, "") + (path || "")
    var host = url.replace(/^https?:\/\//, "").split(/[:\/]/)[0]
    Quickshell.execDetached(["omarchy-launch-or-focus-webapp", "chrome-" + host + "__-Default", url])
  }

  function notify(title, body) {
    lastNotice = title + " | " + body
    if (!silent) Quickshell.execDetached(["notify-send", "-a", "Beancount", title, body])
  }
  // Waits for the notification, so a second entry replaces the earlier undo offer.
  function notifyEntry(title, body) {
    lastNotice = title + " | " + body
    if (!silent) entryNotice.exec(["notify-send", "-a", "Beancount", "-t", "8000", "-A", "undo=" + t("action.undo"), title, body])
  }
}
