// Phone shell strings for settings surfaces; the i18n coverage test requires every
// translated locale to carry every t() key used by the app.
const mobileSettings: Record<string, string> = {
  "Preferences": "Параметры",
  "Managed on the Profile tab. Tap a row to go there.": "Настраивается на вкладке «Профиль». Нажмите строку, чтобы перейти туда.",
  "Recent warnings and errors from this app. Keys and links are already redacted, so this is safe to copy and send.": "Недавние предупреждения и ошибки этого приложения. Ключи и ссылки уже скрыты, поэтому отчёт можно безопасно скопировать и отправить.",
  "Animated tab bar icons": "Анимированные значки панели вкладок",
  "Tab bar icons play a short animation when you tap them. Turn this off to keep them as plain static icons.": "Значки панели вкладок проигрывают короткую анимацию при нажатии. Отключите, чтобы они оставались обычными статичными значками.",
  "Search regions": "Поиск регионов",
  "The native player is the default and plays every format.": "По умолчанию используется системный плеер, он воспроизводит любой формат.",
  "In-app player": "Плеер в приложении",
  "Harbor's touch controls on direct and HLS streams. Anything the webview cannot decode, MKV most of all, switches back to the native player on its own.": "Сенсорное управление Harbor для прямых и HLS-потоков. Всё, что webview не может декодировать, особенно MKV, автоматически переключается на системный плеер.",
  "Turn on the in-app player to unlock on-screen controls, X-Ray, skipping, up next, trailers and subtitle style.": "Включите плеер в приложении, чтобы открыть элементы управления на экране, X-Ray, пропуски, следующую серию, трейлеры и стиль субтитров.",
  "Size, color, outline and the background behind the text.": "Размер, цвет, обводка и фон под текстом.",
  "Personal media servers Harbor can play from.": "Личные медиасерверы, с которых Harbor может воспроизводить.",
  "Sharp": "Острые",
  "Subtle": "Мягкие",
  "Pill": "Капсула",
  "Theme & backgrounds": "Тема и фоны",
  "Service sign-ins": "Входы в сервисы",
  "Watchlist & favorites": "Список и избранное",
  "Watch progress & history": "Прогресс просмотра и история",
  "Search history": "История поиска",
  "Player layouts & prefs": "Макеты и настройки плеера",
  "Xtream credentials": "Учётные данные Xtream",
  "Feed & Discover": "Лента и «Обзор»",
  "Onboarding & interface state": "Знакомство и состояние интерфейса",
  "Cached lookups & misc": "Кэш запросов и прочее",
};

export default mobileSettings;
