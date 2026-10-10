import { PlacePage } from "@/components/community/member/place-page"

/** /community/<slug>/members: the member directory, when the community has it on (staff always). Round 15: seeds the shell. */
export default async function CommunityMembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <PlacePage slug={slug} place={{ kind: "members" }} />
}
