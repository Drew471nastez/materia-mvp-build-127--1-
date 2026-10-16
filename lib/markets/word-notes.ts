/**
 * ===========================================================================
 *  WHAT EACH OF STORELIB'S OWN WORDS IS, FOR A TRANSLATOR
 * ===========================================================================
 * A short label alone is ambiguous. "Pay {shop}" above the checkout's total
 * is a verb, pay this seller; sent bare, it came back in Romanian as
 * "Salariul {shop}", the noun for a wage. A language with hand written words
 * (./curated-words.ts) never reaches a translator; for every other one, each
 * of Storelib's own words goes with a note saying what it is and where it
 * stands (./translate-ai.ts draftReusing, ./open-translate.ts), and the
 * translators that read context use it: the chat models as a note beside
 * the text, DeepL as its `context`.
 *
 * Only Storelib's own words have notes. A store's text is its own and goes
 * as it always did.
 *
 * Pure.
 */
import { UI_WORDS, type UiWord } from "./ui-words"
import { sourceHash } from "./translate"

const UI_DEFAULT = "A word in an online shop's own interface (its cart, product lists and buttons), shown to shoppers."
const CHECKOUT_DEFAULT = "Text on an online shop's checkout or order page, written to the buyer. Keep it short and plain, as a native shop would write it."
const EMAIL_DEFAULT = "Text in an order email an online shop sends to its buyer."

/** The shop words whose meaning a bare label does not carry. */
const UI_NOTES: Partial<Record<UiWord, string>> = {
  cart: "Noun: the shopping cart, a header link.",
  cart_title: "Heading of the shopping cart drawer.",
  check_out: "Button, verb: go to the checkout to pay for the cart.",
  view_cart: "Button, verb: open the shopping cart.",
  remove: "Button, verb: take this item out of the cart.",
  quantity: "Label of a number field: how many of the item.",
  apply: "Button, verb: apply the discount code typed beside it.",
  subtotal: "Label beside an amount: the cart's sum before shipping and taxes.",
  total: "Label beside an amount: the sum to pay.",
  add_to_cart: "Button, verb: put this product in the shopping cart.",
  added_to_cart: "Short notice after the button was pressed: the product is now in the cart.",
  buy_now: "Button, verb: buy this product straight away.",
  get_it_free: "Button, verb: get this free product.",
  sold_out: "Badge on a product: no stock left.",
  search: "Button or field label, verb: search the shop.",
  menu: "Noun: the site menu button on a phone.",
  account: "Noun: the shopper's account, a header link.",
  sign_in: "Link, verb: log in to an account.",
  wishlist: "Noun: the shopper's saved products list.",
  saved: "Follows a number after the wishlist name, e.g. \"Wishlist, 3 saved\": how many products are saved.",
  results_for: "Followed by the search words in quotes: \"Results for 'mug'\".",
  no_results_for: "Followed by the search words in quotes: \"No results for 'mug'\".",
  result: "Follows the number 1: \"1 result\".",
  results: "Follows a number other than 1: \"12 results\".",
  search_for: "Joins a count and the search words: \"12 results for 'mug'\".",
  product: "Follows the number 1: \"1 product\".",
  products: "Follows a number other than 1: \"12 products\".",
  price_to: "Between two price fields of a filter: from [min] to [max].",
  price_from: "Before a price: the lowest price, e.g. \"From $10\".",
  price_up_to: "Before a price: the highest price, e.g. \"Up to $50\".",
  sort_featured: "Sort order option: the shop's chosen order.",
  sort_newest: "Sort order option: newest first.",
  pages: "Accessible name of the page number navigation.",
  save: "Accessible button name, verb: save this product to the wishlist; followed by the product name.",
  remove_saved: "Accessible button name, verb: remove a product from the wishlist.",
  rated: "Starts a rating read aloud: \"Rated 4.5 out of 5\".",
  out_of_five: "Ends a rating read aloud: \"Rated 4.5 out of 5\".",
  rating_from: "Between an average rating and a review count: \"4.8 from 120 reviews\".",
  based_on: "Before a review count: \"Based on 120 reviews\".",
  review_on: "Before a product name on a review: which product it is about.",
  reply_from: "Followed by the shop's name: the shop's reply to a review.",
  photo_from: "Followed by a person's name: alt text of a review photo.",
  your_name: "Form field label: the reviewer's name.",
  review_title: "Form field label: the title of a review.",
  post_review: "Button, verb: publish the review.",
  star: "Follows the number 1: \"1 star\".",
  stars: "Follows a number other than 1: \"4 stars\".",
  review: "Follows the number 1: \"1 review\".",
  reviews: "Follows a number other than 1: \"12 reviews\".",
  breadcrumb: "Accessible name of the breadcrumb navigation.",
  email_me_news_from: "Checkbox label, followed by the shop's name: the shopper agrees to get the shop's newsletter.",
}

/** The checkout's sentences whose meaning a bare label does not carry, by their English. */
const CHECKOUT_NOTES: Record<string, string> = {
  "Pay {shop}": "Small heading above the order total, a verb: pay the seller named {shop}. Never a noun such as pay or wage.",
  "Pay {amount}": "The main payment button, a verb with the amount: pay {amount} now.",
  "Place order": "The main button, verb: place the order (cash on delivery, nothing is charged online).",
  "Get it free": "The main button for a free order, verb: get it for free.",
  "Apply": "Button, verb: apply the discount code typed beside it.",
  "Remove": "Button, verb: remove this item from the order.",
  "Remove {title}": "Accessible button name, verb: remove the product {title} from the order.",
  "Edit": "Button, verb: change this item's options.",
  "Choose": "First, empty choice of a dropdown, verb: choose an option.",
  "Done": "Button, verb: finish changing an item's options.",
  "Free": "Shown instead of a price: costs nothing.",
  "Other": "Tip option button: another amount of the buyer's choosing.",
  "None": "Tip option button: no tip.",
  "Tip": "Noun: the tip the buyer added, a line beside an amount.",
  "Amount": "Placeholder of a number field: the tip amount.",
  "Total": "Label beside an amount: the sum to pay.",
  "Total due": "Label beside an amount: the sum the buyer pays now.",
  "Subtotal": "Label beside an amount: the sum before shipping and taxes.",
  "Tax": "Label beside an amount: tax charged.",
  "Discount": "Label beside an amount: money taken off.",
  "Shipping": "Label beside an amount: the shipping cost.",
  "Pickup": "Label beside an amount: collecting the order in person.",
  "Delivery": "Section heading: how the order reaches the buyer.",
  "Ship": "Toggle option: have the order delivered.",
  "Pick up": "Toggle option: collect the order in person.",
  "Card": "Payment option: pay by card.",
  "Open": "Label before a pickup point's opening hours.",
  "Details": "Button on a phone: show the order's details.",
  "Hide details": "Button on a phone: hide the order's details.",
  "Back": "Link, verb: go back.",
  "Back to {site}": "Link, verb: go back to the shop named {site}.",
  "Cancel": "Button in a small form, verb: close it without doing anything.",
  "Close": "Button, verb: close this panel.",
  "Send": "Button, verb: send the message.",
  "Resend": "Button, verb: send the receipt email again.",
  "Copy": "Button, verb: copy the email address.",
  "Copied": "Short notice after pressing Copy: the address was copied.",
  "Print": "Button, verb: print the receipt.",
  "Download": "Button, verb: download the file.",
  "Downloaded": "Status of a file: already downloaded.",
  "Preparing": "Status of a file being prepared for download.",
  "Processing": "Status: the order or payment is being processed.",
  "Course": "Noun: an online course the buyer bought.",
  "Yours": "Badge on an item the buyer already owns.",
  "Seller": "Noun: the person or business selling, used when their name is missing.",
  "Settings": "Link to the buyer's account settings, inside a sentence.",
  "Language": "Accessible name of the language selector.",
  "Option": "Accessible name of a product option selector.",
  "Standard": "Name of a shipping rate: the usual one.",
  "Returns": "Section heading: returning items from this order.",
  "Items": "Section heading: the products in this order.",
  "Invoice": "Accessible name of the section asking for invoice details for a business.",
  "Powered by": "Followed by the payment provider's logo (Stripe): \"Powered by Stripe\".",
  "Terms": "Footer link: the shop's terms.",
  "Privacy": "Footer link: the shop's privacy policy.",
  "for {shop}": "Follows \"Add a tip\": a tip for the shop named {shop}.",
  "{amount} off": "A discount shown as an amount taken off the price.",
  "Est. {day}": "Short: the estimated delivery date.",
  "Delivered": "Status of an order or a parcel: it has been delivered.",
  "Confirmed": "Status of an order: confirmed.",
  "Shipped": "Status of an order or a parcel: sent out.",
  "Picked up": "Status of an order: the buyer collected it.",
  "Cancelled": "Status of an order or a parcel: cancelled.",
  "Refunded": "Status: the money was given back.",
  "Ready for pickup": "Status of an order: ready to be collected.",
  "Your price": "Label: the amount the buyer chose to pay (pay what you want).",
  "Your price · Qty 1": "Under a product: the buyer's chosen price, quantity one.",
  "Qty {quantity}": "Short: quantity, followed by a number.",
  "Max {count}": "Short: the most one order can hold.",
  "Only {count} left": "Stock note: just {count} remain.",
  "One fewer {title}": "Accessible button name, verb: lower the quantity of {title} by one.",
  "One more {title}": "Accessible button name, verb: raise the quantity of {title} by one.",
  "Change to {count}": "Accessible button name, verb: set the quantity to {count}.",
  "Sold out": "Badge: no stock left.",
  "Checkout is closed": "Heading: the shop is not taking orders right now.",
  "Wrong address?": "Link about the email address the receipt goes to: was it typed wrong?",
}

/** The sentences with a note of their own, for the tests. */
export const NOTED_CHECKOUT_SENTENCES = Object.keys(CHECKOUT_NOTES)

const CHECKOUT_BY_KEY = new Map(Object.entries(CHECKOUT_NOTES).map(([s, n]) => [`checkout:${sourceHash(s)}`, n]))

/**
 * The note for one of Storelib's own words, by its key and English: what it
 * is, where it stands, and whether it is a verb. Undefined for a store's own
 * text, which has no note.
 */
export function builtInNote(key: string, source: string): string | undefined {
  if (key.startsWith("ui:")) {
    const word = key.slice(3) as UiWord
    if (!(word in UI_WORDS)) return UI_DEFAULT
    const note = UI_NOTES[word]
    return note ? `${UI_DEFAULT} ${note}` : UI_DEFAULT
  }
  if (key.startsWith("checkout:")) {
    const note = CHECKOUT_BY_KEY.get(key) ?? CHECKOUT_NOTES[source]
    return note ? `${CHECKOUT_DEFAULT} ${note}` : CHECKOUT_DEFAULT
  }
  if (key.startsWith("email:")) return EMAIL_DEFAULT
  if (key.startsWith("tw:")) return UI_DEFAULT
  return undefined
}
