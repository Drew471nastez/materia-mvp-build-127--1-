/**
 * ===========================================================================
 *  THE MATERIA STORE, AS THE OWNER'S LIVE THEME HAS IT (round 1023, part 2)
 * ===========================================================================
 * tests/fixtures/shopify-materia is the shape of the owner's Materia
 * storefront with one theme setting. The store itself has more around its
 * sections, and that is where the canvas froze on landing and reloaded on
 * edits, so this lays it over the fixture's files (a JSZip of them):
 *
 *   THEME SETTINGS OF EVERY TYPE, printed where store themes print them:
 *   CSS variables in the layout's <style>, a font's @font-face and preload,
 *   classes and data on <html> and <body>, a favicon link, a <style> that is
 *   there only while a switch is on, a cookie banner and a back to top
 *   button in the layout's own markup (not a section), a script in the head
 *   that only loads while a switch is on, the theme's settings as JSON in an
 *   inline script its JavaScript reads once at start, and global settings a
 *   section reads (the social links in the announcement bar)
 *
 *   WHAT THE STORE SHOWS: the announcement bar with arrows and social icons
 *   (the fixture's top bar), a currency and language selector, the slideshow,
 *   a cookie banner with Allow Cookies, and "Cart drawer (live preview)" in
 *   the Overlay group, as its page list shows it
 *
 *   SCENARIOS (`scenario`): what a store theme's scripts do on the first
 *   paint, each a way the canvas can be held from the moment it opens:
 *     consent   the cookie banner holds the page (body.overflow-hidden) until
 *               Allow Cookies is pressed, as consent themes do
 *     loader    a preloader of the theme's own name (.loader-overlay, not one
 *               the canvas knows), the page held under body.is-loading until
 *               an event the theme's own chain fires, which never comes
 *     drawer    the cart drawer section opens itself in a frame (it takes a
 *               frame for Shopify's theme editor) and holds the page; its
 *               panel waits for a class the editor would add, so nothing of
 *               it is seen
 *     smooth    a smooth scroll library (Lenis's shape): every wheel is the
 *               library's, it is stopped until the theme says it has loaded,
 *               and stopped it holds <html> and moves nothing
 *     backdrop  a fixed picture behind the whole page (a grain), with the
 *               consent hold: something fixed and painted the size of the
 *               screen, under the page
 *     banner    the consent hold with a tall banner: a quarter of the canvas
 *   Several at once: "consent,loader".
 *
 * Used by scripts/canvas-probe-kit.mjs (importedTheme({ store: true })) and
 * tests/editor-freeze2.test.ts. Text in, text out: nothing here runs a theme.
 */

/** Every type a theme setting can have, as Shopify documents them, with the id this store gives each. */
export const STORE_SETTINGS = [
  { name: "Theme colors", settings: [
    { type: "color", id: "color_background", label: "Background", default: "#ffffff" },
    { type: "color", id: "color_text", label: "Text", default: "#1a1a1a" },
    { type: "color_background", id: "gradient_accent", label: "Accent gradient", default: "linear-gradient(90deg, #111111, #444444)" },
    { type: "color_scheme_group", id: "color_schemes", definition: [
      { type: "color", id: "background", label: "Background", default: "#ffffff" },
      { type: "color", id: "text", label: "Text", default: "#111111" },
      { type: "color", id: "button", label: "Button", default: "#111111" },
    ], role: { background: "background", text: "text", primary_button: "button", on_primary_button: "background", primary_button_border: "button", secondary_button: "background", on_secondary_button: "text", secondary_button_border: "text", icons: "text", links: "button" } },
    { type: "color_scheme", id: "header_scheme", label: "Header colors", default: "scheme-1" },
  ] },
  { name: "Typography", settings: [
    { type: "font_picker", id: "type_header_font", label: "Headings", default: "assistant_n4" },
    { type: "font_picker", id: "type_body_font", label: "Body", default: "assistant_n4" },
    { type: "range", id: "heading_scale", label: "Heading size", min: 100, max: 150, step: 5, unit: "%", default: 100 },
    { type: "select", id: "text_transform", label: "Headings case", options: [{ value: "none", label: "As written" }, { value: "uppercase", label: "Uppercase" }], default: "none" },
  ] },
  { name: "Layout", settings: [
    { type: "range", id: "page_width", label: "Page width", min: 1000, max: 1600, step: 100, unit: "px", default: 1200 },
    { type: "select", id: "layout_style", label: "Layout", options: [{ value: "full", label: "Full width" }, { value: "boxed", label: "Boxed" }], default: "full" },
    { type: "radio", id: "card_style", label: "Product cards", options: [{ value: "standard", label: "Standard" }, { value: "card", label: "Card" }], default: "standard" },
    { type: "number", id: "products_per_row", label: "Products per row", default: 4 },
    { type: "text_alignment", id: "heading_alignment", label: "Headings", default: "left" },
    { type: "checkbox", id: "animations_reveal_on_scroll", label: "Reveal sections on scroll", default: true },
  ] },
  { name: "Buttons", settings: [
    { type: "range", id: "buttons_radius", label: "Corner radius", min: 0, max: 40, step: 1, unit: "px", default: 6 },
    { type: "checkbox", id: "buttons_shadow", label: "Shadow", default: false },
  ] },
  { name: "Social media", settings: [
    { type: "url", id: "social_facebook_link", label: "Facebook", default: "https://facebook.com/materia" },
    { type: "text", id: "social_instagram_link", label: "Instagram", default: "https://instagram.com/materia" },
  ] },
  { name: "Cookie banner", settings: [
    { type: "checkbox", id: "cookie_enabled", label: "Show the cookie banner", default: true },
    { type: "richtext", id: "cookie_text", label: "Text", default: "<p>We use cookies to improve your experience.</p>" },
    { type: "text", id: "cookie_button", label: "Button", default: "Allow Cookies" },
  ] },
  { name: "Cart", settings: [
    { type: "select", id: "cart_type", label: "Cart type", options: [{ value: "drawer", label: "Drawer" }, { value: "page", label: "Page" }], default: "drawer" },
    { type: "textarea", id: "cart_note", label: "Cart note", default: "Free shipping over 49 euro" },
  ] },
  { name: "Search", settings: [
    { type: "checkbox", id: "predictive_search_enabled", label: "Search suggestions", default: false },
  ] },
  { name: "Favicon", settings: [
    { type: "image_picker", id: "favicon", label: "Favicon" },
    { type: "checkbox", id: "back_to_top", label: "Back to top button", default: false },
  ] },
  { name: "Featured", settings: [
    { type: "inline_richtext", id: "footer_tagline", label: "Footer tagline", default: "Made in <em>Milano</em>" },
    { type: "liquid", id: "custom_liquid", label: "Custom Liquid", default: "" },
    { type: "collection", id: "featured_collection", label: "Collection" },
    { type: "product", id: "featured_product", label: "Product" },
    { type: "page", id: "policy_page", label: "Page" },
    { type: "blog", id: "news_blog", label: "Blog" },
    { type: "collection_list", id: "footer_collections", label: "Collections", limit: 3 },
    { type: "product_list", id: "footer_products", label: "Products", limit: 3 },
    { type: "video", id: "brand_video", label: "Video" },
  ] },
  { name: "Custom code", settings: [
    { type: "html", id: "custom_head_html", label: "In the head", default: "" },
    { type: "video_url", id: "intro_video", label: "Intro video", accept: ["youtube", "vimeo"] },
    { type: "link_list", id: "footer_menu", label: "Footer menu", default: "footer" },
  ] },
]

/** The value each setting is changed to by the probes and the test: another value of the same type. */
export const STORE_CHANGES = {
  color_background: "#f4efe6",
  color_text: "#202a44",
  gradient_accent: "linear-gradient(90deg, #aa3355, #3355aa)",
  color_schemes: { "scheme-1": { settings: { background: "#fff7e8", text: "#222222", button: "#aa3355" } }, "scheme-2": { settings: { background: "#111111", text: "#ffffff", button: "#ffffff" } } },
  header_scheme: "scheme-2",
  type_header_font: "playfair_display_n7",
  type_body_font: "lora_n4",
  heading_scale: 130,
  text_transform: "uppercase",
  page_width: 1400,
  layout_style: "boxed",
  card_style: "card",
  products_per_row: 3,
  heading_alignment: "center",
  animations_reveal_on_scroll: false,
  buttons_radius: 22,
  buttons_shadow: true,
  social_facebook_link: "https://facebook.com/materia-store",
  social_instagram_link: "https://instagram.com/materia-store",
  cookie_enabled: false,
  cookie_text: "<p>Cookies keep your cart between visits.</p>",
  cookie_button: "Accept",
  cart_type: "page",
  cart_note: "Shipped in 24 hours",
  predictive_search_enabled: true,
  favicon: "https://example.invalid/favicon.png",
  back_to_top: true,
  custom_head_html: '<meta name="materia-custom" content="on">',
  intro_video: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  footer_menu: "main-menu",
  footer_tagline: "Fatto a <strong>Torino</strong>",
  custom_liquid: '<p class="custom-liquid">Spedizione in 24 ore</p>',
  featured_collection: "all",
  featured_product: "linen-shirt",
  policy_page: "about",
  news_blog: "news",
  footer_collections: ["all"],
  footer_products: ["linen-shirt"],
  brand_video: "https://example.invalid/brand.mp4",
}

export const SCENARIOS = ["consent", "loader", "drawer", "smooth", "backdrop", "banner"]

/** The store's files laid over the fixture's, in `zip` (a JSZip). `scenario`: a comma separated list of SCENARIOS, or "". */
export async function materiaStore(zip, { scenario = "" } = {}) {
  const on = new Set(String(scenario).split(",").map((s) => s.trim()).filter(Boolean))
  if (on.has("banner")) on.add("consent")
  if (on.has("backdrop")) on.add("consent")

  /* ── config: every type, and the values the store saved ── */
  const schema = JSON.parse(await zip.file("config/settings_schema.json").async("string"))
  zip.file("config/settings_schema.json", JSON.stringify([...schema, ...STORE_SETTINGS], null, 2))
  const data = JSON.parse(await zip.file("config/settings_data.json").async("string"))
  const current = { ...data.current }
  for (const g of STORE_SETTINGS) for (const s of g.settings) if (s.default !== undefined && s.type !== "color_scheme_group") current[s.id] = s.default
  current.color_schemes = { "scheme-1": { settings: { background: "#ffffff", text: "#111111", button: "#111111" } }, "scheme-2": { settings: { background: "#1a1a1a", text: "#f5f5f5", button: "#f5f5f5" } } }
  zip.file("config/settings_data.json", JSON.stringify({ current }, null, 2))

  /* ── the layout: settings printed in the head, on <html> and <body>, and in markup around the sections ── */
  let layout = await zip.file("layout/theme.liquid").async("string")
  layout = layout.replace("<html lang=\"it\">", `<html lang="it" class="no-js{% if settings.animations_reveal_on_scroll %} has-reveal{% endif %}" style="--page-width: {{ settings.page_width }}px">`)
  layout = layout.replace("{{ content_for_header }}", `{{ content_for_header }}
    {%- if settings.favicon != blank -%}<link rel="icon" type="image/png" href="{{ settings.favicon | image_url: width: 32, height: 32 }}">{%- endif -%}
    <link rel="preload" as="font" href="{{ settings.type_header_font | font_url }}" type="font/woff2" crossorigin>
    <script>window.theme = { settings: { cartType: {{ settings.cart_type | json }}, reveal: {{ settings.animations_reveal_on_scroll | json }} } };</script>
    {%- if settings.predictive_search_enabled -%}<script src="{{ 'predictive-search.js' | asset_url }}" defer></script>{%- endif -%}
    {{ settings.custom_head_html }}
    {% style %}
      {{ settings.type_header_font | font_face: font_display: 'swap' }}
      {{ settings.type_body_font | font_face: font_display: 'swap' }}
      :root {
        --color-background: {{ settings.color_background }};
        --color-text: {{ settings.color_text }};
        --gradient-accent: {{ settings.gradient_accent }};
        --font-heading-family: {{ settings.type_header_font.family }}, {{ settings.type_header_font.fallback_families }};
        --font-body-family: {{ settings.type_body_font.family }}, {{ settings.type_body_font.fallback_families }};
        --heading-scale: {{ settings.heading_scale | divided_by: 100.0 }};
        --buttons-radius: {{ settings.buttons_radius }}px;
        --products-per-row: {{ settings.products_per_row }};
      }
      {%- for scheme in settings.color_schemes %}
      .color-{{ scheme.id }} { --scheme-bg: {{ scheme.settings.background }}; --scheme-text: {{ scheme.settings.text }}; --scheme-button: {{ scheme.settings.button }}; }
      {%- endfor %}
      body { background: var(--color-background); color: var(--color-text); font-family: var(--font-body-family); }
      h1, h2, h3 { font-family: var(--font-heading-family); text-transform: {{ settings.text_transform }}; text-align: {{ settings.heading_alignment }}; }
      .page-width { max-width: var(--page-width); margin: 0 auto; }
      .button, .hero__button { border-radius: var(--buttons-radius); }
    {% endstyle %}
    {%- if settings.buttons_shadow -%}<style>.button, .hero__button { box-shadow: 0 4px 12px rgba(0,0,0,.18); }</style>{%- endif -%}`)
  layout = layout.replace('<body class="template-{{ template.name }}">', `<body class="template-{{ template.name }} layout--{{ settings.layout_style }} cards--{{ settings.card_style }}${on.has("consent") ? " overflow-hidden" : ""}${on.has("loader") ? " is-loading" : ""}" data-cart-type="{{ settings.cart_type }}">
    ${on.has("loader") ? '<div class="loader-overlay" aria-hidden="true"><span class="loader-overlay__mark"></span></div>' : ""}${on.has("backdrop") ? '<div class="page-grain" aria-hidden="true"></div>' : ""}<a class="skip-to-content-link" href="#MainContent">Skip to content</a>`)
  layout = layout.replace("{% sections 'overlay-group' %}", `{% sections 'overlay-group' %}
    {%- if settings.cookie_enabled -%}
    <div class="cookie-banner color-scheme-1" data-cookie-banner role="region" aria-label="Cookies">
      <div class="cookie-banner__text">{{ settings.cookie_text }}</div>
      <button type="button" class="button cookie-banner__accept" data-cookie-accept>{{ settings.cookie_button }}</button>
    </div>
    {%- endif -%}
    {{ settings.custom_liquid }}
    {%- if settings.back_to_top -%}<a href="#MainContent" class="back-to-top" aria-label="Back to top">Top</a>{%- endif -%}`)
  zip.file("layout/theme.liquid", layout)

  /* ── the announcement bar reads the social links from the theme's settings; a currency and language selector ── */
  let top = await zip.file("sections/top-bar.liquid").async("string")
  top = top.replace('<a href="#" class="tb__icon">f</a>', '<a href="{{ settings.social_facebook_link }}" class="tb__icon">f</a>').replace('<a href="#" class="tb__icon">ig</a>', '<a href="{{ settings.social_instagram_link }}" class="tb__icon">ig</a>')
  top = top.replace('<div class="tb__locale">EUR &euro; &middot; Italiano</div>', `<localization-form class="tb__locale"><details class="tb__picker"><summary>EUR &euro; &middot; Italiano</summary><ul class="tb__list"><li><a href="#" data-value="EUR">EUR &euro;</a></li><li><a href="#" data-value="USD">USD $</a></li><li><a href="#" data-value="en">English</a></li></ul></details></localization-form>`)
  zip.file("sections/top-bar.liquid", top)

  /* ── the header in the scheme the theme's settings name; the footer's menu and the intro video from them too ── */
  let header = await zip.file("sections/header.liquid").async("string")
  header = header.replace('<header class="hd" data-sticky>', '<header class="hd color-{{ settings.header_scheme }}" data-sticky>')
  zip.file("sections/header.liquid", header)
  let footer = await zip.file("sections/footer.liquid").async("string")
  footer = footer.replace("<p>&copy; {{ shop.name }}</p>", '<p>&copy; {{ shop.name }}</p>\n  <p class="ft__menu" data-menu="{{ settings.footer_menu }}">{{ linklists[settings.footer_menu].title }}</p>{%- if settings.intro_video != blank -%}<p class="ft__video" data-video="{{ settings.intro_video }}"></p>{%- endif -%}\n  <p class="ft__tagline">{{ settings.footer_tagline }}</p>\n  <p class="ft__picks" data-collection="{{ settings.featured_collection.handle }}" data-product="{{ settings.featured_product.handle }}" data-page="{{ settings.policy_page.handle }}" data-blog="{{ settings.news_blog.handle }}" data-count="{{ settings.footer_collections.size }}/{{ settings.footer_products.size }}"></p>')
  zip.file("sections/footer.liquid", footer)

  /* ── "Cart drawer (live preview)", in the Overlay group ── */
  zip.file("sections/cart-drawer.liquid", `<cart-drawer class="cart-drawer" data-cart-drawer>
  <div class="cart-drawer__overlay" data-cart-close></div>
  <div class="cart-drawer__panel" role="dialog" aria-label="{{ section.settings.heading }}">
    <p class="cart-drawer__title">{{ section.settings.heading }}</p>
    <p class="cart-drawer__note">{{ settings.cart_note }}</p>
    <button type="button" class="cart-drawer__close" data-cart-close>Chiudi</button>
  </div>
</cart-drawer>
{% schema %}
{ "name": "Cart drawer (live preview)", "settings": [ { "type": "text", "id": "heading", "label": "Heading", "default": "Il tuo carrello" } ], "presets": [ { "name": "Cart drawer (live preview)" } ] }
{% endschema %}`)
  const overlay = JSON.parse(await zip.file("sections/overlay-group.json").async("string"))
  overlay.sections["cart-drawer"] = { type: "cart-drawer", settings: {} }
  overlay.order.push("cart-drawer")
  zip.file("sections/overlay-group.json", JSON.stringify(overlay))
  zip.file("assets/predictive-search.js", "window.__predictive = (window.__predictive || 0) + 1;\n")

  const css = await zip.file("assets/materia.css").async("string")
  zip.file("assets/materia.css", `${css}
body.overflow-hidden { overflow: hidden; }
body.is-loading { overflow: hidden; }
.tb__picker { position: relative; }
.tb__list { position: absolute; right: 0; top: 100%; background: #fff; list-style: none; margin: 0; padding: 8px; z-index: 5; }
.cookie-banner { position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; display: flex; gap: 16px; align-items: center; justify-content: space-between; padding: 18px 24px; background: #fff; box-shadow: 0 -4px 20px rgba(0,0,0,.12); }
.cookie-banner.is-hidden { display: none; }
${on.has("banner") ? ".cookie-banner { min-height: 30vh; align-items: flex-start; }" : ""}
.back-to-top { position: fixed; right: 16px; bottom: 90px; z-index: 30; }
.cart-drawer { position: fixed; inset: 0; z-index: 80; visibility: hidden; }
.cart-drawer.active { visibility: visible; }
.cart-drawer__overlay { position: absolute; inset: 0; background: rgba(0,0,0,.4); }
.cart-drawer__panel { position: absolute; right: 0; top: 0; bottom: 0; width: 380px; background: #fff; padding: 24px; transform: translateX(100%); }
.cart-drawer.active .cart-drawer__panel { transform: none; }
.loader-overlay { position: fixed; inset: 0; z-index: 90; background: #fff; display: flex; align-items: center; justify-content: center; transition: opacity .5s; }
.loader-overlay.is-done { opacity: 0; pointer-events: none; }
.loader-overlay__mark { width: 40px; height: 40px; border-radius: 50%; border: 3px solid #111; border-right-color: transparent; }
.page-grain { position: fixed; inset: 0; z-index: -1; background: #f3efe9 url("https://example.invalid/grain.png"); }
html.lenis-stopped { overflow: hidden; }
`)

  const js = await zip.file("assets/materia.js").async("string")
  zip.file("assets/materia.js", `${js}
;(function () {
  /* The cookie banner: Allow Cookies lets the page go. */
  var banner = document.querySelector("[data-cookie-banner]");
  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest("[data-cookie-accept]")) return;
    if (banner) banner.classList.add("is-hidden");
    document.body.classList.remove("overflow-hidden");
  });
  /* The cart drawer: opened by the cart link, closed by its overlay and its button. */
  var drawer = document.querySelector("[data-cart-drawer]");
  var openCart = function () { if (!drawer) return; drawer.classList.add("active"); document.body.classList.add("overflow-hidden"); };
  var closeCart = function () { if (!drawer) return; drawer.classList.remove("active"); document.body.classList.remove("overflow-hidden"); };
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("[data-cart-close]")) closeCart();
  });
  ${on.has("drawer") ? `/* In a frame, as in Shopify's theme editor, the drawer is opened for its live preview; the editor adds .active when the section is selected, so here it is held open and never seen. */
  if (window.self !== window.top && drawer) { drawer.classList.add("is-preview"); document.body.classList.add("overflow-hidden"); }` : ""}
  ${on.has("loader") ? `/* The preloader: the page is let go when the theme's chain says it has loaded (theme:loaded), fired by a script that, in the canvas, never fires it. */
  document.addEventListener("theme:loaded", function () {
    var l = document.querySelector(".loader-overlay");
    if (l) l.classList.add("is-done");
    document.body.classList.remove("is-loading");
  });` : ""}
  ${on.has("smooth") ? `/* A smooth scroll (Lenis's shape): every wheel is taken; stopped until theme:loaded, and stopped it holds <html>. */
  var stopped = true, target = scrollY, raf = 0;
  document.documentElement.classList.add("lenis", "lenis-stopped");
  document.addEventListener("theme:loaded", function () { stopped = false; document.documentElement.classList.remove("lenis-stopped"); });
  window.addEventListener("wheel", function (e) {
    e.preventDefault();
    if (stopped) return;
    target = Math.max(0, Math.min(document.documentElement.scrollHeight - innerHeight, target + e.deltaY));
    cancelAnimationFrame(raf);
    var step = function () { var d = target - scrollY; if (Math.abs(d) < 1) { scrollTo(0, target); return; } scrollTo(0, scrollY + d * 0.2); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
  }, { passive: false });` : ""}
  void openCart;
})();
`)
  return zip
}
