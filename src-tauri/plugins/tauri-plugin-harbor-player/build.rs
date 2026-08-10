const COMMANDS: &[&str] = &[
    "load",
    "play",
    "pause",
    "seek",
    "stop",
    "set_audio_track",
    "set_subtitle_track",
    "enter_pip",
    // Built-in mobile listener commands backing `addPluginListener`; handled by the
    // Tauri Kotlin/Swift Plugin base class. Listed here so the ACL permits them.
    "registerListener",
    "removeListener",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
