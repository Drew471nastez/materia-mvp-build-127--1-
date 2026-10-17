import "server-only"

/**
 * ===========================================================================
 *  WHAT THE PAGE EDITOR READS (round 33)
 * ===========================================================================
 * /app/community/<slug>/page draws the community's About page as a visitor
 * sees it, with the creator's changes on it as they type
 * (components/community/creator/page-editor). So it reads the same things
 * the About page does (lib/communities/server/public.ts loadSalesPage and
 * ./about.ts aboutExtras), and the page's settings as Settings reads them
 * (./creator.ts loadSettings), in one round:
 *
 *   THE VISITOR'S BUTTON   loadSalesPage answers for whoever asks, and the
 *                          one asking is the owner ("Open community"). The
 *                          preview is the page somebody deciding whether to
 *                          join gets, so its button is decided again for a
 *                          signed out visitor of the published community
 *                          (../../../components/community/public/join-state.ts).
 *                          A draft is previewed as it will be once published.
 */
import { decideJoin } from "@/components/community/public/join-state"
import type { SalesPageData } from "@/components/community/public/types"
import { communityHead, loadSettings, type CreatorPageContext } from "./creator"
import { loadSalesPage } from "./public"
import { aboutExtras } from "./about"
import { memberLinkClicks } from "./member-shortcuts"

export async function pageEditorReads(ctx: CreatorPageContext) {
  const [head, data, load, extras] = await Promise.all([communityHead(ctx), loadSettings(ctx), loadSalesPage(ctx.community.slug, ctx.userId, ctx.db), aboutExtras(ctx.db, ctx.community)])
  let preview: SalesPageData | null = null
  if (load) {
    const c = load.community
    const view = load.data.community
    const join = decideJoin({
      community: {
        slug: c.slug,
        status: "published",
        access: c.access,
        visibility: c.visibility,
        approvalRequired: c.approval_required,
        suspended: false,
        archived: false,
        creatorName: view.creator?.name ?? null,
      },
      viewer: { signedIn: false, active: false, status: null, role: null, isOwner: false, banned: false, approved: false, invited: false, source: null, membershipId: null },
      options: view.options,
      accessProducts: view.accessProducts,
      canTakePayments: true,
    })
    preview = { community: view, join, notice: null, extras, askWhy: false }
  }
  /*
    Round 26: how often members opened each member link, counted by the member side once per member, link and day
    (lib/communities/server/member-shortcuts.ts, run-now part 221). Before part 221 every link reads 0; a read that throws
    leaves the editor without counts.
  */
  const clicks: Record<string, number> | null = await memberLinkClicks(ctx.community.id, { db: ctx.db }).catch(() => null)
  return { head, data, preview, creatorId: ctx.creatorId, clicks }
}
