// Auto-authored translations for the marketplace surface.
// Covers the marketing footer, explore feed section titles, filter/sort labels,
// category + subcategory chips, empty states and the wishlist.
// Reuses existing keys from lib/i18n/dictionaries.ts where they already fit
// (e.g. "feed.recommended", "feed.most_popular", "category.<id>", "product.free",
// "search.recently_viewed", "search.clear", "nav.wishlist").
export const marketplaceDict: Record<"ro" | "en", Record<string, string>> = {
  ro: {
    // Footer
    "marketplace.footer_copyright": "Drepturi de autor",
    "marketplace.footer_all_rights": "Toate drepturile rezervate.",
    "marketplace.footer_product": "Produs",
    "marketplace.footer_home": "Acasă",
    "marketplace.footer_discover": "Descoperă",
    "marketplace.footer_blog": "Blog",
    "marketplace.footer_sign_in": "Log in",
    "marketplace.footer_pricing": "Prețuri",
    "marketplace.footer_features": "Funcționalități",
    "marketplace.footer_support": "Asistență",
    "marketplace.footer_help": "Ajutor",
    "marketplace.footer_affiliate": "Program de afiliere",
    "marketplace.footer_terms": "Termeni și condiții",
    "marketplace.footer_privacy": "Politica de confidențialitate",
    "marketplace.footer_cookie_prefs": "Preferințe cookie",
    "marketplace.footer_community_title": "Alătură-te comunității noastre!",
    "marketplace.footer_community_text":
      "Primește gratuit resurse săptămânale și șabloane viitoare alăturându-te comunității noastre.",
    "marketplace.footer_subscribed": "Îți mulțumim pentru abonare!",
    "marketplace.footer_email_placeholder": "Introdu adresa ta de email...",
    "marketplace.footer_sign_up": "Abonează-te",
    // Feed section badges / controls
    "marketplace.hot": "La modă",
    "marketplace.go_to_product": "Mergi la produs",
    "marketplace.previous_page": "Pagina anterioară",
    "marketplace.next_page": "Pagina următoare",
    // Featured categories
    "marketplace.browse_categories": "Răsfoiește categoriile",
    "marketplace.previous": "Anterior",
    "marketplace.next": "Următor",
    // Wishlist
    "marketplace.go_back": "Înapoi",
    "marketplace.wishlist_subtitle": "Produse pe care le-ai salvat pentru mai târziu",
    "marketplace.try_again": "Încearcă din nou",
    "marketplace.in_your_wishlist": "În lista ta de favorite",
    "marketplace.adding": "Se adaugă...",
    "marketplace.failed_to_add": "Adăugarea a eșuat",
    "marketplace.something_wrong": "Ceva nu a funcționat",
    "marketplace.loading_wishlist": "Se încarcă lista ta de favorite...",
    "marketplace.no_saved_items": "Încă nu ai articole salvate",
    "marketplace.wishlist_empty_text":
      "Produsele pe care le salvezi vor apărea aici. Începe să explorezi pentru a găsi ceva ce îți place.",
    "marketplace.explore_products": "Explorează produsele",
    "marketplace.item_saved": "articol salvat",
    "marketplace.items_saved": "articole salvate",
    "marketplace.view": "Vezi",
    "marketplace.discover_more": "Descoperă mai multe",
    "marketplace.remove_from_wishlist": "Elimină din favorite",
    "marketplace.creator_fallback": "Creator",
    // Search suggestions panel
    "marketplace.search_suggestions": "Sugestii de căutare",
    "marketplace.recent": "Recente",
    "marketplace.sellers": "Vânzători",
    "marketplace.seller": "Vânzător",
    "marketplace.item": "articol",
    "marketplace.items": "articole",
    "marketplace.remove_x_prefix": "Elimină",
    "marketplace.remove_x_recent_suffix": "din căutările recente",
    // Explore / category filter chrome
    "marketplace.search_storelib": "Caută pe Storelib",
    "marketplace.clear_search": "Șterge căutarea",
    "marketplace.by_category": "După categorie",
    "marketplace.filters": "Filtre",
    "marketplace.reset_all": "Resetează tot",
    "marketplace.subcategories": "Subcategorii",
    "marketplace.price_range": "Interval de preț",
    "marketplace.price": "Preț",
    "marketplace.sort_by": "Sortează după",
    "marketplace.reset": "Resetează",
    "marketplace.apply": "Aplică",
    "marketplace.apply_filters": "Aplică filtrele",
    "marketplace.select_category": "Selectează categoria",
    "marketplace.all_prefix": "Toate",
    "marketplace.category": "Categorie",
    "marketplace.active": "Active:",
    "marketplace.clear_all": "Șterge tot",
    "marketplace.clear_filters": "Șterge filtrele",
    "marketplace.clear_all_filters": "Șterge toate filtrele",
    "marketplace.items_title": "Articole",
    "marketplace.items_available": "articole disponibile",
    "marketplace.showing": "Se afișează",
    "marketplace.of": "din",
    "marketplace.show_all": "Vezi toate",
    "marketplace.browse_by_category": "Răsfoiește pe categorii",
    "marketplace.browse_subcategories": "Răsfoiește subcategoriile",
    "marketplace.back_to_explore": "Înapoi la Explorează",
    "marketplace.search_in": "Caută în",
    "marketplace.results_for": "Rezultate pentru",
    "marketplace.no_items_for": "Niciun articol găsit pentru",
    "marketplace.no_items_in": "Niciun articol găsit în",
    "marketplace.no_items_match":
      "Niciun articol nu corespunde filtrelor. Încearcă să ajustezi intervalul de preț.",
    "marketplace.no_items_match_short": "Niciun articol nu corespunde filtrelor",
    "marketplace.no_items_category": "Niciun articol găsit în această categorie.",
    "marketplace.try_adjusting": "Încearcă să ajustezi filtrele sau termenii de căutare",
    // Recommendation filter pills
    "marketplace.rec_curated": "Selecție",
    "marketplace.rec_trending": "În tendințe",
    "marketplace.rec_hot-new": "Noutăți populare",
    // Price filter options
    "marketplace.price_all": "Toate prețurile",
    "marketplace.price_free": "Gratis",
    "marketplace.price_under-10": "Sub $10",
    "marketplace.price_10-50": "$10 - $50",
    "marketplace.price_50-plus": "$50+",
    // Sort options
    "marketplace.sort_newest": "Cele mai noi",
    "marketplace.sort_popular": "Cele mai populare",
    "marketplace.sort_price-low": "Preț: crescător",
    "marketplace.sort_price-high": "Preț: descrescător",
    // Subcategories — womenswear
    // Subcategories — menswear
    // Subcategories — sneakers (brand names kept)
    // Subcategories — bags & accessories
    // Subcategories — jewellery
    // Subcategories — beauty
    // Subcategories — books
    // Subcategories — home
    // Subcategories — vintage
  },
  en: {
    // Footer
    "marketplace.footer_copyright": "Copyright",
    "marketplace.footer_all_rights": "All rights reserved.",
    "marketplace.footer_product": "Product",
    "marketplace.footer_home": "Home",
    "marketplace.footer_discover": "Discover",
    "marketplace.footer_blog": "Blog",
    "marketplace.footer_sign_in": "Sign In",
    "marketplace.footer_pricing": "Pricing",
    "marketplace.footer_features": "Features",
    "marketplace.footer_support": "Support",
    "marketplace.footer_help": "Help",
    "marketplace.footer_affiliate": "Affiliate Program",
    "marketplace.footer_terms": "Terms of Service",
    "marketplace.footer_privacy": "Privacy Policy",
    "marketplace.footer_cookie_prefs": "Cookie Preferences",
    "marketplace.footer_community_title": "Join Our Community!",
    "marketplace.footer_community_text":
      "Receive weekly assets and future templates for free by joining our community.",
    "marketplace.footer_subscribed": "Thanks for subscribing!",
    "marketplace.footer_email_placeholder": "Enter your email...",
    "marketplace.footer_sign_up": "Sign Up",
    // Feed section badges / controls
    "marketplace.hot": "Hot",
    "marketplace.go_to_product": "Go to product",
    "marketplace.previous_page": "Previous page",
    "marketplace.next_page": "Next page",
    // Featured categories
    "marketplace.browse_categories": "Browse categories",
    "marketplace.previous": "Previous",
    "marketplace.next": "Next",
    // Wishlist
    "marketplace.go_back": "Go back",
    "marketplace.wishlist_subtitle": "Products you've saved for later",
    "marketplace.try_again": "Try again",
    "marketplace.in_your_wishlist": "In your wishlist",
    "marketplace.adding": "Adding...",
    "marketplace.failed_to_add": "Failed to add",
    "marketplace.something_wrong": "Something went wrong",
    "marketplace.loading_wishlist": "Loading your wishlist...",
    "marketplace.no_saved_items": "No saved items yet",
    "marketplace.wishlist_empty_text":
      "Products you save will appear here. Start exploring to find something you love.",
    "marketplace.explore_products": "Explore Products",
    "marketplace.item_saved": "item saved",
    "marketplace.items_saved": "items saved",
    "marketplace.view": "View",
    "marketplace.discover_more": "Discover More",
    "marketplace.remove_from_wishlist": "Remove from wishlist",
    "marketplace.creator_fallback": "Creator",
    // Search suggestions panel
    "marketplace.search_suggestions": "Search suggestions",
    "marketplace.recent": "Recent",
    "marketplace.sellers": "Sellers",
    "marketplace.seller": "Seller",
    "marketplace.item": "item",
    "marketplace.items": "items",
    "marketplace.remove_x_prefix": "Remove",
    "marketplace.remove_x_recent_suffix": "from recent searches",
    // Explore / category filter chrome
    "marketplace.search_storelib": "Search Storelib",
    "marketplace.clear_search": "Clear search",
    "marketplace.by_category": "By Category",
    "marketplace.filters": "Filters",
    "marketplace.reset_all": "Reset all",
    "marketplace.subcategories": "Subcategories",
    "marketplace.price_range": "Price Range",
    "marketplace.price": "Price",
    "marketplace.sort_by": "Sort By",
    "marketplace.reset": "Reset",
    "marketplace.apply": "Apply",
    "marketplace.apply_filters": "Apply Filters",
    "marketplace.select_category": "Select Category",
    "marketplace.all_prefix": "All",
    "marketplace.category": "Category",
    "marketplace.active": "Active:",
    "marketplace.clear_all": "Clear all",
    "marketplace.clear_filters": "Clear filters",
    "marketplace.clear_all_filters": "Clear all filters",
    "marketplace.items_title": "Items",
    "marketplace.items_available": "items available",
    "marketplace.showing": "Showing",
    "marketplace.of": "of",
    "marketplace.show_all": "Show all",
    "marketplace.browse_by_category": "Browse by Category",
    "marketplace.browse_subcategories": "Browse Subcategories",
    "marketplace.back_to_explore": "Back to Explore",
    "marketplace.search_in": "Search in",
    "marketplace.results_for": "Results for",
    "marketplace.no_items_for": "No items found for",
    "marketplace.no_items_in": "No items found in",
    "marketplace.no_items_match":
      "No items match your filters. Try adjusting your price range.",
    "marketplace.no_items_match_short": "No items match your filters",
    "marketplace.no_items_category": "No items found in this category.",
    "marketplace.try_adjusting": "Try adjusting your filters or search terms",
    // Recommendation filter pills
    "marketplace.rec_curated": "Curated",
    "marketplace.rec_trending": "Trending",
    "marketplace.rec_hot-new": "Hot & New",
    // Price filter options
    "marketplace.price_all": "All Prices",
    "marketplace.price_free": "Free",
    "marketplace.price_under-10": "Under $10",
    "marketplace.price_10-50": "$10 - $50",
    "marketplace.price_50-plus": "$50+",
    // Sort options
    "marketplace.sort_newest": "Newest",
    "marketplace.sort_popular": "Most Popular",
    "marketplace.sort_price-low": "Price: Low to High",
    "marketplace.sort_price-high": "Price: High to Low",
    // Subcategories — womenswear
    // Subcategories — menswear
    // Subcategories — sneakers (brand names kept)
    // Subcategories — bags & accessories
    // Subcategories — jewellery
    // Subcategories — beauty
    // Subcategories — books
    // Subcategories — home
    // Subcategories — vintage
  },
}
