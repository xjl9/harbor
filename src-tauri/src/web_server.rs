use std::collections::{HashMap, HashSet};
use std::net::{IpAddr, SocketAddr, UdpSocket};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use axum::body::Body;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::http::{header, HeaderMap, HeaderName, HeaderValue, Response, StatusCode};
use axum::response::IntoResponse;
use axum::routing::get;
use futures_util::{SinkExt, StreamExt};
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, oneshot, Mutex as AsyncMutex};

pub const WEB_PORT: u16 = 11471;
const DEV_FRONTEND: &str = "http://127.0.0.1:1420";

/// mDNS service type Harbor advertises so phones can find a desktop/TV host on
/// the LAN without the user typing an IP. Mirrors REMOTE_WS_PATH being served at
/// `:WEB_PORT/api/remote`.
const HARBOR_SERVICE_TYPE: &str = "_harbor._tcp.local.";
/// Remote-control wire protocol version, kept in sync with REMOTE_PROTO in
/// src/lib/remote/protocol.ts. Advertised in the mDNS TXT record.
const REMOTE_PROTO: u32 = 1;
/// WebSocket path the host serves the remote-control channel on. Mirrors
/// REMOTE_WS_PATH in src/lib/remote/protocol.ts. Advertised in the mDNS TXT.
const REMOTE_WS_PATH: &str = "/api/remote";

/// True when built/run via `tauri dev` (CLI sets `--cfg dev`).
fn is_tauri_dev() -> bool {
    tauri::is_dev()
}

static RUNNING: AtomicBool = AtomicBool::new(false);
static NEXT_CLIENT_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone)]
struct ServeState {
    app: AppHandle,
    outbound: broadcast::Sender<String>,
    clients: Arc<AsyncMutex<HashSet<u64>>>,
}

fn shutdown_slot() -> &'static Mutex<Option<oneshot::Sender<()>>> {
    static S: OnceLock<Mutex<Option<oneshot::Sender<()>>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

fn serve_state_slot() -> &'static Mutex<Option<ServeState>> {
    static S: OnceLock<Mutex<Option<ServeState>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

/// Holds the live mDNS advertisement (daemon + registered fullname) while the web
/// server is running, so it can be torn down on stop.
fn mdns_slot() -> &'static Mutex<Option<(ServiceDaemon, String)>> {
    static S: OnceLock<Mutex<Option<(ServiceDaemon, String)>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

/// Enumerate this machine's non-loopback IPv4 addresses by asking the OS which
/// local interface it would use to reach a few common targets. Same UDP-connect
/// trick dlna.rs and stream_proxy.rs use, gathering more than one interface.
fn local_ipv4s() -> Vec<IpAddr> {
    let mut out: Vec<IpAddr> = Vec::new();
    for target in ["1.1.1.1:80", "8.8.8.8:80", "192.168.1.1:80"] {
        if let Ok(sock) = UdpSocket::bind("0.0.0.0:0") {
            if sock.connect(target).is_ok() {
                if let Ok(addr) = sock.local_addr() {
                    let ip = addr.ip();
                    if let IpAddr::V4(v4) = ip {
                        if !v4.is_loopback() && !v4.is_unspecified() && !out.contains(&ip) {
                            out.push(ip);
                        }
                    }
                }
            }
        }
    }
    out
}

/// Friendly device label for the advertised service, taken from the OS hostname
/// with a plain fallback. Shown to the user on the phone's connect list.
fn device_label() -> String {
    for key in ["COMPUTERNAME", "HOSTNAME", "HOST"] {
        if let Ok(v) = std::env::var(key) {
            let v = v.trim().to_string();
            if !v.is_empty() {
                return v;
            }
        }
    }
    "Harbor".to_string()
}

/// Turn a free-form label into a DNS-safe host label for the mDNS `.local.` name.
fn sanitize_hostname(label: &str) -> String {
    let cleaned: String = label
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '-' })
        .collect();
    let trimmed = cleaned.trim_matches('-');
    if trimmed.is_empty() {
        "harbor".to_string()
    } else {
        trimmed.to_lowercase()
    }
}

/// Register `_harbor._tcp.local.` on the LAN so phones can auto-discover this
/// host. Best-effort: if there is no LAN interface or mDNS init fails, discovery
/// is simply unavailable and the phone's manual-IP path still works.
fn mdns_advertise_start(app: &AppHandle, port: u16) {
    let ips = local_ipv4s();
    if ips.is_empty() {
        return;
    }
    let label = device_label();
    // Instance names must not contain dots (they delimit the DNS domain); keep
    // the original label in the TXT `name` for display.
    let instance_name = label.replace('.', " ");
    let host_name = format!("{}.local.", sanitize_hostname(&label));
    let version = app.package_info().version.to_string();
    let props: Vec<(String, String)> = vec![
        ("v".to_string(), version),
        ("name".to_string(), label),
        ("proto".to_string(), REMOTE_PROTO.to_string()),
        ("path".to_string(), REMOTE_WS_PATH.to_string()),
    ];
    let daemon = match ServiceDaemon::new() {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[web-serve] mDNS daemon init failed: {e}");
            return;
        }
    };
    let info = match ServiceInfo::new(
        HARBOR_SERVICE_TYPE,
        &instance_name,
        &host_name,
        ips.as_slice(),
        port,
        props.as_slice(),
    ) {
        Ok(i) => i,
        Err(e) => {
            eprintln!("[web-serve] mDNS service info failed: {e}");
            let _ = daemon.shutdown();
            return;
        }
    };
    let fullname = info.get_fullname().to_string();
    if let Err(e) = daemon.register(info) {
        eprintln!("[web-serve] mDNS register failed: {e}");
        let _ = daemon.shutdown();
        return;
    }
    *mdns_slot().lock().unwrap() = Some((daemon, fullname));
}

/// Tear down the mDNS advertisement, sending a goodbye packet if possible.
fn mdns_advertise_stop() {
    if let Some((daemon, fullname)) = mdns_slot().lock().unwrap().take() {
        // Unregister flushes a goodbye; give it a brief moment before shutdown.
        if let Ok(receiver) = daemon.unregister(&fullname) {
            let _ = receiver.recv_timeout(Duration::from_millis(500));
        }
        let _ = daemon.shutdown();
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct DiscoveredHost {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub version: Option<String>,
}

fn pick_ipv4(addrs: &HashSet<IpAddr>) -> Option<IpAddr> {
    addrs.iter().copied().find(|a| a.is_ipv4())
}

/// Browse the LAN for other Harbor hosts advertising `_harbor._tcp.local.`.
/// Modeled on cast.rs `discover_chromecasts`: spawn_blocking, browse, collect
/// resolved services into a dedup map, read TXT for name/version. Returns quickly
/// (default 2.5s) and never errors on a device with no LAN peers.
#[tauri::command]
pub async fn remote_discover(timeout_ms: Option<u64>) -> Result<Vec<DiscoveredHost>, String> {
    let timeout = timeout_ms.unwrap_or(2500).clamp(500, 10_000);
    // Skip our own advertisement so a host that is also serving does not list itself.
    let self_ips: HashSet<String> = local_ipv4s().iter().map(|ip| ip.to_string()).collect();
    let hosts = tokio::task::spawn_blocking(move || -> Vec<DiscoveredHost> {
        let Ok(daemon) = ServiceDaemon::new() else {
            return Vec::new();
        };
        let Ok(receiver) = daemon.browse(HARBOR_SERVICE_TYPE) else {
            return Vec::new();
        };
        let deadline = Instant::now() + Duration::from_millis(timeout);
        let mut found: HashMap<String, DiscoveredHost> = HashMap::new();
        while Instant::now() < deadline {
            match receiver.recv_timeout(Duration::from_millis(120)) {
                Ok(ServiceEvent::ServiceResolved(info)) => {
                    let Some(addr) = pick_ipv4(info.get_addresses()) else {
                        continue;
                    };
                    let host = addr.to_string();
                    if self_ips.contains(&host) {
                        continue;
                    }
                    let port = info.get_port();
                    let props: HashMap<String, String> = info
                        .get_properties()
                        .iter()
                        .map(|p| (p.key().to_string(), p.val_str().to_string()))
                        .collect();
                    let name = props
                        .get("name")
                        .cloned()
                        .filter(|s| !s.is_empty())
                        .unwrap_or_else(|| host.clone());
                    let version = props.get("v").cloned().filter(|s| !s.is_empty());
                    let id = format!("{host}:{port}");
                    found.insert(
                        id.clone(),
                        DiscoveredHost {
                            id,
                            name,
                            host,
                            port,
                            version,
                        },
                    );
                }
                Ok(_) => {}
                Err(_) => {}
            }
        }
        let _ = daemon.shutdown();
        found.into_values().collect()
    })
    .await
    .unwrap_or_default();
    let mut out = hosts;
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

fn is_spa_path(raw_path: &str) -> bool {
    raw_path == "/"
        || raw_path.is_empty()
        || raw_path == "/remote"
        || raw_path.starts_with("/remote/")
        || raw_path == "/setup"
        || raw_path.starts_with("/setup/")
        || raw_path == "/reader"
        || raw_path.starts_with("/reader/")
}

fn serve_bundled_asset(app: &AppHandle, raw_path: &str) -> Response<Body> {
    let resolver = app.asset_resolver();
    let path = if is_spa_path(raw_path) {
        "/index.html".to_string()
    } else {
        raw_path.to_string()
    };
    let asset = resolver
        .get(path.clone())
        .or_else(|| resolver.get("/index.html".to_string()));
    match asset {
        Some(a) => {
            let cache = if path.ends_with(".html") || path == "/index.html" {
                "no-cache"
            } else {
                "public, max-age=31536000, immutable"
            };
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, a.mime_type)
                .header(header::CACHE_CONTROL, cache)
                .body(Body::from(a.bytes))
                .unwrap()
        }
        None => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, "text/plain")
            .body(Body::from(
                "Harbor web assets are not available in this build.",
            ))
            .unwrap(),
    }
}

/// In `tauri dev`, the desktop window loads Vite live assets, but `:11471`
/// previously only served Tauri's asset resolver (often stale). Proxy those
/// requests to the Vite dev server so phone `/remote` tracks HMR.
async fn proxy_dev_frontend(path_and_query: &str) -> Option<Response<Body>> {
    if !is_tauri_dev() {
        return None;
    }
    let url = format!("{DEV_FRONTEND}{path_and_query}");
    let client = reqwest::Client::new();
    let upstream = client.get(&url).send().await.ok()?;
    let status =
        StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let headers = upstream.headers().clone();
    let bytes = upstream.bytes().await.ok()?;
    let mut builder = Response::builder().status(status);
    let mut out_headers = HeaderMap::new();
    for (name, value) in headers.iter() {
        let skip = matches!(
            name.as_str(),
            "transfer-encoding" | "content-length" | "connection" | "content-encoding"
        );
        if skip {
            continue;
        }
        if let Ok(n) = HeaderName::from_bytes(name.as_str().as_bytes()) {
            if let Ok(v) = HeaderValue::from_bytes(value.as_bytes()) {
                out_headers.insert(n, v);
            }
        }
    }
    out_headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    *builder.headers_mut().unwrap() = out_headers;
    builder.body(Body::from(bytes)).ok()
}

fn pct_hex(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

fn pct_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (pct_hex(bytes[i + 1]), pct_hex(bytes[i + 2])) {
                out.push(h * 16 + l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn blocked_host(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    let after = lower.split("://").nth(1).unwrap_or("");
    let host = after.split(['/', '?', '#', ':']).next().unwrap_or("");
    host == "localhost"
        || host.starts_with("127.")
        || host.starts_with("0.")
        || host.starts_with("10.")
        || host.starts_with("192.168.")
        || host.starts_with("169.254.")
        || host.starts_with("[::1]")
        || (host.starts_with("172.")
            && host
                .split('.')
                .nth(1)
                .and_then(|o| o.parse::<u8>().ok())
                .map(|o| (16..=31).contains(&o))
                .unwrap_or(false))
}

async fn manga_img_proxy(uri: axum::http::Uri) -> Response<Body> {
    let query = uri.query().unwrap_or("");
    let target = query
        .split('&')
        .find_map(|pair| pair.strip_prefix("u=").map(pct_decode));
    let url = match target {
        Some(u) if (u.starts_with("http://") || u.starts_with("https://")) && !blocked_host(&u) => {
            u
        }
        _ => {
            return Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .body(Body::empty())
                .unwrap()
        }
    };
    let client = reqwest::Client::new();
    let upstream = match client
        .get(&url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        )
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => {
            return Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(Body::empty())
                .unwrap()
        }
    };
    let status =
        StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let ctype = upstream
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();
    let bytes = match upstream.bytes().await {
        Ok(b) => b,
        Err(_) => {
            return Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(Body::empty())
                .unwrap()
        }
    };
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, ctype)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::CACHE_CONTROL, "public, max-age=86400")
        .body(Body::from(bytes))
        .unwrap()
}

async fn serve_http(State(state): State<ServeState>, uri: axum::http::Uri) -> Response<Body> {
    let path_and_query = uri
        .path_and_query()
        .map(|pq| pq.as_str().to_string())
        .unwrap_or_else(|| "/".to_string());
    if let Some(proxied) = proxy_dev_frontend(&path_and_query).await {
        return proxied;
    }
    serve_bundled_asset(&state.app, uri.path())
}

async fn remote_ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<ServeState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_remote_socket(socket, state))
}

async fn handle_remote_socket(socket: WebSocket, state: ServeState) {
    let client_id = NEXT_CLIENT_ID.fetch_add(1, Ordering::SeqCst);
    {
        let mut clients = state.clients.lock().await;
        clients.insert(client_id);
    }
    let _ = state.app.emit(
        "remote://client",
        serde_json::json!({ "action": "join", "clientId": client_id }),
    );

    let (mut sender, mut receiver) = socket.split();
    let mut outbound_rx = state.outbound.subscribe();

    let send_task = tauri::async_runtime::spawn(async move {
        loop {
            match outbound_rx.recv().await {
                Ok(msg) => {
                    if sender.send(Message::Text(msg.into())).await.is_err() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    while let Some(Ok(msg)) = receiver.next().await {
        match msg {
            Message::Text(text) => {
                let _ = state.app.emit(
                    "remote://cmd",
                    serde_json::json!({
                        "clientId": client_id,
                        "raw": text.to_string(),
                    }),
                );
            }
            Message::Close(_) => break,
            Message::Ping(_) | Message::Pong(_) | Message::Binary(_) => {}
        }
    }

    send_task.abort();
    {
        let mut clients = state.clients.lock().await;
        clients.remove(&client_id);
    }
    let _ = state.app.emit(
        "remote://client",
        serde_json::json!({ "action": "leave", "clientId": client_id }),
    );
}

#[tauri::command]
pub async fn web_serve_start(app: AppHandle) -> Result<u16, String> {
    if RUNNING.load(Ordering::SeqCst) {
        return Ok(WEB_PORT);
    }
    let listener = TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], WEB_PORT)))
        .await
        .map_err(|e| format!("port {} unavailable: {}", WEB_PORT, e))?;
    let (tx, rx) = oneshot::channel::<()>();
    *shutdown_slot().lock().unwrap() = Some(tx);

    let (outbound, _) = broadcast::channel::<String>(256);
    let state = ServeState {
        app: app.clone(),
        outbound,
        clients: Arc::new(AsyncMutex::new(HashSet::new())),
    };
    *serve_state_slot().lock().unwrap() = Some(state.clone());
    RUNNING.store(true, Ordering::SeqCst);

    // Advertise on the LAN so phones can auto-discover this host without the user
    // typing an IP. Best-effort; failure leaves the manual-IP path intact.
    mdns_advertise_start(&app, WEB_PORT);

    let router = axum::Router::new()
        .route("/api/remote", get(remote_ws_handler))
        .route("/manga-img", get(manga_img_proxy))
        .fallback(serve_http)
        .with_state(state);

    tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = rx.await;
            })
            .await;
        RUNNING.store(false, Ordering::SeqCst);
        *serve_state_slot().lock().unwrap() = None;
    });
    if is_tauri_dev() {
        eprintln!(
            "[web-serve] Harbor remote WS on 0.0.0.0:{} (UI proxied from {})",
            WEB_PORT, DEV_FRONTEND
        );
    } else {
        eprintln!(
            "[web-serve] Harbor web UI + remote WS listening on 0.0.0.0:{}",
            WEB_PORT
        );
    }
    Ok(WEB_PORT)
}

#[tauri::command]
pub fn web_serve_stop() {
    mdns_advertise_stop();
    if let Some(tx) = shutdown_slot().lock().unwrap().take() {
        let _ = tx.send(());
    }
    *serve_state_slot().lock().unwrap() = None;
    RUNNING.store(false, Ordering::SeqCst);
}

#[tauri::command]
pub fn web_serve_status() -> bool {
    RUNNING.load(Ordering::SeqCst)
}

/// Push a JSON text frame to every connected remote client.
#[tauri::command]
pub fn remote_ws_broadcast(payload: String) -> Result<(), String> {
    let guard = serve_state_slot().lock().unwrap();
    let Some(state) = guard.as_ref() else {
        return Ok(());
    };
    let _ = state.outbound.send(payload);
    Ok(())
}

#[tauri::command]
pub async fn remote_ws_client_count() -> Result<usize, String> {
    let state = {
        let guard = serve_state_slot().lock().unwrap();
        guard.clone()
    };
    let Some(state) = state else {
        return Ok(0);
    };
    let count = state.clients.lock().await.len();
    Ok(count)
}
