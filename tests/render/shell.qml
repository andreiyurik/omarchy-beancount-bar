import QtQuick
import Quickshell
import qs.Commons as Commons
import "plugin" as P

// Renders the real panel against a ledger, saves a PNG and prints what the service saw.
ShellRoot {
  id: h
  readonly property string out: Quickshell.env("OUT")
  P.Service { id: s; silent: true; overrides: JSON.parse(Quickshell.env("SETTINGS")) }

  FloatingWindow {
    implicitWidth: 460; implicitHeight: 1000
    color: Commons.Color.popups.background
    Item {
      id: frame
      width: 460; height: content.implicitHeight + 40
      Rectangle { anchors.fill: parent; color: Commons.Color.popups.background }
      P.PanelContent {
        id: content
        x: 20; y: 20; width: 420
        service: s
        view: Quickshell.env("VIEW") || "freedom"
        scope: Quickshell.env("SCOPE") || "all"
        Component.onCompleted: if (Quickshell.env("INPUT")) prefill(Quickshell.env("INPUT"))
      }
    }
  }
  Timer {
    interval: 100; repeat: true; running: true
    property int ticks: 0
    onTriggered: {
      ticks++
      if ((!s.status && !s.problem) && ticks < 100) return
      running = false
      console.log("STATE " + JSON.stringify({ok: !!s.status, problem: s.problem, bar: s.barText(), preview: content.preview(), banners: content.banners.length}))
      settle.start()
    }
  }
  Timer {
    id: settle; interval: 600
    onTriggered: frame.grabToImage(function(result) { result.saveToFile(h.out); Qt.quit() })
  }
}
