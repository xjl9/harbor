use tauri::{AppHandle, Runtime};

use crate::models::*;
use crate::HarborPlayerExt;

#[tauri::command]
pub(crate) async fn load<R: Runtime>(
    app: AppHandle<R>,
    payload: LoadRequest,
) -> crate::Result<EmptyResponse> {
    app.harbor_player().load(payload)
}

#[tauri::command]
pub(crate) async fn play<R: Runtime>(app: AppHandle<R>) -> crate::Result<EmptyResponse> {
    app.harbor_player().play()
}

#[tauri::command]
pub(crate) async fn pause<R: Runtime>(app: AppHandle<R>) -> crate::Result<EmptyResponse> {
    app.harbor_player().pause()
}

#[tauri::command]
pub(crate) async fn seek<R: Runtime>(
    app: AppHandle<R>,
    payload: SeekRequest,
) -> crate::Result<EmptyResponse> {
    app.harbor_player().seek(payload)
}

#[tauri::command]
pub(crate) async fn stop<R: Runtime>(app: AppHandle<R>) -> crate::Result<EmptyResponse> {
    app.harbor_player().stop()
}

#[tauri::command]
pub(crate) async fn set_audio_track<R: Runtime>(
    app: AppHandle<R>,
    payload: TrackRequest,
) -> crate::Result<EmptyResponse> {
    app.harbor_player().set_audio_track(payload)
}

#[tauri::command]
pub(crate) async fn set_subtitle_track<R: Runtime>(
    app: AppHandle<R>,
    payload: TrackRequest,
) -> crate::Result<EmptyResponse> {
    app.harbor_player().set_subtitle_track(payload)
}

#[tauri::command]
pub(crate) async fn enter_pip<R: Runtime>(app: AppHandle<R>) -> crate::Result<EmptyResponse> {
    app.harbor_player().enter_pip()
}

#[tauri::command]
pub(crate) async fn set_orientation<R: Runtime>(
    app: AppHandle<R>,
    payload: OrientationRequest,
) -> crate::Result<EmptyResponse> {
    app.harbor_player().set_orientation(payload)
}

#[tauri::command]
pub(crate) async fn set_zoom<R: Runtime>(
    app: AppHandle<R>,
    payload: ZoomRequest,
) -> crate::Result<EmptyResponse> {
    app.harbor_player().set_zoom(payload)
}

#[tauri::command]
pub(crate) async fn set_rate<R: Runtime>(
    app: AppHandle<R>,
    payload: RateRequest,
) -> crate::Result<EmptyResponse> {
    app.harbor_player().set_rate(payload)
}

#[tauri::command]
pub(crate) async fn set_volume<R: Runtime>(
    app: AppHandle<R>,
    payload: VolumeRequest,
) -> crate::Result<EmptyResponse> {
    app.harbor_player().set_volume(payload)
}

#[tauri::command]
pub(crate) async fn set_sub_delay<R: Runtime>(
    app: AppHandle<R>,
    payload: DelayRequest,
) -> crate::Result<EmptyResponse> {
    app.harbor_player().set_sub_delay(payload)
}

#[tauri::command]
pub(crate) async fn set_audio_delay<R: Runtime>(
    app: AppHandle<R>,
    payload: DelayRequest,
) -> crate::Result<EmptyResponse> {
    app.harbor_player().set_audio_delay(payload)
}

#[tauri::command]
pub(crate) async fn show_route_picker<R: Runtime>(
    app: AppHandle<R>,
) -> crate::Result<EmptyResponse> {
    app.harbor_player().show_route_picker()
}

#[tauri::command]
pub(crate) async fn haptic<R: Runtime>(
    app: AppHandle<R>,
    payload: HapticRequest,
) -> crate::Result<EmptyResponse> {
    app.harbor_player().haptic(payload)
}
