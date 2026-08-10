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
