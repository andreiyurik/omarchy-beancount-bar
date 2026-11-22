pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui as Ui

// The freedom ladder and the four numbers that move it.
Column {
  id: root
  property var service: null
  readonly property var st: service ? service.status : null
  readonly property int next: service ? service.nextStepIndex : -1
  readonly property var step: st && next >= 0 ? st.ladder[next] : null
  readonly property bool empty: !!st && st.txCount === 0
  signal helpRequested()
  spacing: Style.space(12)

  // A new ledger has nothing to measure yet: say what to do first instead of showing dashes.
  Rectangle {
    width: parent.width
    visible: root.empty
    height: startColumn.implicitHeight + Style.space(24)
    radius: Style.cornerRadius
    color: Util.alpha(Commons.Color.accent, 0.10)
    Column {
      id: startColumn
      x: Style.space(12); y: Style.space(12)
      width: parent.width - Style.space(24)
      spacing: Style.space(8)
      Txt { width: parent.width; font.bold: true; text: root.service ? root.service.t("start.title") : "" }
      Hint { width: parent.width; wrapMode: Text.Wrap; color: Commons.Color.popups.text; text: root.service ? root.service.t("start.body") : "" }
      Row {
        spacing: Style.space(6)
        Ui.Button {
          foreground: Commons.Color.popups.text; bordered: true
          visible: !!root.service && root.service.docPath("guide") !== ""
          text: root.service ? root.service.t("help.note.guide") : ""
          onClicked: root.service.openNote("guide")
        }
        Ui.Button {
          foreground: Commons.Color.popups.text; bordered: true
          text: root.service ? root.service.t("action.help") : ""
          onClicked: root.helpRequested()
        }
      }
    }
  }

  Column {
    width: parent.width
    spacing: Style.space(6)
    Item {
      width: parent.width; height: stepTitle.implicitHeight
      Txt {
        id: stepTitle
        width: parent.width - stepPercent.implicitWidth - Style.space(12)
        font.bold: true
        font.pixelSize: Style.font.title
        text: !root.service || !root.st ? "" : root.next < 0 ? root.service.t("freedom.all-done") : root.service.t("freedom.step").arg(root.next).arg(root.service.stepTitle(root.step))
      }
      Txt {
        id: stepPercent
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        color: Commons.Color.accent
        font.bold: true
        text: root.step && root.step.progress !== null ? root.service.percent(root.step.progress) : ""
      }
    }
    Meter { width: parent.width; visible: !!root.step && !root.empty; ratio: root.step && root.step.progress !== null ? root.step.progress : 0 }
    Txt {
      width: parent.width
      visible: text !== "" && !root.empty
      text: root.service && root.step ? root.service.remainingText(root.step) : ""
    }
    Hint {
      width: parent.width
      wrapMode: Text.Wrap
      visible: text !== ""
      text: root.step && root.service ? root.service.t("freedom.why." + root.step.key) : ""
    }
  }

  // Every step by name: done, the one being climbed, and what each later one asks for.
  Column {
    width: parent.width
    spacing: Style.space(2)
    visible: !!root.st
    Repeater {
      model: root.st ? root.st.ladder : []
      Item {
        id: stepRow
        required property var modelData
        required property int index
        readonly property bool current: index === root.next
        readonly property bool done: modelData.done
        width: parent.width
        height: Math.max(stepName.implicitHeight, Style.space(22)) + (why.visible ? why.implicitHeight + Style.space(2) : 0)
        Rectangle {
          id: mark
          x: 0; y: Style.space(6)
          width: Style.space(10); height: width; radius: width / 2
          color: stepRow.done ? Commons.Color.accent : "transparent"
          border.width: stepRow.done ? 0 : stepRow.current ? Style.space(2) : 1
          border.color: stepRow.current ? Commons.Color.accent : Util.alpha(Commons.Color.popups.text, 0.35)
        }
        Txt {
          id: stepName
          x: Style.space(20); y: Style.space(2)
          width: parent.width - x - stepValue.implicitWidth - Style.space(8)
          font.bold: stepRow.current
          color: stepRow.current || stepRow.done ? Commons.Color.popups.text : Util.alpha(Commons.Color.popups.text, 0.7)
          text: root.service ? stepRow.index + ". " + root.service.stepTitle(stepRow.modelData) : ""
        }
        Hint {
          id: stepValue
          anchors.right: parent.right; y: Style.space(3)
          color: stepRow.current ? Commons.Color.accent : Util.alpha(Commons.Color.popups.text, 0.65)
          text: !root.service ? "" : stepRow.done ? "✓" : root.service.stepTarget(stepRow.modelData)
        }
        Hint {
          id: why
          x: Style.space(20); anchors.top: stepName.bottom; anchors.topMargin: Style.space(2)
          width: parent.width - x
          wrapMode: Text.Wrap
          visible: stepArea.containsMouse && !stepRow.current
          text: root.service ? root.service.t("freedom.why." + stepRow.modelData.key) : ""
        }
        MouseArea { id: stepArea; anchors.fill: parent; hoverEnabled: true; acceptedButtons: Qt.NoButton }
      }
    }
  }

  Ui.PanelSeparator { foreground: Commons.Color.popups.text }

  Grid {
    width: parent.width
    visible: !root.empty
    columns: 2
    rowSpacing: Style.space(12)
    readonly property real cell: width / 2
    Stat {
      width: parent.cell
      label: root.service ? root.service.t("stat.net-worth") : ""
      value: root.st ? root.service.money(root.st.netWorth) : "—"
    }
    Stat {
      width: parent.cell
      label: root.service ? root.service.t("stat.runway") : ""
      value: !root.st || root.st.runway === null ? "—" : root.service.t("stat.runway-value").arg(root.service.number(Math.round(root.st.runway * 10) / 10, 1))
    }
    Stat {
      width: parent.cell
      label: root.service && root.st ? root.service.t("stat.savings").arg(root.service.percent(root.st.savingsTarget)) : ""
      value: !root.st ? "—" : root.service.percent(root.st.savingsRate) + (root.st.savingsRate !== null && root.st.savingsRate >= root.st.savingsTarget ? " ✓" : "")
    }
    Stat {
      width: parent.cell
      label: root.service ? root.service.t("stat.asset-income") : ""
      value: root.st ? root.service.money(root.st.assetIncome) : "—"
    }
  }
}
