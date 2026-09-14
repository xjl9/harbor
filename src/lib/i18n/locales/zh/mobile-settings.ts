// Phone shell strings for settings surfaces; the i18n coverage test requires every
// translated locale to carry every t() key used by the app.
const mobileSettings: Record<string, string> = {
  "Preferences": "偏好设置",
  "Managed on the Profile tab. Tap a row to go there.": "在“个人资料”标签页中管理。轻点一行即可前往。",
  "Recent warnings and errors from this app. Keys and links are already redacted, so this is safe to copy and send.": "此应用最近的警告和错误。密钥和链接已被隐藏，可以放心复制并发送。",
  "Animated tab bar icons": "标签栏图标动画",
  "Tab bar icons play a short animation when you tap them. Turn this off to keep them as plain static icons.": "轻点标签栏图标时会播放一段简短动画。关闭后图标保持为普通静态图标。",
  "Search regions": "搜索地区",
  "The native player is the default and plays every format.": "默认使用原生播放器，可播放所有格式。",
  "In-app player": "应用内播放器",
  "Harbor's touch controls on direct and HLS streams. Anything the webview cannot decode, MKV most of all, switches back to the native player on its own.": "Harbor 在直连和 HLS 流上的触控操作。WebView 无法解码的内容（尤其是 MKV）会自动切回原生播放器。",
  "Turn on the in-app player to unlock on-screen controls, X-Ray, skipping, up next, trailers and subtitle style.": "开启应用内播放器即可使用屏幕控件、X-Ray、跳过、下一集、预告片和字幕样式。",
  "Size, color, outline and the background behind the text.": "大小、颜色、描边以及文字背后的背景。",
  "Personal media servers Harbor can play from.": "Harbor 可以从中播放的个人媒体服务器。",
  "Sharp": "直角",
  "Subtle": "微圆",
  "Pill": "胶囊",
  "Theme & backgrounds": "主题与背景",
  "Service sign-ins": "服务登录信息",
  "Watchlist & favorites": "待看列表与收藏",
  "Watch progress & history": "观看进度与历史",
  "Search history": "搜索历史",
  "Player layouts & prefs": "播放器布局与偏好",
  "Xtream credentials": "Xtream 凭据",
  "Feed & Discover": "动态与发现",
  "Onboarding & interface state": "引导与界面状态",
  "Cached lookups & misc": "缓存的查询及其他",
};

export default mobileSettings;
