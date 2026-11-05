/**
 * The public OnePage's real generateMetadata (app/(storelib)/(marketing)/l/[slug]/page),
 * run in Node against an in-memory database, for
 * scripts/check-onepage-seo.mjs: the probe saves a page in the editor, hands
 * the row it saved here, and compares what comes back with what the editor's
 * previews showed. The database, the domain lookups and the page body are
 * stand-ins (the probe's esbuild plugin); the metadata code is not.
 */
import { fakeDb } from "../tests/_fake-db"
import { generateMetadata } from "@/app/(storelib)/(marketing)/l/[slug]/page"

export async function metadataFor(row: Record<string, any>, owner: { username: string; display_name: string | null; avatar_url: string | null }) {
  ;(globalThis as any).__probeAdmin = fakeDb({
    onepages: [row],
    creators: [{ id: row.seller_id, user_id: row.owner_id, banned_at: null }],
    profiles: [{ id: row.owner_id, ...owner }],
    products: [{ id: "p1", creator_id: row.seller_id, status: "published" }],
  })
  return generateMetadata({ params: Promise.resolve({ slug: row.slug }) })
}
