use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleTrack {
    pub url: String,
    #[serde(default)]
    pub lang: Option<String>,
    #[serde(default)]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadRequest {
    pub url: String,
    #[serde(default)]
    pub headers: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub subtitles: Vec<SubtitleTrack>,
    #[serde(default)]
    pub start_at_sec: f64,
    #[serde(default)]
    pub title: Option<String>,
    /// Whether this title has a following episode. The native overlay only shows
    /// its next button when the JS side says there is somewhere to go.
    #[serde(default)]
    pub can_next: bool,
    /// iOS only: host the native surface behind a transparent web view with no
    /// native controls, so the JS shell draws the chrome. Android ignores it.
    #[serde(default)]
    pub web_chrome: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeekRequest {
    pub position_sec: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackRequest {
    #[serde(default)]
    pub track_id: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrientationRequest {
    // "landscape" | "portrait" | "auto"; unknown values are treated as "auto" natively.
    pub mode: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RateRequest {
    pub rate: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeRequest {
    // 0..1; the native side rescales for engines that use 0..100.
    pub volume: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DelayRequest {
    pub seconds: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HapticRequest {
    // "light" | "medium" | "heavy" | "select"; unknown values fall back to light.
    pub kind: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EmptyResponse {}
