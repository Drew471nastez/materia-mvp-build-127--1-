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
    Round 26: how often members opened each member link. The member side counts the clicks (round 26, W6, run-now part
    221); until its reader is wired here the editor shows the links without counts.
  */
  const clicks: Record<string, number> | null = null
  return { head, data, preview, creatorId: ctx.creatorId, clicks }
}
