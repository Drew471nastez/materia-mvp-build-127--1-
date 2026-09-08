/**
 * The document the preview iframe runs.
 *
 * ============================================================================
 *  THE SANDBOX IS THE WHOLE SECURITY MODEL, AND IT IS ONE MISSING TOKEN WIDE
 * ============================================================================
 *
 * The iframe is `sandbox="allow-scripts"` WITHOUT `allow-same-origin`. Those
 * two together are the documented way to give a page full access to the
 * embedder's origin — with both, the "sandbox" is decorative, and code the AI
 * wrote could read the editor's Supabase session out of localStorage and act as
 * the signed-in creator. Without allow-same-origin the frame runs on an opaque
 * origin: no cookies, no storage, no DOM access upward, and the CSS isolation
 * the brief asks for comes free.
 *
 * That choice is why this file builds a STRING instead of serving a route. A
 * srcdoc document has no origin of its own to be same-origin with; a real URL
 * under the app would be same-origin with the editor the moment anybody added
 * allow-same-origin to fix a symptom.
 *
 * The generated site therefore gets no credentials of any kind, which is the
 * brief's rule stated as a mechanism rather than as a policy.
 */

/**
 * Served from our own origin, not esm.sh.
 *
 * Same argument as the wasm and Monaco: whether a creator can see their own
 * website today must not depend on a CDN we do not control — and a preview
 * that needs egress to a third party cannot be tested anywhere.
 *
 * scripts/build-sites-assets.mjs generates these from the React in
 * package.json, so the version the preview runs is the version the repository
 * installed rather than one written into a URL beside it and left behind.
 */
const IMPORT_MAP = {
  imports: {
    react: "/sites/vendor/react.js",
    "react/jsx-runtime": "/sites/vendor/react-jsx-runtime.js",
    "react/jsx-dev-runtime": "/sites/vendor/react-jsx-dev-runtime.js",
    "react-dom": "/sites/vendor/react-dom.js",
    "react-dom/client": "/sites/vendor/react-dom-client.js",
  },
}

export interface PreviewInput {
  /** The bundled ESM module. */
  code: string
  /** Bundled CSS, if the project imported any. */
  css?: string
  /** The project's index.html, used for whatever it puts in the body. */
  html?: string
}

/**
 * What the project's index.html contributes: its body, minus every script.
 *
 * The scripts are dropped because the bundle replaces them — leaving the
 * original `<script type="module" src="/src/main.tsx">` in would make the frame
 * request a path that does not exist on any server and log a 404 next to a
 * preview that otherwise worked, which is exactly the sort of noise that
 * teaches people to ignore the console.
 */
export function bodyFromHtml(html: string | undefined): string {
  if (!html) return '<div id="root"></div>'
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html
  const withoutScripts = body.replace(/<script[\s\S]*?<\/script>/gi, "")
  return withoutScripts.trim() || '<div id="root"></div>'
}

/**
 * Errors have to leave the frame, or a broken site is a white rectangle.
 *
 * A null-origin frame cannot be inspected from the editor, so anything thrown
 * inside it is invisible unless it is deliberately forwarded. `postMessage` to
 * `"*"` is correct here precisely BECAUSE the frame is opaque: there is no
 * origin to name. The parent authenticates the other way round, by comparing
 * `event.source` to the iframe's contentWindow.
 */
const RUNTIME_BRIDGE = `
<script>
(function () {
  var send = function (kind, message, stack) {
    try { parent.postMessage({ source: "storelib-preview", kind: kind, message: String(message), stack: stack || "" }, "*") } catch (e) {}
  }
  window.addEventListener("error", function (e) {
    send("error", e.message, e.error && e.error.stack)
  })
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason
    send("error", (r && r.message) || r, r && r.stack)
  })
  // Told explicitly, because "it rendered" and "it did not throw" are not the
  // same claim and only the frame knows the difference.
  window.addEventListener("load", function () { send("ready", "") })

  /**
   * A LINK MUST NOT TAKE THE PREVIEW WITH IT.
   *
   * This is a srcdoc document, and a srcdoc document inherits its base URL
   * from the page around it. So <a href="/about"> inside a generated site does
   * not point at the generated site — it points at storelib.com/about, a real
   * page, which like every page on that domain is served with
   * X-Frame-Options: DENY. Clicking it navigated the frame there and the
   * browser refused, so the preview was replaced by "storelib.com refused to
   * connect." and the creator's work was gone from the screen.
   *
   * Measured, both directions, by counting load events on the frame: without
   * this the frame loads TWICE on a click — it left — and with it, once.
   *
   * Capture phase, so a handler in the site itself cannot get there first and
   * stop this from running.
   */
  var findLink = function (node) {
    while (node && node.nodeType === 1) {
      if (String(node.tagName).toUpperCase() === "A") return node
      node = node.parentNode
    }
    return null
  }

  document.addEventListener("click", function (e) {
    var link = findLink(e.target)
    if (!link) return
    var href = link.getAttribute("href") || ""

    /**
     * EVERY link is prevented, including a hash one, and that correction is
     * the whole point of this block.
     *
     * The first version exempted "#..." on the reasoning that an in-page
     * anchor scrolls rather than leaves. That reasoning is about an ordinary
     * page. THIS document is srcdoc: its own URL is "about:srcdoc" and its
     * BASE URL is the editor's, so "#features" resolves to
     * storelib.com/sites/<id>#features — a different document, and one that
     * denies framing like every page on that domain.
     *
     * Measured in a real srcdoc frame rather than reasoned about a second
     * time. All four navigated away; the frame loaded twice in every case:
     *
     *   #/booking     a hash route, which is how generated sites do pages
     *   #features     an in-page anchor whose element is right there
     *   #             a bare placeholder
     *   /about        the plain path already known about
     *
     * So the scroll is done HERE instead of being delegated to a browser that
     * would leave to do it.
     */
    e.preventDefault()

    if (href.charAt(0) === "#") {
      var id = href.slice(1)
      // A bare "#" is the placeholder every generated page uses for a button.
      // Stopping it is the whole behaviour — there is nothing to say about it.
      if (!id) return

      /**
       * getElementById and getElementsByName, because neither takes a
       * SELECTOR. The first version used querySelector with the id
       * interpolated into an attribute selector, which needs escaping — and
       * the escape, written inside a template literal inside TypeScript, came
       * out of the compiler as an invalid regular expression. The whole bridge
       * then failed to parse, which removes every listener in it silently:
       * no ready message, no click guard, and every link navigating again.
       * There is now a test that compiles this script and fails on that.
       */
      var target = document.getElementById(id)
      if (!target) {
        var named = document.getElementsByName(id)
        target = named && named.length ? named[0] : null
      }

      if (target && target.scrollIntoView) {
        target.scrollIntoView({ behavior: "smooth", block: "start" })
        return
      }

      // Nothing here answers to it — "#/booking" is a route, not an anchor.
      send("navigate", href)
      return
    }

    send("navigate", href)
  }, true)

  /**
   * A form does the same thing by a different route: <form action="/subscribe">
   * submits by NAVIGATING, and lands in exactly the same place.
   */
  document.addEventListener("submit", function (e) {
    e.preventDefault()
    send("navigate", (e.target && e.target.getAttribute && e.target.getAttribute("action")) || "")
  }, true)
})()
</script>`

export function previewDocument({ code, css, html }: PreviewInput): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<script type="importmap">${JSON.stringify(IMPORT_MAP)}</script>
${RUNTIME_BRIDGE}
<style>${css ?? ""}</style>
</head>
<body>
${bodyFromHtml(html)}
<script type="module">
${code}
</script>
</body>
</html>`
}

/**
 * What the frame shows before the first build finishes.
 *
 * A blank frame and a broken frame look identical, and the difference matters
 * most in the seconds after someone opens the editor for the first time.
 */
export function previewPlaceholder(message: string): string {
  const safe = message.replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"))
  return `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  html,body{height:100%;margin:0}
  body{display:grid;place-items:center;background:#fff;color:#6b6b72;
       font:14px ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
</style></head><body>${safe}</body></html>`
}

/**
 * The document a PUBLISHED site serves.
 *
 * Different from the preview in three ways that all follow from it being a
 * real page on the internet rather than a frame inside the editor:
 *
 *  - The bundle is a separate file, not inlined, so the CDN can cache it for a
 *    year while the HTML stays short-lived.
 *  - React comes from a shared immutable prefix in the same bucket — one copy
 *    for every site on the platform, on the same origin as the page, so it
 *    costs one connection and no CORS.
 *  - There is no error bridge. The preview forwards exceptions to the editor;
 *    a visitor's browser has nobody to forward them to.
 *
 * `siteId` is the ONLY Storelib value in the bundle, and it is public by
 * design — it is what the Site API uses to know which site a form submission
 * or a subscribe belongs to. No key, no token, no cookie.
 */
export function publishedDocument({
  css,
  html,
  siteId,
  title,
  description,
  version,
}: {
  code: string
  css?: string
  html?: string
  siteId: string
  title?: string
  description?: string
  /**
   * The revision these assets were built from, stamped onto their URLs.
   *
   * `/app.js` is a STABLE path whose contents change on every publish, and it
   * was served `immutable` for a year — the strongest cache promise there is,
   * strong enough that browsers will not revalidate it on a hard reload. So a
   * creator published new code and every visitor who had ever loaded the site,
   * and the CDN in front of them, kept running the old bundle. Publishing
   * appeared to do nothing.
   *
   * Stamping the version makes that promise true: a new publish is a new URL,
   * and the old one is never asked for again. Republishing without editing
   * keeps the same version, so an unchanged site correctly stays cached.
   */
  version?: string | number
}): string {
  const importMap = {
    imports: {
      react: `${VENDOR_PREFIX}/react.js`,
      "react/jsx-runtime": `${VENDOR_PREFIX}/react-jsx-runtime.js`,
      "react/jsx-dev-runtime": `${VENDOR_PREFIX}/react-jsx-dev-runtime.js`,
      "react-dom": `${VENDOR_PREFIX}/react-dom.js`,
      "react-dom/client": `${VENDOR_PREFIX}/react-dom-client.js`,
    },
  }

  // Empty when no version is supplied, so a caller that does not know its
  // revision still produces a working document rather than "?v=undefined".
  const assetVersion = version === undefined || version === null ? "" : `?v=${encodeURIComponent(String(version))}`

  const head = html?.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? ""
  const declaredTitle = title ?? head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim()

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeText(declaredTitle || "Site")}</title>
${description ? `<meta name="description" content="${escapeAttribute(description)}" />\n` : ""}<meta property="og:title" content="${escapeAttribute(declaredTitle || "Site")}" />
${description ? `<meta property="og:description" content="${escapeAttribute(description)}" />\n` : ""}<meta name="twitter:card" content="summary_large_image" />
<script type="importmap">${JSON.stringify(importMap)}</script>
${css ? `<link rel="stylesheet" href="./app.css${assetVersion}" />` : ""}
<script type="module" src="./app.js${assetVersion}"></script>
</head>
<body>
${bodyFromHtml(html)}
<script>window.__STORELIB_SITE_ID__=${JSON.stringify(siteId)}</script>
</body>
</html>`
}

/**
 * One shared copy of React for every published site, keyed by version.
 *
 * Immutable: the version is in the path, so this exact file at this exact URL
 * never changes and can be cached forever. Per-deployment copies would be
 * ~200KB duplicated across every publish of every site for no benefit.
 */
export const REACT_RUNTIME_VERSION = "19.2.0"
export const VENDOR_PREFIX = `/_vendor/react-${REACT_RUNTIME_VERSION}`

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;")
}
