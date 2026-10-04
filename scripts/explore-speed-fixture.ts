/**
 * The catalogue scripts/check-explore-speed.mjs draws: products spread over
 * every pill and communities in most categories. Shared by the page bundle
 * (scripts/render-explore-speed.tsx) and the probe's own API server, so the
 * route answers for exactly the communities the page knows about.
 */
const HUES = [18, 42, 160, 200, 220, 260, 330, 90, 5, 280]
const picture = (i: number, w = 640, h = 360) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="hsl(${HUES[i % HUES.length]} 35% 82%)"/><circle cx="${w * 0.72}" cy="${h * 0.42}" r="${h * 0.22}" fill="hsl(${HUES[i % HUES.length]} 32% 64%)"/></svg>`,
  )

export const CATS = ["design", "development", "business", "marketing", "ai", "education", "productivity", "video", "photography", "audio-music"]
const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 1)

export const PRODUCTS = Array.from({ length: 60 }, (_, i) => ({
  id: `p${i}`,
  title: `${["Brand Kit", "Notion OS", "Prompt Pack", "Course", "Preset Pack", "Landing Page"][i % 6]} ${i + 1}`,
  slug: `product-${i}`,
  description: "A short description of a product that is long enough to count as complete for the ranking. ".repeat(2),
  price_cents: [9200, 0, 1849, 4900, 7900, 2500][i % 6],
  compare_at_cents: null,
  thumbnail_url: picture(i),
  type: "digital",
  category: CATS[i % CATS.length],
  categoryName: CATS[i % CATS.length],
  creator_id: `c${i % 5}`,
  created_at: new Date(NOW - i * DAY).toISOString(),
  sales_count: (i * 7) % 23,
  reviews_count: i % 4,
  reviews_average: 4 + (i % 10) / 10,
  categories: [],
  creator: { id: `c${i % 5}`, slug: `maker${i % 5}`, niche_tags: [], profile: { display_name: `Maker ${i % 5}`, avatar_url: null, username: `maker${i % 5}` } },
}))

export const COMMUNITIES = Array.from({ length: 30 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  slug: `community-${i}`,
  name: `${["Clay Studio", "Night Runners", "Film Photo Club", "Founders Weekly", "Design Guild", "Prompt Lab"][i % 6]} ${i + 1}`,
  tagline: "A calm place to share work and get honest feedback.",
  logoUrl: null,
  coverUrl: picture(i + 3),
  category: CATS[i % CATS.length],
  access: i % 3 === 1 ? "free" : "paid",
  visibility: "public",
  memberCount: (i * 137) % 5000,
  priceLine: i % 3 === 1 ? "Free" : "$9/month",
  creator: { id: `cr${i}`, name: `Creator ${i}`, username: `maker${i}`, avatarUrl: null },
  url: `/community/c${i}`,
  viewCount: (i * 911) % 40000,
  rating: null,
  launchedAt: new Date(NOW - i * 9 * DAY).toISOString(),
})) as any[]
