import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui as Ui

Ui.BarWidget {
  id: root
  moduleName: "andreiyurik.beancount-bar"
  readonly property var service: bar && bar.shell ? bar.shell.serviceFor(moduleName) : null
  readonly property bool opened: popup.opened
  readonly property bool popoutSwitchClosing: popup.popoutSwitchClosing
  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  Binding {
    target: root.service
    property: "widgetSettings"
    value: root.settings || ({})
    when: !!root.service
  }

  function open() { popup.open() }
  function close() { popup.close() }
  function toggle() { popup.toggle() }
  function closeForPopoutSwitch() { popup.closeForPopoutSwitch() }

  function tooltip() {
    var s = service
    if (!s) return "Beancount"
    if (s.problem) return s.problemText()
    if (!s.status) return s.t("tooltip.loading")
    var st = s.status, i = s.nextStepIndex
    var lines = []
    if (st.growth) lines.push(s.t("growth.title").arg(s.monthName(st.growth.month)) + ": " + s.money(st.growth.current))
    lines.push(s.wealthText())
    lines.push(i < 0 ? s.t("tooltip.all-steps") : s.t("tooltip.step").arg(s.stepTitle(st.ladder[i])))
    if (st.runway !== null) lines.push(s.t("tooltip.runway").arg(s.number(Math.round(st.runway * 10) / 10, 1)))
    if (st.unprocessed > 0) lines.push(s.tn("warn.unprocessed", st.unprocessed).arg(s.number(st.unprocessed, 0)))
    return lines.join("\n")
  }

  Ui.WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.service ? root.service.barText() : "\u{F0E66}"
    foreground: root.bar ? root.bar.barForeground : Commons.Color.foreground
    dimmed: !root.service || !root.service.status || !!root.service.problem
    tooltipText: root.tooltip()
    onPressed: function(code) {
      if (code === Qt.MiddleButton) { if (root.service) root.service.refresh() }
      else root.toggle()
    }
    Accessible.role: Accessible.Button
    Accessible.name: tooltipText
  }

  Panel {
    id: popup
    bar: root.bar
    moduleName: root.moduleName
    settings: root.settings
    anchorItem: button
    hostWidget: root
    service: root.service
  }
}
