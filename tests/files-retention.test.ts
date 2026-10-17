/**
 * ===========================================================================
 *  ROUND 27: TAKING A PICTURE OUT OF FILES MUST NOT EMPTY A LIVE PAGE
 * ===========================================================================
 * The owner's report: "If I delete images from the Files library, images
 * already being used elsewhere can disappear: store logos, receipt logos and
 * receipt image pickers, websites, checkout icons, product thumbnails,
 * product images inside checkout, other previously configured areas."
 *
 * Every surface is pinned on its own, against the real functions
 * (lib/files/library.ts, lib/files/references.ts, lib/files/assets.ts,
 * lib/files/cleanup-removed.ts) with the fake database (tests/_fake-db.ts)
 * and a storage stub that records every remove. Separately, so a change to
 * one surface cannot quietly break another.
 *
 *   npx tsx tests/files-retention.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fakeDb } from "./_fake-db"
import { listLibrary, purgeLibraryFiles, removeFromLibrary, restoreToLibrary } from "@/lib/files/library"
import { SURFACES, findUses, holdsPath, needlesFor } from "@/lib/files/references"
import { RETENTION_DAYS } from "@/lib/files/assets"
import { sweepRemovedLibraryFiles } from "@/lib/files/cleanup-removed"
import { addressesIn, repairBrokenReferences } from "@/lib/files/repair"
import { loadStoreSettings } from "@/lib/store/settings-server"
import { checkoutBrand } from "@/lib/checkout/brand-server"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

const USER = "11111111-1111-4111-8111-111111111111"
const CREATOR = "22222222-2222-4222-8222-222222222222"
const owner = { userId: USER, creatorId: CREATOR }

/** The picture every case below uploads: the store's own folder in the library. */
const LOGO = `${USER}/files/logo.png`
const LOGO_URL = `https://storelib.com/media/store-builder-images/${LOGO}`

type Entry = { name: string; id: string | null; created_at?: string; metadata?: { size: number; mimetype: string } | null }

/**
 * One client with both halves a route gets: the fake database for `.from`,
 * a storage stub for `.storage`, and `rpc` standing in for SQL part 18's
 * public.storage_object_referenced, which walks every table looking for the
 * path in a row, exactly as the real function does.
 */
function client(tables: Record<string, Record<string, unknown>[]>, tree: Record<string, Record<string, Entry[]>> = {}, options: { removedPaths?: string[][]; failWith?: Record<string, { code?: string; message: string }>; noRpc?: boolean } = {}) {
  const db = fakeDb(tables, options.failWith ? { failWith: options.failWith } : {})
  const removed = options.removedPaths ?? []
  const storage = {
    from: (bucket: string) => ({
      list: async (prefix: string) => ({ data: tree[bucket]?.[prefix] ?? [], error: null }),
      getPublicUrl: (path: string) => ({ data: { publicUrl: encodeURI(`https://abc.supabase.co/storage/v1/object/public/${bucket}/${path}`) } }),
      remove: async (paths: string[]) => {
        removed.push(paths.map((p) => `${bucket}:${p}`))
        for (const p of paths) {
          const at = p.lastIndexOf("/")
          const folder = tree[bucket]?.[p.slice(0, at)]
          if (folder) tree[bucket][p.slice(0, at)] = folder.filter((e) => e.name !== p.slice(at + 1))
        }
        return { error: null }
      },
    }),
  }
  const rpc = async (name: string, args: Record<string, unknown>) => {
    if (name !== "storage_object_referenced") return { data: null, error: null }
    if (options.noRpc) return { data: null, error: { code: "PGRST202", message: "not found" } }
    const path = String(args.p_name ?? "")
    for (const [table, rows] of Object.entries(tables)) {
      if (table === "library_assets") continue
      for (const row of rows) if (JSON.stringify(row).includes(path)) return { data: true, error: null }
    }
    return { data: false, error: null }
  }
  return { ...db, storage, rpc, removedPaths: removed }
}

const folderWith = (...names: string[]): Record<string, Record<string, Entry[]>> => ({
  "store-builder-images": {
    [USER]: [{ name: "files", id: null, metadata: null }],
    [`${USER}/files`]: names.map((n) => ({ name: n, id: n, created_at: "2026-10-01T00:00:00Z", metadata: { size: 2048, mimetype: "image/png" } })),
  },
})

/* ─────────────────────────────────────────────────────────────────────────
   1. EVERY SURFACE, ONE AT A TIME
   ───────────────────────────────────────────────────────────────────────── */

/**
 * One surface's case: the store's rows hold the address, the object is in
 * storage, the owner removes the picture from Files. The object must stay,
 * the row must be untouched, the list must stop showing it, and the dialog
 * must be able to name the place.
 */
async function surfaceCase(name: string, label: string, tables: Record<string, Record<string, unknown>[]>, tree = folderWith("logo.png")) {
  const before = JSON.stringify(tables)
  const removedPaths: string[][] = []
  const db = client({ ...tables, library_assets: [] }, tree, { removedPaths })

  const where = await findUses(db, owner, "store-builder-images", LOGO)
  check(`${name}: Files says where it is used`, where.total > 0 && where.uses.some((u) => u.label === label), { name, where })

  const out = await removeFromLibrary(db, owner, [{ bucket: "store-builder-images", path: LOGO }])
  check(`${name}: the removal is accepted`, out.ok && "retained" in out && out.retained === true, out)
  check(`${name}: NOTHING is deleted from storage`, removedPaths.length === 0, removedPaths)
  check(`${name}: the object is still in the bucket`, (tree["store-builder-images"]?.[`${USER}/files`] ?? []).some((e) => e.name === "logo.png"))
  const after = JSON.stringify(Object.fromEntries(Object.keys(tables).map((t) => [t, db.tables[t]])))
  check(`${name}: the row that points at it is untouched`, after === before, { before, after })

  const list = await listLibrary(db, owner, "media")
  check(`${name}: and the Files list no longer shows it`, !list.some((f) => f.path === LOGO), list.map((f) => f.path))
}

async function main() {
  console.log("\nA picture removed from Files keeps drawing on every surface")

  /* Settings › Store details: the logo on receipts, order emails and the checkout header (lib/store/settings-server.ts, lib/checkout/brand-server.ts). */
  await surfaceCase("store logo, receipts and emails", "Store logo, receipts and emails", {
    store_settings: [{ id: "s1", creator_id: CREATOR, store_name: "Nest", logo_url: LOGO_URL }],
  })

  /* The checkout header's own read, and a reworded checkout block that names a picture. */
  await surfaceCase("checkout media and icons", "Checkout", {
    checkout_text_overrides: [{ id: "c1", creator_id: CREATOR, text: { trust_icon: LOGO_URL } }],
  })

  /* The published website's theme: Branding › Logo, the favicon, the share image. */
  await surfaceCase("website theme", "Website theme", {
    store_theme_installs: [{ id: "i1", creator_id: CREATOR, status: "published" }],
    store_theme_settings: [{ id: "ts1", install_id: "i1", settings: { logo_url: LOGO_URL, favicon_url: null } }],
  })

  /* A website page's sections. */
  await surfaceCase("website sections", "Website sections", {
    store_theme_installs: [{ id: "i1", creator_id: CREATOR }],
    store_theme_pages: [{ id: "p1", install_id: "i1", sections: [{ type: "hero", settings: { imageUrl: LOGO_URL } }] }],
  })

  /* An imported theme's own files, which keep an asset map naming the picture. */
  await surfaceCase("website files", "Website files", {
    store_theme_installs: [{ id: "i1", creator_id: CREATOR }],
    store_theme_custom_files: [{ id: "f1", install_id: "i1", path: "assets/map.json", content: `{"logo.png":"${LOGO_URL}"}` }],
  })

  /* The newer sites surface. */
  await surfaceCase("site settings", "Website", {
    sites: [{ id: "site1", creator_id: CREATOR, settings: { logo: LOGO_URL } }],
  })

  /* The store page the builder writes. */
  await surfaceCase("store page", "Store page", {
    store_builder_configs: [{ id: "b1", creator_id: CREATOR, published_config: { header: { settings: { avatarUrl: LOGO_URL } } } }],
  })

  /* Product thumbnail and gallery, which is also what checkout draws beside a line. */
  await surfaceCase("product thumbnail", "Product photos", {
    products: [{ id: "pr1", creator_id: CREATOR, thumbnail_url: LOGO_URL, gallery_urls: [] }],
  })

  await surfaceCase("product gallery and checkout line pictures", "Product photos", {
    products: [{ id: "pr1", creator_id: CREATOR, thumbnail_url: null, gallery_urls: [LOGO_URL] }],
  })

  /* A variant's own picture, which checkout prefers over the product's. */
  await surfaceCase("product variant picture", "Product photos", {
    products: [{ id: "pr1", creator_id: CREATOR }],
    product_variants: [{ id: "v1", product_id: "pr1", image_url: LOGO_URL }],
  })

  /* The product page's own sections. */
  await surfaceCase("product page sections", "Product page", {
    product_page_configs: [{ id: "pc1", creator_id: CREATOR, product_id: "pr1", published_config: { sections: [{ settings: { imageUrl: LOGO_URL } }] } }],
  })

  await surfaceCase("collection picture", "Collections", {
    product_collections: [{ id: "col1", creator_id: CREATOR, image_url: LOGO_URL }],
  })

  /* Courses and their lessons. */
  await surfaceCase("course image", "Courses", {
    courses: [{ id: "cr1", creator_id: CREATOR, thumbnail_url: LOGO_URL }],
  })

  await surfaceCase("course lesson video", "Course lessons", {
    courses: [{ id: "cr1", creator_id: CREATOR }],
    course_lessons: [{ id: "l1", course_id: "cr1", video_path: LOGO }],
  })

  /* The creator's own avatar and banner, and the person's photo the checkout falls back to. */
  await surfaceCase("creator avatar and banner", "Store page", {
    creators: [{ id: CREATOR, user_id: USER, avatar_url: LOGO_URL, cover_url: null }],
  })

  await surfaceCase("your photo", "Your photo", {
    profiles: [{ id: USER, avatar_url: LOGO_URL }],
  })

  /* Communities: logo, cover, spaces, events, posts. */
  await surfaceCase("community logo and cover", "Community", {
    communities: [{ id: "cm1", owner_user_id: USER, logo_url: LOGO_URL, cover_url: null }],
  })

  await surfaceCase("community cover", "Community", {
    communities: [{ id: "cm1", owner_user_id: USER, logo_url: null, cover_url: LOGO_URL }],
  })

  await surfaceCase("community event cover", "Community events", {
    communities: [{ id: "cm1", owner_user_id: USER }],
    community_events: [{ id: "e1", community_id: "cm1", cover_url: LOGO_URL }],
  })

  await surfaceCase("community post media", "Community posts", {
    communities: [{ id: "cm1", owner_user_id: USER }],
    community_feed_posts: [{ id: "fp1", community_id: "cm1", media: [{ url: LOGO_URL }] }],
  })

  /* Membership posts, email branding, blog posts, offers, review widgets, one page. */
  await surfaceCase("membership post pictures", "Membership posts", {
    products: [{ id: "pr1", creator_id: CREATOR }],
    membership_posts: [{ id: "mp1", product_id: "pr1", images: [LOGO_URL] }],
  })

  await surfaceCase("email branding", "Email campaigns", {
    email_campaigns: [{ id: "ec1", creator_id: CREATOR, body: `<img src="${LOGO_URL}">` }],
  })

  await surfaceCase("published blog post", "Blog posts", {
    blog_posts: [{ id: "bp1", creator_id: CREATOR, cover_image_url: LOGO_URL }],
  })

  await surfaceCase("offer picture", "Offers", {
    store_offers: [{ id: "o1", creator_id: CREATOR, image_url: LOGO_URL }],
  })

  await surfaceCase("review widget", "Review widgets", {
    review_widget_configs: [{ id: "rw1", creator_id: CREATOR, settings: { badgeImage: LOGO_URL } }],
  })

  await surfaceCase("one page", "One page", {
    onepages: [{ id: "op1", creator_id: CREATOR, avatar_url: LOGO_URL }],
  })

  await surfaceCase("a photo on a review", "Reviews", {
    reviews: [{ id: "rv1", creator_id: CREATOR, photos: [LOGO_URL] }],
  })

  /* Two hops: the attachment's lesson, the lesson's course, the course's store. */
  await surfaceCase("a file attached to a published lesson", "Course lessons", {
    courses: [{ id: "cr1", creator_id: CREATOR }],
    course_lessons: [{ id: "l1", course_id: "cr1" }],
    lesson_attachments: [{ id: "at1", lesson_id: "l1", file_path: LOGO }],
  })

  /*
    THE OWNER'S OWN TEST, END TO END, THROUGH THE REAL READERS: upload a
    picture, set it as the store logo, remove it from Files, and the store
    logo still reads back, for Settings, for receipts and order emails
    (lib/store/settings-server.ts) and for the checkout header
    (lib/checkout/brand-server.ts).
  */
  console.log("\nThe store logo still shows after the picture is removed from Files")
  {
    const tree = folderWith("logo.png")
    const removedPaths: string[][] = []
    const db = client(
      {
        store_settings: [{ id: "s1", creator_id: CREATOR, store_name: "Nest", logo_url: LOGO_URL }],
        creators: [{ id: CREATOR, user_id: USER, display_name: "Nest", username: "nest" }],
        profiles: [{ id: USER, display_name: "Nest", username: "nest" }],
        library_assets: [],
      },
      tree,
      { removedPaths },
    )
    const before = await loadStoreSettings(db, CREATOR)
    const brandBefore = await checkoutBrand(db, CREATOR)
    check("before: the logo is the picture just uploaded", before.logoUrl === LOGO_URL && brandBefore.imageUrl === LOGO_URL, { before, brandBefore })
    const out = await removeFromLibrary(db, owner, [{ bucket: "store-builder-images", path: LOGO }])
    check("removed from Files", out.ok && removedPaths.length === 0, out)
    const after = await loadStoreSettings(db, CREATOR)
    const brandAfter = await checkoutBrand(db, CREATOR)
    check("  Settings and receipts still read the same logo", after.logoUrl === LOGO_URL, after)
    check("  the checkout header still draws it as a logo", brandAfter.imageUrl === LOGO_URL && brandAfter.kind === "logo", brandAfter)
    check("  and the object is still in the bucket for the page to fetch", tree["store-builder-images"][`${USER}/files`].some((e) => e.name === "logo.png"))
  }

  /* A product photo in the product-images bucket, removed from Files the same way. */
  console.log("\nA product photo in its own bucket")
  {
    const PHOTO = `${CREATOR}/pr1/front.jpg`
    const tree = {
      "product-images": {
        [CREATOR]: [{ name: "pr1", id: null, metadata: null }],
        [`${CREATOR}/pr1`]: [{ name: "front.jpg", id: "x", created_at: "2026-10-01T00:00:00Z", metadata: { size: 900, mimetype: "image/jpeg" } }],
      },
    }
    const removedPaths: string[][] = []
    const db = client({ products: [{ id: "pr1", creator_id: CREATOR, thumbnail_url: `https://storelib.com/media/product-images/${PHOTO}` }], library_assets: [] }, tree, { removedPaths })
    const out = await removeFromLibrary(db, owner, [{ bucket: "product-images", path: PHOTO }])
    check("a product photo is removed from the list, not from storage", out.ok && removedPaths.length === 0)
    check("  and still in the bucket for the product page and checkout", tree["product-images"][`${CREATOR}/pr1`].some((e) => e.name === "front.jpg"))
    const list = await listLibrary(db, owner, "image")
    check("  and gone from the Files list", !list.some((f) => f.path === PHOTO), list.map((f) => f.path))
  }

  /* A video takes its first frame with it, both ways. */
  console.log("\nA video and its first frame")
  {
    const VIDEO = `${USER}/files/clip-37s.mp4`
    const tree = {
      "store-builder-images": {
        [USER]: [{ name: "files", id: null, metadata: null }],
        [`${USER}/files`]: [
          { name: "clip-37s.mp4", id: "v", created_at: "2026-10-02T00:00:00Z", metadata: { size: 5000, mimetype: "video/mp4" } },
          { name: "clip-37s.poster.jpg", id: "p", created_at: "2026-10-02T00:00:00Z", metadata: { size: 400, mimetype: "image/jpeg" } },
        ],
      },
    }
    const removedPaths: string[][] = []
    const db = client({ store_theme_installs: [{ id: "i1", creator_id: CREATOR }], store_theme_pages: [{ id: "p1", install_id: "i1", sections: [{ settings: { videoUrl: `https://storelib.com/media/store-builder-images/${VIDEO}` } }] }], library_assets: [] }, tree, { removedPaths })
    const out = await removeFromLibrary(db, owner, [{ bucket: "store-builder-images", path: VIDEO }])
    check("a video in a website section is removed from the list only", out.ok && removedPaths.length === 0)
    check("  the video and its frame are both still there", tree["store-builder-images"][`${USER}/files`].length === 2)
    const list = await listLibrary(db, owner, "media")
    check("  and neither shows in the list", !list.some((f) => f.path === VIDEO || f.path.endsWith(".poster.jpg")), list.map((f) => f.path))
  }

  /* ─────────────────────────────────────────────────────────────────────────
     2. THE LIST IS WHAT CHANGED, AND IT CAN BE UNDONE
     ───────────────────────────────────────────────────────────────────────── */

  console.log("\nPut back")
  {
    const tree = folderWith("logo.png")
    const db = client({ store_settings: [{ id: "s1", creator_id: CREATOR, logo_url: LOGO_URL }], library_assets: [] }, tree)
    await removeFromLibrary(db, owner, [{ bucket: "store-builder-images", path: LOGO }])
    check("the ledger holds one row, with how many places were using it", db.tables.library_assets.length === 1 && db.tables.library_assets[0].uses_at_removal === 1, db.tables.library_assets)
    check("  it belongs to the folder's owner", db.tables.library_assets[0].owner_user_id === USER)
    const back = await restoreToLibrary(db, owner, [{ bucket: "store-builder-images", path: LOGO }])
    check("putting it back clears the removal", back.ok && db.tables.library_assets[0].removed_at === null)
    const list = await listLibrary(db, owner, "media")
    check("  and the list shows it again", list.some((f) => f.path === LOGO), list.map((f) => f.path))
  }

  /* ─────────────────────────────────────────────────────────────────────────
     3. ONLY THE OWNER'S OWN FILES
     ───────────────────────────────────────────────────────────────────────── */

  console.log("\nSomebody else's folder")
  {
    const removedPaths: string[][] = []
    const db = client({ library_assets: [] }, folderWith("logo.png"), { removedPaths })
    const theirs = await removeFromLibrary(db, owner, [{ bucket: "store-builder-images", path: `33333333-3333-4333-8333-333333333333/files/x.png` }])
    check("refused, and nothing written or deleted", !theirs.ok && "status" in theirs && theirs.status === 404 && db.tables.library_assets.length === 0 && removedPaths.length === 0, theirs)
    const mixed = await removeFromLibrary(db, owner, [
      { bucket: "store-builder-images", path: LOGO },
      { bucket: "store-builder-images", path: `33333333-3333-4333-8333-333333333333/files/x.png` },
    ])
    check("one that is not theirs refuses the whole list", !mixed.ok && db.tables.library_assets.length === 0)
  }

  /* ─────────────────────────────────────────────────────────────────────────
     4. A PERMANENT DELETE IS A DIFFERENT THING, AND SAYS SO
     ───────────────────────────────────────────────────────────────────────── */

  console.log("\nDelete permanently")
  {
    const tree = folderWith("logo.png")
    const removedPaths: string[][] = []
    const db = client({ store_settings: [{ id: "s1", creator_id: CREATOR, logo_url: LOGO_URL }], library_assets: [] }, tree, { removedPaths })
    const unconfirmed = await purgeLibraryFiles(db, owner, [{ bucket: "store-builder-images", path: LOGO }], false)
    check("without the dialog's confirmation nothing goes", !unconfirmed.ok && removedPaths.length === 0, unconfirmed)
    const done = await purgeLibraryFiles(db, owner, [{ bucket: "store-builder-images", path: LOGO }], true)
    check("confirmed, the bytes go", done.ok && removedPaths.length === 1)
    check("  and the ledger says they were collected", db.tables.library_assets[0]?.purged_at !== null && db.tables.library_assets[0]?.purged_at !== undefined, db.tables.library_assets)
  }

  /* ─────────────────────────────────────────────────────────────────────────
     5. ORPHANS ARE COLLECTED, REFERENCED FILES ARE NOT
     ───────────────────────────────────────────────────────────────────────── */

  console.log("\nThe daily collection")
  const past = new Date(Date.now() - 86_400_000).toISOString()
  const future = new Date(Date.now() + 86_400_000).toISOString()
  {
    /* Nothing points at it, and the grace period has passed. */
    const tree = folderWith("logo.png")
    const removedPaths: string[][] = []
    const db = client(
      { library_assets: [{ id: "a1", owner_user_id: USER, owner_creator_id: CREATOR, bucket: "store-builder-images", path: LOGO, removed_at: past, purge_after: past, purged_at: null }] },
      tree,
      { removedPaths },
    )
    const sweep = await sweepRemovedLibraryFiles(db, {})
    check("an unreferenced removed file is collected", sweep.collected === 1 && removedPaths.length === 1, { sweep, removedPaths })
    check("  the object is gone from the bucket", !(tree["store-builder-images"][`${USER}/files`] ?? []).some((e) => e.name === "logo.png"))
    check("  and the row says so", db.tables.library_assets[0].purged_at !== null)
  }
  {
    /* The grace period has NOT passed. */
    const removedPaths: string[][] = []
    const db = client(
      { library_assets: [{ id: "a1", owner_user_id: USER, owner_creator_id: CREATOR, bucket: "store-builder-images", path: LOGO, removed_at: new Date().toISOString(), purge_after: future, purged_at: null }] },
      folderWith("logo.png"),
      { removedPaths },
    )
    const sweep = await sweepRemovedLibraryFiles(db, {})
    check(`inside the ${RETENTION_DAYS} day grace period nothing is collected`, sweep.due === 0 && sweep.collected === 0 && removedPaths.length === 0, sweep)
  }
  {
    /* Past the grace period, but the store logo still points at it. */
    const removedPaths: string[][] = []
    const db = client(
      {
        store_settings: [{ id: "s1", creator_id: CREATOR, logo_url: LOGO_URL }],
        library_assets: [{ id: "a1", owner_user_id: USER, owner_creator_id: CREATOR, bucket: "store-builder-images", path: LOGO, removed_at: past, purge_after: past, purged_at: null }],
      },
      folderWith("logo.png"),
      { removedPaths },
    )
    const sweep = await sweepRemovedLibraryFiles(db, {})
    check("a file the store logo still points at is KEPT for ever", sweep.collected === 0 && sweep.keptInUse === 1 && removedPaths.length === 0, sweep)
  }
  {
    /* The written down surfaces find nothing, but SQL part 18 does: the backstop holds. */
    const removedPaths: string[][] = []
    const db = client(
      {
        /* A table no surface in references.ts names. */
        some_future_table: [{ id: "z1", creator_id: CREATOR, picture: LOGO_URL }],
        library_assets: [{ id: "a1", owner_user_id: USER, owner_creator_id: CREATOR, bucket: "store-builder-images", path: LOGO, removed_at: past, purge_after: past, purged_at: null }],
      },
      folderWith("logo.png"),
      { removedPaths },
    )
    const sweep = await sweepRemovedLibraryFiles(db, {})
    check("a surface nobody wrote down is still caught by the database's own check", sweep.collected === 0 && sweep.keptInUse === 1 && removedPaths.length === 0, sweep)
  }
  {
    /* Without SQL part 18 the second gate cannot answer: nothing is collected. */
    const removedPaths: string[][] = []
    const db = client(
      { library_assets: [{ id: "a1", owner_user_id: USER, owner_creator_id: CREATOR, bucket: "store-builder-images", path: LOGO, removed_at: past, purge_after: past, purged_at: null }] },
      folderWith("logo.png"),
      { removedPaths, noRpc: true },
    )
    const sweep = await sweepRemovedLibraryFiles(db, {})
    check("without the database's check nothing is collected at all", sweep.collected === 0 && sweep.keptUnsure === 1 && removedPaths.length === 0, sweep)
  }
  {
    /* A surface that cannot be read is a reason to keep, not to collect. */
    const removedPaths: string[][] = []
    const db = client(
      { library_assets: [{ id: "a1", owner_user_id: USER, owner_creator_id: CREATOR, bucket: "store-builder-images", path: LOGO, removed_at: past, purge_after: past, purged_at: null }] },
      folderWith("logo.png"),
      { removedPaths, failWith: { store_settings: { code: "42501", message: "permission denied" } } },
    )
    const sweep = await sweepRemovedLibraryFiles(db, {})
    check("a surface that cannot be read keeps the file", sweep.collected === 0 && sweep.keptUnsure === 1 && removedPaths.length === 0, sweep)
  }
  {
    /* Part 222 not run: the sweep says so and does nothing. */
    const db = client({}, folderWith("logo.png"), { failWith: { library_assets: { code: "42P01", message: "does not exist" } } })
    const sweep = await sweepRemovedLibraryFiles(db, {})
    check("without part 222 the sweep is a no-op, not an error", sweep.ready === false && sweep.collected === 0, sweep)
  }

  /* ─────────────────────────────────────────────────────────────────────────
     6. BEFORE PART 222 RUNS, THE APP STILL WORKS AND STILL CANNOT DESTROY
     ───────────────────────────────────────────────────────────────────────── */

  console.log("\nBefore SQL part 222 has run")
  const noLedger = { library_assets: { code: "42P01" as const, message: "relation does not exist" } }
  {
    const tree = folderWith("logo.png")
    const removedPaths: string[][] = []
    const db = client({ store_settings: [{ id: "s1", creator_id: CREATOR, logo_url: LOGO_URL }] }, tree, { removedPaths, failWith: noLedger })
    const out = await removeFromLibrary(db, owner, [{ bucket: "store-builder-images", path: LOGO }])
    check("a picture in use REFUSES rather than deleting", !out.ok && "status" in out && out.status === 409 && removedPaths.length === 0, out)
    const why = "error" in out ? String(out.error) : ""
    check("  and the message names the place and the part to run", /Store logo/.test(why) && /part 222/.test(why), why)
    check("  the object is untouched", tree["store-builder-images"][`${USER}/files`].some((e) => e.name === "logo.png"))
  }
  {
    const tree = folderWith("spare.png")
    const removedPaths: string[][] = []
    const db = client({}, tree, { removedPaths, failWith: noLedger })
    const out = await removeFromLibrary(db, owner, [{ bucket: "store-builder-images", path: `${USER}/files/spare.png` }])
    check("a picture nothing points at is still removed, as before", out.ok && removedPaths.length === 1, { out, removedPaths })
  }
  {
    const removedPaths: string[][] = []
    const db = client({}, folderWith("spare.png"), { removedPaths, failWith: noLedger, noRpc: true })
    const out = await removeFromLibrary(db, owner, [{ bucket: "store-builder-images", path: `${USER}/files/spare.png` }])
    check("without part 18 either, it refuses instead of guessing", !out.ok && removedPaths.length === 0, out)
  }
  {
    const db = client({ store_settings: [{ id: "s1", creator_id: CREATOR, logo_url: LOGO_URL }] }, folderWith("logo.png"), { failWith: noLedger })
    const list = await listLibrary(db, owner, "media")
    check("the list is exactly as it was", list.some((f) => f.path === LOGO), list.map((f) => f.path))
  }

  /* ─────────────────────────────────────────────────────────────────────────
     7. MATCHING AN ADDRESS, NOT A FILE NAME
     ───────────────────────────────────────────────────────────────────────── */

  console.log("\nWhat counts as a reference")
  check("the storage host's own address counts", holdsPath(`https://abc.supabase.co/storage/v1/object/public/store-builder-images/${LOGO}`, needlesFor(LOGO)))
  check("Storelib's media address counts", holdsPath(LOGO_URL, needlesFor(LOGO)))
  check("a bare path in a theme file counts", holdsPath(`{"logo":"${LOGO}"}`, needlesFor(LOGO)))
  check("a percent encoded name counts", holdsPath(`https://storelib.com/media/store-builder-images/${USER}/files/my%20logo.png`, needlesFor(`${USER}/files/my logo.png`)))
  check("another store's file of the same name does not", !holdsPath(`https://storelib.com/media/store-builder-images/33333333-3333-4333-8333-333333333333/files/logo.png`, needlesFor(LOGO)))
  check("the file name on its own does not", !holdsPath("logo.png", needlesFor(LOGO)))

  /* The control case: the surface list has to actually fail on a surface it does not cover. */
  {
    const db = client({ store_settings: [{ id: "s1", creator_id: CREATOR, logo_url: LOGO_URL }], library_assets: [] }, folderWith("logo.png"))
    const none = await findUses(db, owner, "store-builder-images", `${USER}/files/other.png`)
    check("a picture nothing points at reads as nowhere", none.total === 0 && none.uses.length === 0, none)
    const only = await findUses(db, owner, "store-builder-images", LOGO, SURFACES.filter((s) => s.key === "collection"))
    check("  and with only the wrong surface looked at, the answer IS wrong (the control)", only.total === 0, only)
  }

  /* ─────────────────────────────────────────────────────────────────────────
     8. REFERENCES THAT ALREADY POINT AT NOTHING
     ───────────────────────────────────────────────────────────────────────── */

  console.log("\nRepairing what the old delete left behind")
  {
    /* The logo was hard deleted before this round: the row still names it. */
    const tree: Record<string, Record<string, Entry[]>> = { "store-builder-images": { [USER]: [{ name: "files", id: null, metadata: null }], [`${USER}/files`]: [] } }
    const db = client({ store_settings: [{ id: "s1", creator_id: CREATOR, logo_url: LOGO_URL }], library_assets: [] }, tree)
    const report = await repairBrokenReferences(db, owner, { apply: true, surfaces: SURFACES.filter((s) => s.key === "store-logo") })
    check("a reference whose object is gone is counted", report.broken === 1 && report.unrecoverable === 1, report)
    check("  nothing is recovered, because there is nothing to recover", report.recovered === 0 && report.recoverable === 0, report)
    check("  and the row keeps the address it has: no other picture is put in its place", db.tables.store_settings[0].logo_url === LOGO_URL)
  }
  {
    /* A row that says the bytes were collected while the object is in fact there. */
    const db = client(
      { library_assets: [{ id: "a1", owner_user_id: USER, owner_creator_id: CREATOR, bucket: "store-builder-images", path: LOGO, removed_at: past, purge_after: past, purged_at: past }] },
      folderWith("logo.png"),
    )
    const report = await repairBrokenReferences(db, owner, { apply: true, surfaces: [] })
    check("a real retained object is put back in Files", report.recoverable === 1 && report.recovered === 1, report)
    check("  and its row is clear again", db.tables.library_assets[0].removed_at === null && db.tables.library_assets[0].purged_at === null)
  }
  {
    const db = client(
      { store_settings: [{ id: "s1", creator_id: CREATOR, logo_url: LOGO_URL }], library_assets: [{ id: "a1", owner_user_id: USER, owner_creator_id: CREATOR, bucket: "store-builder-images", path: LOGO, removed_at: past, purge_after: past, purged_at: null }] },
      folderWith("logo.png"),
    )
    const report = await repairBrokenReferences(db, owner, { surfaces: SURFACES.filter((s) => s.key === "store-logo") })
    check("a retained object in use is counted as retained, not broken", report.retained === 1 && report.broken === 0, report)
  }
  check("every address in a page of markup is found", addressesIn(`<img src="${LOGO_URL}"><img src="https://abc.supabase.co/storage/v1/object/public/product-images/${CREATOR}/pr1/a.jpg">`).length === 2)

  /* ─────────────────────────────────────────────────────────────────────────
     9. THE WORDS ON THE BUTTONS
     ───────────────────────────────────────────────────────────────────────── */

  console.log("\nThe UI says what it does")
  const lib = read("components/files/files-library.tsx")
  const route = read("app/api/files/route.ts")
  check("the menu offers Remove from Files, not Delete", /label: "Remove from Files"/.test(lib) && !/label: "Delete"/.test(lib))
  check("the removal dialog says the file keeps showing where it is used", /keeps showing everywhere you have already used it/.test(lib))
  check("a permanent delete is its own dialog", /ConfirmDeleteForever/.test(lib) && /Delete this file permanently\?/.test(lib) && /Remove from Files\?/.test(lib))
  check("  which lists what will empty", /Deleting it empties:/.test(lib))
  check("  and cannot be pressed before the answer is in", /disabled=\{busy \|\| asking\}/.test(lib))
  check("  and sends the confirmation the server asks for", /body\.confirm = "permanent"/.test(lib) && /body\?\.confirm === "permanent"/.test(route))
  check("the details panel says where the file is in use", /\["In use on"/.test(lib) && /data-file-detail=/.test(lib))
  const words = [["un", "lock"], ["ele", "vate"], ["seam", "less"], ["power", "ful"], ["effort", "lessly"], ["super", "charge"], ["trans", "form"]].map((w) => w.join(""))
  const banned = new RegExp(`\u2014|\\b(${words.join("|")})\\b`, "i")
  for (const [name, src] of [["files-library", lib], ["files route", route], ["references", read("lib/files/references.ts")], ["assets", read("lib/files/assets.ts")], ["cleanup", read("lib/files/cleanup-removed.ts")], ["repair", read("lib/files/repair.ts")]] as const) {
    check(`${name}: no em dashes or banned words`, !banned.test(src), src.match(banned)?.[0])
  }


  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
}

void main()
