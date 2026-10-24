/**
 * ===========================================================================
 *  THE ACCOUNT FORMS, PRESSED
 * ===========================================================================
 * Every sign in and account form on a website is a plain form post that
 * works without a line of script (app/api/site-account/*). This makes
 * pressing one feel like it was heard, on a Storelib theme's account pages
 * (app/(site)/w/[username]/render-account.tsx) and an imported theme's
 * (lib/storelib-theme/compat/account.ts) alike:
 *
 *   busy        the button pressed shows a small spinner and cannot be
 *               pressed twice (a second press sent a second code)
 *   in place    a form marked `data-sl-async` (the address book, the phone
 *               number) is sent with fetch and answered with JSON, so a
 *               refused field is said beside it, focused, with what was
 *               typed still there; the words are the page's own, in
 *               `data-sl-msg-<code>` (lib/site-accounts/words.ts)
 *   confirm     `data-sl-confirm` asks once before a delete
 *
 * A page restored from the back/forward cache is reset, so its buttons are
 * not left spinning. Without fetch, or with script off, the form posts as
 * it always did and the page it lands on says how it went.
 */

export const ACCOUNT_FORMS_STYLE = `.sl-busy{opacity:.7;pointer-events:none;cursor:progress}
.sl-busy::after{content:"";display:inline-block;flex:none;width:.9em;height:.9em;margin-left:.55em;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-.12em;animation:sl-acc-spin .7s linear infinite}
.sl-acc-in{animation:sl-acc-in .26s cubic-bezier(.2,.7,.3,1) both}
[data-sl-error]:not([hidden]){animation:sl-acc-in .2s ease-out both}
[aria-invalid="true"]{border-color:#c0392b!important}
@keyframes sl-acc-spin{to{transform:rotate(360deg)}}
@keyframes sl-acc-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.sl-busy::after{animation-duration:2s}.sl-acc-in,[data-sl-error]:not([hidden]){animation:none}}`

export const ACCOUNT_FORMS_SCRIPT = `(function(){if(window.__slAccForms)return;window.__slAccForms=1;
var ours=function(a){try{var u=new URL(a,location.href);return u.origin===location.origin&&/^\\/(?:api\\/site-account\\/|(?:[a-z]{2,3}(?:-[a-z0-9]{2,8})*\\/)?account\\/logout)/i.test(u.pathname)}catch(e){return false}};
var idle=function(f){f.removeAttribute("data-sl-busy");f.querySelectorAll(".sl-busy").forEach(function(b){b.classList.remove("sl-busy");b.removeAttribute("aria-busy")})};
document.addEventListener("submit",function(e){var f=e.target;if(!f||f.tagName!=="FORM"||e.defaultPrevented)return;var a=f.getAttribute("action")||"";if(!ours(a))return;
if(f.getAttribute("data-sl-busy")==="1"){e.preventDefault();return}
var q=f.getAttribute("data-sl-confirm");if(q&&!window.confirm(q)){e.preventDefault();return}
var b=e.submitter||f.querySelector("[type=submit]");f.setAttribute("data-sl-busy","1");if(b){b.classList.add("sl-busy");b.setAttribute("aria-busy","true")}
if(!f.hasAttribute("data-sl-async")||!window.fetch||!window.FormData)return;
e.preventDefault();var err=f.querySelector("[data-sl-error]");var body=new FormData(f);if(b&&b.name)body.append(b.name,b.value);
var say=function(code){idle(f);var msg=f.getAttribute("data-sl-msg-"+code)||f.getAttribute("data-sl-msg-failed")||"";f.querySelectorAll("[aria-invalid]").forEach(function(x){x.removeAttribute("aria-invalid")});if(err){err.textContent=msg;err.hidden=!msg}var field=f.querySelector('[data-sl-field~="'+code+'"]');if(field){field.setAttribute("aria-invalid","true");try{field.focus()}catch(x){}}};
fetch(a,{method:"POST",body:body,headers:{Accept:"application/json"},credentials:"same-origin"}).then(function(r){return r.json().catch(function(){return{ok:false,error:"failed"}})}).then(function(j){if(j&&j.to&&(j.ok||j.error==="signed_out")){var u=new URL(j.to,location.href);if(u.pathname+u.search===location.pathname+location.search){location.hash=u.hash;location.reload()}else location.assign(u.href);return}say(j&&j.error?j.error:"failed")}).catch(function(){say("network")})},false);
window.addEventListener("pageshow",function(ev){if(ev.persisted)document.querySelectorAll("form[data-sl-busy]").forEach(idle)});
})();`
