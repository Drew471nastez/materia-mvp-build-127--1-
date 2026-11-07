import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { parseLinkMetadata } from "../lib/onepage/link-metadata"
import { socialPresentation } from "../lib/onepage/block-presentation"
const url = "https://example.com/redirected/page"
const meta = parseLinkMetadata(
  `<title>Fallback</title><meta property="og:title" content="Training &amp; plans"><meta property="og:description" content="&lt;b&gt;Healthy&lt;/b&gt;"><meta property="og:image" content="../cover.jpg"><script>alert(1)</script>`,
  url,
)
assert.equal(meta.title, "Training & plans")
assert.equal(meta.image, "https://example.com/cover.jpg")
assert.equal(meta.url, url)
assert.ok(!meta.description.includes("<"))
assert.equal(parseLinkMetadata("<title>A &amp; B</title>", url).title, "A & B")
assert.equal(parseLinkMetadata("", url).title, "example.com")
for (const image of [
  "http://127.0.0.1/private",
  "http://169.254.169.254/latest",
  "javascript:alert(1)",
  "https://user:password@example.com/image",
])
  assert.equal(
    parseLinkMetadata(`<meta property="og:image" content="${image}">`, url)
      .image,
    null,
  )
assert.equal(
  parseLinkMetadata(
    `<meta property="og:title" content="${"x".repeat(1000)}">`,
    url,
  ).title.length,
  200,
)
/* The site's icon: its declared icon, else /favicon.ico; a private or http address on a https page is not passed on as such. */
assert.equal(parseLinkMetadata(`<link rel="icon" href="/static/icon.png">`, url).favicon, "https://example.com/static/icon.png")
assert.equal(parseLinkMetadata("<title>x</title>", url).favicon, "https://example.com/favicon.ico")
assert.equal(parseLinkMetadata(`<link rel="shortcut icon" href="http://10.0.0.1/i.png">`, url).favicon, "https://example.com/favicon.ico")
assert.equal(parseLinkMetadata(`<meta property="og:image" content="http://cdn.example.com/a.jpg">`, url).image, "https://cdn.example.com/a.jpg")
for (const address of [
  "https://vimeo.com/123456789",
  "https://x.com/creator/status/123456789",
])
  assert.ok(socialPresentation(address))
for (const address of [
  "https://vimeo.com.evil.test/123456789",
  "https://x.com.evil.test/creator/status/123456789",
])
  assert.equal(socialPresentation(address), null)
console.log(
  "Link metadata: safe text, relative images after redirects, private URL rejection, limits and native provider allowlists passed",
)

execFileSync(process.execPath, ["scripts/check-onepage-link-preview.mjs"], {
  stdio: "inherit",
})
