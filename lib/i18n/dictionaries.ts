/**
 * Marketplace UI dictionaries.
 *
 * Single source of truth for translatable strings read by `useLocale().t(key)`.
 * The app is Romanian-first: `ro` and `en` are the maintained locales. Other
 * locales keep their original header keys and fall back to English for the rest.
 *
 * Convention for keys: dot-namespaced, e.g. "nav.library", "category.sneakers".
 * When converting a component, add its strings here (ro + en) and call t("...").
 * A translation workflow extends this map across the rest of the app.
 */

// Per-surface translations authored by the RO/EN sweep. Merged below; the
// curated base keys in this file win on any key collision.
import { authDict } from "./dict/auth"
import { checkoutDict } from "./dict/checkout"
import { dashboardDict } from "./dict/dashboard"
import { marketplaceDict } from "./dict/marketplace"
import { settingsDict } from "./dict/settings"
import { builderDict } from "./dict/builder"
import { feedDict } from "./dict/feed"
import { catpageDict } from "./dict/catpage"

export type LocaleCode = "ro" | "en" | "es" | "de" | "pt-BR" | "fr" | "it" | "nl" | "pl"

export const dictionaries: Record<LocaleCode, Record<string, string>> = {
  ro: {
    // Merged per-surface keys (base keys below override on collision)
    ...authDict.ro,
    ...checkoutDict.ro,
    ...dashboardDict.ro,
    ...marketplaceDict.ro,
    ...settingsDict.ro,
    ...builderDict.ro,
    ...feedDict.ro,
    ...catpageDict.ro,
    // Header / nav
    "nav.library": "Biblioteca",
    "nav.dashboard": "Panou",
    "nav.sign_in": "Autentificare",
    "nav.sign_up": "Înregistrare",
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
    "category.all": "Toate",
    "category.womenswear": "Damă",
    "category.menswear": "Bărbați",
    "category.sneakers": "Sneakers",
    "category.bags-accessories": "Genți & Accesorii",
    "category.jewellery": "Bijuterii",
    "category.beauty": "Frumusețe",
    "category.books": "Cărți",
    "category.home": "Casă",
    "category.vintage": "Vintage",
    // Feed sections
    "feed.recommended": "Recomandate",
    "feed.most_popular": "Cele mai populare",
    "feed.trending": "În tendințe",
    "feed.new": "Noutăți",
    "feed.featured_categories": "Categorii recomandate",
    "feed.seo_h1": "Cumpără și vinde modă second-hand, sneakers, genți și vintage | Storelib",
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
    language: "Limbă",
    currency: "Monedă",
  },
  en: {
    // Merged per-surface keys (base keys below override on collision)
    ...authDict.en,
    ...checkoutDict.en,
    ...dashboardDict.en,
    ...marketplaceDict.en,
    ...settingsDict.en,
    ...builderDict.en,
    ...feedDict.en,
    ...catpageDict.en,
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
    "category.all": "All",
    "category.womenswear": "Womenswear",
    "category.menswear": "Menswear",
    "category.sneakers": "Sneakers",
    "category.bags-accessories": "Bags & Accessories",
    "category.jewellery": "Jewellery",
    "category.beauty": "Beauty",
    "category.books": "Books",
    "category.home": "Home",
    "category.vintage": "Vintage",
    "feed.recommended": "Recommended",
    "feed.most_popular": "Most popular",
    "feed.trending": "Trending",
    "feed.new": "New",
    "feed.featured_categories": "Featured categories",
    "feed.seo_h1": "Buy & Sell Second-Hand Fashion, Sneakers, Bags & Vintage | Storelib",
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
    dashboard: "Dashboard",
    language: "Language",
    currency: "Currency",
  },
  // Other locales keep their original header keys; everything else falls back to English.
  es: {
    search_placeholder: "Buscar cualquier cosa",
    wishlist: "Lista",
    library: "Biblioteca",
    start_selling: "Empezar a vender",
    dashboard: "Panel",
    language: "Idioma",
    currency: "Moneda",
  },
  de: {
    search_placeholder: "Alles suchen",
    wishlist: "Wunschliste",
    library: "Bibliothek",
    start_selling: "Verkaufen",
    dashboard: "Dashboard",
    language: "Sprache",
    currency: "Währung",
  },
  "pt-BR": {
    search_placeholder: "Buscar qualquer coisa",
    wishlist: "Lista",
    library: "Biblioteca",
    start_selling: "Começar a vender",
    dashboard: "Painel",
    language: "Idioma",
    currency: "Moeda",
  },
  fr: {
    search_placeholder: "Rechercher n'importe quoi",
    wishlist: "Favoris",
    library: "Bibliothèque",
    start_selling: "Vendre",
    dashboard: "Tableau de bord",
    language: "Langue",
    currency: "Devise",
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
