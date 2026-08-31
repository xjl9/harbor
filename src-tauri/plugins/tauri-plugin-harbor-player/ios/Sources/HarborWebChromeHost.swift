/// Web-chrome hosting: the player surface becomes a child of the Tauri root
/// controller, inserted beneath the WKWebView, and the web view is made
/// see-through so the JS shell draws every control over live video. The modal
/// path in HarborPlayerPlugin.load is untouched; this only runs for webChrome loads.
import UIKit
import WebKit

final class HarborWebChromeHost {
  private weak var webView: WKWebView?
  private var savedOpaque = true
  private var savedBackground: UIColor?
  private var savedScrollBackground: UIColor?
  private var savedUnderPage: UIColor?
  private var webViewAltered = false

  func embed(_ vc: UIViewController, in root: UIViewController) {
    guard vc.parent == nil else { return }
    root.addChild(vc)
    vc.view.frame = root.view.bounds
    vc.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    // Index 0 keeps the web view (and anything Tauri adds later) on top; the
    // surface is purely a backdrop and must never receive a touch.
    vc.view.isUserInteractionEnabled = false
    root.view.insertSubview(vc.view, at: 0)
    vc.didMove(toParent: root)
    makeWebViewTransparent(under: root.view)
  }

  /// Safe to call for a modal or already-detached controller: only the web
  /// view restore happens then, and only if a previous embed altered it.
  func detach(_ vc: UIViewController, restoreWebView: Bool) {
    if vc.parent != nil {
      vc.willMove(toParent: nil)
      vc.view.removeFromSuperview()
      vc.removeFromParent()
    }
    if restoreWebView { restore() }
  }

  private func makeWebViewTransparent(under root: UIView) {
    guard !webViewAltered, let webView = Self.findWebView(in: root) else { return }
    self.webView = webView
    savedOpaque = webView.isOpaque
    savedBackground = webView.backgroundColor
    savedScrollBackground = webView.scrollView.backgroundColor
    savedUnderPage = webView.underPageBackgroundColor
    webView.isOpaque = false
    webView.backgroundColor = .clear
    webView.scrollView.backgroundColor = .clear
    // Painted behind the document on rubber-band overscroll; left opaque it
    // flashes over the video at the scroll edges.
    webView.underPageBackgroundColor = .clear
    webViewAltered = true
  }

  private func restore() {
    guard webViewAltered else { return }
    webViewAltered = false
    guard let webView = webView else { return }
    webView.isOpaque = savedOpaque
    webView.backgroundColor = savedBackground
    webView.scrollView.backgroundColor = savedScrollBackground
    webView.underPageBackgroundColor = savedUnderPage
  }

  private static func findWebView(in view: UIView) -> WKWebView? {
    var queue: [UIView] = [view]
    while !queue.isEmpty {
      let current = queue.removeFirst()
      if let webView = current as? WKWebView { return webView }
      queue.append(contentsOf: current.subviews)
    }
    return nil
  }
}
