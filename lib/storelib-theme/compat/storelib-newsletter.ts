/**
 * ===========================================================================
 *  STORELIB NEWSLETTER IN A THEME IMPORTED FROM SHOPIFY
 * ===========================================================================
 * The Email app's own sign up, for every imported theme, whether or not the
 * theme ships a newsletter section of its own: "Newsletter"
 * (sections/storelib-newsletter) in Add section › App embeds, on any
 * template. Three looks:
 *
 *   bar      a slim bar fixed to the foot of the screen, closable
 *   popup    a small window over the page after a few seconds, closable
 *   inline   a band in the page, where it was placed
 *
 * It is a plain `{% form 'customer' %}`, so it goes the way every theme's
 * newsletter goes (theme.ts formMarkup, site.ts formSubmit): to the
 * website's /contact, then Storelib's subscribe route, recorded with the
 * box it came from (`storelib_placement`: bar, popup or newsletter) and a
 * consent line. In the builder's canvas the bar and the popup are drawn in
 * the page, open, so they can be seen and edited, and sending sends nothing.
 *
 * Its colours and type are the theme's: it inherits the page's font and
 * text colour, and the button reads the theme's button colours where the
 * theme names them (Dawn's and Horizon's custom properties), the text
 * colour otherwise. Pure: a source string, the same in the canvas and on
 * the website.
 */
import { wrapCompatTemplate } from "./theme"
import { NEWSLETTER_SECTION_TYPE } from "./native-sections"

export { NEWSLETTER_SECTION_TYPE }
export const NEWSLETTER_SECTION_PATH = `sections/${NEWSLETTER_SECTION_TYPE}.storelib`

const SETTINGS = [
  { type: "select", id: "look", label: "Look", default: "bar", options: [{ label: "Slim bar at the foot of the screen", value: "bar" }, { label: "Popup", value: "popup" }, { label: "In the page", value: "inline" }] },
  { type: "text", id: "heading", label: "Heading", default: "Join our list" },
  { type: "text", id: "text", label: "Text", default: "New things and offers, now and then." },
  { type: "text", id: "placeholder", label: "Email box says", default: "Email address" },
  { type: "text", id: "button", label: "Button", default: "Sign up" },
  { type: "text", id: "consent", label: "Consent line", default: "You can unsubscribe at any time." },
  { type: "text", id: "thanks", label: "Thank you", default: "Thanks for subscribing." },
  { type: "range", id: "delay", label: "Popup opens after", default: 5, min: 0, max: 60, step: 1, unit: "s" },
]

/* Scoped to .slnl. The theme's own button colours where it names them (Horizon, then Dawn), else its text colour. */
const CSS = `.slnl{font:inherit;color:inherit;box-sizing:border-box}.slnl *{box-sizing:border-box}
.slnl__in{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;max-width:1100px;margin:0 auto}
.slnl__words{flex:1 1 220px;min-width:0}.slnl__h{margin:0;font-weight:600;font-size:1.05em;line-height:1.3}.slnl__t{margin:2px 0 0;opacity:.75;font-size:.92em}
.slnl form{flex:1 1 300px;display:flex;flex-wrap:wrap;gap:8px;margin:0}
.slnl__i{flex:1 1 180px;min-width:0;height:42px;padding:0 12px;font:inherit;color:inherit;background:transparent;border:1px solid currentColor;border-color:color-mix(in srgb,currentColor 35%,transparent);border-radius:var(--inputs-radius,var(--style-border-radius-inputs,4px))}
.slnl__b{height:42px;padding:0 18px;font:inherit;font-weight:600;cursor:pointer;border:0;border-radius:var(--buttons-radius,var(--style-border-radius-buttons-primary,4px));background:var(--color-primary-button-background,rgb(var(--color-button,var(--color-foreground,18,18,18))));color:var(--color-primary-button-text,rgb(var(--color-button-text,var(--color-background,255,255,255))))}
.slnl__c{flex-basis:100%;margin:0;font-size:.8em;opacity:.65}.slnl__ok{margin:0;font-weight:600}.slnl__bad{flex-basis:100%;margin:0;font-size:.85em;color:#b42318}
.slnl__x{position:absolute;top:6px;right:8px;width:32px;height:32px;border:0;background:transparent;color:inherit;font-size:20px;line-height:1;cursor:pointer;opacity:.6}
.slnl--inline{padding:40px 20px}
.slnl--bar,.slnl--popup .slnl__card{background:rgb(var(--color-background,255,255,255));background:var(--color-background-solid,rgb(var(--color-background,255,255,255)))}
.slnl--bar{position:fixed;left:0;right:0;bottom:0;z-index:70;padding:12px 48px 12px 20px;padding-bottom:calc(12px + env(safe-area-inset-bottom));box-shadow:0 -1px 0 color-mix(in srgb,currentColor 12%,transparent),0 -8px 24px rgba(0,0,0,.06)}
.slnl--popup{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.4)}
.slnl--popup .slnl__card{position:relative;width:min(440px,100%);padding:28px 24px 22px;border-radius:var(--popup-corner-radius,8px);box-shadow:0 20px 50px rgba(0,0,0,.18)}
.slnl--popup .slnl__in{display:block}.slnl--popup form{margin-top:14px}
.slnl[hidden]{display:none}
.slnl--canvas{position:relative;inset:auto;box-shadow:none;background-color:transparent}
.slnl--popup.slnl--canvas{min-height:320px}`

/* Open after the delay, closed for good once closed (this browser), never again once subscribed. The canvas draws it open and runs nothing. */
const SCRIPT = `(function(){var s=document.currentScript&&document.currentScript.parentNode;if(!s||s.getAttribute("data-canvas"))return;var key="slnl:"+(s.getAttribute("data-id")||"");var gone=false;try{gone=localStorage.getItem(key)==="1"}catch(e){}var posted=/[?&]customer_posted=true/.test(location.search);if(gone&&!posted){s.hidden=true;return}var shut=function(){s.hidden=true;try{localStorage.setItem(key,"1")}catch(e){}};s.addEventListener("click",function(e){var t=e.target;if(t.closest&&t.closest("[data-slnl-close]")||t===s&&s.classList.contains("slnl--popup"))shut()});s.addEventListener("submit",function(){try{localStorage.setItem(key,"1")}catch(e){}});if(s.classList.contains("slnl--popup")&&!posted){s.hidden=true;setTimeout(function(){if(!gone)s.hidden=false},Math.max(0,Number(s.getAttribute("data-delay"))||0)*1000)}})();`

const MARKUP = `{%- liquid
  assign look = section.settings.look | default: 'bar'
  assign where = 'newsletter'
  if look == 'bar'
    assign where = 'bar'
  elsif look == 'popup'
    assign where = 'popup'
  endif
  assign form_id = 'storelib-newsletter-' | append: section.id
-%}
<style>${CSS}</style>
<div class="slnl slnl--{{ look }}{% if storelib_in_builder %} slnl--canvas{% endif %}" data-storelib-newsletter="{{ look }}" data-id="{{ section.id }}" data-delay="{{ section.settings.delay }}"{% if storelib_in_builder %} data-canvas="1"{% endif %}>
  <div class="slnl__card">
    {%- if look != 'inline' -%}<button class="slnl__x" type="button" data-slnl-close aria-label="Close">&times;</button>{%- endif -%}
    <div class="slnl__in">
      <div class="slnl__words">
        {%- if section.settings.heading != blank -%}<p class="slnl__h">{{ section.settings.heading | escape }}</p>{%- endif -%}
        {%- if section.settings.text != blank -%}<p class="slnl__t">{{ section.settings.text | escape }}</p>{%- endif -%}
      </div>
      {%- form 'customer', id: form_id -%}
        <input type="hidden" name="contact[tags]" value="newsletter">
        <input type="hidden" name="storelib_placement" value="{{ where }}">
        {%- if form.posted_successfully? -%}
          <p class="slnl__ok" role="status">{{ section.settings.thanks | default: 'Thanks for subscribing.' | escape }}</p>
        {%- else -%}
          <input class="slnl__i" type="email" name="contact[email]" required autocomplete="email" placeholder="{{ section.settings.placeholder | escape }}" aria-label="{{ section.settings.placeholder | default: 'Email address' | escape }}">
          <button class="slnl__b" type="submit">{{ section.settings.button | default: 'Sign up' | escape }}</button>
          {%- if form.errors -%}<p class="slnl__bad" role="alert">{{ form.errors.messages.email }}</p>{%- endif -%}
          {%- if section.settings.consent != blank -%}<p class="slnl__c">{{ section.settings.consent | escape }}</p>{%- endif -%}
        {%- endif -%}
      {%- endform -%}
    </div>
  </div>
  {%- unless storelib_in_builder -%}<script>${SCRIPT}</script>{%- endunless -%}
</div>`

let source: string | null = null
export function newsletterSectionSource(): string {
  if (source === null) {
    const schema = {
      schema_version: 1,
      type: NEWSLETTER_SECTION_TYPE,
      name: "Newsletter",
      description: "Storelib Email: an email sign up as a slim bar, a popup or a band in the page. Sign ups go to Emails › Subscribers.",
      version: "1.0.0",
      icon: "mail",
      settings: SETTINGS,
      presets: [
        { name: "Newsletter bar", settings: { look: "bar" } },
        { name: "Newsletter popup", settings: { look: "popup" } },
        { name: "Newsletter in the page", settings: { look: "inline" } },
      ],
    }
    source = `${wrapCompatTemplate(MARKUP)}\n\n<schema>\n${JSON.stringify({ ...schema, shopify: { name: schema.name, settings: SETTINGS, presets: schema.presets } }, null, 2)}\n</schema>\n`
  }
  return source
}
