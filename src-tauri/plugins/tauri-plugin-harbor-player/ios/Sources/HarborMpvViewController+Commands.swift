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
}
