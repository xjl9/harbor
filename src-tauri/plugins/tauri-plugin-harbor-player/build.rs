const COMMANDS: &[&str] = &[
    "load",
    "play",
    "pause",
    "seek",
    "stop",
    "set_audio_track",
    "set_subtitle_track",
    "enter_pip",
    "set_orientation",
    "set_zoom",
    "set_rate",
    "set_volume",
    "set_sub_delay",
    "set_audio_delay",
    "add_subtitle",
    "set_sub_visible",
    "set_secondary_subtitle_track",
    "set_sub_style",
    "set_sub_fps",
    "show_route_picker",
    "haptic",
    // Built-in mobile listener commands backing `addPluginListener`; handled by the
    // Tauri Kotlin/Swift Plugin base class. Listed here so the ACL permits them.
    "registerListener",
    "removeListener",
    // @tauri-apps/api unregisters via `plugin:harbor-player|remove_listener` and the
    // ACL matches the raw command string before camel-casing, so the snake_case
    // spelling needs its own entry or `PluginListener.unregister()` is rejected.
    "remove_listener",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
