// Phone shell strings for settings surfaces; the i18n coverage test requires every
// translated locale to carry every t() key used by the app.
const mobileSettings: Record<string, string> = {
  "Preferences": "Préférences",
  "Managed on the Profile tab. Tap a row to go there.": "Géré dans l’onglet Profil. Touchez une ligne pour y accéder.",
  "Recent warnings and errors from this app. Keys and links are already redacted, so this is safe to copy and send.": "Avertissements et erreurs récents de cette app. Les clés et les liens sont déjà masqués : vous pouvez copier et envoyer ce rapport sans risque.",
  "Animated tab bar icons": "Icônes animées de la barre d’onglets",
  "Tab bar icons play a short animation when you tap them. Turn this off to keep them as plain static icons.": "Les icônes de la barre d’onglets jouent une courte animation quand vous les touchez. Désactivez cette option pour garder des icônes statiques.",
  "Search regions": "Rechercher des régions",
  "The native player is the default and plays every format.": "Le lecteur natif est utilisé par défaut et lit tous les formats.",
  "In-app player": "Lecteur intégré",
  "Harbor's touch controls on direct and HLS streams. Anything the webview cannot decode, MKV most of all, switches back to the native player on its own.": "Les commandes tactiles de Harbor pour les flux directs et HLS. Tout ce que la webview ne peut pas décoder, surtout le MKV, repasse automatiquement au lecteur natif.",
  "Turn on the in-app player to unlock on-screen controls, X-Ray, skipping, up next, trailers and subtitle style.": "Activez le lecteur intégré pour débloquer les commandes à l’écran, X-Ray, le saut, l’épisode suivant, les bandes-annonces et le style des sous-titres.",
  "Size, color, outline and the background behind the text.": "Taille, couleur, contour et arrière-plan derrière le texte.",
  "Personal media servers Harbor can play from.": "Serveurs multimédias personnels à partir desquels Harbor peut lire.",
  "Sharp": "Droit",
  "Subtle": "Discret",
  "Pill": "Pilule",
  "Theme & backgrounds": "Thème et arrière-plans",
  "Service sign-ins": "Connexions aux services",
  "Watchlist & favorites": "Liste et favoris",
  "Watch progress & history": "Progression et historique",
  "Search history": "Historique de recherche",
  "Player layouts & prefs": "Dispositions et préférences du lecteur",
  "Xtream credentials": "Identifiants Xtream",
  "Feed & Discover": "Fil et Découvrir",
  "Onboarding & interface state": "Accueil et état de l’interface",
  "Cached lookups & misc": "Recherches en cache et divers",
};

export default mobileSettings;
