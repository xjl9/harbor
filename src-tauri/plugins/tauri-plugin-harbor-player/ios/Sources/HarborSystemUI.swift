/// System UI the JS shell cannot reach from a WKWebView: the AirPlay route
/// sheet and haptic feedback.
import AVKit
import UIKit

/// AVRoutePickerView has no public "open" call. The standard workaround keeps
/// a hidden instance in the hierarchy and synthesizes a tap on its internal
/// button; the system sheet then presents from that view's window.
final class HarborRoutePicker {
  private var picker: AVRoutePickerView?

  func present(in host: UIView) {
    let view = picker ?? AVRoutePickerView(frame: CGRect(x: -200, y: -200, width: 44, height: 44))
    // Off-screen and nearly invisible rather than hidden: a hidden view has no
    // window to present from.
    view.alpha = 0.02
    if view.superview !== host {
      view.removeFromSuperview()
      host.addSubview(view)
    }
    picker = view
    guard let button = Self.firstButton(in: view) else {
      NSLog("%@", "[harbor-player] route picker: no internal button to trigger")
      return
    }
    button.sendActions(for: .touchUpInside)
  }

  // The button's depth in the picker's private hierarchy varies by iOS release.
  private static func firstButton(in view: UIView) -> UIButton? {
    for subview in view.subviews {
      if let button = subview as? UIButton { return button }
      if let nested = firstButton(in: subview) { return nested }
    }
    return nil
  }
}

enum HarborHaptics {
  static func play(_ kind: String) {
    switch kind {
    case "select":
      let generator = UISelectionFeedbackGenerator()
      generator.prepare()
      generator.selectionChanged()
    case "medium":
      impact(.medium)
    case "heavy":
      impact(.heavy)
    default:
      impact(.light)
    }
  }

  private static func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
    let generator = UIImpactFeedbackGenerator(style: style)
    generator.prepare()
    generator.impactOccurred()
  }
}
