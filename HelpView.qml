pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui as Ui

// A short how-to: the entry line, the keys, and where the rest is written down.
Column {
  id: root
  property var service: null
  readonly property var st: service ? service.status : null
  readonly property var examples: ["spend", "income", "goal", "inbox", "category", "account", "currency", "week"]
  readonly property var keys: ["enter", "tab", "esc", "arrows", "middle"]
  readonly property var noteKeys: ["guide", "constitution", "ladder", "policy"]
  signal tryRequested(string text)
  signal closeRequested()
  spacing: Style.space(12)

  component Row2: Item {
    id: row
    property string code: ""
    property string meaning: ""
    property bool clickable: false
    signal clicked()
    width: parent ? parent.width : 0
    height: Math.max(leftText.implicitHeight, rightText.implicitHeight) + Style.space(4)
    Txt {
      id: leftText
      width: parent.width * 0.42
      font.bold: true
      color: row.clickable && area.containsMouse ? Commons.Color.accent : Commons.Color.popups.text
      text: row.code
    }
    Hint {
      id: rightText
      x: parent.width * 0.42 + Style.space(8)
      width: parent.width - x
      wrapMode: Text.Wrap
      text: row.meaning
    }
    MouseArea {
      id: area
      anchors.fill: leftText
      enabled: row.clickable
      hoverEnabled: true
      cursorShape: row.clickable ? Qt.PointingHandCursor : Qt.ArrowCursor
      onClicked: row.clicked()
    }
  }

  Ui.PanelSectionHeader { foreground: Commons.Color.popups.text; text: root.service ? root.service.t("help.entry") : "" }
  Column {
    width: parent.width
    spacing: Style.space(2)
    Repeater {
      model: root.examples
      Row2 {
        required property string modelData
        code: root.service ? root.service.t("help.ex." + modelData + ".code") : ""
        meaning: root.service ? root.service.t("help.ex." + modelData + ".text") : ""
        clickable: true
        onClicked: root.tryRequested(code)
      }
    }
  }
  Hint { width: parent.width; wrapMode: Text.Wrap; text: root.service ? root.service.t("help.entry-note") : "" }

  Ui.PanelSeparator { foreground: Commons.Color.popups.text }

  Ui.PanelSectionHeader { foreground: Commons.Color.popups.text; text: root.service ? root.service.t("help.keys") : "" }
  Column {
    width: parent.width
    spacing: Style.space(2)
    Repeater {
      model: root.keys
      Row2 {
        required property string modelData
        code: root.service ? root.service.t("help.key." + modelData + ".code") : ""
        meaning: root.service ? root.service.t("help.key." + modelData + ".text") : ""
      }
    }
  }

  Ui.PanelSeparator { foreground: Commons.Color.popups.text }

  Ui.PanelSectionHeader { foreground: Commons.Color.popups.text; text: root.service ? root.service.t("help.read") : "" }
  Flow {
    width: parent.width
    spacing: Style.space(6)
    Repeater {
      model: root.st ? root.noteKeys.filter(function(k) { return root.service.docPath(k) !== "" }) : []
      Ui.Button {
        required property string modelData
        foreground: Commons.Color.popups.text
        bordered: true
        text: root.service.t("help.note." + modelData)
        onClicked: { root.closeRequested(); root.service.openNote(modelData) }
      }
    }
    Ui.Button {
      foreground: Commons.Color.popups.text
      bordered: true
      text: root.service ? root.service.t("action.fava") : ""
      onClicked: { root.closeRequested(); root.service.openFava("") }
    }
    Ui.Button {
      foreground: Commons.Color.popups.text
      bordered: true
      text: root.service ? root.service.t("help.plugin") : ""
      onClicked: { root.closeRequested(); root.service.openUrl(root.service.helpUrl) }
    }
  }
  Hint { width: parent.width; wrapMode: Text.Wrap; text: root.service ? root.service.t("help.obsidian") : "" }
}
