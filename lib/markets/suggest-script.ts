/**
 * ===========================================================================
 *  THE LANGUAGE SUGGESTION CARD
 * ===========================================================================
 * A small card (at the top on a phone, in the bottom right corner on a
 * computer), offering the website in the
 * language a visitor most likely reads, when "Show visitors their own
 * language" found a near match or only their country to go by
 * (lib/markets/visitor-language.ts). The proxy names the language in a
 * cookie for the visit (sl_suggest); this draws the card from it:
 *
 *   written in the language it offers ("Voir ce site en français ?"), with
 *   the language's own name on the button and a close button
 *   one press either way, remembered as the visitor's choice (sl_lang), so
 *   it is never shown again and nothing is ever redirected after it
 *   not a modal: the page stays usable under it, nothing is dimmed, no
 *   focus is taken; Escape closes it
 *   never in a frame (the editor's canvas), never on a page already in it
 *
 * One script for every kind of page: a builder theme and the creator page
 * run it through components/website-builder/theme/language-suggest, an
 * imported theme gets it inline (app/api/site-theme/site). It defines
 * window.__slLangSuggest(conf); nothing here can break the page.
 */
import { SUGGEST_WORDS } from "./visitor-language"

export interface LanguageSuggestConf {
  /** The language this page is drawn in. */
  current: string
  /** The website's own language: its addresses carry no prefix. */
  defaultLanguage: string
  /** Every published language, the website's own first. */
  languages: string[]
  /** "path": /fr/… addresses (a website); "query": ?lang=fr (the creator page). */
  address: "path" | "query"
  /** The language to offer, when the page itself decided it (the creator page); otherwise the proxy's sl_suggest. */
  suggest?: string | null
}

const WORDS_JSON = JSON.stringify(SUGGEST_WORDS)

export const LANGUAGE_SUGGEST_JS =
  "window.__slLangSuggest=function(C){try{var w=window,d=document;if(w.__slLangShown)return;try{if(w.self!==w.top)return}catch(e){return}" +
  "function ck(n){var m=d.cookie.match(new RegExp('(?:^|;\\\\s*)'+n+'=([^;]*)'));return m?decodeURIComponent(m[1]):''}" +
  "if(ck('sl_lang'))return;var asked=String(C.suggest||ck('sl_suggest')).toLowerCase();if(!asked||asked==='-')return;" +
  "var code=null;for(var i=0;i<C.languages.length;i++)if(C.languages[i].toLowerCase()===asked)code=C.languages[i];if(!code||code.toLowerCase()===String(C.current).toLowerCase())return;" +
  `var W=${WORDS_JSON};var lw=code.toLowerCase(),words=W[code]||(lw.indexOf('zh')===0?W[/hant|tw|hk|mo/.test(lw)?'zh-Hant':'zh-Hans']:W[lw.split('-')[0]])||W.en;` +
  /* The language's name in its own words: lower case inside a sentence, as most languages write it; capitalised on the button. */
  "function own(c){try{return new Intl.DisplayNames([c],{type:'language'}).of(c)||c}catch(e){return c}}var name=own(code),cap=name.charAt(0).toLocaleUpperCase(code)+name.slice(1);" +
  "var inSentence=words===W.en?cap:name;" +
  /* Where the button goes: the same page in that language. */
  "function href(){var l=location,p=l.pathname,codes=C.languages.map(function(x){return x.toLowerCase()}),def=C.defaultLanguage.toLowerCase();" +
  "if(C.address==='query'){var u=new URL(l.href);if(code.toLowerCase()===def)u.searchParams.delete('lang');else u.searchParams.set('lang',code.toLowerCase());return u.pathname+u.search+u.hash}" +
  "var m=p.match(/^\\/([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)(\\/.*)?$/),rest=p;if(m&&codes.indexOf(m[1].toLowerCase())>=0&&m[1].toLowerCase()!==def)rest=m[2]||'/';" +
  "var to=code.toLowerCase()===def?rest:'/'+code.toLowerCase()+(rest==='/'?'':rest);return to+l.search+l.hash}" +
  "function keep(c){try{d.cookie='sl_lang='+encodeURIComponent(c.toLowerCase())+'; Path=/; Max-Age=31536000; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'')}catch(e){}}" +
  "var rtl=/^(ar|he|fa|ur|ps|sd|ug|yi|dv|ckb)(-|$)/i.test(code);" +
  "var box=d.createElement('aside');box.setAttribute('data-language-suggest',code);box.setAttribute('lang',code);box.setAttribute('dir',rtl?'rtl':'ltr');box.setAttribute('aria-label',words.ask.replace('{name}',inSentence));" +
  "var reduce=w.matchMedia&&w.matchMedia('(prefers-reduced-motion: reduce)').matches;" +
  /* A phone: at the top, clear of the cookie banner, a sticky add to cart and a theme's bottom bar. A computer: the bottom right corner, clear of the header's links and the cookie card (bottom left). */
  "var wide=(w.innerWidth||0)>=768,from=reduce?'0':(wide?'6px':'-6px');" +
  "box.style.cssText='position:fixed;z-index:2147482000;'+(wide?'right:24px;bottom:24px;width:400px;':'top:calc(12px + env(safe-area-inset-top,0px));left:16px;right:16px;')+'box-sizing:border-box;display:flex;align-items:center;gap:10px;padding:8px 8px 8px 14px;background:#fff;color:#1a1a2e;border:1px solid rgba(229,231,235,.95);border-radius:14px;box-shadow:0 12px 32px -12px rgba(17,24,39,.22),0 1px 3px rgba(0,0,0,.05);font:500 14px/1.35 Inter,ui-sans-serif,system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;letter-spacing:0;text-align:start;transform:translateY('+from+');opacity:'+(reduce?'1':'0')+';transition:opacity .18s ease,transform .18s ease';" +
  "var g=d.createElementNS('http://www.w3.org/2000/svg','svg');g.setAttribute('viewBox','0 0 20 20');g.setAttribute('width','18');g.setAttribute('height','18');g.setAttribute('aria-hidden','true');g.setAttribute('fill','none');g.setAttribute('stroke','#6b7280');g.setAttribute('stroke-width','1.5');g.style.flex='none';" +
  "g.innerHTML='<circle cx=\"10\" cy=\"10\" r=\"7.25\"/><path d=\"M2.75 10h14.5M10 2.75c2 2.2 2.9 4.6 2.9 7.25S12 15.05 10 17.25M10 2.75C8 4.95 7.1 7.35 7.1 10s.9 5.05 2.9 7.25\"/>';" +
  "var t=d.createElement('span');t.textContent=words.ask.replace('{name}',inSentence);t.style.cssText='flex:1;min-width:0;color:#1a1a2e';" +
  "var go=d.createElement('a');go.href=href();go.textContent=cap;go.setAttribute('data-language-suggest-go','');go.style.cssText='flex:none;display:inline-flex;align-items:center;height:34px;padding:0 12px;border-radius:9px;background:#1a1a2e;color:#fff;font-weight:600;font-size:13.5px;text-decoration:none;white-space:nowrap;max-width:45%;overflow:hidden;text-overflow:ellipsis';" +
  "go.addEventListener('click',function(){keep(code)});" +
  "var x=d.createElement('button');x.type='button';x.setAttribute('aria-label',words.close);x.setAttribute('data-language-suggest-close','');x.style.cssText='flex:none;display:grid;place-items:center;width:34px;height:34px;margin:0;padding:0;border:0;border-radius:9px;background:transparent;color:#6b7280;cursor:pointer';" +
  "x.innerHTML='<svg viewBox=\"0 0 20 20\" width=\"16\" height=\"16\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\"><path d=\"M5.5 5.5l9 9M14.5 5.5l-9 9\"/></svg>';" +
  "function close(){keep(C.current);d.removeEventListener('keydown',esc);box.style.opacity='0';setTimeout(function(){box.remove()},reduce?0:180)}function esc(e){if(e.key==='Escape')close()}" +
  "x.addEventListener('click',close);d.addEventListener('keydown',esc);" +
  "box.appendChild(g);box.appendChild(t);box.appendChild(go);box.appendChild(x);w.__slLangShown=true;(d.body||d.documentElement).appendChild(box);" +
  "requestAnimationFrame(function(){requestAnimationFrame(function(){box.style.opacity='1';box.style.transform='translateY(0)'})})" +
  "}catch(e){}};"

/** The script and its call, for a page that is not React (an imported theme). */
export function languageSuggestTag(conf: LanguageSuggestConf): string {
  const json = JSON.stringify(conf).replace(/</g, "\\u003c")
  return `<script data-storelib-language-suggest>${LANGUAGE_SUGGEST_JS}(function(){var f=function(){window.__slLangSuggest(${json})};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',f);else f()})();</script>`
}
