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

/// Crop-to-fill instead of fit. A scope film on a phone letterboxes to a thin
/// band; this trades the edges of the frame for the height of the screen.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoomRequest {
    pub fill: bool,
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

/// External subtitle for the running item, the same mpv `sub-add` the sidecar
/// batch already uses at load. Only the mpv engine honors it; the JS side never
/// sends it to the AVPlayer engine because that engine reports the flag off.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddSubtitleRequest {
    pub url: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub lang: Option<String>,
    /// Select the track once added; false leaves the current selection alone.
    #[serde(default)]
    pub select: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubVisibleRequest {
    pub visible: bool,
}

/// Subtitle appearance for the mpv engine, mirroring the desktop applySubStyle
/// mapping (src/lib/player/sub-style.ts) so a phone and a desktop render the
/// same settings the same way. Colors are #RRGGBB; opacities are 0..1.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubStyleRequest {
    pub font_size: f64,
    pub color: String,
    pub border_size: f64,
    pub border_color: String,
    pub box_opacity: f64,
    pub margin_y: f64,
    // "left" | "center" | "right"
    pub align_x: String,
    pub bold: bool,
    /// "shadow" | "outline" | "box"; missing means shadow.
    #[serde(default)]
    pub style: Option<String>,
    #[serde(default)]
    pub box_color: Option<String>,
    /// Text opacity 0..1; missing means opaque.
    #[serde(default)]
    pub opacity: Option<f64>,
}

/// Subtitle source frame rate for mpv's `sub-fps`; 0 restores the default.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubFpsRequest {
    pub fps: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EmptyResponse {}
