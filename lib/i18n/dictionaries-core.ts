/**
 * Marketplace UI dictionaries, the part a page that translates carries:
 * English (and the header keys of the partly translated locales). Romanian,
 * Spanish, French and German are complete and large, so they are loaded only
 * for a person who chose one (loadLazyDictionary); the server reads all of
 * them from lib/i18n/dictionaries.ts. Only the pages that call useLocale().t
 * load this file at all (lib/i18n/locale-words.ts, round 12).
 */
// Per-surface translations authored by the RO/EN sweep. Merged below; the
// curated base keys in this file win on any key collision.
import { authEn } from "./dict/auth"
import { checkoutEn } from "./dict/checkout"
import { dashboardEn } from "./dict/dashboard"
import { settingsEn } from "./dict/settings"
import { builderEn } from "./dict/builder"
import { LAZY_LOCALES, LOCALE_SIZES, type LazyLocale } from "./locale-sizes"

export type LocaleCode = "ro" | "en" | "es" | "de" | "pt-BR" | "fr" | "it" | "nl" | "pl"

export { LAZY_LOCALES, type LazyLocale }
export type CoreLocale = Exclude<LocaleCode, LazyLocale>

/** How many keys each lazy locale has (lib/i18n/locale-sizes.ts). */
export const LAZY_LOCALE_SIZES: Record<LazyLocale, number> = { es: LOCALE_SIZES.es, fr: LOCALE_SIZES.fr, de: LOCALE_SIZES.de, ro: LOCALE_SIZES.ro }

/** The lazy locale's dictionary, fetched once. */
export function loadLazyDictionary(code: LazyLocale): Promise<Record<string, string>> {
  if (code === "ro") return import("./dict/ro").then((m) => m.roDict)
  if (code === "es") return import("./dict/es").then((m) => m.esDict)
  if (code === "fr") return import("./dict/fr").then((m) => m.frDict)
  return import("./dict/de").then((m) => m.deDict)
}

export const coreDictionaries: Record<CoreLocale, Record<string, string>> = {
  en: {
    // Merged per-surface keys (base keys below override on collision)
    ...authEn,
    ...checkoutEn,
    ...dashboardEn,
    ...settingsEn,
    ...builderEn,
    "nav.library": "Library",
    "nav.dashboard": "Dashboard",
    "nav.sign_in": "Sign in",
    "nav.sign_up": "Sign up",
    "nav.start_selling": "Start selling",
    "nav.wishlist": "Wishlist",
    "nav.categories": "Categories",
    "nav.all_categories": "All categories",
    "search.placeholder": "Search for anything",
    "search.recent": "Recent searches",
    "search.recently_viewed": "Recently viewed",
    "search.people": "People",
    "search.clear": "Clear",
    // The six digital categories. lib/marketplace/categories.ts owns the ids and
    // the English labels; these are what the UI shows in each locale.
    "category.all": "All",
    "category.design": "Design",
    "category.development": "Development",
    "category.marketing": "Marketing",
    "category.business": "Business",
    "category.ai": "AI",
    "category.social-media": "Social Media",
    "category.productivity": "Productivity",
    "category.photography": "Photography",
    "category.video": "Video",
    "category.audio-music": "Audio & Music",
    "category.education": "Education",
    "category.ecommerce": "E-commerce",
    "category.freebies": "Freebies",
    "category.other": "Other",
    "feed.recommended": "Recommended",
    "feed.most_popular": "Most popular",
    "feed.trending": "Trending",
    "feed.new": "New",
    "feed.featured_categories": "Featured categories",
    // Mobile browse
    "mfeed.search_placeholder": "Search templates, courses, fonts...",
    "mfeed.search_for": "Search for",
    "mfeed.filters": "Filters",
    "mfeed.for_you": "For You",
    "mfeed.following": "Following",
    "mfeed.saved": "Saved",
    "mfeed.view_grid": "Grid view",
    "mfeed.view_reels": "Full-screen view",
    "mfeed.share": "Share",
    "mfeed.save": "Save",
    "mfeed.picked_for_you": "Picked for you",
    "mfeed.based_on_searches": "Based on your searches",
    "mfeed.home": "Home",
    "mfeed.search": "Search",
    "mfeed.sell": "Sell",
    "mfeed.inbox": "Inbox",
    "mfeed.profile": "Profile",
    "mfeed.empty_title": "No listings yet",
    "mfeed.empty_sub": "Check back soon. New items land every day.",
    "mfeed.following_empty_title": "You're not following anyone yet",
    "mfeed.following_empty_sub": "Follow sellers to see their listings here.",
    "mfeed.saved_empty_title": "No saved items",
    "mfeed.saved_empty_sub": "Tap the heart on a listing to save it here.",
    // Full-screen search overlay
    "mfeed.search_items_members": "Search items or members",
    "mfeed.close": "Close",
    "mfeed.tab_items": "Items",
    "mfeed.back": "Back",
    "mfeed.tab_people": "People",
    "mfeed.recent_searches": "Recent searches",
    "mfeed.clear_all": "Clear all",
    "mfeed.suggestions": "Suggestions",
    "mfeed.browse_categories": "Browse categories",
    "mfeed.no_people": "No members found",
    "mfeed.search_people_hint": "Search members by name or username",
    "mfeed.items_count": "items",
    "mfeed.searching": "Searching…",
    "mfeed.swipe_photos": "Swipe",
    "mfeed.saved_toast": "Saved to wishlist",
    "mfeed.follow_action": "Follow",
    "mfeed.unfollow_action": "Following",
    "mfeed.follow_tip": "Follow again",
    "mfeed.unfollow_tip": "Unfollow",
    "mfeed.member_since": "Member since",
    "mfeed.listings_short": "listings",
    "mfeed.online": "Online",
    "mfeed.offline": "Offline",
    "mfeed.following_action": "Following",
    "mfeed.follow_toast": "You're following {name}",
    "mfeed.following_loading": "Loading listings...",
    "mfeed.removed_toast": "Removed from wishlist",
    "product.free": "Free",
    "product.size": "Size",
    "product.condition": "Condition",
    "product.brand": "Brand",
    "product.add_to_wishlist": "Add to wishlist",
    "settings.language": "Language",
    "settings.currency": "Currency",
    search_placeholder: "Search for anything",
    wishlist: "Wishlist",
    library: "Library",
    start_selling: "Start selling",
    sell_now: "Sell",
    bag: "Bag",
    messages: "Messages",
    sign_up: "Sign up",
    log_in: "Log in",
    dashboard: "Dashboard",
    language: "Language",
    currency: "Currency",
  },
  // Other locales keep their original header keys; everything else falls back to English.
  "pt-BR": {
    search_placeholder: "Buscar qualquer coisa",
    wishlist: "Lista",
    library: "Biblioteca",
    start_selling: "Começar a vender",
    dashboard: "Painel",
    language: "Idioma",
    currency: "Moeda",
  },
  it: {
    search_placeholder: "Cerca qualsiasi cosa",
    wishlist: "Preferiti",
    library: "Libreria",
    start_selling: "Inizia a vendere",
    dashboard: "Dashboard",
    language: "Lingua",
    currency: "Valuta",
  },
  nl: {
    search_placeholder: "Zoek naar alles",
    wishlist: "Verlanglijst",
    library: "Bibliotheek",
    start_selling: "Begin met verkopen",
    dashboard: "Dashboard",
    language: "Taal",
    currency: "Valuta",
  },
  pl: {
    search_placeholder: "Szukaj czegokolwiek",
    wishlist: "Lista",
    library: "Biblioteka",
    start_selling: "Zacznij sprzedawać",
    dashboard: "Panel",
    language: "Język",
    currency: "Waluta",
  },
}
