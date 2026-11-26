(function(){if(window.__slAccForms)return;window.__slAccForms=1;
var ours=function(a){try{var u=new URL(a,location.href);return u.origin===location.origin&&/^\/(?:api\/site-account\/|(?:[a-z]{2,3}(?:-[a-z0-9]{2,8})*\/)?account\/logout)/i.test(u.pathname)}catch(e){return false}};
var idle=function(f){f.removeAttribute("data-sl-busy");f.querySelectorAll(".sl-busy").forEach(function(b){b.classList.remove("sl-busy");b.removeAttribute("aria-busy")})};
document.addEventListener("submit",function(e){var f=e.target;if(!f||f.tagName!=="FORM"||e.defaultPrevented)return;var a=f.getAttribute("action")||"";if(!ours(a))return;
if(f.getAttribute("data-sl-busy")==="1"){e.preventDefault();return}
var q=f.getAttribute("data-sl-confirm");if(q&&!window.confirm(q)){e.preventDefault();return}
var b=e.submitter||f.querySelector("[type=submit]");f.setAttribute("data-sl-busy","1");if(b){b.classList.add("sl-busy");b.setAttribute("aria-busy","true")}
if(!f.hasAttribute("data-sl-async")||!window.fetch||!window.FormData)return;
e.preventDefault();var err=f.querySelector("[data-sl-error]");var body=new FormData(f);if(b&&b.name)body.append(b.name,b.value);
var say=function(code){idle(f);var msg=f.getAttribute("data-sl-msg-"+code)||f.getAttribute("data-sl-msg-failed")||"";f.querySelectorAll("[aria-invalid]").forEach(function(x){x.removeAttribute("aria-invalid")});if(err){err.textContent=msg;err.hidden=!msg}var field=f.querySelector('[data-sl-field~="'+code+'"]');if(field){field.setAttribute("aria-invalid","true");try{field.focus()}catch(x){}}};
fetch(a,{method:"POST",body:body,headers:{Accept:"application/json"},credentials:"same-origin"}).then(function(r){return r.json().catch(function(){return{ok:false,error:"failed"}})}).then(function(j){if(j&&j.to&&(j.ok||j.error==="signed_out")){var u=new URL(j.to,location.href);if(u.pathname+u.search===location.pathname+location.search){location.hash=u.hash;location.reload()}else __slGo("assign",u.href);return}say(j&&j.error?j.error:"failed")}).catch(function(){say("network")})},false);
window.addEventListener("pageshow",function(ev){if(ev.persisted)document.querySelectorAll("form[data-sl-busy]").forEach(idle)});
})();