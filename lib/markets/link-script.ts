/**
 * ===========================================================================
 *  EVERY LINK OF A PAGE, IN THE PAGE'S LANGUAGE
 * ===========================================================================
 * For an imported theme's page in another of the website's languages
 * (lib/markets/compat.ts): a small script, put at the end of the page, that
 * gives every link to the website and every search form the language's
 * prefix (/about becomes /fr/about), now and as the theme adds more (a cart
 * drawer, a menu opened later). Links to other websites, anchors, files and
 * links already in a language are left as they are. The builder theme's
 * language switch does the same (components/website-builder/theme/
 * language-switch.tsx).
 *
 * Pure: the codes are checked here and written into the script as JSON.
 */
import { localePrefix, normalizeLocale } from "./locales"

export function linkLanguageScript(code: string, defaultLanguage: string, languages: readonly string[]): string {
  const lang = normalizeLocale(code)
  const def = normalizeLocale(defaultLanguage)
  if (!lang || !def || lang === def) return ""
  const prefixes = languages.map((l) => normalizeLocale(l)).filter((l): l is string => !!l && l !== def).map(localePrefix)
  const data = JSON.stringify({ p: localePrefix(lang), all: prefixes })
  return `<script data-storelib-language>(function(d){var c=${data};var o=location.origin;var re=new RegExp("^/(?:"+c.all.map(function(x){return x.replace(/[^a-z0-9-]/g,"")}).join("|")+")(?:/|$)","i");function fix(h){if(!h||h.charAt(0)==="#"||/^(mailto|tel|javascript|data):/i.test(h))return null;var u;try{u=new URL(h,o)}catch(e){return null}if(u.origin!==o)return null;if(/^\\/(api|cdn|_next|media|files|apps)(\\/|$)/.test(u.pathname)||/\\.[a-z0-9]{1,8}$/i.test(u.pathname)||re.test(u.pathname))return null;var p="/"+c.p+(u.pathname==="/"?"":u.pathname);return p+u.search+u.hash}function run(r){(r.querySelectorAll?r:d).querySelectorAll("a[href]").forEach(function(a){var n=fix(a.getAttribute("href"));if(n)a.setAttribute("href",n)});(r.querySelectorAll?r:d).querySelectorAll("form[action]").forEach(function(f){if((f.getAttribute("method")||"get").toLowerCase()!=="get")return;var n=fix(f.getAttribute("action"));if(n)f.setAttribute("action",n)})}run(d);new MutationObserver(function(m){m.forEach(function(x){x.addedNodes.forEach(function(n){if(n.nodeType===1)run(n.parentNode||d)})})}).observe(d.documentElement,{childList:true,subtree:true})})(document)</script>`
}
