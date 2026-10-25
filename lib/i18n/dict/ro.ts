/**
 * The marketplace's Romanian, fetched only for a person who reads it
 * (lib/i18n/dictionaries-core.ts loadLazyDictionary, round 12): about 66KB
 * that every page carried for everybody. The server reads it from
 * lib/i18n/dictionaries.ts.
 */
import { authRo } from "./ro/auth"
import { checkoutRo } from "./ro/checkout"
import { dashboardRo } from "./ro/dashboard"
import { settingsRo } from "./ro/settings"
import { builderRo } from "./ro/builder"

export const roDict: Record<string, string> = {
  // Merged per-surface keys (base keys below override on collision)
  ...authRo,
  ...checkoutRo,
  ...dashboardRo,
  ...settingsRo,
  ...builderRo,
  // Header / nav
  "nav.library": "Biblioteca",
  "nav.dashboard": "Panou",
  "nav.sign_in": "Log in",
  "nav.sign_up": "Sign up",
  "nav.start_selling": "Începe să vinzi",
  "nav.wishlist": "Favorite",
  "nav.categories": "Categorii",
  "nav.all_categories": "Toate categoriile",
  // Search
  "search.placeholder": "Caută orice",
  "search.recent": "Căutări recente",
  "search.recently_viewed": "Vizualizate recent",
  "search.people": "Persoane",
  "search.clear": "Șterge",
  // Categories
  // The six digital categories. lib/marketplace/categories.ts owns the ids and
  // the English labels; these are what the UI shows in each locale.
  "category.all": "Toate",
  "category.design": "Design",
  "category.development": "Dezvoltare",
  "category.marketing": "Marketing",
  "category.business": "Afaceri",
  "category.ai": "AI",
  "category.social-media": "Social media",
  "category.productivity": "Productivitate",
  "category.photography": "Fotografie",
  "category.video": "Video",
  "category.audio-music": "Audio și muzică",
  "category.education": "Educație",
  "category.ecommerce": "E-commerce",
  "category.freebies": "Gratuite",
  "category.other": "Altele",
  // Feed sections
  "feed.recommended": "Recomandate",
  "feed.most_popular": "Cele mai populare",
  "feed.trending": "În tendințe",
  "feed.new": "Noutăți",
  "feed.featured_categories": "Categorii recomandate",
  // Mobile browse
  "mfeed.search_placeholder": "Caută șabloane, cursuri, fonturi...",
  "mfeed.search_for": "Caută",
  "mfeed.filters": "Filtre",
  "mfeed.for_you": "Pentru tine",
  "mfeed.following": "Urmărești",
  "mfeed.saved": "Salvate",
  "mfeed.view_grid": "Vizualizare grilă",
  "mfeed.view_reels": "Vizualizare pe ecran complet",
  "mfeed.share": "Trimite",
  "mfeed.save": "Salvează",
  "mfeed.picked_for_you": "Alese pentru tine",
  "mfeed.based_on_searches": "Pe baza căutărilor tale",
  "mfeed.home": "Acasă",
  "mfeed.search": "Caută",
  "mfeed.sell": "Vinde",
  "mfeed.inbox": "Mesaje",
  "mfeed.profile": "Profil",
  "mfeed.empty_title": "Niciun anunț încă",
  "mfeed.empty_sub": "Revino curând. Apar produse noi în fiecare zi.",
  "mfeed.following_empty_title": "Nu urmărești pe nimeni încă",
  "mfeed.following_empty_sub": "Urmărește vânzători ca să le vezi anunțurile aici.",
  "mfeed.saved_empty_title": "Niciun articol salvat",
  "mfeed.saved_empty_sub": "Apasă pe inimă la un anunț ca să îl salvezi aici.",
  // Full-screen search overlay
  "mfeed.search_items_members": "Caută articole sau membri",
  "mfeed.close": "Închide",
  "mfeed.tab_items": "Articole",
  "mfeed.back": "Înapoi",
  "mfeed.tab_people": "Persoane",
  "mfeed.recent_searches": "Căutări recente",
  "mfeed.clear_all": "Șterge tot",
  "mfeed.suggestions": "Sugestii",
  "mfeed.browse_categories": "Explorează categoriile",
  "mfeed.no_people": "Niciun membru găsit",
  "mfeed.search_people_hint": "Caută membri după nume sau utilizator",
  "mfeed.items_count": "articole",
  "mfeed.searching": "Se caută…",
  "mfeed.swipe_photos": "Glisează",
  "mfeed.saved_toast": "Salvat în favorite",
  "mfeed.follow_action": "Urmărește",
  "mfeed.unfollow_action": "Nu mai urmări",
  "mfeed.follow_tip": "Urmărește din nou",
  "mfeed.unfollow_tip": "Nu mai urmări",
  "mfeed.member_since": "Membru din",
  "mfeed.listings_short": "anunțuri",
  "mfeed.online": "Online",
  "mfeed.offline": "Offline",
  "mfeed.following_action": "Urmărit",
  "mfeed.follow_toast": "Îl urmărești pe {name}",
  "mfeed.following_loading": "Se încarcă anunțurile...",
  "mfeed.removed_toast": "Eliminat din favorite",
  // Product / listing
  "product.free": "Gratis",
  "product.size": "Mărime",
  "product.condition": "Stare",
  "product.brand": "Marcă",
  "product.add_to_wishlist": "Adaugă la favorite",
  // Settings modal
  "settings.language": "Limbă",
  "settings.currency": "Monedă",
  // Back-compat keys (used by existing components)
  search_placeholder: "Caută orice",
  wishlist: "Favorite",
  library: "Biblioteca",
  start_selling: "Începe să vinzi",
  dashboard: "Panou",
  sell_now: "Vinde",
  bag: "Coș",
  messages: "Mesaje",
  sign_up: "Sign up",
  log_in: "Log in",
  language: "Limbă",
  currency: "Monedă",
}
