/// Web-chrome era engine commands for the AVPlayer surface. The stored rate
/// lives on the controller so doPlay can reapply it: AVPlayer.play() is
/// rate = 1, which would silently undo a speed change on every pause/resume.
import AVFoundation

extension HarborPlayerViewController {
  var engineName: String { "av" }

  // presentationSize is what AVPlayer is actually decoding, not what the file or the
  // release name claims, which is the whole point of showing it. CGSize.zero until
  // the item is ready, and the shell shows nothing until it is non-zero.
  var decodedSize: CGSize { player?.currentItem?.presentationSize ?? .zero }

  func doSetRate(_ rate: Double) {
    desiredRate = Float(max(0, rate))
    // Applied live only while playback is under way (playing or waiting to);
    // setting rate on a paused player would start it.
    guard let p = player, p.timeControlStatus != .paused else { return }
    p.rate = desiredRate
  }

  func doSetVolume(_ volume: Double) {
    player?.volume = Float(min(max(volume, 0), 1))
  }
}
