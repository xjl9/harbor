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
pub struct EmptyResponse {}
