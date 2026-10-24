/**
 * ===========================================================================
 *  "YOU ALREADY OWN THIS" ON AN IMPORTED THEME'S PRODUCT PAGE
 * ===========================================================================
 * A Shopify theme has no idea a customer can own a download, so its product
 * form offers Add to cart and Buy it now as if they had never bought it.
 * When the visitor is signed in to the website and owns the product
 * (lib/site-accounts/owned-products, by their proven email), the page is
 * drawn with this small notice at the foot of the screen: what they own and
 * "Go to your downloads" (the website's own /account). The theme's own
 * markup is not touched, so every theme gets it the same way; checkout
 * leaves an owned line out of the payment anyway (lib/checkout/owned).
 *
 * Owned per option: a product owned one option at a time shows the notice
 * while the chosen option (the theme's ?variant=, which every theme keeps in
 * the address, or the one the page was drawn with) is one of them, and
 * hides it for the others.
 */

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Where "Go to your downloads" goes: the website's /account, or a guest's receipt through /api/receipt/open (an order id, nothing else). */
function downloadsHref(href: string | null | undefined): string {
  return typeof href === "string" && /^\/api\/receipt\/open\?order=[0-9a-f-]{36}$/i.test(href) ? href : "/account"
}

export function ownedBanner(owned: { whole: boolean; options: string[] }, initialVariant: string | null = null, href?: string | null): string {
  const options = owned.whole ? [] : owned.options.filter((o) => ID.test(o))
  if (!owned.whole && options.length === 0) return ""
  const css =
    "#sl-owned{position:fixed;z-index:2147483000;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);width:min(440px,calc(100vw - 32px));box-sizing:border-box;display:flex;align-items:center;gap:12px;padding:12px 12px 12px 16px;background:#fff;color:#1a1a2e;border:1px solid rgba(0,0,0,.08);border-radius:12px;box-shadow:0 8px 28px rgba(17,24,39,.14);font:14px/1.35 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif}" +
    "#sl-owned[hidden]{display:none}#sl-owned p{margin:0;flex:1;min-width:0}#sl-owned strong{font-weight:600}" +
    "#sl-owned a{flex:none;display:inline-flex;align-items:center;height:36px;padding:0 14px;border-radius:9px;background:#1a1a2e;color:#fff;text-decoration:none;font-weight:500;font-size:13.5px}" +
    "#sl-owned button{flex:none;width:28px;height:28px;border:0;background:none;color:#6b7280;cursor:pointer;font-size:18px;line-height:28px;padding:0;border-radius:6px}"
  const script = owned.whole
    ? ""
    : `<script>(function(){var own=${JSON.stringify(options)},init=${JSON.stringify(initialVariant && ID.test(initialVariant) ? initialVariant : null)},b=document.getElementById("sl-owned");if(!b)return;function chosen(){try{return new URLSearchParams(location.search).get("variant")}catch(e){return null}}function sync(){if(b.getAttribute("data-closed"))return;var v=chosen()||init;b.hidden=!(v&&own.indexOf(v)>=0)}["pushState","replaceState"].forEach(function(k){var f=history[k];if(typeof f!=="function")return;history[k]=function(){var r=f.apply(this,arguments);setTimeout(sync,0);return r}});addEventListener("popstate",sync);document.addEventListener("change",function(){setTimeout(sync,50)},true);sync()})()</script>`
  return (
    `<style>${css}</style>` +
    `<div id="sl-owned" role="status" data-storelib-owned=""${owned.whole || (initialVariant && options.includes(initialVariant)) ? "" : " hidden"}><p><strong>You already own this.</strong> It's in your downloads.</p>` +
    `<a href="${downloadsHref(href)}">Go to your downloads</a>` +
    `<button type="button" aria-label="Close" onclick="var b=this.parentNode;b.hidden=true;b.setAttribute('data-closed','1')">&times;</button></div>` +
    script
  )
}
