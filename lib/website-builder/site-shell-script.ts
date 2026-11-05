/**
 * ===========================================================================
 *  WHAT A PUBLISHED WEBSITE'S DOCUMENT DOES BEFORE ITS FIRST PAINT
 * ===========================================================================
 * A website has a root layout of its own (app/(site)/layout.tsx), so none of
 * Storelib's boot scripts run on it any more. Two of them did something for
 * a website, and they are kept here, word for word:
 *
 *   - inside the phone app (Capacitor, *.storelib.com is in its
 *     allowNavigation): `capacitor` on <html>, which the native CSS rules key
 *     on, and Stripe's windows kept in the web view rather than opened out;
 *   - the visible viewport as --vv-h, --vv-top and --kb-inset, which the
 *     cart sheet and the chat read before components/viewport-vars.tsx runs.
 *
 * Not kept: the app's redirect of `/` to /native-start, which is for
 * storelib.com's marketing pages, and on a website's front page sent the
 * phone app to a page the website does not have.
 */
export const SITE_SHELL_SCRIPT =
  "try{var _ua=navigator.userAgent||'';if((window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())||/StorelibApp|Capacitor/.test(_ua)){document.documentElement.classList.add('capacitor');var _ow=window.open;window.open=function(u,t,f){if(u&&/stripe\\.com/.test(String(u))){var s={closed:false,close:function(){s.closed=true},focus:function(){},blur:function(){},postMessage:function(){},location:{href:String(u)},opener:window};return s}return _ow.apply(window,arguments)};var _stay=function(u){return u&&/https?:\\/\\/(connect|js)\\.stripe\\.com\\//.test(String(u))};try{var _as=location.assign.bind(location);location.assign=function(u){if(_stay(u))return;return _as(u)}}catch(e){}try{var _rp=location.replace.bind(location);location.replace=function(u){if(_stay(u))return;return _rp(u)}}catch(e){}try{if(window.navigation)navigation.addEventListener('navigate',function(e){try{var u=e.destination&&e.destination.url;if(_stay(u)&&e.cancelable)e.preventDefault()}catch(err){}})}catch(e){}}}catch(e){}" +
  "try{var r=document.documentElement,vv=window.visualViewport;r.style.setProperty('--vv-h',Math.round(vv?vv.height:window.innerHeight)+'px');r.style.setProperty('--vv-top',Math.round(vv?vv.offsetTop:0)+'px');r.style.setProperty('--kb-inset',Math.max(0,Math.round(window.innerHeight-(vv?vv.offsetTop:0)-(vv?vv.height:window.innerHeight)))+'px')}catch(e){}"

/** The phone app's shell, by the same test the script above makes (lib/native-bridge isNativeApp, without importing the bridge). */
export function inNativeShell(): boolean {
  if (typeof window === "undefined") return false
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
  return !!w.Capacitor?.isNativePlatform?.() || /StorelibApp|Capacitor/.test(navigator.userAgent || "")
}
