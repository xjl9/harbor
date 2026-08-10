use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "app.harbor.player";

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<HarborPlayer<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "PlayerPlugin")?;
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_harbor_player)?;
    Ok(HarborPlayer(handle))
}

/// Access to the native player APIs on mobile.
pub struct HarborPlayer<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> HarborPlayer<R> {
    pub fn load(&self, payload: LoadRequest) -> crate::Result<EmptyResponse> {
        self.0
            .run_mobile_plugin("load", payload)
            .map_err(Into::into)
    }
    pub fn play(&self) -> crate::Result<EmptyResponse> {
        self.0
            .run_mobile_plugin("play", ())
            .map_err(Into::into)
    }
    pub fn pause(&self) -> crate::Result<EmptyResponse> {
        self.0
            .run_mobile_plugin("pause", ())
            .map_err(Into::into)
    }
    pub fn seek(&self, payload: SeekRequest) -> crate::Result<EmptyResponse> {
        self.0
            .run_mobile_plugin("seek", payload)
            .map_err(Into::into)
    }
    pub fn stop(&self) -> crate::Result<EmptyResponse> {
        self.0
            .run_mobile_plugin("stop", ())
            .map_err(Into::into)
    }
}
