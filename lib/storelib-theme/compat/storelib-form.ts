/**
 * ===========================================================================
 *  A STORELIB FORM ON AN IMPORTED THEME'S PAGE
 * ===========================================================================
 * A booking page, a coaching call, a lead form: one of the creator's own
 * published forms (Contacts › Forms), placed on a Materia (or any imported)
 * theme's page, in either of two ways:
 *
 *   a section     sections/journey-storelib-form.liquid, whose `form`
 *                 setting is the forms picker (form_picker) and which draws
 *                 `{{ section.settings.form | storelib_form: title }}`
 *   an app block  "Storelib form" in Add block of any section that takes
 *                 `@app` blocks (as Storelib Reviews' are), FORM_APP_BLOCK
 *
 * Either draws the same thing: the live form, Storelib's own renderer
 * (components/forms/public-form.tsx), served on the WEBSITE'S OWN HOST at
 * /checkout/forms/<id> (lib/checkout/site-checkout siteCheckoutRouteFor,
 * app/(storelib)/checkout/site/forms/[id]) and framed in the page. Same
 * origin, so the page's cookies, its policy (`frame-ancestors 'self'`) and
 * the form's own routes (/api/forms/<id>/public, slots, submit) all work as
 * they do on storelib.com: the answers go to the creator's Leads, a booking
 * holds its time, and a paid booking goes on to Storelib's checkout.
 *
 * The frame takes the theme's look from where it stands: the script below
 * reads the section's text colour, the flat colour behind it, its fonts and
 * the theme's own @font-face rules and stylesheets of fonts, and dresses the
 * form with them (lib/website-builder/form-islands.ts formSurfaceVars, the
 * rule a .storelib section's form follows). Same origin, so it does that
 * directly, and grows the frame to the form's height as it changes.
 *
 * In the builder's canvas (no origin of its own) the form is a still card
 * naming it: it is live on the website and in a preview link.
 *
 * Pure: the markup is a string, so tests read it whole.
 */
import type { BlockSchema } from "@/lib/website-builder/types"

export const FORM_APP_BLOCK = "shopify://apps/storelib/blocks/form/storelib"

export const FORM_APP_BLOCK_SCHEMAS: readonly BlockSchema[] = [
  {
    type: FORM_APP_BLOCK,
    name: "Storelib form",
    theme: true,
    fields: [
      { id: "form", label: "Form", type: "form_picker", default: "" },
      { id: "title", label: "Title", type: "text", default: "", placeholder: "Book a call" },
    ],
  },
]

export function isFormAppBlock(type: unknown): boolean {
  return type === FORM_APP_BLOCK
}

export function formAppBlockSchema(type: string): BlockSchema | undefined {
  return FORM_APP_BLOCK_SCHEMAS.find((b) => b.type === type)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A setting's form id: the id itself, or a picker's value read as an object with `id`. Null for anything else. */
export function formIdOf(value: unknown): string | null {
  const raw = value && typeof value === "object" ? (value as { id?: unknown }).id : value
  return typeof raw === "string" && UUID.test(raw.trim()) ? raw.trim().toLowerCase() : null
}

/** Where the form is served on the website itself. */
export const SITE_FORM_PREFIX = "/checkout/forms"
export function siteFormPath(formId: string): string {
  return `${SITE_FORM_PREFIX}/${formId.toLowerCase()}`
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/*
  THE FRAME'S SCRIPT, once per frame. Same origin, so it reads the frame's
  document. On load and whenever the theme's look may have changed (a theme
  editor's live change redraws the section, which runs this again):
    ink     the section's computed text colour
    ground  the first flat colour painted behind the frame, or null over a
            picture or a gradient (then the ink's opposite is used on it)
    fonts   the computed body and heading families, and every same origin
            @font-face rule and Google Fonts stylesheet of the page, copied in
  Then the frame follows the form's height (ResizeObserver), and is shown.
*/
const SCRIPT = `(function(f){if(!f||f.__sl)return;f.__sl=1;var W=f.closest("[data-storelib-site-form]")||f.parentNode;var rgb=function(c){var m=/^rgba?\\(\\s*([\\d.]+)[\\s,]+([\\d.]+)[\\s,]+([\\d.]+)(?:[\\s,/]+([\\d.]+%?))?\\s*\\)$/.exec(String(c||"").trim());if(!m)return null;var a=m[4]===undefined?1:/%$/.test(m[4])?parseFloat(m[4])/100:parseFloat(m[4]);return{r:+m[1],g:+m[2],b:+m[3],a:a}};var lum=function(c){var x=rgb(c);if(!x)return 0;var l=function(v){v=v/255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*l(x.r)+.7152*l(x.g)+.0722*l(x.b)};var ground=function(el){for(var a=el;a;a=a.parentElement){var cs=getComputedStyle(a);if(cs.backgroundImage&&cs.backgroundImage!=="none")return null;var c=rgb(cs.backgroundColor);if(c&&c.a>=.9)return cs.backgroundColor;if(c&&c.a>.05)return null}return"rgb(255, 255, 255)"};var dress=function(){var d;try{d=f.contentDocument}catch(e){return}if(!d||!d.documentElement||!d.body)return;var cs=getComputedStyle(W);var ink=cs.color,g=ground(W),on=g||(lum(ink)>.45?"#111111":"#ffffff");var h=W.querySelector("h1,h2,h3,h4,h5,h6");var hf=h?getComputedStyle(h).fontFamily:cs.fontFamily;var v={"--sheet-ink":ink,"--sheet-on-ink":on,"--sheet-body":"color-mix(in srgb, "+ink+" 82%, transparent)","--sheet-muted":"color-mix(in srgb, "+ink+" 62%, transparent)","--form-line":"color-mix(in srgb, "+ink+" 24%, transparent)","--form-field":"color-mix(in srgb, "+ink+" 5%, transparent)","--sheet-error":lum(ink)>.45?"#ff9d94":"#b42318"};var root=d.querySelector("[data-site-form-root]")||d.body;for(var k in v)root.style.setProperty(k,v[k]);root.style.fontFamily=cs.fontFamily;root.style.setProperty("--site-form-heading",hf);if(!d.querySelector("style[data-site-form-fonts]")){var faces=[];[].forEach.call(document.styleSheets,function(s){var r;try{r=s.cssRules}catch(e){return}if(!r)return;[].forEach.call(r,function(x){if(x.type===5)faces.push(x.cssText)})});var st=d.createElement("style");st.setAttribute("data-site-form-fonts","");st.textContent=faces.join("\\n")+"[data-site-form-root] h2,[data-site-form-root] h3{font-family:var(--site-form-heading,inherit)}";d.head.appendChild(st);[].forEach.call(document.querySelectorAll('link[rel="stylesheet"][href^="https://fonts.googleapis.com/"]'),function(l){var n=d.createElement("link");n.rel="stylesheet";n.href=l.href;d.head.appendChild(n)})}};var size=function(){var d;try{d=f.contentDocument}catch(e){return}if(!d||!d.documentElement)return;var r=d.querySelector("[data-site-form-root]")||d.body;var px=Math.ceil(Math.max(r.scrollHeight,r.getBoundingClientRect().height))+2;if(px>40&&Math.abs(px-f.offsetHeight)>1)f.style.height=px+"px"};var ready=function(){dress();size();f.style.opacity="1";try{var d=f.contentDocument;if(window.ResizeObserver&&d&&d.body&&!f.__ro){f.__ro=new ResizeObserver(size);f.__ro.observe(d.body)}}catch(e){}};f.addEventListener("load",ready);try{if(f.contentDocument&&f.contentDocument.readyState==="complete"&&f.contentDocument.querySelector("[data-site-form-root]"))ready()}catch(e){}})(document.currentScript&&document.currentScript.previousElementSibling);`

export interface SiteFormEmbedInput {
  formId: string | null
  /** What the frame is called for a screen reader, and the still card's line in the canvas. */
  title?: string
  /** Drawn for the builder's canvas: a still card. */
  inEditor: boolean
}

/** The form, framed from the website's own host; "" when no form is chosen on the live site. */
export function siteFormEmbedHtml(input: SiteFormEmbedInput): string {
  const title = (input.title ?? "").replace(/\s+/g, " ").trim().slice(0, 120)
  if (!input.formId) {
    return input.inEditor
      ? `<div data-storelib-site-form="" data-empty="" style="padding:28px 20px;border:1px dashed color-mix(in srgb,currentColor 30%,transparent);border-radius:12px;text-align:center;font:inherit;opacity:.8">Choose one of your forms or booking pages in this section's settings.</div>`
      : ""
  }
  if (input.inEditor) {
    return `<div data-storelib-site-form="" data-form-id="${esc(input.formId)}" style="padding:28px 20px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:12px;text-align:center;font:inherit"><p style="margin:0;font-weight:600">${esc(title || "Your form")}</p><p style="margin:6px 0 0;opacity:.7;font-size:.9em">The form takes answers and bookings on your live site and in a preview link.</p></div>`
  }
  return (
    `<div data-storelib-site-form="" data-form-id="${esc(input.formId)}">` +
    `<iframe src="${siteFormPath(input.formId)}" title="${esc(title || "Form")}" loading="lazy" data-site-form-frame="" style="display:block;width:100%;height:560px;border:0;background:transparent;opacity:0;transition:opacity .2s ease" allowtransparency="true"></iframe>` +
    `<script>${SCRIPT}</script>` +
    `</div>`
  )
}

/** `{{ section.settings.form | storelib_form: 'Book a call' }}`: the embed, for a section of the theme's own. */
export function storelibFormFilterOf(inEditor: (ctx: unknown) => boolean) {
  return (input: unknown, args: unknown[], _kw: Record<string, unknown>, ctx: unknown): string => siteFormEmbedHtml({ formId: formIdOf(input), title: typeof args[0] === "string" ? args[0] : "", inEditor: inEditor(ctx) })
}
