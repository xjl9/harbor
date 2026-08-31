use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<HarborPlayer<R>> {
    Ok(HarborPlayer(app.clone()))
}

/// Desktop stub — Harbor uses libmpv on desktop, so the native mobile player is a no-op here.
pub struct HarborPlayer<R: Runtime>(AppHandle<R>);

impl<R: Runtime> HarborPlayer<R> {
    pub fn load(&self, _payload: LoadRequest) -> crate::Result<EmptyResponse> {
        Ok(EmptyResponse {})
    }
    pub fn play(&self) -> crate::Result<EmptyResponse> {
        Ok(EmptyResponse {})
    }
    pub fn pause(&self) -> crate::Result<EmptyResponse> {
        Ok(EmptyResponse {})
    }
    pub fn seek(&self, _payload: SeekRequest) -> crate::Result<EmptyResponse> {
        Ok(EmptyResponse {})
    }
    pub fn stop(&self) -> crate::Result<EmptyResponse> {
        Ok(EmptyResponse {})
    }
    pub fn set_audio_track(&self, _payload: TrackRequest) -> crate::Result<EmptyResponse> {
        Ok(EmptyResponse {})
    }
    pub fn set_subtitle_track(&self, _payload: TrackRequest) -> crate::Result<EmptyResponse> {
        Ok(EmptyResponse {})
    }
    pub fn enter_pip(&self) -> crate::Result<EmptyResponse> {
        Ok(EmptyResponse {})
    }
    pub fn set_orientation(&self, _payload: OrientationRequest) -> crate::Result<EmptyResponse> {
        Ok(EmptyResponse {})
    }
    pub fn set_rate(&self, _payload: RateRequest) -> crate::Result<EmptyResponse> {
        Ok(EmptyResponse {})
    }
    pub fn set_volume(&self, _payload: VolumeRequest) -> crate::Result<EmptyResponse> {
        Ok(EmptyResponse {})
    }
    pub fn set_sub_delay(&self, _payload: DelayRequest) -> crate::Result<EmptyResponse> {
        Ok(EmptyResponse {})
    }
    pub fn set_audio_delay(&self, _payload: DelayRequest) -> crate::Result<EmptyResponse> {
        Ok(EmptyResponse {})
    }
    pub fn show_route_picker(&self) -> crate::Result<EmptyResponse> {
        Ok(EmptyResponse {})
    }
    pub fn haptic(&self, _payload: HapticRequest) -> crate::Result<EmptyResponse> {
        Ok(EmptyResponse {})
    }
}
