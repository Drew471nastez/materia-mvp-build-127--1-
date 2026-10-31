/**
 * ===========================================================================
 *  COMMUNITIES AND SHARED JOBS THAT HOLD (rel-shared)
 * ===========================================================================
 * Each case is one reliability gap found in the communities and shared
 * systems audit, simulated with a fake and measured:
 *
 *   a community file posted without the complete step   still size and content checked
 *
 *   node scripts/run-push-tests.mjs (in the list as tests/rel-shared.test.ts)
 */
import { ownedMedia } from "@/lib/communities/server/feed"
import { communityFilesExist } from "@/lib/communities/server/post-files"
import { MEMBER_FILE_MAX_BYTES } from "@/lib/communities/post-media"
import type { CommunityRow, PostMedia } from "@/lib/communities/types"
import type { Viewer } from "@/lib/communities/server/context"

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
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`)
  }
}
const realFetch = globalThis.fetch
const keepAlive = setInterval(() => {}, 1_000)

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
function viewer(o: Partial<Viewer> = {}): Viewer {
  return { userId: U(1), member: null, role: "member", active: true, status: "active", tierId: null, ownedProductIds: [], level: 1, points: 0, isOwner: false, isCreatorAccount: false, banned: false, mutedUntil: null, ...o } as Viewer
}
const community = { id: U(900), creator_id: U(800), slug: "studio", name: "Studio", chat_enabled: true } as CommunityRow

/** Storage as the post's checks see it: a folder listing with sizes, signed reads, removals. Bytes are served by the fetch below. */
function storageFake(files: Record<string, { size: number; bytes: Uint8Array }>) {
  const removed: string[] = []
  const db = {
    from() {
      /* the security log: written, never read here */
      return { insert: async () => ({ error: null }) }
    },
    storage: {
      from(_bucket: string) {
        return {
          async list(folder: string, opts: { search: string }) {
            const found = Object.entries(files)
              .filter(([p]) => p === `${folder}/${opts.search}`)
              .map(([p, f]) => ({ name: p.split("/").pop(), metadata: { size: f.size } }))
            return { data: found, error: null }
          },
          async createSignedUrl(path: string) {
            return { data: { signedUrl: `https://fake.storage/${encodeURIComponent(path)}` }, error: null }
          },
          async remove(paths: string[]) {
            removed.push(...paths)
            return { data: null, error: null }
          },
        }
      },
    },
  }
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = String(input)
    const path = decodeURIComponent(href.replace("https://fake.storage/", ""))
    const f = files[path]
    if (!f) return new Response(null, { status: 404 })
    const range = String((init?.headers as Record<string, string> | undefined)?.Range ?? "")
    const m = /bytes=(\d+)-(\d+)/.exec(range)
    const start = m ? Number(m[1]) : 0
    const end = m ? Number(m[2]) : f.bytes.length - 1
    return new Response(f.bytes.slice(start, end + 1), { status: 206 })
  }) as typeof fetch
  return { db, removed }
}

const pdfBytes = new TextEncoder().encode("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer\n%%EOF\n")
/** A Windows program: "MZ", then the PE header the sniffer looks for. */
const exeBytes = (() => {
  const b = new Uint8Array(512)
  b[0] = 0x4d
  b[1] = 0x5a
  b[0x3c] = 0x80
  b[0x80] = 0x50
  b[0x81] = 0x45
  return b
})()
const pathOf = (fileId: string, ext: string, uploader = U(1)) => `${U(800)}/community-files/${U(900)}/${uploader}/${fileId}.${ext}`
const fileMedia = (fileId: string, name: string, size: number): PostMedia => ({ type: "file", assetId: fileId, name, size, store: "community" }) as PostMedia

async function main() {
  // -------------------------------------------------------------------------
  console.log("\nA community file posted without the complete step is still checked (F1)")
  {
    /* The browser called prepare, PUT a program renamed .pdf, and never called complete. */
    const disguised = storageFake({ [pathOf(U(11), "pdf")]: { size: exeBytes.length, bytes: exeBytes } })
    const r = await ownedMedia(disguised.db as never, community, viewer(), [fileMedia(U(11), "Notes.pdf", exeBytes.length)])
    check("a program named .pdf is refused at posting", !r.ok, r)
    check("and it is removed from storage, as complete would have", disguised.removed.includes(pathOf(U(11), "pdf")), disguised.removed)

    /* Over the member's 50 MB limit (storage's own record of the size), never completed. */
    const huge = storageFake({ [pathOf(U(12), "pdf")]: { size: MEMBER_FILE_MAX_BYTES + 1, bytes: pdfBytes } })
    const big = await ownedMedia(huge.db as never, community, viewer(), [fileMedia(U(12), "Big.pdf", 1000)])
    check("a file over the member's limit is refused at posting, saying the limit", !big.ok && /50 MB/.test((big as { error: string }).error), big)
    check("and it is removed", huge.removed.includes(pathOf(U(12), "pdf")))

    /* Staff may send up to 500 MB: the same size from a moderator is taken. */
    const staffBig = storageFake({ [pathOf(U(13), "pdf")]: { size: MEMBER_FILE_MAX_BYTES + 1, bytes: pdfBytes } })
    const mod = await ownedMedia(staffBig.db as never, community, viewer({ role: "moderator" }), [fileMedia(U(13), "Big.pdf", 1000)])
    check("a moderator's file over the member limit is taken (staff limit)", mod.ok && staffBig.removed.length === 0, mod)

    /* The ordinary path: a real PDF, completed or not, posts as before with its checked name. */
    const fine = storageFake({ [pathOf(U(14), "pdf")]: { size: pdfBytes.length, bytes: pdfBytes } })
    const ok = await ownedMedia(fine.db as never, community, viewer(), [fileMedia(U(14), "Plan.pdf", pdfBytes.length)])
    check("a real PDF posts, keeping its name, nothing removed", ok.ok && (ok.value[0] as { name: string }).name === "Plan.pdf" && fine.removed.length === 0, ok)

    /* Existing posts: a file the post already had is not looked at again (not even listed), so old posts edit as before. */
    const empty = storageFake({})
    const kept = fileMedia(U(15), "Old.pdf", 10)
    const edit = await ownedMedia(empty.db as never, community, viewer(), [kept], [kept])
    check("a file a post already had is kept without a new check", edit.ok && empty.removed.length === 0, edit)

    /* Not there at all: the old sentence. */
    const none = await communityFilesExist(storageFake({}).db as never, community, U(1), [{ fileId: U(16), name: "x.pdf" }])
    check("a file that never arrived is still refused with the upload again sentence", !none.ok && /Upload it again/.test((none as { error: string }).error))
    globalThis.fetch = realFetch
  }

  clearInterval(keepAlive)
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
