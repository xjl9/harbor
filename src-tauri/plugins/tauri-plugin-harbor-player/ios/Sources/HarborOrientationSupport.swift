// Makes the orientation lock actually hold.
//
// UIKit asks the application delegate for the allowed orientations before it asks
// any view controller, and only falls back to the root controller when the delegate
// does not implement the callback. Tauri's iOS template generates no AppDelegate
// SOURCE file, so there was nowhere to write that method: the build script that
// tried to inject one searched gen/apple for "class AppDelegate", never matched,
// and skipped silently because its guard was `if [ -n "$AD" ]`.
//
// The consequence shipped. set_orientation wrote a mask to UserDefaults and called
// requestGeometryUpdate, but requestGeometryUpdate is CONSTRAINED by the orientations
// the app reports as supported. Nothing ever reported the locked mask, so the plist's
// portrait entry stayed valid and iOS was free to rotate straight back. Verified in the
// shipped binary: `harbor.player.orientationMask` and `set_orientation` are present,
// `supportedInterfaceOrientationsFor` appears zero times.
//
// Installing the method on the live delegate's class puts the answer where UIKit
// looks, and needs no generated-template surgery to survive `tauri ios init`.
import ObjectiveC
import UIKit

enum HarborOrientationSupport {
  private static var installed = false

  /// Idempotent, and safe to call from any orientation change: the first call wires
  /// the delegate, later ones are a no-op.
  static func installIfNeeded() {
    guard !installed else { return }
    guard let delegate = UIApplication.shared.delegate else { return }
    let cls: AnyClass = type(of: delegate)
    let selector = #selector(UIApplicationDelegate.application(_:supportedInterfaceOrientationsFor:))

    let block: @convention(block) (AnyObject, UIApplication, UIWindow?) -> UIInterfaceOrientationMask = {
      _, _, _ in
      let raw = UInt(UserDefaults.standard.integer(forKey: harborOrientationDefaultsKey))
      // 0 is "never set" and "restored to free rotation" alike, both of which mean
      // defer to the plist rather than pin the app to a stale mask.
      return raw == 0 ? .allButUpsideDown : UIInterfaceOrientationMask(rawValue: raw)
    }
    let imp = imp_implementationWithBlock(block)

    // Q = NSUInteger return (the mask), @ = self, : = _cmd, then UIApplication and UIWindow.
    if !class_addMethod(cls, selector, imp, "Q@:@@") {
      // Some delegate already implements it; replace so ours is the answer.
      if let existing = class_getInstanceMethod(cls, selector) {
        method_setImplementation(existing, imp)
      }
    }
    installed = true
  }

  /// A mask persisted in UserDefaults outlives a crash, so a session that died in
  /// landscape would pin the next launch to landscape before any playback starts.
  static func clearStaleMask() {
    UserDefaults.standard.removeObject(forKey: harborOrientationDefaultsKey)
  }
}
