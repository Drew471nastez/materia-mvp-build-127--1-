/**
 * Storelib never shows the storage host: a public file is
 * https://storelib.com/media/<bucket>/<path> (lib/storage/media-url.ts).
 *
 *   npx tsx tests/media-url.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcproject.supabase.co"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

async function run() {
  const { mediaUrl, mediaUrlsIn, withMediaUrls, isOwnMedia, toStorageUrl, withMediaAddresses, mediaFetch } = await import("@/lib/storage/media-url")
  const storage = "https://abcproject.supabase.co/storage/v1/object/public/store-builder-images/u1/sections/1.jpg"
  const media = "https://storelib.com/media/store-builder-images/u1/sections/1.jpg"

  check("a storage address becomes Storelib's", mediaUrl(storage) === media, mediaUrl(storage))
  check("  one from another project too", mediaUrl("https://zzz.supabase.co/storage/v1/object/public/a/b.png") === "https://storelib.com/media/a/b.png")
  check("  anything else is left as it is", mediaUrl("https://images.unsplash.com/x.jpg") === "https://images.unsplash.com/x.jpg" && mediaUrl("") === "" && mediaUrl(null) === null)
  check("  a signed (private) address is not touched", mediaUrl("https://abcproject.supabase.co/storage/v1/object/sign/digital/a.zip?token=t").includes("supabase.co"))
  check("and back again, for a server check that wants the storage form", toStorageUrl(media) === storage && toStorageUrl("https://other.com/media/x") === "https://other.com/media/x")
  check("inside text: every address, nothing else", mediaUrlsIn(`<img src="${storage}"> and ${storage}?v=2`) === `<img src="${media}"> and ${media}?v=2`)
  const settings = { image: storage, nested: { list: [storage, "keep"] }, n: 3 }
  const out = withMediaUrls(settings)
  check("in any shape of settings", out.image === media && out.nested.list[0] === media && out.nested.list[1] === "keep" && out.n === 3)
  const plain = { a: "x", b: [1, "y"] }
  check("  the same object back when there was nothing to change", withMediaUrls(plain) === plain)
  check("own files are recognised by either address", isOwnMedia(storage) && isOwnMedia(media) && !isOwnMedia("https://images.unsplash.com/x.jpg") && !isOwnMedia(""))

  /* The upload side: every getPublicUrl answers with the media address. */
  class FileApi {
    constructor(private bucket: string) {}
    getPublicUrl(path: string) {
      return { data: { publicUrl: `https://abcproject.supabase.co/storage/v1/object/public/${this.bucket}/${path}` } }
    }
  }
  const client = { storage: { from: (b: string) => new FileApi(b) } }
  withMediaAddresses(client)
  withMediaAddresses(client)
  const got = client.storage.from("avatars").getPublicUrl("u/me.png").data.publicUrl
  check("an upload hands back Storelib's address, patched once", got === "https://storelib.com/media/avatars/u/me.png", got)

  /* The read side: database JSON only. */
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const u = String(input)
    const body = JSON.stringify([{ thumbnail_url: storage }])
    return new Response(body, { status: 200, headers: { "content-type": u.includes("/rest/v1/") ? "application/json" : "text/plain", "content-length": String(body.length) } })
  }) as typeof fetch
  const rows = await (await mediaFetch("https://abcproject.supabase.co/rest/v1/products?select=*")).json()
  check("a database read comes back with Storelib's addresses", rows[0].thumbnail_url === media, rows)
  const other = await (await mediaFetch("https://abcproject.supabase.co/auth/v1/user")).text()
  check("  auth and storage calls are passed through untouched", other.includes("supabase.co/storage"))
  globalThis.fetch = realFetch

  /* Wired where it matters. */
  for (const f of ["lib/supabase/client.ts", "lib/supabase/server.ts", "lib/supabase/admin.ts", "lib/supabase/public-read.ts"]) {
    check(`${f} reads through mediaFetch`, /global: \{ fetch: mediaFetch \}/.test(read(f)))
  }
  check("the browser, server and admin clients hand back media addresses on upload",
    /withMediaAddresses\(browserClient\)/.test(read("lib/supabase/client.ts")) && /withMediaAddresses\(createServerClient\(/.test(read("lib/supabase/server.ts")) && /withMediaAddresses\(createClient\(url, serviceRoleKey/.test(read("lib/supabase/admin.ts")))
  const config = read("next.config.mjs")
  check("/media/ is the bucket's public objects, passed straight through", /source: "\/media\/:path\*", destination: `\$\{storage\}\/storage\/v1\/object\/public\/:path\*`/.test(config))
  check("  on every host, never a page of a site", /if \(pathname\.startsWith\("\/media\/"\)\) return NextResponse\.next\(\)/.test(read("proxy.ts")))
  check("pictures, files and videos never show one of Storelib's own files as an address",
    /isOwnMedia\(shown\) \? "" : shown/.test(read("components/website-builder/editor/controls/image-picker-control.tsx")) &&
      /isOwnMedia\(shown\) \? "" : shown/.test(read("components/website-builder/editor/controls/file-picker-control.tsx")) &&
      /!isOwnMedia\(shown\)/.test(read("components/website-builder/editor/controls/video-picker-control.tsx")))
  check("emails carry Storelib's addresses", /mediaUrlsIn\(finalizeEmailHtml\(html, subject\)\)/.test(read("lib/mailgun.ts")))
  check("server checks read either form: avatar, cover, rich text, downloads",
    /toStorageUrl\(url\)\.startsWith/.test(read("app/api/account/avatar/route.ts")) && /\/media\/covers\//.test(read("lib/profile/cover.ts")) &&
      /pathname\.startsWith\("\/media\/"\)/.test(read("lib/rich-text/policy.ts")) && /normalizedPath = toStorageUrl\(normalizedPath\)/.test(read("lib/storage/download.ts")))
  const pages = ["components/marketing/hero.tsx", "components/billing/plan-cards.tsx", "app/(auth)/login/page.tsx", "components/onepage/tabs/design-tab.tsx", "app/(marketing)/layout.tsx"]
  check("no page names the storage host", pages.every((f) => !/supabase\.co/.test(read(f))), pages.filter((f) => /supabase\.co/.test(read(f))))

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

void run()
