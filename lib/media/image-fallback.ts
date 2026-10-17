/**
 * ===========================================================================
 *  A PICTURE THAT FAILS NEVER SHOWS A BROKEN ICON (round AG)
 * ===========================================================================
 * The owner: broken thumbnails and product photos in the builder, on live
 * websites, at checkout (the business logo, the product) and in the cart.
 *
 * What was found: the media address itself works (https://storelib.com/media/…
 * answers from every host), but some pictures are gone from storage (a file
 * a product still names, removed long ago), and a picture can fail on one
 * route of delivery and not another (Next's image optimizer, a website on its
 * own domain). Each of those showed the browser's broken picture.
 *
 * This runs in <head>, before anything paints, and listens for any <img> that
 * fails, once, for the whole page (an <img> drawn by a theme or by the cart's
 * own script included). In order:
 *   1. a picture through Next's optimizer (/_next/image?url=…) is loaded
 *      straight from its own address;
 *   2. one of Storelib's media addresses on another host is asked for on this
 *      host's /media/ path (the proxy serves it on every host);
 *   3. still nothing: the picture is hidden (data-img-broken), so the frame
 *      around it shows its quiet background, never a torn icon.
 * Each step is tried once per picture (data-img-retry), so it can never loop.
 */
export const IMAGE_FALLBACK_SCRIPT = `(function(){try{
function onErr(e){var img=e&&e.target;if(!img||img.tagName!=="IMG")return;
var tried=img.getAttribute("data-img-retry")||"";var src=img.currentSrc||img.src||"";if(!src)return;
if(tried.indexOf("o")<0&&src.indexOf("/_next/image?")>=0){try{var raw=new URL(src,location.href).searchParams.get("url");if(raw){img.setAttribute("data-img-retry",tried+"o");img.removeAttribute("srcset");img.removeAttribute("sizes");img.src=raw;return}}catch(_){}}
if(tried.indexOf("m")<0){try{var u=new URL(src,location.href);if(u.pathname.indexOf("/media/")===0&&u.host!==location.host){img.setAttribute("data-img-retry",tried+"m");img.removeAttribute("srcset");img.removeAttribute("sizes");img.src=location.origin+u.pathname+u.search;return}}catch(_){}}
img.setAttribute("data-img-broken","")}
window.addEventListener("error",onErr,true)}catch(_){}})();`
