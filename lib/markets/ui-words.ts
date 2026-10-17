/**
 * ===========================================================================
 *  THE SHOP'S OWN WORDS, IN EVERY LANGUAGE OF THE WEBSITE
 * ===========================================================================
 * The words a Storelib theme draws itself, that no section setting holds:
 * the cart's, the buy buttons', the cart notice's. They were English on
 * every language of a website. Each is a translation like any other text
 * (Translate › Shop words, key `ui:<name>`), drafted by AI with the rest,
 * and drawn in the page's language once approved (StorefrontContext
 * `words`, lib/markets/live.ts). A word with no approved translation, or a
 * page in the website's own language, shows the English below.
 *
 * A button's own label set in a section (a product block's "Add to cart"
 * label) is that section's text and is translated there; these are the
 * defaults it falls back to.
 */
export const UI_WORDS = {
  cart: "Cart",
  cart_nothing: "Nothing in your cart yet.",
  cart_title: "Your cart",
  cart_empty: "Your cart is empty",
  continue_shopping: "Continue shopping",
  subtotal: "Subtotal",
  total: "Total",
  check_out: "Check out",
  view_cart: "View cart",
  remove: "Remove",
  quantity: "Quantity",
  note_for_shop: "Note for the shop",
  discount_code: "Discount code",
  apply: "Apply",
  taxes_at_checkout: "Taxes and shipping are worked out at checkout",
  add_to_cart: "Add to cart",
  added_to_cart: "Added to cart",
  buy_now: "Buy now",
  get_it_free: "Get it free",
  sold_out: "Sold out",
  search: "Search",
  no_results: "No results",
  /* The header: its menu on a phone, the account and the wishlist (components/website-builder/sections/renderers/HeaderSection.tsx). */
  menu: "Menu",
  account: "Account",
  sign_in: "Sign in",
  wishlist: "Wishlist",
  saved: "saved",
  /* The shop's lists: search, the products page and a collection (themes/default/sections, lib/products/catalog-filters.ts). */
  results_for: "Results for",
  no_results_for: "No results for",
  result: "result",
  results: "results",
  search_for: "for",
  product: "product",
  products: "products",
  price: "Price",
  price_to: "to",
  price_from: "From",
  price_up_to: "Up to",
  lowest_price: "Lowest price",
  highest_price: "Highest price",
  availability: "Availability",
  in_stock: "In stock",
  product_type: "Product type",
  sort_featured: "Featured",
  sort_newest: "Newest",
  sort_price_asc: "Price, low to high",
  sort_price_desc: "Price, high to low",
  sort_title_asc: "Name, A to Z",
  sort_title_desc: "Name, Z to A",
  kind_digital: "Digital download",
  kind_physical: "Physical product",
  kind_course: "Course",
  kind_membership: "Membership",
  kind_community: "Community",
  kind_coaching: "Coaching",
  kind_bundle: "Bundle",
  kind_service: "Service",
  kind_event: "Event",
  kind_ebook: "Ebook",
  pages: "Pages",
  save: "Save",
  remove_saved: "Remove from saved items",
  rated: "Rated",
  out_of_five: "out of 5",
  out_of_five_stars: "out of 5 stars",
  email_address: "Email address",
  verified: "Verified",
  verified_purchase: "Verified purchase",
  /* Storelib Reviews (sections/reviews_*.storelib). */
  verified_buyer: "Verified buyer",
  based_on: "Based on",
  no_reviews_yet: "No reviews yet",
  reviews_by_rating: "Reviews by rating",
  show_more_reviews: "Show more reviews",
  reply_from: "Reply from",
  photo_from: "Photo from",
  review_on: "On",
  write_a_review: "Write a review",
  your_rating: "Your rating",
  your_review: "Your review",
  review_title: "Title",
  your_name: "Name",
  email: "Email",
  photos: "Photos",
  optional: "(optional)",
  optional_up_to_four: "(optional, up to 4)",
  review_privacy: "Only your first name and last initial are shown. Your email is not.",
  post_review: "Post review",
  star: "star",
  stars: "stars",
  review_posted: "Thanks. Your review is up.",
  review_waiting: "Thanks. Your review shows once the store has read it.",
  review_check_email: "Thanks. Check your email and open the link in it to post your review.",
  review_error: "That didn't go through. Check the form and try again.",
  review: "review",
  reviews: "reviews",
  rating_from: "from",
  /* Storelib Reviews widgets (lib/reviews/widgets): a carousel's buttons, the photo wall, the link to every review. */
  previous: "Previous",
  next: "Next",
  customer_photos: "Customer photos",
  read_all_reviews: "Read all reviews",
  breadcrumb: "Breadcrumb",
  contact: "Contact",
  email_me_news_from: "Email me news from",
  email_me_news: "Email me news from this store",
} as const

export type UiWord = keyof typeof UI_WORDS

export const uiKey = (word: UiWord) => `ui:${word}`

/** Every word as a line in Translate › Shop words. */
export function uiTranslatables(): { key: string; source: string; label: string; where: string; multiline: boolean }[] {
  return (Object.keys(UI_WORDS) as UiWord[]).map((w) => ({ key: uiKey(w), source: UI_WORDS[w], label: UI_WORDS[w], where: "Shop words", multiline: false }))
}

/** Every word in the page's language, English where it has no translation: a template's `words` (lib/storelib-theme/render.ts). */
export function shopWords(words: Partial<Record<string, string>> | undefined): Record<UiWord, string> {
  const out = { ...UI_WORDS } as Record<UiWord, string>
  for (const w of Object.keys(UI_WORDS) as UiWord[]) out[w] = uiWord(words, w)
  return out
}

/** A word in the page's language: its approved translation, else the English. */
export function uiWord(words: Partial<Record<string, string>> | undefined, word: UiWord): string {
  const v = words?.[word]
  return typeof v === "string" && v.trim() ? v : UI_WORDS[word]
}
