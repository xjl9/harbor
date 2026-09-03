// iOS binds this in place of gamepad.rs. The real module is built on gilrs,
// whose only backends are xinput, linux evdev and macOS IOKit; none of them
// exist on iOS, and gilrs is not a dependency there. Android keeps the real
// module because Android TV ships controller support.
//
// The commands stay registered so the frontend's gamepad settings panel gets
// an empty list and a silent no-op instead of an "unknown command" rejection.
use serde::Serialize;
use tauri::AppHandle;

#[derive(Clone, Serialize)]
pub struct GamepadInfo {
    pub id: u32,
    pub name: String,
}

pub fn spawn(_app: AppHandle) {}

pub fn set_window_focused(_focused: bool) {}

#[tauri::command]
pub fn gamepad_list() -> Vec<GamepadInfo> {
    Vec::new()
}

#[tauri::command]
pub fn gamepad_set_enabled(_enabled: bool) {}

#[tauri::command]
pub fn gamepad_set_background_input(_allowed: bool) {}
