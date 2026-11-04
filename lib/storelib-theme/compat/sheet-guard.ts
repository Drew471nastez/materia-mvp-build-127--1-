/**
 * ===========================================================================
 *  A STYLESHEET THAT DOES NOT ANSWER NEVER HOLDS A PAGE OF THE BUILDER
 * ===========================================================================
 * The owner (andrewrullz, 1 Nov 2026): every card in Add a section stayed an
 * empty grey box, a section added was not drawn in the canvas, and sections
 * already on the page were listed but not drawn. Production said "[compat-
 * canvas] the page never said it had drawn".
 *
 * Both pages are documents the builder writes, with the theme's stylesheets
 * linked in their head. A linked stylesheet in the head holds back every
 * script after it (the canvas's bridge, at the end of the page, is one) and
 * the document's load event (what the Add a section cards' page waited for
 * before it drew a single card). When one stylesheet does not answer (the
 * asset route waiting on a database or on Supabase Auth, both measured at
 * 10s and more in production that day, a web font host that hangs), the
 * canvas's bridge never ran, so no change ever reached the page, and the
 * cards' page never loaded, so no card was ever drawn. Nothing put an end
 * to the wait (scripts/check-compat-stalls.mjs, scripts/check-canvas-stalls.mjs).
 *
 * Now a stylesheet that has not come after SHEET_WAIT_MS is let go of: it is
 * put back as a copy that loads on its own (a stylesheet a script inserts
 * holds back neither scripts nor the load event), and the one that was
 * holding the page is taken out. The page goes on with what it has; the
 * copy styles it when it does arrive. Which ones were let go is said, so the
 * error log hears of it.
 *
 * No imports: the canvas page runs CANVAS_SHEET_GUARD as a string, and the
 * cards' page (a frame with no scripts) is guarded from outside with
 * releaseLateSheets.
 */

/** How long a page of the builder waits for a stylesheet before it goes on without it. */
export const SHEET_WAIT_MS = 3000

/** The short name of a stylesheet's address, for a report (never a query, never a pass). */
export function sheetName(href: string): string {
  const path = String(href).split(/[?#]/)[0]
  return (path.split("/").pop() || path).slice(0, 80)
}

/**
 * The stylesheets in `doc` that have neither loaded nor failed, each put
 * back as a copy that holds nothing, in the same place (so the cascade is
 * the same once it arrives). Returns the names of the ones let go.
 * `done` says which links have already answered (an error leaves no sheet).
 */
export function releaseLateSheets(doc: Document, done: (link: HTMLLinkElement) => boolean = () => false): string[] {
  const out: string[] = []
  for (const link of Array.from(doc.querySelectorAll<HTMLLinkElement>("link[rel~='stylesheet'][href]"))) {
    if (link.sheet || done(link) || link.hasAttribute("data-sl-released")) continue
    const copy = doc.createElement("link")
    for (const a of Array.from(link.attributes)) copy.setAttribute(a.name, a.value)
    copy.setAttribute("data-sl-released", "")
    link.after(copy)
    link.remove()
    out.push(sheetName(link.getAttribute("href") ?? ""))
  }
  return out
}

/**
 * The same, in the canvas page, first thing in its head: each link's own
 * answer is heard as it comes (load and error, in the capture phase), and
 * after SHEET_WAIT_MS any still on its way is let go of and said to the
 * builder ("slow-sheets").
 */
export const CANVAS_SHEET_GUARD = `<script data-sl-sheet-guard>(function(){var d=document,done=function(e){var t=e.target;if(t&&t.tagName==="LINK")t.__slDone=true};d.addEventListener("load",done,true);d.addEventListener("error",done,true);setTimeout(function(){if(d.readyState==="complete")return;var late=[];Array.prototype.forEach.call(d.querySelectorAll("link[rel~='stylesheet'][href]"),function(l){if(l.sheet||l.__slDone||l.hasAttribute("data-sl-released"))return;var c=d.createElement("link");Array.prototype.forEach.call(l.attributes,function(a){c.setAttribute(a.name,a.value)});c.setAttribute("data-sl-released","");l.parentNode.insertBefore(c,l.nextSibling);l.parentNode.removeChild(l);late.push(String(l.getAttribute("href")||"").split(/[?#]/)[0].split("/").pop().slice(0,80))});if(late.length)try{parent.postMessage({storelib:1,type:"slow-sheets",names:late},window.__slTo||"*")}catch(e){}},${SHEET_WAIT_MS})})()</script>`
