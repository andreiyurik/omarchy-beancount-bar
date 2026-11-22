pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui as Ui

// Income this month as a race: against the goal, or against last month and the best month.
// Then where it comes from, what it does for freedom, the lifetime milestones and one action.
Column {
  id: root
  property var service: null
  readonly property var g: service && service.status ? service.status.growth : null
  readonly property var goal: g ? g.goal : null
  readonly property real recordAmount: g && g.record ? g.record.amount : 0
  readonly property real scale: !g ? 1 : goal ? Math.max(goal.target, g.current) * (goal.reached ? 1.04 : 1) : Math.max(1, g.current, g.prevSame, recordAmount) * 1.04
  readonly property color strongTick: Util.alpha(Commons.Color.popups.text, 0.9)
  readonly property color softTick: Util.alpha(Commons.Color.popups.text, 0.4)
  readonly property var recentWins: g ? g.wins.filter(function(w) { return w.kind !== "first-income" }).slice(-3).reverse() : []
  signal commandRequested(string text)
  spacing: Style.space(14)

  function goalWord() { return service.t("command.goal-word") + " " }

  // Headline.
  Column {
    width: parent.width
    spacing: Style.space(4)
    Item {
      width: parent.width; height: head.implicitHeight
      Ui.PanelSectionHeader {
        id: head
        foreground: Commons.Color.popups.text
        text: root.g ? root.service.t("growth.title").arg(root.service.monthName(root.g.month)) : ""
      }
      Ui.PanelActionButton {
        id: editGoal
        anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
        visible: !!root.goal
        iconText: "󰏫"; foreground: Commons.Color.popups.text
        tooltipText: root.service ? root.service.t("goal.edit") : ""
        onClicked: root.commandRequested(root.goalWord() + root.goal.amount + (root.goal.currency !== "RUB" ? " " + root.goal.currency.toLowerCase() : ""))
      }
      Hint {
        anchors.right: editGoal.visible ? editGoal.left : parent.right; anchors.verticalCenter: parent.verticalCenter
        anchors.rightMargin: editGoal.visible ? Style.space(4) : 0
        text: root.g ? root.service.t("growth.day").arg(root.g.day).arg(root.g.daysInMonth) : ""
      }
    }
    Item {
      width: parent.width; height: hero.implicitHeight
      Txt {
        id: hero
        width: parent.width - side.implicitWidth - Style.space(12)
        font.pixelSize: Style.font.displayLarge
        font.bold: true
        text: root.g ? root.service.money(root.g.current) : ""
      }
      Column {
        id: side
        anchors.right: parent.right; anchors.bottom: parent.bottom; anchors.bottomMargin: Style.space(3)
        visible: !!root.g && (!!root.goal || root.g.delta !== null || root.g.isRecord)
        Txt {
          anchors.right: parent.right
          font.pixelSize: Style.font.title
          font.bold: true
          color: Commons.Color.accent
          text: {
            var g = root.g, s = root.service
            if (!g) return ""
            if (root.goal) return root.goal.reached ? "★ " + s.signed(root.goal.over) : s.number(Math.floor(root.goal.progress * 100), 0) + "%"
            if (g.isRecord) return "★ " + s.t("growth.record-badge")
            return (g.delta >= 0 ? "▲ " : "▼ ") + s.number(Math.abs(g.delta), 0) + "%"
          }
        }
        Hint {
          anchors.right: parent.right
          text: {
            var g = root.g, s = root.service
            if (!g) return ""
            if (root.goal) return root.goal.reached ? s.t("goal.over") : s.t("goal.of").arg(s.money(root.goal.target))
            if (g.isRecord) return s.t("growth.record-was").arg(s.money(root.recordAmount))
            return s.t("growth.vs-last").arg(s.monthShort(g.prevMonth))
          }
        }
      }
    }
    Meter {
      width: parent.width
      visible: !!root.g && (!!root.goal || root.g.prevSame > 0 || root.recordAmount > 0)
      ratio: root.g ? root.g.current / root.scale : 0
      ticks: {
        var g = root.g, out = []
        if (!g) return out
        if (root.goal) {
          root.goal.stages.forEach(function(s) { if (s < root.goal.target) out.push({ratio: s / root.scale, color: root.softTick}) })
          if (!root.goal.reached) out.push({ratio: root.goal.pace / root.scale, color: root.strongTick})
          return out
        }
        if (g.prevSame > 0) out.push({ratio: g.prevSame / root.scale, color: root.strongTick})
        if (root.recordAmount > 0) out.push({ratio: root.recordAmount / root.scale, color: root.softTick})
        return out
      }
    }
    // With a goal: the next stage, and the even pace explained. Never a warning.
    Item {
      width: parent.width; height: stageLine.implicitHeight
      visible: !!root.goal
      Txt {
        id: stageLine
        width: parent.width - paceKey.implicitWidth - Style.space(12)
        text: !root.goal ? "" : root.goal.reached ? root.service.t("goal.reached") : root.service.t("goal.stage").arg(root.service.money(root.goal.stage.remaining)).arg(root.service.money(root.goal.stage.target))
      }
      Row {
        id: paceKey
        anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
        spacing: Style.space(6)
        visible: !!root.goal && !root.goal.reached
        Rectangle { width: Style.space(2); height: Style.space(10); anchors.verticalCenter: parent.verticalCenter; color: root.strongTick }
        Hint { text: root.goal ? root.service.t("goal.pace").arg(root.service.money(root.goal.pace)) : "" }
      }
    }
    // Without a goal: a key for the ticks, and an offer to set one.
    Item {
      width: parent.width; height: Math.max(prevKey.implicitHeight, recordKey.implicitHeight)
      visible: !!root.g && !root.goal && (root.g.prevSame > 0 || root.recordAmount > 0)
      Row {
        id: prevKey
        spacing: Style.space(6)
        visible: !!root.g && root.g.prevSame > 0
        Rectangle { width: Style.space(2); height: Style.space(10); anchors.verticalCenter: parent.verticalCenter; color: root.strongTick }
        Hint { text: root.g ? root.service.t("growth.same-day").arg(root.service.monthShort(root.g.prevMonth)).arg(root.service.money(root.g.prevSame)) : "" }
      }
      Row {
        id: recordKey
        anchors.right: parent.right
        spacing: Style.space(6)
        visible: root.recordAmount > 0
        Rectangle { width: Style.space(2); height: Style.space(10); anchors.verticalCenter: parent.verticalCenter; color: root.softTick }
        Hint { text: root.g && root.g.record ? root.service.t("growth.record").arg(root.service.monthShort(root.g.record.month)).arg(root.service.money(root.g.record.amount)) : "" }
      }
    }
    Item {
      width: parent.width; height: Math.max(goalHint.implicitHeight, goalButton.implicitHeight)
      visible: !!root.g && !root.goal
      Hint {
        id: goalHint
        anchors.left: parent.left; anchors.right: goalButton.left; anchors.rightMargin: Style.space(8); anchors.verticalCenter: parent.verticalCenter
        wrapMode: Text.Wrap
        text: root.service ? root.service.t(root.g && root.g.current === 0 && root.g.lifetime === 0 ? "growth.first-hint" : "goal.offer") : ""
      }
      Ui.Button {
        id: goalButton
        anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
        foreground: Commons.Color.popups.text
        bordered: true
        text: root.service ? root.service.t("goal.set") : ""
        onClicked: root.commandRequested(root.goalWord())
      }
    }
  }

  // What this month's money does for freedom.
  Txt {
    width: parent.width
    wrapMode: Text.Wrap
    visible: text !== ""
    text: {
      var g = root.g, s = root.service
      if (!g || g.freedom.monthsAdded === null || g.freedom.monthNet <= 0) return ""
      var added = s.t("growth.months-added").arg(s.number(Math.round(g.freedom.monthsAdded * 10) / 10, 1))
      if (g.freedom.monthsToStep === null || g.freedom.monthsToStep <= 0) return added
      return added + " · " + s.t("growth.months-to-step").arg(s.number(Math.ceil(g.freedom.monthsToStep * 10) / 10, 1))
    }
  }

  // Where the money comes from, against the whole of last month.
  Column {
    width: parent.width
    spacing: Style.space(4)
    visible: !!root.g && root.g.sources.length > 0
    Ui.PanelSectionHeader { foreground: Commons.Color.popups.text; text: root.service ? root.service.t("growth.sources") : "" }
    Repeater {
      model: root.g ? root.g.sources : []
      Item {
        id: src
        required property var modelData
        width: parent.width; height: srcName.implicitHeight
        readonly property real share: root.g && root.g.current > 0 ? modelData.current / root.g.current : 0
        Rectangle {
          anchors.left: parent.left; anchors.verticalCenter: parent.verticalCenter
          width: (parent.width - Style.space(150)) * src.share; height: parent.height - Style.space(2)
          radius: Style.space(2)
          color: Util.alpha(Commons.Color.accent, 0.16)
        }
        Txt {
          id: srcName
          x: Style.space(6)
          width: parent.width - srcValue.implicitWidth - Style.space(18)
          text: root.service ? root.service.sourceName(src.modelData.name) : ""
        }
        Hint {
          id: srcValue
          anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
          color: Commons.Color.popups.text
          text: {
            var s = root.service, d = src.modelData
            if (!s) return ""
            var tail = d.previous > 0 ? "  " + (d.current >= d.previous ? "▲" : "▼") + s.number(Math.abs(Math.round((d.current - d.previous) / d.previous * 100)), 0) + "%" : d.current > 0 ? "  " + s.t("growth.new") : ""
            return s.money(d.current) + tail
          }
        }
      }
    }
  }

  Ui.PanelSeparator { foreground: Commons.Color.popups.text }

  // Lifetime milestones: earned money only goes up.
  Column {
    width: parent.width
    spacing: Style.space(6)
    visible: !!root.g
    Item {
      width: parent.width; height: msHead.implicitHeight
      Ui.PanelSectionHeader { id: msHead; foreground: Commons.Color.popups.text; text: root.service ? root.service.t("growth.milestones") : "" }
      Hint {
        anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
        text: root.g ? root.service.t("growth.lifetime").arg(root.service.money(root.g.lifetime)) : ""
      }
    }
    MilestoneLadder {
      width: parent.width
      steps: root.g ? root.g.steps : []
      segment: {
        var g = root.g
        if (!g || !g.next) return 0
        var reached = g.steps.filter(function(s) { return s.done })
        var from = reached.length ? reached[reached.length - 1].target : 0
        return Math.max(0, Math.min(1, (g.lifetime - from) / (g.next.target - from)))
      }
    }
    Txt {
      width: parent.width
      text: !root.g ? "" : root.g.next ? root.service.t("growth.next").arg(root.service.money(root.g.next.target)).arg(root.service.money(root.g.next.remaining)) : root.service.t("growth.all-done")
    }
    Repeater {
      model: root.recentWins
      Hint {
        required property var modelData
        width: parent.width
        text: root.service ? "★ " + root.service.winText(modelData) : ""
      }
    }
  }

  Ui.PanelSeparator { foreground: Commons.Color.popups.text }

  WeekAction { width: parent.width; service: root.service; onCommandRequested: function(text) { root.commandRequested(text) } }
}
