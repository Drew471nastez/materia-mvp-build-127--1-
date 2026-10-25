/**
 * ===========================================================================
 *  PERSONALIZATION FIELDS IN A THEME IMPORTED FROM SHOPIFY
 * ===========================================================================
 * What a product that ships asks the buyer (lib/products/personalization.ts)
 * reaches an imported theme four ways, the first that applies winning, as
 * the size chart does (./size-chart.ts):
 *
 *   THE METAFIELD    `product.metafields.storelib.personalization.value`
 *                    (./objects.ts): one object per field, `label`, `type`
 *                    (text, textarea, image), `required`, `max_length`,
 *                    `placeholder`, `help_text`, `name` (the input name to
 *                    post: properties[<label>]), `accept` and `max_size` for
 *                    a photo. A theme whose code reads it draws the fields
 *                    itself, and Storelib adds only its script.
 *   THE SNIPPET      `{% render 'storelib-personalization' %}`, or the filter
 *                    `{{ product | storelib_personalization }}`: Storelib's
 *                    fields, where the theme's code puts them.
 *   THE APP BLOCK    "Personalization" under Apps in Add block, in any
 *                    section that takes `@app`.
 *   IN THE FORM      otherwise, on the product page, inside the main product
 *                    form (Shopify's /cart/add), above its buy buttons.
 *
 * Each answer is posted the way every Shopify theme already posts line item
 * properties, `properties[<label>]`, so the theme's own Add to cart sends it
 * with nothing changed (./site.ts cartAction holds it to the product's
 * fields; the checkout checks again). A field drawn outside the form is
 * joined to it by the form attribute.
 *
 * ONE SMALL SCRIPT per page, delegated, so a section the theme draws again
 * (a variant change, a quick add) keeps working: a photo goes to the store's
 * private cart uploads (POST /cart/upload, lib/cart-uploads: checked by its
 * bytes, kept for this browser and this store), its value fills the hidden
 * input; a press of Add to cart or Buy it
 * now with a required answer missing, or a photo still uploading, is held
 * back and the field says why. Inert in the builder's canvas. The contract
 * for a theme's own markup: docs/theme-contracts/personalization-and-custom-fields.md.
 */
import type { BlockSchema } from "@/lib/website-builder/types"
import { MAX_UPLOAD_BYTES, UPLOAD_ACCEPT, readPersonalization, type PersonalizationField } from "@/lib/products/personalization"

type O = Record<string, unknown>

export const PERSONALIZATION_APP_BLOCK = "shopify://apps/storelib-personalization/blocks/personalization/storelib"
const APPS = /^shopify:\/\/apps\/[^/]*(storelib-personalization|personali[sz]|custom-?fields|product-?options|infinite-?options|customily|zepto|bold-?product-?options)[^/]*\/blocks\//i

export function isPersonalizationAppBlock(type: unknown): boolean {
  return typeof type === "string" && APPS.test(type)
}

export const PERSONALIZATION_APP_BLOCK_SCHEMAS: readonly BlockSchema[] = [
  {
    type: PERSONALIZATION_APP_BLOCK,
    name: "Personalization",
    theme: true,
    limit: 1,
    fields: [{ id: "heading", label: "Heading", type: "text", default: "", placeholder: "Make it yours", info: "Shows the fields the product asks for (Products, Personalization)." }],
  },
]

export function personalizationAppBlockSchema(type: string): BlockSchema | undefined {
  return PERSONALIZATION_APP_BLOCK_SCHEMAS.find((b) => b.type === type)
}

export const PERSONALIZATION_SNIPPET_NAME = "storelib-personalization"
export const PERSONALIZATION_SNIPPET = "{{ product | storelib_personalization: heading: heading }}"

/** The product's fields, from the page's `product` (the metafield). */
export function personalizationFieldsOf(product: unknown): PersonalizationField[] {
  const mf = (product as O | null | undefined)?.metafields as O | undefined
  const value = ((mf?.storelib as O | undefined)?.personalization as O | undefined)?.value
  if (!Array.isArray(value)) return []
  return readPersonalization(value.map((v) => ({ ...(v as O), type: (v as O)?.type === "textarea" ? "multiline" : (v as O)?.type, maxLength: (v as O)?.max_length })))
}

/** Whether a theme's own code reads the fields, so it draws them itself. */
export function themeReadsPersonalization(sources: Iterable<string>): boolean {
  for (const s of sources) if (/metafields\.storelib\.personalization|metafields\.storelib\[['"]personalization['"]\]|storelib_personalization|render\s+['"]storelib-personalization['"]/.test(s)) return true
  return false
}

/** Whether a section already holds the app block, at any depth. */
export function holdsPersonalizationBlock(blocks: readonly { type: string; blocks?: unknown }[] | undefined): boolean {
  return (blocks ?? []).some((b) => isPersonalizationAppBlock(b.type) || holdsPersonalizationBlock(b.blocks as { type: string; blocks?: unknown }[] | undefined))
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")

export interface PersonalizationWordsLike {
  optional_field: string
  upload_photo: string
  change_photo: string
  remove_photo: string
  uploading: string
  photo_added: string
  photo_types: string
  photo_failed: string
  photo_wait: string
  fill_in: string
}

/** The fields' look: the theme's own fonts and colours (inherited), Storelib's spacing. Scoped to .sl-pz. */
export const PERSONALIZATION_CSS = `<style data-storelib-personalization-css>.sl-pz{display:grid;gap:16px;margin:0 0 18px;text-align:left}.sl-pz__h{margin:0;font-weight:600;font-size:1.05em}.sl-pz__f{display:grid;gap:6px}.sl-pz__l{font-weight:500;font-size:.95em;line-height:1.3}.sl-pz__o{font-weight:400;opacity:.65;margin-left:6px;font-size:.9em}.sl-pz__i{box-sizing:border-box;width:100%;min-height:46px;padding:10px 12px;font:inherit;font-size:16px;color:inherit;background:transparent;border:1px solid rgba(127,127,127,.45);border-radius:var(--inputs-radius,8px);transition:border-color .15s ease}.sl-pz__i:focus{outline:none;border-color:currentColor}textarea.sl-pz__i{min-height:92px;resize:vertical;line-height:1.45}.sl-pz__help{margin:0;font-size:.85em;opacity:.7;line-height:1.4}.sl-pz__err{margin:0;font-size:.85em;font-weight:500;color:#b42318}.sl-pz__err[hidden],.sl-pz__ph[hidden],.sl-pz__drop[hidden]{display:none}.sl-pz__file{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}.sl-pz__drop{display:flex;align-items:center;gap:12px;min-height:52px;padding:10px 12px;border:1px solid rgba(127,127,127,.45);border-radius:var(--inputs-radius,8px);cursor:pointer}.sl-pz__drop small{display:block;opacity:.65;font-size:.82em}.sl-pz__drop b{font-weight:500}.sl-pz__ph{display:flex;align-items:center;gap:12px;padding:8px 10px;border:1px solid rgba(127,127,127,.45);border-radius:var(--inputs-radius,8px)}.sl-pz__ph img{width:56px;height:56px;object-fit:cover;border-radius:6px;background:rgba(127,127,127,.15)}.sl-pz__ph span{flex:1;min-width:0}.sl-pz__ph button{font:inherit;font-size:.88em;background:none;border:0;padding:6px;color:inherit;text-decoration:underline;cursor:pointer}.sl-pz__f[data-state=uploading] .sl-pz__ph img{opacity:.55}.sl-pz__f[data-invalid] .sl-pz__i,.sl-pz__f[data-invalid] .sl-pz__drop{border-color:#b42318}</style>`

/**
 * THE SCRIPT. Delegated on the document, once per page (window.__slPz), so a
 * section drawn again keeps its fields working. Uses the page's own host for
 * the upload calls (a website's host answers /api, proxy.ts).
 */
export const PERSONALIZATION_SCRIPT = `<script data-storelib-personalization-js>(function(){if(window.__slPz)return;window.__slPz=1;var d=document,MAX=${MAX_UPLOAD_BYTES},OK=${JSON.stringify(UPLOAD_ACCEPT.split(","))};
function box(el){return el&&el.closest?el.closest('[data-storelib-personalization]'):null}
function fieldOf(el){return el&&el.closest?el.closest('[data-storelib-pz-field]'):null}
function say(f,t){var e=f.querySelector('.sl-pz__err');if(!e)return;if(t){e.textContent=t;e.hidden=false;f.setAttribute('data-invalid','')}else{e.textContent='';e.hidden=true;f.removeAttribute('data-invalid')}}
function formFor(b){var f=b.closest('form');if(f&&/\\/cart\\/add/.test(f.getAttribute('action')||''))return f;var s=b.closest('[data-section-id],.shopify-section,section,main')||d;var all=s.querySelectorAll('form[action*="/cart/add"]');for(var i=0;i<all.length;i++){if(!/installment/i.test(all[i].id+' '+all[i].className))return all[i]}return null}
function link(b){if(b.__slLinked)return;var f=formFor(b);if(!f)return;b.__slLinked=1;if(b.closest('form')===f)return;if(!f.id)f.id='sl-pz-form-'+Math.random().toString(36).slice(2,8);var els=b.querySelectorAll('input[name],textarea[name]');for(var i=0;i<els.length;i++)els[i].setAttribute('form',f.id)}
function linkAll(){var bs=d.querySelectorAll('[data-storelib-personalization]');for(var i=0;i<bs.length;i++)link(bs[i])}
function words(b){try{return JSON.parse(b.getAttribute('data-words')||'{}')}catch(e){return{}}}
function upload(input){var f=fieldOf(input),b=box(input);if(!f||!b||b.hasAttribute('data-inert'))return;var w=words(b),file=input.files&&input.files[0];if(!file)return;var type=file.type==='image/jpg'?'image/jpeg':file.type;
if(OK.indexOf(type)<0){say(f,'Upload a JPG, PNG or WEBP photo.');input.value='';return}if(file.size>MAX){say(f,'This photo is over 10 MB. Choose a smaller one.');input.value='';return}
var hidden=f.querySelector('[data-storelib-upload-value]'),ph=f.querySelector('.sl-pz__ph'),drop=f.querySelector('.sl-pz__drop'),img=ph&&ph.querySelector('img'),label=ph&&ph.querySelector('span');
say(f,'');if(label&&label.__slOrig===undefined)label.__slOrig=label.textContent;if(hidden)hidden.value='';f.setAttribute('data-state','uploading');try{if(img)img.src=URL.createObjectURL(file)}catch(e){}if(label)label.textContent=w.uploading||'Uploading';if(ph)ph.hidden=false;if(drop)drop.hidden=true;var mine=f.__slTry=(f.__slTry||0)+1;
var fd=new FormData();fd.append('file',file,file.name||'photo');fetch('/cart/upload',{method:'POST',body:fd,credentials:'same-origin',headers:{accept:'application/json'}}).then(function(r){return r.json().catch(function(){return{}}).then(function(j){if(!r.ok||!j||!j.upload||!j.upload.value)throw new Error(j&&(j.description||j.message)||'');return j})}).then(function(done){if(mine!==f.__slTry)return;if(hidden){hidden.value=done.upload.value;hidden.dispatchEvent(new Event('change',{bubbles:true}))}f.setAttribute('data-state','done');if(label)label.textContent=w.photo_added||label.__slOrig||'Photo added'}).catch(function(e){if(mine!==f.__slTry)return;f.removeAttribute('data-state');if(ph)ph.hidden=true;if(drop)drop.hidden=false;input.value='';say(f,(e&&e.message)||w.photo_failed||'The photo could not be uploaded. Try again.')})}
function clear(btn){var f=fieldOf(btn);if(!f)return;f.__slTry=(f.__slTry||0)+1;var hidden=f.querySelector('[data-storelib-upload-value]'),ph=f.querySelector('.sl-pz__ph'),drop=f.querySelector('.sl-pz__drop'),input=f.querySelector('[data-storelib-upload]');if(hidden){hidden.value='';hidden.dispatchEvent(new Event('change',{bubbles:true}))}if(input)input.value='';if(ph)ph.hidden=true;if(drop)drop.hidden=false;f.removeAttribute('data-state')}
function problems(form){var bs=[],all=d.querySelectorAll('[data-storelib-personalization]');for(var i=0;i<all.length;i++){link(all[i]);if(formFor(all[i])===form)bs.push(all[i])}var first=null;
bs.forEach(function(b){if(b.hasAttribute('data-inert'))return;var w=words(b);var fs=b.querySelectorAll('[data-storelib-pz-field]');for(var j=0;j<fs.length;j++){var f=fs[j],t=null,label=f.getAttribute('data-label')||'';
if(f.getAttribute('data-state')==='uploading')t=w.photo_wait||'Wait for the photo to finish uploading.';else if(f.hasAttribute('data-required')){var v=f.querySelector('[name]');if(!v||!String(v.value||'').trim())t=(w.fill_in||'Fill in {label}').replace('{label}',label)}
say(f,t);if(t&&!first)first=f}});return first}
function hold(e,form){var first=problems(form);if(!first)return false;e.preventDefault();e.stopImmediatePropagation();var el=first.querySelector('.sl-pz__i,.sl-pz__drop');try{first.scrollIntoView({block:'center',behavior:'smooth'})}catch(x){}if(el&&el.focus)el.focus({preventScroll:true});return true}
d.addEventListener('change',function(e){var t=e.target;if(t&&t.matches&&t.matches('[data-storelib-upload]'))upload(t);else if(t&&fieldOf(t))say(fieldOf(t),'')},true);
d.addEventListener('keydown',function(e){var t=e.target;if((e.key==='Enter'||e.key===' ')&&t&&t.matches&&t.matches('.sl-pz__drop')){e.preventDefault();var i=d.getElementById(t.getAttribute('for'));if(i&&!i.disabled)i.click()}},true);
d.addEventListener('input',function(e){var f=fieldOf(e.target);if(f&&f.hasAttribute('data-invalid'))say(f,'')},true);
d.addEventListener('click',function(e){var t=e.target;var rm=t&&t.closest&&t.closest('[data-storelib-upload-remove]');if(rm){e.preventDefault();clear(rm);return}var btn=t&&t.closest&&t.closest('button,[type=submit]');if(!btn)return;var form=btn.form||btn.closest('form');if(!form||!/\\/cart\\/add/.test(form.getAttribute('action')||''))return;if(btn.type&&btn.type!=='submit'&&!/shopify-payment-button|buy.?it.?now|dynamic-checkout/i.test(btn.className+' '+(btn.name||'')))return;hold(e,form)},true);
d.addEventListener('submit',function(e){var form=e.target;if(form&&/\\/cart\\/add/.test(form.getAttribute('action')||''))hold(e,form)},true);
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',linkAll);else linkAll();
})();</script>`

/**
 * The fields' markup: every input named properties[<label>], so the theme's
 * own form posts the answers. The product id keeps two products' fields
 * apart on one page (a quick add beside the main product).
 */
export function personalizationHtml(fields: PersonalizationField[], productId: string, words: PersonalizationWordsLike, opts: { heading?: string; inEditor?: boolean; withCss?: boolean; withScript?: boolean } = {}): string {
  if (!fields.length) return ""
  const uid = esc(String(productId).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 12) || "p")
  const inert = opts.inEditor === true
  const wordJson = esc(JSON.stringify({ uploading: words.uploading, photo_added: words.photo_added, photo_failed: words.photo_failed, photo_wait: words.photo_wait, fill_in: words.fill_in }))
  const body = fields
    .map((f) => {
      const id = `sl-pz-${uid}-${esc(f.id)}`
      const name = esc(`properties[${f.label}]`)
      const optional = f.required ? "" : `<span class="sl-pz__o">${esc(words.optional_field)}</span>`
      const help = f.help ? `<p class="sl-pz__help" id="${id}-help">${esc(f.help)}</p>` : ""
      const err = `<p class="sl-pz__err" role="alert" hidden></p>`
      const head = `<div class="sl-pz__f" data-storelib-pz-field="${esc(f.id)}" data-label="${esc(f.label)}" data-type="${f.type}"${f.required ? " data-required" : ""}>`
      if (f.type === "image") {
        return `${head}<span class="sl-pz__l">${esc(f.label)}${optional}</span><input type="hidden" name="${name}" value="" data-storelib-upload-value><input class="sl-pz__file" type="file" id="${id}" accept="${UPLOAD_ACCEPT}" data-storelib-upload${inert ? " disabled" : ""} tabindex="-1" aria-hidden="true"><label class="sl-pz__drop" for="${id}" tabindex="0" role="button"${f.help ? ` aria-describedby="${id}-help"` : ""}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg><span><b>${esc(words.upload_photo)}</b><small>${esc(words.photo_types)}</small></span></label><div class="sl-pz__ph" hidden><img alt=""><span>${esc(words.photo_added)}</span><button type="button" data-storelib-upload-remove aria-label="${esc(words.remove_photo)}">${esc(words.remove_photo)}</button></div>${help}${err}</div>`
      }
      const common = `class="sl-pz__i" id="${id}" name="${name}" maxlength="${f.maxLength ?? 250}"${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ""}${f.required ? " required" : ""}${inert ? " readonly" : ""}${f.help ? ` aria-describedby="${id}-help"` : ""} autocomplete="off"`
      const input = f.type === "multiline" ? `<textarea ${common} rows="3"></textarea>` : `<input type="text" ${common}>`
      return `${head}<label class="sl-pz__l" for="${id}">${esc(f.label)}${optional}</label>${input}${help}${err}</div>`
    })
    .join("")
  const heading = opts.heading ? `<p class="sl-pz__h">${esc(opts.heading)}</p>` : ""
  return `${opts.withCss === false ? "" : PERSONALIZATION_CSS}<div class="sl-pz" data-storelib-personalization data-product-id="${esc(productId)}" data-words="${wordJson}"${inert ? " data-inert" : ""}>${heading}${body}</div>${opts.withScript === false || inert ? "" : PERSONALIZATION_SCRIPT}`
}

/**
 * The main product section's markup with the fields inside its product form,
 * above the buy buttons, or null when this is not where they go: no product
 * form, or fields already drawn.
 *
 *   Dawn and its family     before the form's .product-form__buttons
 *   any other theme         before the form's first submit button
 *   no button found         at the end of the form
 */
export function withPersonalizationFields(html: string, fieldsHtml: string): string | null {
  if (!fieldsHtml || /data-storelib-personalization[\s>=]/.test(html)) return null
  const forms = /<form\b[^>]*action=["'][^"']*\/cart\/add[^>]*>/gi
  let f: RegExpExecArray | null
  while ((f = forms.exec(html))) {
    if (/installment/i.test(f[0])) continue
    const start = f.index + f[0].length
    const end = html.indexOf("</form>", start)
    if (end < 0) return null
    const inner = html.slice(start, end)
    const buttons = inner.search(/<div\b[^>]*class=["'][^"']*product-form__buttons/i)
    const submit = buttons >= 0 ? buttons : inner.search(/<button\b[^>]*(type=["']submit["']|name=["']add["'])/i)
    const at = submit >= 0 ? start + submit : end
    return html.slice(0, at) + fieldsHtml + html.slice(at)
  }
  return null
}
