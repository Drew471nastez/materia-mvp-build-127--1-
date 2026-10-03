/**
 * The website's Community card (themes/default/sections/community_card.storelib)
 * drawn by the real theme engine with a fixture community, printed as JSON
 * { html, css, empty, editor } for scripts/check-community-section.mjs. Runs
 * in node (the engine hashes with node:crypto):
 *
 *   npx tsx scripts/render-community-card.ts
 */
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { storefrontData } from "@/lib/website-builder/storefront-data"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const ID = "11111111-1111-4111-8111-111111111111"
const cover = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="300"><rect width="1200" height="300" fill="#b9c8bd"/><path d="M0 220 Q 300 150 600 210 T 1200 190 V300 H0Z" fill="#7d9686"/></svg>`)}`
const logo = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112"><rect width="112" height="112" fill="#1f3b2d"/><circle cx="56" cy="56" r="26" fill="#f2c14e"/></svg>`)}`
const sec = { id: "s-cc", type: "community_card", name: "community_card", settings: { community: ID, text: "Plans, routes and a crew that shows up at 6." }, blocks: [] } as unknown as SectionInstance
const communities = {
  [ID]: { id: ID, name: "Morning Runners", tagline: "Run before the city wakes.", url: "/community/morning-runners", image: cover, logo, members: 1240, members_label: "1.2k members", posts: 318, events: 2, price: "$9/month", join_label: "Join for $9/month" },
}
const draw = (data: ReturnType<typeof storefrontData>, inEditor = false) => {
  const r = renderStorelibSection(sec, {} as ThemeSettingsValues, { template: "index", in_editor: inEditor }, {}, [] as never, data)
  if (r.ok === false) throw new Error(JSON.stringify(r.errors))
  return r
}
const full = draw(storefrontData({ dynamic: {} as never, catalog: [], menus: {}, communities }))
const empty = draw(storefrontData({ dynamic: {} as never, catalog: [], menus: {} }))
const editor = draw(storefrontData({ dynamic: {} as never, catalog: [], menus: {} }), true)
process.stdout.write(JSON.stringify({ html: full.html, css: full.css, empty: empty.html, editor: editor.html }))
