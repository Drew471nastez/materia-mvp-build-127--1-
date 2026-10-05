import { permanentRedirect } from "next/navigation"

/** /app/community/<id>/classroom was Learn's old address: links and bookmarks land on Learn. */
export default async function CommunityClassroomAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  permanentRedirect(`/app/community/${encodeURIComponent(id)}/learn`)
}
