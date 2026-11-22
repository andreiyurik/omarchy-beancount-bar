pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui as Ui

// Separate from Panel.qml so it can be rendered and tested without a bar.
Column {
  id: root
  property var service: null
  property string view: "growth"
  property string scope: "all"
  property string error: ""
  property bool allBanners: false
  readonly property bool helpOpen: view === "help"
  readonly property Item focusItem: input
  readonly property bool editing: input.activeFocus
  readonly property var st: service ? service.status : null
  readonly property var parsed: service ? service.parseInput(input.text) : null
  readonly property var banners: {
    if (!service) return []
    var out = []
    if (service.problem) out.push({text: service.problemText() + (st ? " " + service.t("banner.last-data") : ""), detail: service.problem.message})
    if (st) st.warnings.forEach(function(w) {
      if (w.key === "little-data" && st.txCount === 0) return  // the start card says it better
      var text = service.warningText(w)
      if (text) out.push({text: text})
    })
    return out
  }
  signal closeRequested()
  spacing: Style.space(14)

  readonly property var views: ["growth", "freedom", "month"]
  function reset() { error = ""; view = "growth"; allBanners = false }
  function switchView(step) { var i = views.indexOf(view); view = views[(i + (step || 1) + views.length) % views.length] }
  function toggleHelp() { view = helpOpen ? "growth" : "help"; input.forceActiveFocus() }
  function submit() {
    if (!service || service.saving) return
    error = ""
    var kind = parsed ? parsed.kind : ""
    service.addEntry(input.text, function(ok, text) {
      if (ok) { input.text = ""; if (kind === "entry") root.closeRequested() }
      else root.error = text
    })
  }
  function prefill(text) {
    error = ""
    input.text = text
    input.cursorPosition = text.length
    input.forceActiveFocus()
  }
  function preview() {
    var s = service, p = parsed
    if (!s) return ""
    if (error) return error
    if (!p) return s.t("input.hint")
    if (!p.ok) { var msg = s.t("entry." + p.error); return msg.indexOf("%1") >= 0 ? msg.arg(p.amount || p.query || "") : msg }
    if (p.kind === "goal") return p.off ? s.t("command.goal-off") : s.t("command.goal").arg(s.plainMoney(p.amount, p.currency))
    if (p.kind === "week") {
      if (p.target) return s.t("command.week").arg(p.target).arg(p.text)
      return p.args[0] === "clear" ? s.t("command.week-clear") : s.t("command.week-bump").arg(p.args[0])
    }
    var parts = [(p.income ? "+" : "−") + s.plainMoney(p.amount, p.currency), p.narration,
                 Commons.I18n.rightToLeft ? "" : s.shortAccount(p.source) + " → " + s.shortAccount(p.account)]
    if (p.flag === "!") parts.push(s.t("input.inbox"))
    parts.push(s.t(p.offset === 2 ? "date.two-days" : p.offset === 1 ? "date.yesterday" : "date.today"))
    return parts.filter(function(x) { return x !== "" }).join("  ·  ")
  }

  Column {
    width: parent.width
    spacing: Style.space(5)
    Ui.TextField {
      id: input
      width: parent.width
      foreground: Commons.Color.popups.text
      placeholderText: root.service ? root.service.t("input.placeholder") : ""
      enabled: !root.service || !root.service.saving
      onAccepted: root.submit()
      onTextEdited: root.error = ""
      Keys.onEscapePressed: root.helpOpen ? root.toggleHelp() : root.closeRequested()
      Keys.onPressed: function(event) { if (event.key === Qt.Key_F1) { root.toggleHelp(); event.accepted = true } }
      Keys.onTabPressed: if (!root.helpOpen) root.switchView()
      Keys.onBacktabPressed: if (!root.helpOpen) root.switchView(-1)
      Keys.onUpPressed: if (input.text === "" && root.st && root.st.week) root.service.bumpWeek(1)
      Keys.onDownPressed: if (input.text === "" && root.st && root.st.week) root.service.bumpWeek(-1)
    }
    Hint {
      width: parent.width
      leftPadding: Style.spacing.controlPaddingX
      wrapMode: Text.Wrap
      color: root.error || (root.parsed && !root.parsed.ok) ? Commons.Color.urgent : root.parsed && root.parsed.ok ? Commons.Color.popups.text : Util.alpha(Commons.Color.popups.text, 0.65)
      text: root.preview()
    }
  }

  // Notes about the ledger: two at most, the rest one click away, so the numbers stay on top.
  Column {
    width: parent.width
    spacing: Style.space(4)
    visible: root.banners.length > 0 && !root.helpOpen
  Repeater {
    model: root.allBanners ? root.banners : root.banners.slice(0, 2)
    Rectangle {
      id: banner
      required property var modelData
      width: parent.width
      height: bannerText.implicitHeight + Style.space(10)
      radius: Style.cornerRadius
      color: Util.alpha(Commons.Color.popups.text, 0.08)
      Hint {
        id: bannerText
        anchors.verticalCenter: parent.verticalCenter
        x: Style.space(10)
        width: parent.width - Style.space(20)
        wrapMode: Text.Wrap
        color: Commons.Color.popups.text
        text: "• " + banner.modelData.text
      }
      Ui.PanelToolTip {
        visible: bannerHover.containsMouse && !!banner.modelData.detail
        text: banner.modelData.detail || ""
      }
      MouseArea { id: bannerHover; anchors.fill: parent; hoverEnabled: true; acceptedButtons: Qt.NoButton }
    }
  }
    Hint {
      visible: root.banners.length > 2
      leftPadding: Style.space(10)
      color: moreArea.containsMouse ? Commons.Color.accent : Util.alpha(Commons.Color.popups.text, 0.65)
      text: !root.service ? "" : root.allBanners ? root.service.t("banner.less") : root.service.tn("banner.more", root.banners.length - 2).arg(root.banners.length - 2)
      MouseArea { id: moreArea; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: root.allBanners = !root.allBanners }
    }
  }

  Item {
    width: parent.width
    height: viewSwitch.implicitHeight
    visible: !!root.st && !root.helpOpen
    Ui.ButtonGroup {
      id: viewSwitch
      focusable: false
      foreground: Commons.Color.popups.text
      value: root.view
      options: root.service ? root.views.map(function(v) { return {value: v, label: root.service.t("view." + v)} }) : []
      onChanged: function(value) { root.view = value; input.forceActiveFocus() }
    }
    Ui.ButtonGroup {
      anchors.right: parent.right
      visible: root.view === "month"
      focusable: false
      foreground: Commons.Color.popups.text
      value: root.scope
      options: root.service ? [{value: "all", label: root.service.t("scope.all")}, {value: "business", label: root.service.t("scope.business")}] : []
      onChanged: function(value) { root.scope = value; input.forceActiveFocus() }
    }
  }

  GrowthView {
    width: parent.width; visible: !!root.st && root.view === "growth"; service: root.service
    onCommandRequested: function(text) { root.prefill(text) }
  }
  FreedomView {
    width: parent.width; visible: !!root.st && root.view === "freedom"; service: root.service
    onHelpRequested: root.toggleHelp()
  }
  HelpView {
    width: parent.width; visible: root.helpOpen; service: root.service
    onTryRequested: function(text) { root.view = "growth"; root.prefill(text) }
    onCloseRequested: root.closeRequested()
  }
  MonthView {
    width: parent.width; visible: !!root.st && root.view === "month"; service: root.service; scope: root.scope
    onCommandRequested: function(text) { root.prefill(text) }
  }

  Ui.PanelSeparator { foreground: Commons.Color.popups.text }

  Item {
    width: parent.width
    height: actions.implicitHeight
    Hint {
      anchors.left: parent.left
      anchors.right: actions.left
      anchors.rightMargin: Style.space(8)
      anchors.verticalCenter: parent.verticalCenter
      text: root.service ? root.service.updatedText() : ""
    }
    Row {
      id: actions
      anchors.right: parent.right
      spacing: Style.space(4)
      Ui.PanelActionButton {
        visible: !!root.service && !!root.service.lastAdded
        iconText: "󰕌"; foreground: Commons.Color.popups.text
        tooltipText: root.service ? root.service.t("action.undo") : ""
        onClicked: root.service.undoLast()
      }
      Ui.PanelActionButton {
        iconText: root.service && root.service.amountsHidden ? "󰈉" : "󰈈"; foreground: Commons.Color.popups.text
        tooltipText: !root.service ? "" : root.service.t(root.service.amountsHidden ? "action.show" : "action.hide")
        onClicked: root.service.toggleAmounts()
      }
      Ui.PanelActionButton {
        iconText: "󰑐"; foreground: Commons.Color.popups.text
        enabled: !!root.service && !root.service.busy
        tooltipText: root.service ? root.service.t("action.refresh") : ""
        onClicked: root.service.refresh()
      }
      Ui.PanelActionButton {
        iconText: root.helpOpen ? "󰅖" : "󰋗"; foreground: Commons.Color.popups.text
        tooltipText: root.service ? root.service.t(root.helpOpen ? "action.help-close" : "action.help") : ""
        onClicked: root.toggleHelp()
      }
      Ui.PanelActionButton {
        iconText: "󰏌"; foreground: Commons.Color.popups.text
        tooltipText: root.service ? root.service.t("action.fava") : ""
        onClicked: { root.closeRequested(); root.service.openFava("") }
      }
    }
  }
}
