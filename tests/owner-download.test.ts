/**
 * ===========================================================================
 *  A CREATOR DOWNLOADS THEIR OWN FILE, AND ONLY THEIR OWN
 * ===========================================================================
 * The product editor's file menu has Download now. The server half is
 * lib/storage/owner-download.ts behind /api/products/files/<id>/download;
 * the page half is lib/platform/own-file.ts. This runs the decision against
 * a fake database and storage, the real signing code and the real scan gate:
 *
 *   signed out            401, nothing read
 *   no such file          404
 *   another creator's     404, the same answer, and nothing signed
 *   a file the scan flagged  403
 *   the owner             a signed URL for that file, two minutes, with the
 *                         name as the download parameter storage turns into
 *                         Content-Disposition: attachment (& # + and accents
 *                         intact), and no path or bucket in the answer
 *
 * and each platform's way of saving it, without a browser.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { downloadFileName, ownerDownload, OWNER_LINK_SECONDS, NOT_FOUND } from "../lib/storage/owner-download"
import { ownFileNotice, ownFilePlan, saveOwnFile, type OwnFileDeps } from "../lib/platform/own-file"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1")

const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const THEM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const MY_CREATOR = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const THEIR_CREATOR = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const MY_PRODUCT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
const THEIR_PRODUCT = "ffffffff-ffff-4fff-8fff-ffffffffffff"
const MY_FILE = "11111111-1111-4111-8111-111111111111"
const THEIR_FILE = "22222222-2222-4222-8222-222222222222"
const FLAGGED = "33333333-3333-4333-8333-333333333333"
const ORPHAN = "44444444-4444-4444-8444-444444444444"
const MISSING = "55555555-5555-4555-8555-555555555555"

type Row = Record<string, unknown>
const tables: Record<string, Row[]> = {
  digital_assets: [
    { id: MY_FILE, product_id: MY_PRODUCT, file_name: "Drums & Bass #2 + café.zip", file_path: `${MY_CREATOR}/digital/kit.zip`, storage_bucket: "digital-products", scan_status: "clean", uploaded_by: ME },
    { id: THEIR_FILE, product_id: THEIR_PRODUCT, file_name: "Theirs.pdf", file_path: `${THEIR_CREATOR}/digital/theirs.pdf`, storage_bucket: "digital-products", scan_status: "clean", uploaded_by: THEM },
    { id: FLAGGED, product_id: MY_PRODUCT, file_name: "bad.zip", file_path: `${MY_CREATOR}/digital/bad.zip`, storage_bucket: "digital-products", scan_status: "infected", uploaded_by: ME },
    { id: ORPHAN, product_id: null, file_name: "draft.wav", file_path: `${MY_CREATOR}/digital/draft.wav`, storage_bucket: "digital-products", scan_status: "clean", uploaded_by: ME },
  ],
  products: [
    { id: MY_PRODUCT, creator_id: MY_CREATOR },
    { id: THEIR_PRODUCT, creator_id: THEIR_CREATOR },
  ],
  creators: [
    { id: MY_CREATOR, user_id: ME },
    { id: THEIR_CREATOR, user_id: THEM },
  ],
}
const reads: string[] = []
const signed: { bucket: string; path: string; expiry: number }[] = []
const admin = {
  from(table: string) {
    const filters: [string, unknown][] = []
    const q = {
      select: () => q,
      eq: (col: string, v: unknown) => {
        filters.push([col, v])
        return q
      },
      maybeSingle: async () => {
        reads.push(table)
        const row = (tables[table] ?? []).find((r) => filters.every(([c, v]) => r[c] === v))
        return { data: row ?? null, error: null }
      },
    }
    return q
  },
  storage: {
    from: (bucket: string) => ({
      createSignedUrl: async (path: string, expiry: number) => {
        signed.push({ bucket, path, expiry })
        return { data: { signedUrl: `https://project.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=t0k` }, error: null }
      },
    }),
  },
} as never

async function main() {
  console.log("\nWho may have the link\n")
  {
    reads.length = 0
    const out = await ownerDownload({ admin }, { userId: null, assetId: MY_FILE })
    check("signed out is 401, and nothing is read", out.status === 401 && reads.length === 0, out)
  }
  {
    const out = await ownerDownload({ admin }, { userId: ME, assetId: MISSING })
    check("a file that does not exist is 404", out.status === 404 && (out.body as { error: string }).error === NOT_FOUND, out)
    const bad = await ownerDownload({ admin }, { userId: ME, assetId: "../../etc" })
    check("an id that is not an id is 404 before any read", bad.status === 404)
  }
  {
    signed.length = 0
    const out = await ownerDownload({ admin }, { userId: ME, assetId: THEIR_FILE })
    check("another creator's file is refused with the same 404 as a missing one", out.status === 404 && (out.body as { error: string }).error === NOT_FOUND, out)
    check("and nothing is signed for it", signed.length === 0, signed)
    const theirs = await ownerDownload({ admin }, { userId: THEM, assetId: MY_FILE })
    check("and the other way round", theirs.status === 404 && signed.length === 0)
  }
  {
    signed.length = 0
    const out = await ownerDownload({ admin }, { userId: ME, assetId: FLAGGED })
    check("a file the virus scan flagged is 403 even for its owner, unsigned, in words for the owner", out.status === 403 && signed.length === 0 && (out.body as { error: string }).error === "The virus scan flagged this file, so it cannot be downloaded.", out)
  }

  console.log("\nWhat the owner gets\n")
  {
    signed.length = 0
    const out = await ownerDownload({ admin }, { userId: ME, assetId: MY_FILE })
    check("the owner gets 200 and a link", out.status === 200, out)
    const body = out.body as { downloadUrl: string; fileName: string; expiresIn: number }
    const url = new URL(body.downloadUrl)
    check("signed for this one file, in the bucket its row names", signed.length === 1 && signed[0].path === `${MY_CREATOR}/digital/kit.zip` && signed[0].bucket === "digital-products", signed)
    check("short lived: two minutes", signed[0].expiry === OWNER_LINK_SECONDS && OWNER_LINK_SECONDS === 120 && body.expiresIn === 120)
    check(
      "the real name is the download parameter, whole: storage answers it with Content-Disposition: attachment and filename*",
      url.searchParams.get("download") === "Drums & Bass #2 + café.zip" && !url.hash && url.searchParams.get("token") === "t0k",
      body.downloadUrl,
    )
    check("encoded on the wire, so no & or # of the name reaches the query raw", /download=Drums%20%26%20Bass%20%232%20%2B%20caf%C3%A9\.zip$/.test(body.downloadUrl), body.downloadUrl)
    check("the answer names the file and nothing about where it is kept", body.fileName === "Drums & Bass #2 + café.zip" && !JSON.stringify({ ...body, downloadUrl: "" }).includes("digital/"))
  }
  {
    const out = await ownerDownload({ admin }, { userId: ME, assetId: MY_FILE, name: "Renamed in the editor.zip" })
    const url = new URL((out.body as { downloadUrl: string }).downloadUrl)
    check("a name renamed in the editor names the download", url.searchParams.get("download") === "Renamed in the editor.zip")
    const hostile = await ownerDownload({ admin }, { userId: ME, assetId: MY_FILE, name: '../../x"\r\nSet-Cookie: a=b.zip' })
    const n = new URL((hostile.body as { downloadUrl: string }).downloadUrl).searchParams.get("download") ?? ""
    check("and a hostile one loses its path, quotes and line breaks", !/[\r\n"/\\]/.test(n) && !n.startsWith("."), n)
  }
  {
    const out = await ownerDownload({ admin }, { userId: ME, assetId: ORPHAN })
    check("a file whose product was never saved is its uploader's", out.status === 200)
    const not = await ownerDownload({ admin }, { userId: THEM, assetId: ORPHAN })
    check("and nobody else's", not.status === 404)
  }
  check("a name longer than a file system takes keeps its extension", downloadFileName("a".repeat(400) + ".zip", null).endsWith(".zip") && downloadFileName("a".repeat(400) + ".zip", null).length === 180)
  check("with no name at all it is still a name", downloadFileName("", "") === "download" && downloadFileName(null, "Stored.pdf") === "Stored.pdf")

  console.log("\nThe route\n")
  {
    const route = code("app/api/products/files/[assetId]/download/route.ts")
    const auth = route.indexOf("auth.getUser()")
    check("it reads the caller from the session, and answers 401 before the service role is made", auth > 0 && route.indexOf("status: 401") > auth && route.indexOf("createAdminClient()") > route.indexOf("status: 401"))
    check("rate limited per person and per address, in Postgres", /rateLimit\(\{[\s\S]*bucket: "owner-download"[\s\S]*`user:\$\{userId\}`, addressSubject\(request\)/.test(route))
    check("never cached", /"Cache-Control": "no-store"/.test(route))
    check("the log names the file id and nothing else", !/console\.[a-z]+\([^)]*(name|email|file_path|downloadUrl|user)/.test(route))
    const lib = code("lib/storage/owner-download.ts")
    check("the owner check filters by the caller's user id", /\.eq\("user_id", userId\)/.test(lib))
    check("it goes through the same virus gate as a buyer's download", /gate\(admin, asset, \{ isCreator: true \}\)/.test(lib))
  }

  console.log("\nSaving it, per platform\n")
  {
    check("a browser with the file still in hand saves it from there", ownFilePlan({ platform: "web", hasLocal: true, assetId: MY_FILE }).via === "local")
    check("a browser without it follows the signed link", JSON.stringify(ownFilePlan({ platform: "web", hasLocal: false, assetId: MY_FILE })) === JSON.stringify({ via: "link", open: "anchor" }))
    check("the apps open the signed link in the system browser, even with the file in hand", ownFilePlan({ platform: "ios", hasLocal: true, assetId: MY_FILE }).via === "link" && ownFilePlan({ platform: "android", hasLocal: false, assetId: MY_FILE }).via === "link")
    check("an app with only the picked file shares it", ownFilePlan({ platform: "ios", hasLocal: true }).via === "share")
    check("nothing to save from says so", ownFilePlan({ platform: "web", hasLocal: false }).via === "none")

    const calls: string[] = []
    /* Changed on purpose, and the `anchor:` line below with it. The signed
       link is on storage's origin, where an anchor's `download` is ignored,
       so following one in place was an ordinary navigation: whenever the
       attachment header did not arrive the editor was replaced by the file.
       The link goes to a tab of its own now, opened before the request
       (lib/platform/download-tab). These stand-ins are that tab, the test
       for an address the anchor really saves, and the notice a refused tab
       shows. `tabRefused` and `sameOrigin` steer the new branches. */
    let tabRefused = false
    let sameOrigin = false
    const deps = (platform: OwnFileDeps["platform"], share = true): OwnFileDeps => ({
      platform,
      fetchLink: async (id, name) => {
        calls.push(`fetch:${id}:${name}`)
        return { url: "https://s/signed?download=x", fileName: name }
      },
      downloadBlob: (_b, name) => calls.push(`blob:${name}`),
      openTab: () => {
        if (tabRefused) {
          calls.push("tab:refused")
          return null
        }
        calls.push("tab:open")
        return {
          point: (url: string) => {
            calls.push(`tab:${url}`)
            return true
          },
          close: () => calls.push("tab:close"),
        }
      },
      anchorCanSave: () => sameOrigin,
      followLink: (url) => calls.push(`anchor:${url}`),
      showBlocked: (url, name) => calls.push(`notice:${url}:${name}`),
      openInSystemBrowser: async (url) => {
        calls.push(`system:${url}`)
      },
      shareFile: async () => {
        calls.push("share")
        return share
      },
    })
    const local = new Blob(["x"]) as unknown as File

    calls.length = 0
    tabRefused = false
    sameOrigin = false
    let r = await saveOwnFile({ assetId: MY_FILE, name: "Kit.zip" }, deps("web"))
    check("web: the tab is opened BEFORE the request, then pointed at the link",
      r === "downloaded" && calls.join(" ") === `tab:open fetch:${MY_FILE}:Kit.zip tab:https://s/signed?download=x`, calls)
    calls.length = 0
    sameOrigin = true
    r = await saveOwnFile({ assetId: MY_FILE, name: "Kit.zip" }, deps("web"))
    check("a link on our own origin still saves through the anchor, and the tab is closed again",
      r === "downloaded" && calls.join(" ") === `tab:open fetch:${MY_FILE}:Kit.zip tab:close anchor:https://s/signed?download=x`, calls)
    calls.length = 0
    sameOrigin = false
    tabRefused = true
    r = await saveOwnFile({ assetId: MY_FILE, name: "Kit.zip" }, deps("web"))
    check("a browser that refuses the tab gets the notice with the file, not nothing, and the editor stays",
      r === "blocked" && calls.join(" ") === `tab:refused fetch:${MY_FILE}:Kit.zip notice:https://s/signed?download=x:Kit.zip`, calls)
    calls.length = 0
    tabRefused = false
    calls.length = 0
    r = await saveOwnFile({ assetId: MY_FILE, name: "Kit.zip", local }, deps("web"))
    check("web with the file in hand: no request at all", r === "downloaded" && calls.join(" ") === "blob:Kit.zip", calls)
    calls.length = 0
    r = await saveOwnFile({ assetId: MY_FILE, name: "Kit.zip", local }, deps("ios"))
    /* Unchanged on purpose: no tab is opened in the apps, the link still goes straight to the system browser. */
    check("iOS app: the system browser, and the notice says Files", r === "ios-download" && calls.join(" ") === `fetch:${MY_FILE}:Kit.zip system:https://s/signed?download=x`, calls)
    calls.length = 0
    r = await saveOwnFile({ assetId: MY_FILE, name: "Kit.zip" }, deps("android"))
    check("Android app: the system browser, and the notice says Downloads", r === "android-download" && calls[1] === "system:https://s/signed?download=x" && !calls.some((c) => c.startsWith("tab:")))
    calls.length = 0
    r = await saveOwnFile({ name: "Kit.zip", local }, deps("ios"))
    check("an app with a file still uploading shares the picked file", r === "shared" && calls.join(" ") === "share")
    let error = ""
    try {
      await saveOwnFile({ name: "Kit.zip", local }, deps("ios", false))
    } catch (e) {
      error = (e as Error).message
    }
    check("and where sharing is not there, says when it can be downloaded", /once it has uploaded/.test(error), error)
    error = ""
    calls.length = 0
    const failing: OwnFileDeps = { ...deps("web"), fetchLink: async () => { throw new Error("That is a lot of downloads at once. Wait a minute and try again.") } }
    try {
      await saveOwnFile({ assetId: MY_FILE, name: "Kit.zip" }, failing)
    } catch (e) {
      error = (e as Error).message
    }
    check("a refusal reaches the row in the server's words", /Wait a minute/.test(error), error)
    check("and the tab opened for it is closed again, not left empty", calls.join(" ") === "tab:open tab:close", calls)
    check("the apps' notices fit the toast on a phone and say what to do", ownFileNotice("ios-download") === "Tap Download to save it to Files" && ownFileNotice("android-download") === "Saving to Downloads on this phone" && ownFileNotice("downloaded") === null && [ownFileNotice("ios-download"), ownFileNotice("android-download")].every((m) => (m ?? "").length <= 34))
    /* New with the tab: the toast points at the notice, which carries the file. */
    check("a refused tab has a toast of its own, short enough for a phone", ownFileNotice("blocked") === "Your file is ready. Press Save." && (ownFileNotice("blocked") ?? "").length <= 34)
  }

  {
    /* A buyer's Download in the app: the iOS build has no Browser plugin, so the button must not call it alone.
       Moved with the one download path (lib/downloads/download-file.ts): the system browser is now its
       last resort, behind the app's own downloader, and is still reached through openInSystemBrowser. */
    const buyer = read("lib/downloads/download-file.ts")
    check("a buyer's download in the app goes through openInSystemBrowser, which falls back to the address itself", buyer.includes("await openInSystemBrowser(file.url)") && !buyer.includes('import("@capacitor/browser")') && !read("components/download-button.tsx").includes('import("@capacitor/browser")'))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
