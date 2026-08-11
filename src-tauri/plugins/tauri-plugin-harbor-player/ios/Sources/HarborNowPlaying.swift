/// Lock-screen and Control Center transport shared by both player engines:
/// MPRemoteCommandCenter registration plus MPNowPlayingInfoCenter updates.
/// The parity target is Android's MediaSession in PlayerActivity.kt.
import MediaPlayer

final class HarborNowPlaying {
  private var commandTokens: [(MPRemoteCommand, Any)] = []

  /// Handlers return false when the engine cannot service the command, which
  /// surfaces as .commandFailed to the system. Registration is once per
  /// instance; repeat calls are no-ops so every load can call this safely.
  func register(
    play: @escaping () -> Bool,
    pause: @escaping () -> Bool,
    toggle: @escaping () -> Bool,
    seek: @escaping (Double) -> Bool
  ) {
    guard commandTokens.isEmpty else { return }
    let center = MPRemoteCommandCenter.shared()
    func add(
      _ command: MPRemoteCommand,
      _ handler: @escaping (MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus
    ) {
      commandTokens.append((command, command.addTarget(handler: handler)))
    }
    add(center.playCommand) { _ in play() ? .success : .commandFailed }
    add(center.pauseCommand) { _ in pause() ? .success : .commandFailed }
    add(center.togglePlayPauseCommand) { _ in toggle() ? .success : .commandFailed }
    add(center.changePlaybackPositionCommand) { event in
      guard let event = event as? MPChangePlaybackPositionCommandEvent else {
        return .commandFailed
      }
      return seek(event.positionTime) ? .success : .commandFailed
    }
  }

  func update(title: String?, positionSec: Double?, durationSec: Double?, playing: Bool) {
    var info: [String: Any] = [:]
    if let title = title { info[MPMediaItemPropertyTitle] = title }
    if let duration = durationSec { info[MPMediaItemPropertyPlaybackDuration] = duration }
    if let position = positionSec { info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = position }
    info[MPNowPlayingInfoPropertyPlaybackRate] = playing ? 1.0 : 0.0
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }

  func clear() {
    for (command, token) in commandTokens { command.removeTarget(token) }
    commandTokens.removeAll()
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
  }
}
