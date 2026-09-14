/// Web-chrome era engine commands for the mpv surface. Kept out of the main
/// controller file, which is already at the size ceiling; the stored state they
/// need (currentRate, the property setters) lives there.
import Foundation

extension HarborMpvViewController {
  var engineName: String { "mpv" }

  /// Crop to fill. layoutSurface already solves for the square's on-screen size;
  /// fitting takes the smaller solution and filling takes the larger, so this is
  /// the same geometry with the bound flipped and needs nothing from mpv itself.
  func doSetZoom(_ fill: Bool) {
    zoomFill = fill
    view.setNeedsLayout()
  }

  func doSetRate(_ rate: Double) {
    // mpv rejects speed below 0.01 (options.rst), so the floor is enforced here
    // rather than surfacing as a logged property failure.
    let clamped = max(0.01, rate)
    currentRate = clamped
    setDouble("speed", clamped)
  }

  /// Wire volume is 0..1; mpv's volume property is 0..100.
  func doSetVolume(_ volume: Double) {
    setDouble("volume", min(max(volume, 0), 1) * 100)
  }

  func doSetSubDelay(_ seconds: Double) {
    setDouble("sub-delay", seconds)
  }

  func doSetAudioDelay(_ seconds: Double) {
    setDouble("audio-delay", seconds)
  }

  func doSetSubVisible(_ visible: Bool) {
    setString("sub-visibility", visible ? "yes" : "no")
  }

  /// "s/<mpv id>" like the primary picker; nil clears the second line. mpv
  /// renders the secondary track itself, so nothing reaches the web overlay.
  func doSetSecondarySubtitleTrack(_ id: String?) {
    guard let id = id else {
      setString("secondary-sid", "no")
      emitTracks()
      return
    }
    let parts = id.components(separatedBy: "/")
    guard parts.count == 2, parts[0] == "s", Int(parts[1]) != nil else { return }
    setString("secondary-sid", parts[1])
    emitTracks()
  }

  /// The desktop mapping from src/lib/player/sub-style.ts, property for
  /// property, so one set of subtitle settings renders the same on a phone and a
  /// computer. Everything goes through the string setter: several of these are
  /// integer options on some mpv builds and float on others, and a string parses
  /// into either where a double would be rejected by the integer ones.
  func doSetSubStyle(_ args: SubStyleArgs) {
    let opacity = min(max(args.opacity ?? 1, 0.1), 1)
    let boxOpacity = min(max(args.boxOpacity, 0), 1)
    let style = args.style ?? "shadow"
    let marginY = Int(min(max(args.marginY, 0), 100).rounded())
    let size = args.fontSize > 0 ? args.fontSize : 32
    let align = ["left", "center", "right"].contains(args.alignX) ? args.alignX : "center"
    setString("sub-font-size", "32")
    setString("sub-scale", String(format: "%.3f", min(4, max(0.4, size / 32))))
    setString("sub-color", mpvColor(args.color, opacity))
    setString("sub-border-color", mpvColor(args.borderColor, opacity))
    setString("sub-border-size", String(format: "%.2f", max(0, args.borderSize)))
    setString(
      "sub-back-color",
      style == "box" ? mpvColor(args.boxColor ?? "#000000", boxOpacity * opacity) : "#00000000")
    setString("sub-shadow-color", mpvColor("#000000", opacity))
    setString("sub-shadow-offset", style == "shadow" ? "1.4" : "0")
    setString("sub-margin-y", String(marginY))
    setString("sub-align-x", align)
    setString("sub-bold", args.bold ? "yes" : "no")
    setString("sub-pos", String(100 - marginY))
  }

  /// Source frame rate the subtitle was authored for; 0 restores mpv's default
  /// of no correction. Out-of-range values are dropped rather than clamped so a
  /// bad input never silently retimes every line.
  func doSetSubFps(_ fps: Double) {
    guard fps == 0 || (fps >= 1 && fps <= 240) else { return }
    setDouble("sub-fps", fps)
  }

  /// mpv colors are #AARRGGBB; the wire carries #RRGGBB plus an opacity.
  private func mpvColor(_ hex: String, _ opacity: Double) -> String {
    let rgb = hex.hasPrefix("#") && hex.count == 7 ? String(hex.dropFirst()).uppercased() : "FFFFFF"
    let alpha = Int((min(max(opacity, 0), 1) * 255).rounded())
    return String(format: "#%02X", alpha) + rgb
  }
}
