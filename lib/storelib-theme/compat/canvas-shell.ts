/**
 * ===========================================================================
 *  THE CANVAS SHELL: THE DOCUMENT ON THE CANVAS ORIGIN (lib/website-builder/canvas-origin.ts)
 * ===========================================================================
 * Served from the canvas origin (storelib.me/__canvas/<installId>) only when
 * NEXT_PUBLIC_CANVAS_ORIGIN is set. It holds nothing of the store: no page,
 * no draft, no setting. The editor sends it the page it drew, once ("doc"),
 * and it draws that page in a frame of its own, sandboxed as the canvas
 * always was (allow-scripts allow-forms allow-popups, never
 * allow-same-origin): the theme's scripts still run with no origin and
 * reach nothing, of the editor or of this origin.
 *
 * What it adds is the process: this document is on another site than the
 * editor, so Chrome draws it, and the page inside it, in a process of its
 * own, and the theme's scripts and layout no longer run on the editor's
 * main thread.
 *
 * MESSAGES, BOTH WAYS, BY EXACT ORIGIN:
 *   from the editor   heard only from the window that framed it (parent)
 *                     and only from EDITOR, the one origin the route
 *                     accepted for this address; passed to the page
 *   to the editor     posted to EDITOR only, never "*"
 *   from the page     heard only from the page's own window; passed on
 *   to the page       the page has no origin, so "*" is the only target a
 *                     message to it can carry; it goes to that one window,
 *                     which this shell made
 * The page is told to answer this shell's origin only, and to hear nothing
 * else (window.__slTo, window.__slFrom, read by canvas-bridge.ts and
 * canvas-network.ts).
 *
 * The page's address base is the editor's (the `base` the editor sends, kept
 * only when it is on EDITOR), so every address in it resolves as it did when
 * it was drawn in the editor's own srcdoc frame: the theme's files and
 * pictures, and the website's own addresses the bridge asks the editor for.
 *
 * Its load events are the page's: "frame-load" each time the page frame
 * loads, which the editor reads as it read the srcdoc frame's own (a second
 * load is the page having left the canvas, compat-canvas.tsx onFrameLoad).
 */

/** The sandbox the page itself is drawn in: the same as the srcdoc frame's. */
export const CANVAS_PAGE_SANDBOX = "allow-scripts allow-forms allow-popups"

/** The page with this shell's origin given to it, first in its head, so the bridge reads it before anything else runs. */
export function withShellOrigin(html: string, origin: string): string {
  const tag = `<script>window.__slTo=window.__slFrom=${JSON.stringify(origin).replace(/</g, "\\u003c")};</script>`
  return /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, (h) => `${h}${tag}`) : `${tag}${html}`
}

/** The shell document for one editor origin (already checked by the route against the editors allowed). */
export function canvasShellHtml(editorOrigin: string): string {
  const editor = JSON.stringify(editorOrigin).replace(/</g, "\\u003c")
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Canvas</title><style>html,body{margin:0;height:100%;overflow:hidden;background:#fff}iframe{display:block;border:0;width:100%;height:100%}</style></head><body><script>(function(){
var EDITOR=${editor},SELF=location.origin,inner=null;
var withOrigin=function(h,o){var t="<scr"+"ipt>window.__slTo=window.__slFrom="+JSON.stringify(o)+";<\\/script>";return /<head\\b[^>]*>/i.test(h)?h.replace(/<head\\b[^>]*>/i,function(x){return x+t}):t+h};
var toEditor=function(m){try{parent.postMessage(m,EDITOR)}catch(e){}};
var draw=function(html,base){
if(inner)return;
if(typeof base==="string"){try{var b=new URL(base);if(b.origin===EDITOR){var el=document.createElement("base");el.href=b.href;document.head.appendChild(el)}}catch(e){}}
var f=document.createElement("iframe");
f.setAttribute("sandbox",${JSON.stringify(CANVAS_PAGE_SANDBOX)});
f.setAttribute("title","Preview");
f.addEventListener("load",function(){toEditor({storelib:1,type:"frame-load"})});
f.srcdoc=withOrigin(html,SELF);
document.body.appendChild(f);
inner=f;
};
addEventListener("message",function(e){
if(e.source===parent){
if(e.origin!==EDITOR)return;
var m=e.data;
if(m&&m.storelib===1&&m.type==="doc"){if(typeof m.html==="string")draw(m.html,m.base);return}
if(inner&&inner.contentWindow)inner.contentWindow.postMessage(m,"*");
return;
}
if(inner&&e.source===inner.contentWindow)toEditor(e.data);
});
toEditor({storelib:1,type:"shell-ready"});
})();</script></body></html>`
}
