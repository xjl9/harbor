const COMMANDS: &[&str] = &["load", "play", "pause", "seek", "stop"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
