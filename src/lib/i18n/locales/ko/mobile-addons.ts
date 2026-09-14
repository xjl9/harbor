// Phone shell strings for addons surfaces; the i18n coverage test requires every
// translated locale to carry every t() key used by the app.
const mobileAddons: Record<string, string> = {
  "Couldn't read the clipboard. Paste into the field instead.": "클립보드를 읽을 수 없습니다. 대신 입력란에 붙여 넣으세요.",
  "Update addon": "애드온 업데이트",
  "This addon is already installed. Continue to swap in this link.": "이미 설치된 애드온입니다. 계속하면 이 링크로 교체합니다.",
  "Install with {name}": "{name}(으)로 설치",
  "Show fewer": "간단히 보기",
  "Show all {n}": "{n}개 모두 보기",
  "Its catalogs and streams disappear from this device. You can install it again any time.": "이 애드온의 카탈로그와 스트림이 이 기기에서 사라집니다. 언제든 다시 설치할 수 있습니다.",
  "More sources": "추가 소스",
  "Hidden unless you pass the age check.": "연령 확인을 통과하기 전에는 숨겨집니다.",
  "Small scripts that look for streams on sites Harbor does not know about.": "Harbor가 모르는 사이트에서 스트림을 찾는 작은 스크립트입니다.",
  "Head to Discover to add catalogs, subtitles and stream sources.": "탐색에서 카탈로그, 자막, 스트림 소스를 추가하세요.",
  "More options for {name}": "{name} 추가 옵션",
  "From {site}": "{site} 제공",
  "Search community addons": "커뮤니티 애드온 검색",
  "Filtered to": "필터:",
  "Couldn't load community addons.": "커뮤니티 애드온을 불러올 수 없습니다.",
  "No addons match \"{query}\".": "\"{query}\"와(과) 일치하는 애드온이 없습니다.",
  "No addons to show yet.": "아직 표시할 애드온이 없습니다.",
  "Could not add this addon. Tap Add to retry.": "이 애드온을 추가할 수 없습니다. 다시 시도하세요.",
  "Couldn't sync the order to your Stremio account. It is saved on this device.": "순서를 Stremio 계정과 동기화할 수 없습니다. 이 기기에는 저장되었습니다.",
  "Picked from the community index and what you already use.": "커뮤니티 지수와 이미 사용 중인 애드온을 바탕으로 골랐습니다.",
  "Synced with your Stremio account. Changes here apply everywhere you sign in.": "Stremio 계정과 동기화되었습니다. 여기서 변경한 내용은 로그인한 모든 곳에 적용됩니다.",
  "Addons you add here stay on this phone. Sign in to Stremio from Profile to keep them in sync with your account.": "여기서 추가한 애드온은 이 휴대폰에만 남습니다. 계정과 동기화하려면 프로필에서 Stremio에 로그인하세요.",
  "Search installed addons": "설치된 애드온 검색",
  "Official catalogs + metadata": "공식 카탈로그 + 메타데이터",
};

export default mobileAddons;
