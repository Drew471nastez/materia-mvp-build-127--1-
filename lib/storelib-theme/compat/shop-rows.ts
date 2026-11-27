/**
 * ===========================================================================
 *  "YOU MAY ALSO LIKE" AND "RECENTLY VIEWED" NEVER SHOW THE SAME PRODUCT (round 67)
 * ===========================================================================
 * The owner, on liam-bailey.storelib.com: a product page showed "You may
 * also like" and "Recently viewed" one above the other with the same single
 * product in each (Gym Beginner Program). A shop of two products has one
 * other product, which is the one the visitor saw before this one, so both
 * rows drew it.
 *
 * Written into the head of every page an installed theme draws (theme.ts,
 * beside ./shop-calm.ts), so it reaches every installed Materia store and
 * every imported theme without a theme release:
 *
 *   - Recently viewed never shows the product of the page it is on, nor a
 *     product the page's related row ("You may also like", product
 *     recommendations) already shows. A product is known by its address
 *     (/products/<handle>), which every theme's card links to.
 *   - A Recently viewed row with nothing new left is hidden whole, heading
 *     and padding included (its section), as when nothing was viewed yet.
 *   - It waits for the related row: Recently viewed stays out of the page
 *     until the related row has drawn its cards (or has none, or HOLD_MS has
 *     passed), so a card is never shown and then taken away.
 *
 * Self contained (written into pages as its own source).
 */

/** The longest Recently viewed waits for the related row to draw its cards. */
export const ROWS_HOLD_MS = 4000

export function installShopRows(doc: Document, win: Window): void {
  var w = win as Window & { __slShopRows?: unknown }
  if (w.__slShopRows) return
  w.__slShopRows = true
  var RV = '[data-r7k-root="recently-viewed"],[data-section-type="recently-viewed"]:not(.shopify-section),recently-viewed-products,.recently-viewed'
  var REL = 'product-recommendations,[data-section-type="related-products"],.sec__related-product,[data-section-type*="recommendation"]'
  var LOADING = '[class*="skeleton"],.r7rv__ghost,[aria-busy="true"]'
  var root = doc.documentElement
  var held = true
  var pathHandle = function (href: string | null): string {
    if (!href) return ""
    try {
      var m = new URL(href, doc.baseURI).pathname.match(/\/products\/([^/?#]+)/)
      return m ? decodeURIComponent(m[1]).toLowerCase() : ""
    } catch {
      return ""
    }
  }
  var current = pathHandle(doc.location ? doc.location.href : "")
  try {
    var css = doc.createElement("style")
    css.setAttribute("data-sl-shop-rows", "")
    /* Held: Recently viewed takes no space until the related row has drawn. */
    css.textContent = "html.sl-rows-hold :is(" + RV + "){display:none!important}html.sl-rows-hold .shopify-section:has(>:is(" + RV + ")){display:none!important}"
    ;(doc.head || root).appendChild(css)
    root.classList.add("sl-rows-hold")
  } catch {
    return
  }

  var relatedSettled = function (): boolean {
    var rel = doc.querySelectorAll(REL)
    for (var i = 0; i < rel.length; i++) {
      var r = rel[i] as HTMLElement
      if (r.closest(RV)) continue
      var box = r.getBoundingClientRect()
      var gone = box.width === 0 && box.height === 0
      if (!gone && r.querySelector(LOADING) && !r.querySelector('a[href*="/products/"]')) return false
    }
    return true
  }
  var shownElsewhere = function (): Record<string, boolean> {
    var out: Record<string, boolean> = {}
    if (current) out[current] = true
    var rel = doc.querySelectorAll(REL)
    for (var i = 0; i < rel.length; i++) {
      if (rel[i].closest(RV)) continue
      var box = (rel[i] as HTMLElement).getBoundingClientRect()
      if (box.width === 0 && box.height === 0) continue
      var links = rel[i].querySelectorAll('a[href*="/products/"]')
      for (var j = 0; j < links.length; j++) {
        var h = pathHandle(links[j].getAttribute("href"))
        if (h) out[h] = true
      }
    }
    return out
  }
  /* The card a product link sits in: the row's direct child holding it. */
  var cardOf = function (link: Element, track: Element): Element | null {
    var at: Element | null = link
    while (at && at.parentElement !== track) at = at.parentElement
    return at
  }
  var tidy = function () {
    if (held) return
    var skip = shownElsewhere()
    var rows = doc.querySelectorAll(RV)
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] as HTMLElement
      var links = row.querySelectorAll('a[href*="/products/"]')
      for (var j = 0; j < links.length; j++) {
        var h = pathHandle(links[j].getAttribute("href"))
        if (!h || !skip[h]) continue
        var track = links[j].closest("ul,ol,[data-r7k-track],.swiper-wrapper,[class*=grid],[class*=track]") || links[j].parentElement
        var card = track ? cardOf(links[j], track) : null
        if (card && card.parentNode) card.parentNode.removeChild(card)
      }
      var busy = row.querySelector(LOADING)
      var left = row.querySelector('a[href*="/products/"]')
      var section = row.closest(".shopify-section") as HTMLElement | null
      if (!left && !busy) {
        if (!row.hidden) row.hidden = true
        if (section && section.style.display !== "none") {
          section.style.display = "none"
          section.setAttribute("data-sl-rows-hid", "")
        }
      } else if (left && section && section.hasAttribute("data-sl-rows-hid")) {
        /* The row has cards again (a product viewed in another tab): shown again. */
        section.removeAttribute("data-sl-rows-hid")
        section.style.display = ""
      }
    }
  }
  var release = function () {
    if (!held) return
    held = false
    tidy()
    root.classList.remove("sl-rows-hold")
  }
  var check = function () {
    if (held && relatedSettled()) release()
    else tidy()
  }
  var watch = function () {
    if (!doc.querySelector(RV)) {
      release()
      return
    }
    check()
    if (typeof MutationObserver === "function") {
      var queued = false
      new MutationObserver(function () {
        if (queued) return
        queued = true
        ;(win.requestAnimationFrame || win.setTimeout)(function () {
          queued = false
          check()
        })
      }).observe(doc.body || root, { childList: true, subtree: true })
    }
    win.setTimeout(release, 4000) /* ROWS_HOLD_MS: this runs as its own source, so the number is written here. */
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", watch)
  else watch()
}

/** The same, for a page's <head>. */
export const SHOP_ROWS_HEAD = `<script data-sl-shop-rows>try{(${installShopRows.toString()})(document,window)}catch(e){}</script>`
