export async function GET() {
  await new Promise((r) => setTimeout(r, 300))
  const c = { id: "c0000000-0000-4000-8000-000000000001", slug: "clay-studio", name: "Clay Studio", logoUrl: null }
  const posts = Array.from({ length: 8 }, (_, i) => ({ id: `q${i}`, title: `An older post, number ${i + 9}`, excerpt: "Glaze tip that saved me a whole batch: test tiles on the same shelf height.", space: "Critique", at: new Date(Date.now() - (i + 12) * 86_400_000).toISOString(), reactions: i, comments: 1, href: `/community/clay-studio/post/q${i}`, imageUrl: null, community: c, canEdit: true, canDelete: true }))
  return new Response(JSON.stringify({ posts, next: null }), { headers: { "Content-Type": "application/json" } })
}
