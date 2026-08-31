use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

mod commands;
mod error;
mod models;

pub use error::{Error, Result};
pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

#[cfg(desktop)]
use desktop::HarborPlayer;
#[cfg(mobile)]
use mobile::HarborPlayer;

/// Extension trait to access the native player APIs from a `Manager` (e.g. `AppHandle`).
pub trait HarborPlayerExt<R: Runtime> {
    fn harbor_player(&self) -> &HarborPlayer<R>;
}

impl<R: Runtime, T: Manager<R>> HarborPlayerExt<R> for T {
    fn harbor_player(&self) -> &HarborPlayer<R> {
        self.state::<HarborPlayer<R>>().inner()
    }
}

/// Initializes the Harbor native player plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("harbor-player")
        .invoke_handler(tauri::generate_handler![
            commands::load,
            commands::play,
            commands::pause,
            commands::seek,
            commands::stop,
            commands::set_audio_track,
            commands::set_subtitle_track,
            commands::enter_pip,
            commands::set_orientation,
            commands::set_rate,
            commands::set_volume,
            commands::set_sub_delay,
            commands::set_audio_delay,
            commands::show_route_picker,
            commands::haptic,
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let player = mobile::init(app, api)?;
            #[cfg(desktop)]
            let player = desktop::init(app, api)?;
            app.manage(player);
            Ok(())
        })
        .build()
}
