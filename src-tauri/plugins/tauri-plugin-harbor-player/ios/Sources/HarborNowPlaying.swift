/// Lock-screen and Control Center transport shared by both player engines:
/// MPRemoteCommandCenter registration plus MPNowPlayingInfoCenter updates.
/// The parity target is Android's MediaSession in PlayerActivity.kt.
import MediaPlayer

final class HarborNowPlaying {
  private var commandTokens: [(MPRemoteCommand, Any)] = []
  private var lastWrite: TimeInterval = 0
  private var lastPlaying: Bool?
  // The system interpolates elapsed time from the last write and the rate, so
  // a heartbeat this sparse keeps the lock screen accurate between events.
  private static let heartbeatSec: TimeInterval = 5

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

  /// Unforced calls (the 0.5 s tick) are coalesced to a play/pause flip or the
  /// heartbeat; forced calls (load, seek, ready) always write.
  func update(
    title: String?, positionSec: Double?, durationSec: Double?, playing: Bool,
    rate: Double = 1.0, force: Bool = false
  ) {
    let now = Date().timeIntervalSinceReferenceDate
    if !force, playing == lastPlaying, now - lastWrite < Self.heartbeatSec { return }
    var info: [String: Any] = [:]
    if let title = title { info[MPMediaItemPropertyTitle] = title }
    if let duration = durationSec { info[MPMediaItemPropertyPlaybackDuration] = duration }
    if let position = positionSec { info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = position }
    info[MPNowPlayingInfoPropertyPlaybackRate] = playing ? rate : 0.0
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    lastWrite = now
    lastPlaying = playing
  }

  func clear() {
    for (command, token) in commandTokens { command.removeTarget(token) }
    commandTokens.removeAll()
    lastWrite = 0
    lastPlaying = nil
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
  }
}
