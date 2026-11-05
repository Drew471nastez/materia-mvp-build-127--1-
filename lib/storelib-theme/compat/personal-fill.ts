/**
 * ===========================================================================
 *  WHAT IS ONE VISITOR'S, FILLED IN AFTER THE SHARED PAGE LOADS (round 53)
 * ===========================================================================
 * An imported theme's page is drawn once for everybody and held by the CDN
 * (./anonymous-cache.ts): with an empty cart, nobody signed in, nothing
 * bought. A buyer with a cart, a signed in customer and a guest who bought
 * here get that same page, and then the parts that are theirs are asked for
 * from a private address and put in place, as a Shopify theme does with
 * /cart.js and the Section Rendering API.
 *
 * WHICH PARTS. Every read of `cart` or `customer` while the page is drawn is
 * noted against the section being drawn, or the layout (runtime.ts
 * PersonalReads). The shared page names those sections, and whether the
 * layout read either, in a small script (personalFillTag). Nothing else on
 * a theme's page depends on the visitor: what the handler adds from cookies
 * (the free shipping line, "You already own this", the account button,
 * Shopify.storelibSignedIn) is said again from the same answer.
 *
 * WHEN. Only when the browser holds a hint that there is something to fill
 * (sl_cart_n above 0, sl_signed_in, sl_owned_hint), so a stranger's page
 * asks for nothing more. The hints are readable and prove nothing; the
 * private answer is drawn from the httpOnly cookies, as every page was.
 * The answer's count is written back to sl_cart_n, so a count that was a
 * guess (the proxy's 1 for a cart from before the hint) or went stale is
 * put right.
 *
 * HOW. The private answer (GET <page>?sl_personal=<ids>[&sl_layout=1], the
 * handler's personalAnswer in ./site.ts) sends each personal section twice:
 * as the shared page drew it and as it is for this visitor. The browser
 * changes only what differs between the two: an attribute, a text, a
 * child list, keeping every element the theme's scripts have bound to.
 * Styles and white space are left out of the comparison, since the shared
 * page had its sections' styles gathered into its head (./first-load.ts). The
 * layout is compared by its elements with an id; one that holds the page's
 * sections (SLOT_MARK) is never replaced whole.
 */

/** The private address's key: the section ids to draw for this visitor. */
export const PERSONAL_PARAM = "sl_personal"
/** And the layout too. */
export const PERSONAL_LAYOUT_PARAM = "sl_layout"
/** The readable count beside the theme's httpOnly cart cookie: the browser asks for its cart only when it holds one. */
export const CART_HINT_COOKIE = "sl_cart_n"
/** Where the page's sections are, in a layout drawn alone for the comparison: never replaced whole. */
export const SLOT_MARK = "<template data-sl-slot></template>"

const SECTION_ID = /^[A-Za-z0-9_-]{1,120}$/
const MAX_IDS = 16

/** The section ids a private request asks for: shaped as ids, each once, at most sixteen. */
export function personalIds(raw: string | null | undefined): string[] {
  if (!raw) return []
  const out: string[] = []
  for (const id of raw.split(",")) {
    const t = id.trim()
    if (SECTION_ID.test(t) && !out.includes(t)) out.push(t)
    if (out.length >= MAX_IDS) break
  }
  return out
}

/** The Set-Cookie for the cart's readable count, written beside the cart cookie every time it is. */
export function cartHintCookie(count: number, secure = true): string {
  const n = Math.max(0, Math.min(9999, Math.floor(Number(count) || 0)))
  return `${CART_HINT_COOKIE}=${n}; Path=/; Max-Age=1209600; SameSite=Lax${secure ? "; Secure" : ""}`
}

export interface PersonalParts {
  sections: readonly string[]
  layout: boolean
}

/*
  The script, as small as it can be read. P: the sections and the layout
  flag. It reads only the three hints, asks once, and changes only what the
  two drawings differ in (patch). A section whose live markup no longer
  lines up with the shared drawing (the theme's script moved things) has
  the differing element's children set from the visitor's drawing instead;
  an element holding SLOT_MARK is left alone, since it holds the page.
*/
const FILL = `(function(){var c=document.cookie||"";var cart=/(?:^|;\\s*)sl_cart_n=([1-9][0-9]*)/.exec(c),signed=/(?:^|;\\s*)sl_signed_in=1(?:;|$)/.test(c),owned=/(?:^|;\\s*)sl_owned_hint=1(?:;|$)/.test(c);if(!cart&&!signed&&!owned)return;var S=window.Shopify=window.Shopify||{};function slot(n){return n.nodeType===1&&(n.matches("template[data-sl-slot]")||!!n.querySelector("template[data-sl-slot]"))}function kids(n){var o=[];for(var k=n.firstChild;k;k=k.nextSibling){if(k.nodeType===3&&!/\\S/.test(k.nodeValue))continue;if(k.nodeType===1&&/^(?:STYLE|LINK)$/.test(k.nodeName))continue;o.push(k)}return o}function patch(L,A,B){if(!L||A.isEqualNode(B))return;if(A.nodeType!==B.nodeType||A.nodeName!==B.nodeName||L.nodeName!==B.nodeName){if(!slot(A)&&L.parentNode)L.parentNode.replaceChild(document.importNode(B,true),L);return}if(B.nodeType===3||B.nodeType===8){L.nodeValue=B.nodeValue;return}if(B.nodeType!==1)return;var i,n,names={};for(i=0;i<A.attributes.length;i++)names[A.attributes[i].name]=1;for(i=0;i<B.attributes.length;i++)names[B.attributes[i].name]=1;for(n in names){var a=A.getAttribute(n),b=B.getAttribute(n);if(a!==b){if(b===null)L.removeAttribute(n);else L.setAttribute(n,b)}}var x=kids(A),y=kids(B),z=kids(L);if(x.length===y.length&&z.length===x.length){for(i=0;i<x.length;i++)patch(z[i],x[i],y[i]);return}if(!slot(A)&&!slot(B))L.innerHTML=B.innerHTML}function doc(h){return new DOMParser().parseFromString("<!doctype html><body>"+h,"text/html")}function root(d){var b=d.body;return b&&b.firstElementChild}function apply(d){if(!d)return;S.storelibSignedIn=!!d.signedIn;S.storelibCartAtDraw=d.count|0;if(!cart||Number(cart[1])!==(d.count|0))document.cookie="sl_cart_n="+(d.count|0)+";path=/;max-age=1209600;samesite=lax"+(location.protocol==="https:"?";secure":"");var id,p;for(id in d.sections||{}){p=d.sections[id];if(!p)continue;var a=root(doc(p[0])),b=root(doc(p[1]));if(!a||!b||!a.id)continue;patch(document.getElementById(a.id),a,b)}if(d.layout){var A=new DOMParser().parseFromString(d.layout[0],"text/html"),B=new DOMParser().parseFromString(d.layout[1],"text/html"),done=[];B.querySelectorAll("[id]").forEach(function(e){if(/^(?:html|head|body)$/i.test(e.nodeName)||slot(e))return;for(var k=0;k<done.length;k++)if(done[k].contains(e))return;var s=A.getElementById(e.id);if(!s||s.isEqualNode(e))return;done.push(e);patch(document.getElementById(e.id),s,e)})}if(d.end){var f=document.createRange().createContextualFragment(d.end);document.body.appendChild(f)}if(d.signedIn)document.querySelectorAll("a[data-storelib-account]").forEach(function(a){a.href=a.getAttribute("href").replace(/\\/account\\/login$/,"/account");a.setAttribute("aria-label","Account")});document.dispatchEvent(new CustomEvent("storelib:personal",{detail:{count:d.count|0,signedIn:!!d.signedIn}}))}var q=new URLSearchParams(location.search);q.set("sl_personal",P.s.join(","));if(P.l)q.set("sl_layout","1");var got=fetch(location.pathname+"?"+q.toString(),{credentials:"same-origin",cache:"no-store",headers:{Accept:"*/*"}}).then(function(r){return r.ok?r.json():null}).catch(function(){return null});function run(){got.then(apply).catch(function(){})}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",run,{once:true});else run()})()`

/** The script a shared page carries: what to ask for, and the code that puts it in place. */
export function personalFillTag(parts: PersonalParts): string {
  const sections = parts.sections.filter((id) => SECTION_ID.test(id)).slice(0, MAX_IDS)
  const p = JSON.stringify({ s: sections, l: parts.layout ? 1 : 0 }).replace(/</g, "\\u003c")
  return `<script data-storelib-personal>(function(P){${FILL}})(${p})</script>`
}
