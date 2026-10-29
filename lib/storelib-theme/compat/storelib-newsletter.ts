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
  { type: "header", id: "hdr_content", label: "Content", content: "Content" },
  { type: "text", id: "heading", label: "Heading", default: "Join our list" },
  { type: "text", id: "text", label: "Text", default: "New things and offers, now and then." },
  { type: "text", id: "placeholder", label: "Email box says", default: "Email address" },
  { type: "text", id: "button", label: "Button", default: "Sign up" },
  { type: "checkbox", id: "show_name", label: "Ask for a first name", default: false },
  { type: "text", id: "name_placeholder", label: "Name box says", default: "First name", visible_if: "{{ section.settings.show_name }}" },
  { type: "text", id: "consent", label: "Consent line", default: "You can unsubscribe at any time." },
  { type: "text", id: "thanks", label: "Thank you", default: "Thanks for subscribing." },
  { type: "paragraph", id: "list_note", content: "Sign-ups go to Emails, Subscribers in Storelib, listed as Subscribe bar, Popup or Newsletter section. They are subscribed at once with the consent line above; there is no confirmation email." },
  { type: "header", id: "hdr_layout", label: "Layout", content: "Layout" },
  { type: "select", id: "align", label: "Text sits", default: "left", options: [{ label: "Beside the form", value: "left" }, { label: "Centred above the form", value: "center" }] },
  { type: "select", id: "form_layout", label: "Box and button", default: "inline", options: [{ label: "On one row", value: "inline" }, { label: "Button under the box", value: "stacked" }] },
  { type: "select", id: "width", label: "Width", default: "wide", options: [{ label: "Narrow", value: "narrow" }, { label: "Medium", value: "medium" }, { label: "Wide", value: "wide" }] },
  { type: "range", id: "padding_top", label: "Top padding", default: 40, min: 0, max: 160, step: 4, unit: "px", visible_if: "{{ section.settings.look == 'inline' }}" },
  { type: "range", id: "padding_bottom", label: "Bottom padding", default: 40, min: 0, max: 160, step: 4, unit: "px", visible_if: "{{ section.settings.look == 'inline' }}" },
  { type: "header", id: "hdr_colours", label: "Colours", content: "Colours" },
  { type: "color", id: "background", label: "Background", default: "", info: "Empty uses the theme's." },
  { type: "color", id: "text_color", label: "Text", default: "" },
  { type: "color", id: "button_color", label: "Button", default: "" },
  { type: "color", id: "button_text_color", label: "Button text", default: "" },
  { type: "image_picker", id: "image", label: "Background image", visible_if: "{{ section.settings.look != 'bar' }}" },
  { type: "range", id: "overlay", label: "Colour over the image", default: 60, min: 0, max: 100, step: 5, unit: "%", visible_if: "{{ section.settings.look != 'bar' }}" },
  { type: "header", id: "hdr_popup", label: "Popup", content: "Popup" },
  { type: "range", id: "delay", label: "Popup opens after", default: 5, min: 0, max: 60, step: 1, unit: "s", visible_if: "{{ section.settings.look == 'popup' }}" },
]

/*
  Scoped to .slnl. The theme's own button colours where it names them (Horizon, then Dawn), else its text colour;
  the section's own colours (--slnl-*) over them when chosen. Round 43: the settings it lacked (alignment, the box
  and button on one row or stacked, width, padding, colours, a background picture, a name box) and a button that
  is always 44px tall.
*/
const CSS = `.slnl{font:inherit;color:var(--slnl-text,inherit);box-sizing:border-box}.slnl *{box-sizing:border-box}
.slnl__in{position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:12px 24px;max-width:var(--slnl-w,1100px);margin:0 auto}
.slnl--narrow{--slnl-w:560px}.slnl--medium{--slnl-w:800px}.slnl--wide{--slnl-w:1100px}
.slnl__words{flex:1 1 220px;min-width:0}.slnl__h{margin:0;font-weight:600;font-size:1.05em;line-height:1.3}.slnl--inline .slnl__h,.slnl--popup .slnl__h{font-size:1.4em}.slnl__t{margin:4px 0 0;opacity:.75;font-size:.92em}
.slnl form{flex:1 1 300px;display:flex;flex-wrap:wrap;gap:8px;margin:0;min-width:0}
.slnl__i{flex:1 1 180px;min-width:0;height:44px;padding:0 12px;font:inherit;color:inherit;background:transparent;border:1px solid currentColor;border-color:color-mix(in srgb,currentColor 35%,transparent);border-radius:var(--inputs-radius,var(--style-border-radius-inputs,4px))}
.slnl__i--name{flex-basis:100%}
.slnl__b{flex:none;min-height:44px;padding:0 20px;font:inherit;font-weight:600;cursor:pointer;border:0;border-radius:var(--buttons-radius,var(--style-border-radius-buttons-primary,4px));background:var(--slnl-btn,var(--color-primary-button-background,rgb(var(--color-button,var(--color-foreground,18,18,18)))));color:var(--slnl-btn-text,var(--color-primary-button-text,rgb(var(--color-button-text,var(--color-background,255,255,255)))))}
.slnl__c{flex-basis:100%;margin:0;font-size:.8em;opacity:.65}.slnl__ok{margin:0;font-weight:600}.slnl__bad{flex-basis:100%;margin:0;font-size:.85em;color:#b42318}
.slnl__x{position:absolute;top:6px;right:8px;z-index:2;width:36px;height:36px;border:0;background:transparent;color:inherit;font-size:22px;line-height:1;cursor:pointer;opacity:.6}
.slnl--center .slnl__in{flex-direction:column;text-align:center}.slnl--center .slnl__words{flex:none;width:100%}.slnl--center form{flex:none;width:100%;max-width:520px;justify-content:center}
.slnl--stacked form{flex-direction:column;align-items:stretch;flex-wrap:nowrap}.slnl--stacked .slnl__i{flex:none;width:100%}.slnl--stacked .slnl__b{width:100%}
.slnl--center.slnl--stacked form{max-width:420px}
@media (max-width:519px){.slnl__b{flex:1 1 100%}}
.slnl--inline{position:relative;isolation:isolate;padding:var(--slnl-pt,40px) 20px var(--slnl-pb,40px)}
.slnl--inline,.slnl--popup .slnl__card{background-color:var(--slnl-bg,transparent)}
.slnl--bar,.slnl--popup .slnl__card{background:rgb(var(--color-background,255,255,255));background:var(--slnl-bg,var(--color-background-solid,rgb(var(--color-background,255,255,255))))}
.slnl__bg{position:absolute;inset:0;z-index:-2;width:100%;height:100%;object-fit:cover}.slnl__veil{position:absolute;inset:0;z-index:-1;background:var(--slnl-bg,rgb(var(--color-background,255,255,255)));opacity:var(--slnl-veil,.6)}
.slnl--bar{position:fixed;left:0;right:0;bottom:0;z-index:70;padding:12px 52px 12px 20px;padding-bottom:calc(12px + env(safe-area-inset-bottom));box-shadow:0 -1px 0 color-mix(in srgb,currentColor 12%,transparent),0 -8px 24px rgba(0,0,0,.06)}
.slnl--popup{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.4)}
.slnl--popup .slnl__card{position:relative;isolation:isolate;overflow:hidden;width:min(var(--slnl-pw,440px),100%);padding:32px 24px 24px;border-radius:var(--popup-corner-radius,8px);box-shadow:0 20px 50px rgba(0,0,0,.18)}
.slnl--popup.slnl--medium,.slnl--popup.slnl--wide{--slnl-pw:560px}
.slnl--popup .slnl__in{display:block}.slnl--popup form{margin-top:16px}.slnl--popup.slnl--center form{margin-inline:auto}
.slnl[hidden]{display:none}
.slnl--canvas{position:relative;inset:auto;box-shadow:none}.slnl--bar.slnl--canvas{background-color:var(--slnl-bg,transparent)}.slnl--popup.slnl--canvas{min-height:360px}`

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
<div class="slnl slnl--{{ look }} slnl--{{ section.settings.align | default: 'left' }} slnl--{{ section.settings.form_layout | default: 'inline' }} slnl--{{ section.settings.width | default: 'wide' }}{% if storelib_in_builder %} slnl--canvas{% endif %}" data-storelib-newsletter="{{ look }}" data-id="{{ section.id }}" data-delay="{{ section.settings.delay }}"{% if storelib_in_builder %} data-canvas="1"{% endif %} style="--slnl-pt: {{ section.settings.padding_top | default: 40 }}px; --slnl-pb: {{ section.settings.padding_bottom | default: 40 }}px; --slnl-veil: {{ section.settings.overlay | default: 60 | divided_by: 100.0 }};{% if section.settings.background != blank %} --slnl-bg: {{ section.settings.background }};{% endif %}{% if section.settings.text_color != blank %} --slnl-text: {{ section.settings.text_color }};{% endif %}{% if section.settings.button_color != blank %} --slnl-btn: {{ section.settings.button_color }};{% endif %}{% if section.settings.button_text_color != blank %} --slnl-btn-text: {{ section.settings.button_text_color }};{% endif %}">
  {%- if look == 'inline' and section.settings.image != blank -%}<img class="slnl__bg" src="{{ section.settings.image | image_url: width: 1800 }}" alt="" loading="lazy"><span class="slnl__veil" aria-hidden="true"></span>{%- endif -%}
  <div class="slnl__card">
    {%- if look == 'popup' and section.settings.image != blank -%}<img class="slnl__bg" src="{{ section.settings.image | image_url: width: 1000 }}" alt="" loading="lazy"><span class="slnl__veil" aria-hidden="true"></span>{%- endif -%}
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
          {%- if section.settings.show_name -%}<input class="slnl__i slnl__i--name" type="text" name="contact[first_name]" autocomplete="given-name" placeholder="{{ section.settings.name_placeholder | default: 'First name' | escape }}" aria-label="{{ section.settings.name_placeholder | default: 'First name' | escape }}">{%- endif -%}
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
      version: "1.1.0",
      icon: "mail",
      settings: SETTINGS,
      presets: [
        { name: "Newsletter bar", settings: { look: "bar" } },
        { name: "Newsletter popup", settings: { look: "popup", align: "center", form_layout: "stacked", width: "narrow" } },
        { name: "Newsletter in the page", settings: { look: "inline", align: "center" } },
      ],
    }
    source = `${wrapCompatTemplate(MARKUP)}\n\n<schema>\n${JSON.stringify({ ...schema, shopify: { name: schema.name, settings: SETTINGS, presets: schema.presets } }, null, 2)}\n</schema>\n`
  }
  return source
}
