pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui as Ui

// Six months of money in and out, the business this month, and the action of the week.
Column {
  id: root
  property var service: null
  property string scope: "all"
  readonly property var st: service ? service.status : null
  signal commandRequested(string text)
  spacing: Style.space(14)

  CashflowChart {
    width: parent.width
    service: root.service
    incomeLabel: root.service ? root.service.t(root.scope === "business" ? "chart.revenue" : "chart.income") : ""
    spendingLabel: root.service ? root.service.t(root.scope === "business" ? "chart.biz-expenses" : "chart.spending") : ""
    series: !root.st ? [] : root.st.months.map(function(m) {
      return root.scope === "business" ? {month: m.month, income: m.bizRevenue, spending: m.bizExpenses}
                                       : {month: m.month, income: m.income, spending: m.living}
    })
  }

  Ui.PanelSeparator { foreground: Commons.Color.popups.text }

  Column {
    width: parent.width
    spacing: Style.space(8)
    Ui.PanelSectionHeader { foreground: Commons.Color.popups.text; text: root.service ? root.service.t("biz.title") : "" }
    Row {
      width: parent.width
      readonly property real cell: width / 3
      Stat { width: parent.cell; label: root.service ? root.service.t("biz.revenue") : ""; value: root.st ? root.service.money(root.st.bizMonth.revenue) : "—" }
      Stat { width: parent.cell; label: root.service ? root.service.t("biz.profit") : ""; value: root.st ? root.service.signed(root.st.bizMonth.profit) : "—" }
      Stat {
        width: parent.cell
        label: root.service ? root.service.t("biz.tax") : ""
        value: root.st ? root.service.money(root.st.tax.reserved) : "—"
      }
    }
    Meter {
      width: parent.width
      visible: !!root.st && root.st.tax.need > 0
      ratio: root.st && root.st.tax.need > 0 ? root.st.tax.reserved / root.st.tax.need : 0
    }
    Hint {
      width: parent.width
      wrapMode: Text.Wrap
      text: !root.st || !root.service ? "" : root.st.tax.need > 0
        ? root.service.t("biz.tax-need").arg(root.service.money(root.st.tax.need)).arg(root.service.percent(root.st.tax.rate))
        : root.service.t("biz.tax-none").arg(root.service.percent(root.st.tax.rate))
    }
  }

  Ui.PanelSeparator { foreground: Commons.Color.popups.text }

  WeekAction { width: parent.width; service: root.service; onCommandRequested: function(text) { root.commandRequested(text) } }
}
