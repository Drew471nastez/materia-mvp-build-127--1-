import { notFound, permanentRedirect } from "next/navigation"
import { communitiesEnabled } from "@/lib/communities/flag"

/** /app/community/<id>/classroom was Learn's old address: links and bookmarks land on Learn. */
export default async function CommunityClassroomAdminPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await communitiesEnabled())) notFound()
  const { id } = await params
  permanentRedirect(`/app/community/${encodeURIComponent(id)}/learn`)
}
