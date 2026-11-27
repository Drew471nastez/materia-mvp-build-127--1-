/**
 * ===========================================================================
 *  PRODUCT CARDS AND PRODUCT PAGES THAT STAY STILL AND IN PROPORTION (round 66)
 * ===========================================================================
 * The owner, on live stores (liam-bailey.storelib.com, the Northpaper
 * template): two product cards were each 850 by 1000 on a 1920 screen, the
 * product page's picture was a full screen tall, a card's picture zoomed and
 * swapped under the pointer, every card had a wishlist heart on a store with
 * no wishlist, and the Northpaper logo in the footer was squashed.
 *
 * A website keeps the theme files it was installed with (js-fixes.ts), so a
 * fix to theme-packages/materia alone would reach a store only on a theme
 * release. This is written into the head of every page an installed theme
 * draws (theme.ts renderDocument), live and on the builder's canvas, so it
 * reaches every installed Materia store and every imported theme at once.
 *
 *  1. CARD SIZE. A card is never wider than SHOP_CARD_MAX_PX, whatever the
 *     row setting or the number of products: the size a card has at three
 *     to four across on a computer (Aesop, Allbirds and Everlane draw theirs
 *     330 to 420 wide). Where the grid's column count is a variable the
 *     columns themselves are capped, so the gaps stay the theme's own
 *     (Materia's Products listing, the collection page, .grid-cols);
 *     elsewhere the card is, centred in its cell (a grid) or packed at the
 *     row's start (a flex row, Dawn's product grid).
 *
 *  2. PRODUCT PAGE PICTURE. The main picture is never taller than the
 *     window below the header (SHOP_GALLERY_MAX_H) and the gallery is as
 *     wide as that picture at its frame's shape, centred in its column. The
 *     frame's shape is read from the first slide's --aspect-ratio (Materia
 *     writes it there, not on the gallery), so nothing is measured and
 *     nothing moves after the first paint. Thumbnails keep their layout.
 *
 *  3. NOTHING MOVES UNDER THE POINTER. A card's picture does not zoom, pan,
 *     tilt, lift or swap to its second picture; the card's buttons fade in
 *     where they are. A colour, an underline or a shadow may still change.
 *     The gallery's magnifier (Drift) is not shown; a click still opens the
 *     lightbox.
 *
 *  4. A WISHLIST HEART ONLY ON A STORE WITH A WISHLIST. theme.ts turns the
 *     theme's heart settings off when the header has no wishlist icon, and
 *     marks <html data-sl-wishlist="off">; this hides any heart a section
 *     draws on its own setting (the product page's Wishlist button).
 *
 *  5. A LOGO KEEPS ITS SHAPE. A picture setting whose file Storelib cannot
 *     read is an image object 1600 by 1600 (image-size.ts), so Materia's
 *     footer logo was written width="160" height="160" and drawn square.
 *     A picture in a header or footer takes its height from its width at its
 *     own shape unless the theme's stylesheet sizes it (these rules weigh
 *     nothing, :where, so any rule of the theme's wins; only the width and
 *     height attributes lose). A logo is drawn whole in whatever box it is
 *     given (object-fit: contain). A lazy logo (sizes="auto") is laid out by
 *     its attributes whatever the stylesheet says, so once its file is in it
 *     is given the file's shape (installLogoShape).
 *
 *  6. WISHLIST (N) IN A HEADER OF WORDS (round 67). Materia's "Show actions
 *     as text" draws Wishlist as a label before the icon's count, and the
 *     count sits in the icon's <h-count class="fs-0">, a box at font size 0,
 *     whose size it inherits: a heart pressed, the count went to 1 and stayed
 *     invisible, so the header read "Search Account Wishlist Cart (0)". The
 *     box takes the label's size here, and the count reads "Wishlist (1)" as
 *     the cart's reads "Cart (1)", kept current by the theme's own script on
 *     a press, in another tab and on load.
 *
 *  7. A COUNT BUBBLE'S NUMBER FROM ITS OWN FILL (round 67). Materia works the
 *     number's colour out from the bubble (header-section.css --cb-auto):
 *     white under a luminance of 0.179, where white and black have the same
 *     WCAG ratio, else black, which put a black number on Redline's intense
 *     red (#f01a10, luminance 0.19). People read small bold figures on a
 *     saturated colour as perceptual contrast (APCA) says, whose crossing is
 *     near 0.31: white on red, orange, blue and mid grey, black on yellow,
 *     light green, pastels and white. Only the line moves; a colour the
 *     creator picked for the number, when it reads, still wins (--cb-text).
 *
 *  8. A SHORT RELATED ROW. A shop of two products has one product to
 *     recommend: its card sits at the row's start, under a heading at the
 *     start, or in the middle under a centred one, never at the start under
 *     a centred heading. Recently viewed never repeats it (./shop-rows.ts).
 */

/** The widest a product card is drawn, in CSS pixels. */
export const SHOP_CARD_MAX_PX = 400

/** The tallest a product page's main picture is drawn: the window below a header, a breadcrumb and the page's top padding (they come to 120 to 230px across Materia's templates), at most 960. */
export const SHOP_GALLERY_MAX_H = "min(calc(100svh - 240px), 960px)"

/** The frame shapes Materia writes (Theme settings > Product cards > Image ratio, a custom one, a picture's own). */
const FRACTIONS = ["1/1", "3/4", "4/3", "4/5", "5/4", "2/3", "3/2", "16/9", "9/16", "16/10", "10/16", "2/1", "1/2", "5/7", "7/5", "3/5", "5/3"]

/*
  The gallery's shape from its first slide's own --aspect-ratio. "Adapt" writes the picture's own
  ratio as a decimal (0.7, 1.7777): matched by its first two digits, close enough for a width cap
  (the picture is drawn whole in its frame, lib/images/pic-fit.ts).
*/
function galleryRatioRules(): string {
  const first = (v: string) =>
    `media-gallery:has(:is(.swiper-wrapper,.grid-cols,.grid)>.media-gallery__image:first-child:is([style*="--aspect-ratio: ${v};"],[style$="--aspect-ratio: ${v}"],[style*="--aspect-ratio:${v};"],[style$="--aspect-ratio:${v}"]))`
  const out: string[] = []
  for (let tenths = 3; tenths <= 29; tenths++) {
    const d = (tenths / 10).toFixed(1)
    out.push(`media-gallery:has(:is(.swiper-wrapper,.grid-cols,.grid)>.media-gallery__image:first-child[style*="--aspect-ratio: ${d}"]){--sl-mg-r:${d}}`)
  }
  for (const f of FRACTIONS) out.push(`${first(f)}{--sl-mg-r:${f}}`)
  out.push(`${first("1")}{--sl-mg-r:1}`)
  /* A square gallery (Main product > Square media) is square whatever its pictures. */
  out.push("media-gallery[data-square]{--sl-mg-r:1}")
  return out.join("")
}

/** Where a picture is a logo, or sits beside one. */
const LOGO_PLACES = "header img,footer img,.footer img,.header img,.store-info-content img,[class*=logo] img,img[class*=logo]"

/* The cards' hover effects that move (Materia's Product cards > Hover effect, Dawn's image zoom and lift). */
const STILL = "transform:none!important;translate:none!important;scale:none!important;rotate:none!important"

export const SHOP_CALM_CSS = [
  `:root{--sl-card-max:${SHOP_CARD_MAX_PX}px;--sl-gallery-h:${SHOP_GALLERY_MAX_H}}`,

  /* 1. Card size: columns capped where the grid's count is a variable, the card itself elsewhere. */
  "@media (min-width:768px){.pl-grid:has(>.product-item){grid-template-columns:repeat(var(--pl-cols,4),minmax(0,var(--sl-card-max)))!important}}",
  ".pl[data-align=center] .pl-grid{justify-content:center}.pl[data-align=right] .pl-grid{justify-content:end}",
  "@container (min-width:860px){.facets-grid:has(>.grid__item>.product-item){grid-template-columns:repeat(var(--cols-desktop,4),minmax(0,var(--sl-card-max)))!important}}",
  ".grid-cols:has(>.product-item){grid-template-columns:repeat(var(--col),min(var(--sl-card-max),calc((100% - var(--gap,0px) * (var(--col) - 1)) / var(--col))))!important}",
  ":is(.pg__grid,.mlook__side,.search-results-list)>.product-item{max-width:var(--sl-card-max);justify-self:center;width:100%}",
  ":is(.flex-cols,.products-grid__items:not(.swiper-wrapper))>.product-item,.r7rv__item{max-width:var(--sl-card-max)}",
  /* Dawn and the themes built on it: a flex row of list items. */
  "ul.product-grid>li.grid__item,.product-grid>.grid__item:has(.card-wrapper){max-width:var(--sl-card-max)}",

  /* 2. The product page's picture: as wide as the window's height allows at its frame's shape. */
  galleryRatioRules(),
  "media-gallery>zoom-action>slide-with-thumbs:not(.thumbnail_left),media-gallery>slide-with-thumbs:not(.thumbnail_left),media-gallery slide-with-thumbs.thumbnail_left>.media-main-swiper{max-width:calc(var(--sl-gallery-h) * (var(--sl-mg-r,1)));margin-inline:auto}",
  "media-gallery :is(.grid-cols,.grid)>.media-gallery__image[style*=--aspect-ratio]{max-width:calc(var(--sl-gallery-h) * (var(--aspect-ratio)));justify-self:center;width:100%;margin-inline:auto}",
  ".drift-zoom-pane,.drift-bounding-box{display:none!important}",

  /* 3. Nothing on a card moves under the pointer or the finger. */
  `.product-item .hover-effect:is(:hover,[data-pc-press]),.product-item :is(.hover-effect :is(img,picture,video,.placeholder-image),.product__media :is(img,picture),.product-item__media--ratio :is(img,picture)){${STILL}}`,
  ".product-item .product__media.show_secondary>.secondary-image,.product-item .hover-effect :is(.secondary-image,.hover-effect__alt){opacity:0!important;visibility:hidden!important}",
  ".product-item .product__media.show_secondary>.first-image,.product-item .hover-effect .first-image{opacity:1!important}",
  `.product-item .pc-actions .pc-action,.product-item .pc-form--media{${STILL}}`,
  /* Dawn: Enable image zoom on hover, the second picture, the card lift. */
  `.card-wrapper .media.media--hover-effect>img{${STILL}}`,
  ".card-wrapper .media.media--hover-effect>img+img{opacity:0!important}.card-wrapper .media.media--hover-effect>img:first-child:not(:only-child){opacity:1!important}",
  `.card-wrapper :is(.card,.card__inner,.card__media,.card__media img){${STILL}}`,

  /* 4. No wishlist on this store: no heart anywhere. */
  'html[data-sl-wishlist=off] :is(button-wishlist,.product-item__button-wishlist,.pc-heart,.product-form__wishlist,[data-wishlist-button],.qv__wish){display:none!important}',

  /* 6. Wishlist (N) in a header of words: the count's box at the label's size, not the icon's 0. */
  "@media (min-width:1025px){:is(#materia-header,.shopify-section.section-header) .header[data-actions-text] .header__action .header__wishlist h-count{display:inline-flex!important;align-items:center;position:static!important;font-size:inherit!important;line-height:inherit!important;order:2}}",

  /* 7. A count bubble's number from its own fill: the line at a luminance of 0.31 (one class more than Materia's rule). */
  "@supports (color:color(from red srgb-linear r g b)){html body .h-count.h-count:not(.header-action-text .h-count),html body .wishlist-count-header.wishlist-count-header{--cb-auto:clamp(0,(0.31 - (0.2126 * r + 0.7152 * g + 0.0722 * b)) * 100000,1)}}",

  /* 8. A related row with fewer cards than its columns sits under its heading: centred under a centred heading (round 67). */
  "[data-section-type=related-products]:has(.section__header.text-center) .products-grid__items:not(.swiper-wrapper),.pl[data-align=center] .products-grid__items:not(.swiper-wrapper){justify-content:center}",

  /* 5. A logo keeps its shape. */
  `:where(${LOGO_PLACES}){height:auto}`,
  ":where([class*=logo] img,img[class*=logo],.store-info-content img){object-fit:contain}",
].join("")

/*
  A LOGO DRAWN AT ITS FILE'S SHAPE, ALSO WHEN IT LOADS LAZILY. A lazy picture with sizes="auto" is laid out with
  size containment (the browser's own !important rule, which no stylesheet can undo), so its shape comes from its
  width and height attributes, never from the file. Written 160 by 160 from the image object's unknown size, the
  Northpaper logo was a square. Once a logo's file has loaded and its attributes say another shape, it is given
  the file's (aspect-ratio). Self contained, like lib/images/pic-fit.ts.
*/
export function installLogoShape(doc: Document): void {
  var SEL = "header img,footer img,.footer img,.header img,.store-info-content img,[class*=logo] img,img[class*=logo]"
  var fix = function (i: HTMLImageElement) {
    try {
      if (!i.naturalWidth || !i.naturalHeight || !i.matches(SEL)) return
      var w = Number(i.getAttribute("width"))
      var h = Number(i.getAttribute("height"))
      if (!w || !h) return
      if (Math.abs(w / h / (i.naturalWidth / i.naturalHeight) - 1) > 0.02) i.style.aspectRatio = i.naturalWidth + " / " + i.naturalHeight
    } catch {
      /* Left as the theme drew it. */
    }
  }
  doc.addEventListener(
    "load",
    function (e) {
      var t = e.target as HTMLElement | null
      if (t && t.tagName === "IMG") fix(t as HTMLImageElement)
    },
    true,
  )
  var all = function () {
    for (var k = 0; k < doc.images.length; k++) if (doc.images[k].complete) fix(doc.images[k])
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", all)
  else all()
}

/** The same, for a page's <head>. */
export const SHOP_CALM_HEAD = `<style data-sl-shop-calm>${SHOP_CALM_CSS}</style><script data-sl-logo-shape>try{(${installLogoShape.toString()})(document)}catch(e){}</script>`

/** What a header section says about the store's wishlist: an icon setting's value (or its default). Null when it has none. */
export function headerWishlistOn(
  headers: readonly { settings?: Record<string, unknown> | null; schema?: { settings?: unknown } | null; disabled?: boolean; hidden?: boolean }[],
): boolean | null {
  let seen = false
  for (const h of headers) {
    if (h.disabled || h.hidden) continue
    const defs = Array.isArray(h.schema?.settings) ? (h.schema!.settings as { id?: unknown; type?: unknown; default?: unknown }[]) : []
    const ids = new Set<string>()
    for (const d of defs) if (d && typeof d.id === "string" && d.type === "checkbox" && /wishlist/i.test(d.id) && /icon|show|enable/i.test(d.id)) ids.add(d.id)
    for (const [k, v] of Object.entries(h.settings ?? {})) if (/wishlist/i.test(k) && /icon/i.test(k) && typeof v === "boolean") ids.add(k)
    for (const id of ids) {
      seen = true
      const v = h.settings?.[id]
      const def = defs.find((d) => d && d.id === id)?.default
      if ((typeof v === "boolean" ? v : def !== false) === true) return true
    }
  }
  return seen ? false : null
}
