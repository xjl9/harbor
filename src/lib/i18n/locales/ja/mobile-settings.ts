// Phone shell strings for settings surfaces; the i18n coverage test requires every
// translated locale to carry every t() key used by the app.
const mobileSettings: Record<string, string> = {
  "Preferences": "環境設定",
  "Managed on the Profile tab. Tap a row to go there.": "プロフィールタブで管理します。行をタップすると移動します。",
  "Recent warnings and errors from this app. Keys and links are already redacted, so this is safe to copy and send.": "このアプリの最近の警告とエラーです。キーとリンクは伏せ字になっているので、そのままコピーして送っても安全です。",
  "Animated tab bar icons": "タブバーのアイコンアニメーション",
  "Tab bar icons play a short animation when you tap them. Turn this off to keep them as plain static icons.": "タップするとタブバーのアイコンが短いアニメーションを再生します。オフにすると静止したアイコンのままになります。",
  "Search regions": "地域を検索",
  "The native player is the default and plays every format.": "ネイティブプレーヤーが既定で、あらゆる形式を再生できます。",
  "In-app player": "アプリ内プレーヤー",
  "Harbor's touch controls on direct and HLS streams. Anything the webview cannot decode, MKV most of all, switches back to the native player on its own.": "ダイレクトおよびHLSストリームで使えるHarborのタッチ操作です。WebViewでデコードできないもの、特にMKVは自動でネイティブプレーヤーに切り替わります。",
  "Turn on the in-app player to unlock on-screen controls, X-Ray, skipping, up next, trailers and subtitle style.": "アプリ内プレーヤーをオンにすると、画面上の操作、X-Ray、スキップ、次のエピソード、予告編、字幕スタイルが使えるようになります。",
  "Size, color, outline and the background behind the text.": "サイズ、色、縁取り、文字の背景。",
  "Personal media servers Harbor can play from.": "Harborで再生できる個人のメディアサーバー。",
  "Sharp": "角",
  "Subtle": "控えめ",
  "Pill": "ピル",
  "Theme & backgrounds": "テーマと背景",
  "Service sign-ins": "サービスのログイン情報",
  "Watchlist & favorites": "ウォッチリストとお気に入り",
  "Watch progress & history": "視聴の進行状況と履歴",
  "Search history": "検索履歴",
  "Player layouts & prefs": "プレーヤーのレイアウトと設定",
  "Xtream credentials": "Xtreamの認証情報",
  "Feed & Discover": "フィードと発見",
  "Onboarding & interface state": "初回設定とインターフェースの状態",
  "Cached lookups & misc": "キャッシュ済みの照会データなど",
};

export default mobileSettings;
