import { Suspense } from "react"
import { can } from "@/lib/communities/permissions"
import { sectionPage, type CreatorPageContext } from "@/lib/communities/server/creator"
import { libraryReads } from "@/lib/communities/server/admin-sections"
import { LibraryAdmin } from "@/components/community/library/library-admin"
import { SectionSeed } from "@/components/community/creator/community-shell"
import { SectionFrame } from "@/components/community/creator/section-frame"

export const dynamic = "force-dynamic"

/**
 * /app/community/<id>/library (round 39): the community's Library, its items in the order members see them, its sections,
 * and each item's editor, read here so the section lands filled. The frame first, as every section (round 32).
 * ?item=<id> opens that item's editor (the member side's Edit item).
 */
export default async function CommunityLibraryAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ item?: string }> }) {
  const [{ id }, { item }] = await Promise.all([params, searchParams])
  const ctx = await sectionPage(id, "manage_classroom")
  if (!ctx) return null
  const open = typeof item === "string" && /^[0-9a-f-]{36}$/i.test(item) ? item.toLowerCase() : null
  return (
    <SectionSeed id="library" stamp={open ?? ""}>
      <Suspense fallback={<SectionFrame id="library" />}>{libraryBody({ ctx, open })}</Suspense>
    </SectionSeed>
  )
}

async function libraryBody({ ctx, open }: { ctx: CreatorPageContext; open: string | null }) {
  const { initial } = await libraryReads(ctx)
  return <LibraryAdmin communityId={ctx.community.id} initial={initial} initialOpenId={open} canSwitch={can(ctx.role, "manage_settings", ctx.viewer.perms)} />
}
