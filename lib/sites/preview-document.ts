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
