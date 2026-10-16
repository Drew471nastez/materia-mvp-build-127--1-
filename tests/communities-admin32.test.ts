/**
 * ===========================================================================
 *  COMMUNITIES ROUND 32: THE ADMIN'S OVERVIEW AND SETTINGS ON A COMPUTER
 * ===========================================================================
 * The owner: "the admin of the community on desktop and larger screens looks
 * absolutely horrible, it's too shrunk, bad UI, uses bad elements".
 *
 *   WIDTH      the /app 1200px container; Settings' column of panels as
 *              /app Settings draws it; every panel one column of full width
 *              cards (no 300px side column)
 *   PANELS     a list a new panel joins with one line (SETTINGS_TABS and
 *              PANELS), Address and domain and Explore and search as panels
 *              of their own, old links landing where they point
 *   GALLERY    the product editor's media grid and upload zone
 *   OVERVIEW   figures in the Analytics row's type, setup, recent activity
 *              read from real rows, shortcuts, the link
 *   LOOK       members choose their own look; the creator's stored one is
 *              no longer offered or read, and nothing deletes it
 *
 *   The measured proof is scripts/check-community-admin-round32.mjs.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { readCode } from "./_source"
import { SETTINGS_TABS, settingsTabOf } from "@/components/community/creator/logic"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => readCode(p)
const read = (p: string) => readFileSync(p, "utf8")

function main() {
  const settings = code("components/community/creator/settings-section.tsx")
  const parts = code("components/community/creator/parts.tsx")
  const logic = read("components/community/creator/logic.ts")

  console.log("\nWIDTH")
  check("the content keeps the /app page container, 1200px", /export const SECTION_WIDTH = "max-w-\[1200px\]"/.test(parts))
  check("the column of panels is /app Settings' from 1280px: 232px and 48px beside the panel", /xl:grid-cols-\[232px_minmax\(0,1fr\)\] xl:gap-12/.test(settings))
  check("no side column in a panel any more", !/_300px\]/.test(settings) && !/grid-cols-\[minmax\(0,1fr\)_\d+px\]/.test(settings))
  check("Roles are one column too", !/xl:grid-cols-2/.test(settings.slice(settings.indexOf("function Roles"))))
  check("a card heading can carry its one button (Publish, Archive, Delete, Add tier)", /export function EditorCard\(\{ title, hint, action,/.test(parts) && /action=\{/.test(settings))

  console.log("\nPANELS")
  check("the panels are one list a new panel joins with a line", Array.isArray(SETTINGS_TABS) && SETTINGS_TABS.includes("address") && SETTINGS_TABS.includes("discovery") && /export type SettingsTab = \(typeof SETTINGS_TABS\)\[number\]/.test(logic))
  check("the place for new panels is marked, in the list of names and the panel list", /\/\* round32: features panels/.test(logic) && /\/\* round32: features panels/.test(read("components/community/creator/settings-section.tsx")) && /\{\/\* round32: features panels/.test(read("components/community/creator/settings-section.tsx")))
  check("every name in SETTINGS_TABS has a panel", SETTINGS_TABS.every((t) => new RegExp(`value: "${t}"`).test(settings)), SETTINGS_TABS.filter((t) => !new RegExp(`value: "${t}"`).test(settings)))
  check("the column, the list and the open panel all come from PANELS", /const tabs = PANELS\.filter/.test(settings) && /tabs\.map\(\(t\) =>\s*opened\.has\(t\.value\)/.test(settings))
  check("old links land where they point", settingsTabOf("domain") === "address" && settingsTabOf("domains") === "address" && settingsTabOf("discovery") === "discovery" && settingsTabOf("explore") === "discovery" && settingsTabOf("welcome") === "features" && settingsTabOf("rules") === "policies" && settingsTabOf("general") === "page" && settingsTabOf("nope") === "page" && settingsTabOf(null) === "page")
  check("names a business reads", /label: "Address and domain"/.test(settings) && /label: "Access and prices"/.test(settings) && /label: "Explore and search"/.test(settings))
  check("the address saves on its own and moves these screens with it", /function AddressSettings/.test(settings) && /send\(`\/api\/app\/community\/\$\{head\.id\}`, "PATCH", \{ slug \}\)/.test(settings) && /router\.replace\(pathname\.replace\(`\/app\/community\/\$\{before\}`/.test(settings))
  check("the Page save no longer carries the address or the category", !/slug: head\.slug,\s*tagline/.test(settings) && !/category: communityCategoryId\(data\.category\) \?\? "",\s*description/.test(settings))
  check("the category is chosen under Explore and search, with Explore's list", settings.indexOf('id="g-category"') > settings.indexOf("function Discovery"))
  check("no second visibility control beside Access (the same column)", !/name="community-visibility"/.test(settings))
  const domain = code("components/community/creator/community-domain-panel.tsx")
  check("the domain card is the settings card, its way to Settings › Domains a link in a sentence", /<EditorCard/.test(domain) && !/<Section\b/.test(domain) && /parts=\{\{ settings: settingsWords \}\}/.test(domain) && !/action=\{<span className="hidden sm:inline-flex">\{settingsLink\}/.test(domain))
  check("blocked words are a card of their own in Rules and policies, still a row in Moderation", /<BlockedWords communityId=\{head\.id\} canEdit=\{head\.can\.manage_settings === true\} card \/>/.test(settings) && /<BlockedWords communityId=\{head\.id\} canEdit=\{head\.can\.manage_settings === true\} initial=\{blockedWords\} \/>/.test(code("components/community/creator/moderation-section.tsx")))

  console.log("\nGALLERY")
  const editor = code("components/community/creator/gallery-editor.tsx")
  const tiles = code("components/community/creator/gallery-tiles.tsx")
  const media = code("app/app/products/new/media-grid.tsx")
  check("the product editor's grid: two a row on a phone, three wider", /grid grid-cols-2 gap-2\.5 sm:grid-cols-3 sm:gap-3/.test(editor) && /grid grid-cols-2 gap-2\.5 sm:grid-cols-3 sm:gap-3/.test(media))
  check("16:9 tiles with a hairline, as a product's photos", /group\/tile relative aspect-video overflow-hidden rounded-lg border/.test(tiles) && /aspect-video/.test(media))
  check("no narrow add tile and no row of buttons under the grid: one upload zone across the card", /data-gallery-drop=/.test(editor) && /border-2 border-dashed/.test(editor) && !/aspect-\[16\/10\]/.test(editor + tiles) && !/data-gallery-add-video/.test(editor))
  check("the zone takes pictures and videos in one picker and a drop", /accept="image\/jpeg,image\/png,image\/webp,image\/heic,image\/heif,video\/mp4,video\/quicktime,video\/webm"/.test(read("components/community/creator/gallery-editor.tsx")) && (editor.match(/takeFiles\(Array\.from\(e\.dataTransfer\.files\)\)/g) ?? []).length === 2)
  check("still held to move, with a menu per tile", /useHoldToDragSensors\(\)/.test(editor) && /ResponsiveActionMenu/.test(tiles))

  console.log("\nOVERVIEW")
  const overview = code("components/community/creator/overview.tsx")
  const activity = code("lib/communities/server/overview-activity.ts")
  const creator = code("lib/communities/server/creator.ts")
  check("figures in the Analytics row's type (12px name, 22px number)", /text-\[12px\] font-medium text-\[#6b7280\]/.test(overview) && /sm:text-\[22px\]/.test(overview))
  check("two columns from 1280px, one ordered column below", /xl:grid-cols-\[minmax\(0,1fr\)_340px\]/.test(overview) && /contents xl:flex/.test(overview) && /order-1/.test(overview) && /order-6/.test(overview))
  check("setup, recent activity, shortcuts and the link", /<NextSteps/.test(overview) && /data-overview-activity/.test(overview) && /data-overview-actions/.test(overview) && /<CopyAddress/.test(overview))
  check("recent activity is read from real rows: the newest posts and members", /from\("community_feed_posts"\)/.test(activity) && /from\("community_members"\)/.test(activity) && /recent: await recentLines/.test(creator) && /overviewActivity\(db, c\)/.test(creator))
  check("a shortcut only for a role that may", /head\.can\.post \?/.test(overview) && /head\.can\.invite \?/.test(overview) && /head\.can\.manage_settings \?/.test(overview))
  check("no figure is made up: every one comes from the server's figures", !/Math\.random|sample/i.test(overview))

  console.log("\nLOOK")
  const choice = code("lib/communities/client/appearance-choice.ts")
  check("the admin has no White or Dark setting", !/appearance: next/.test(settings) && !/"White or dark/.test(settings) && !/communityAppearance/.test(settings))
  check("the creator's stored look is not read for members or visitors", !/communityAppearance/.test(code("components/community/member/data.ts")) && /export function useCommunityAppearance\(\)/.test(choice) && !/setPageDefaultAppearance/.test(choice) && /useCommunityAppearance\(\)/.test(code("components/community/member/shell-frame.tsx")) && /useCommunityAppearance\(\)/.test(code("components/community/public/public-frame.tsx")))
  check("a member's own choice, else white", /return useAppearance\("light"\)/.test(choice))
  check("nothing deletes the stored value: a welcome save still carries it", /\.\.\.\(look === "dark" \? \{ appearance: "dark" as const \} : \{\}\)/.test(creator))

  console.log("\nCOPY")
  const files = [
    "components/community/creator/settings-section.tsx",
    "components/community/creator/overview.tsx",
    "components/community/creator/gallery-editor.tsx",
    "components/community/creator/gallery-tiles.tsx",
    "components/community/creator/community-domain-panel.tsx",
    "components/community/creator/blocked-words.tsx",
    "components/community/creator/parts.tsx",
    "lib/communities/server/overview-activity.ts",
    "lib/communities/client/appearance-choice.ts",
    "scripts/check-community-admin-round32.mjs",
    "scripts/render-community-admin-round32.tsx",
  ]
  const banned = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i
  for (const f of files) {
    const src = read(f)
    check(`${f}: no em dash, no banned word`, !src.includes("—") && !banned.test(src), (src.match(banned) ?? [])[0])
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main()
