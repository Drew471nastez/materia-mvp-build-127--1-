/**
 * ===========================================================================
 *  ROUND 51 (E): PROFILE DETAILS ON THE CREATOR PAGE, AND EMAILS' PILLS
 * ===========================================================================
 * The owner's list for Edit profile, and for Customer emails and Settings'
 * pill groups. The browser half is measured by
 * scripts/check-profile-sheet-r51.mjs and scripts/check-emails-pills-r51.mjs;
 * this holds the logic and the wiring:
 *
 *   sync      the creator page's social links and the OnePage's: only the
 *             platforms a save changed travel, a removed link is removed,
 *             nothing the save did not touch is written, both copies of the
 *             OnePage take it, and a failure never fails the save
 *   fields    a saved link shows as the name after "@", a field nobody
 *             touched sends its saved link back character for character, a
 *             typed name and a pasted link resolve as the route resolves them
 *   switches  Social links hides the icons through its own flag, never the
 *             builder's stale showSocialMedia; Rating and reviews turns the
 *             old Stats master on with it; the page shows the sheet what the
 *             page really does
 *   live      the header and the About block draw Edit profile's fields
 *             before Save, only where the owner's controls are
 *   scroll    one bar in the drawer: the drawer's thumb, not Chrome's as
 *             well, and not the page's own beside it
 *   pills     Customer emails and Integrations draw Analytics' chip; the
 *             list never dims as a whole and the language note sits under it
 *
 * Run with:  npx tsx tests/creator-emails-r51.test.ts
 * (or through scripts/run-push-tests.mjs).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  applyToCreatorPage,
  applyToOnePage,
  changedLinks,
  creatorPageLinks,
  onePageLinks,
  syncCreatorLinksToOnePage,
  syncOnePageLinksToCreatorPage,
} from "@/lib/social/onepage-sync"
import { SOCIAL_PLATFORM_KEYS, resolveSocialInput } from "@/lib/social/platforms"
import { socialFieldIsLink, socialFieldValue } from "@/lib/onepage/social-input"

let passed = 0
let failed = 0
const out = console.log.bind(console)
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    out(`  ok    ${label}`)
  } else {
    failed++
    out(`  FAIL  ${label}${detail !== undefined ? `: ${JSON.stringify(detail)?.slice(0, 400)}` : ""}`)
  }
}
console.error = () => {}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

/* ── A stand-in database: rows by table, every update written down ───── */
type Row = Record<string, unknown>
function fakeDb(tables: Record<string, Row[]>, fail: Record<string, boolean> = {}) {
  const writes: { table: string; update: Row; id: unknown }[] = []
  const db = {
    from(table: string) {
      const filters: [string, unknown][] = []
      const q = {
        select() {
          return q
        },
        eq(col: string, v: unknown) {
          filters.push([col, v])
          return q
        },
        async maybeSingle() {
          const row = (tables[table] || []).find((r) => filters.every(([c, v]) => r[c] === v)) ?? null
          return { data: row, error: null }
        },
        update(update: Row) {
          return {
            async eq(col: string, v: unknown) {
              if (fail[table]) return { error: { message: "refused" } }
              writes.push({ table, update, id: v })
              const row = (tables[table] || []).find((r) => r[col] === v)
              if (row) Object.assign(row, update)
              return { error: null }
            },
          }
        },
      }
      return q
    },
  }
  return { db, writes }
}

async function main() {
  out("\nSYNC: what changed, and only that")
  {
    const before = creatorPageLinks({ instagram: { enabled: true, url: "https://www.instagram.com/a" }, tiktok: { enabled: false, url: "https://www.tiktok.com/@old" } })
    check("a disabled creator page link reads as none, as the page draws it", before.tiktok === "" && before.instagram === "https://www.instagram.com/a")
    const after = { ...before, instagram: "", youtube: "https://www.youtube.com/@b" }
    const changes = changedLinks(before, after)
    check("only the changed platforms, a removed one as empty", JSON.stringify(changes) === JSON.stringify({ instagram: "", youtube: "https://www.youtube.com/@b" }), changes)
    check("nothing changed is nothing to send", Object.keys(changedLinks(before, before)).length === 0)
    const onepage = applyToOnePage({ instagram: "https://instagram.com/a", website: "https://me.test", email: "mailto:a@b.test", tiktok: "https://tiktok.com/@keep" }, changes)
    check("the OnePage takes the change, a removal as null", onepage.instagram === null && onepage.youtube === "https://www.youtube.com/@b")
    check("the OnePage's own platforms and an untouched link are left as they were", onepage.website === "https://me.test" && onepage.email === "mailto:a@b.test" && onepage.tiktok === "https://tiktok.com/@keep")
    const creator = applyToCreatorPage({ instagram: { enabled: true, url: "x" }, twitch: { enabled: true, url: "https://www.twitch.tv/keep" } }, { instagram: "", twitter: "https://x.com/c" })
    check("the creator page takes it in its own shape", JSON.stringify(creator.instagram) === JSON.stringify({ enabled: false, url: "" }) && creator.twitter?.url === "https://x.com/c" && creator.twitter?.enabled === true)
    check("and keeps what was not changed", creator.twitch?.url === "https://www.twitch.tv/keep")
    check("the OnePage's plain URLs read the same way", onePageLinks({ instagram: " https://instagram.com/a ", website: "w" }).instagram === "https://instagram.com/a" && !("website" in onePageLinks({ website: "w" })))
    check("every creator page platform is shared", SOCIAL_PLATFORM_KEYS.every((k) => k in onePageLinks({})))
  }

  out("\nSYNC: Edit profile's save reaches the OnePage")
  {
    const page = { id: "op1", owner_id: "u1", social_links: { instagram: "https://instagram.com/old", website: "https://me.test" }, published_social_links: { instagram: "https://instagram.com/old" }, instagram: "https://instagram.com/old" }
    const { db, writes } = fakeDb({ onepages: [page] })
    const ok = await syncCreatorLinksToOnePage(db, "u1", { instagram: "https://www.instagram.com/new" })
    const w = writes[0]?.update as Record<string, Record<string, unknown> | string>
    check("written once, to that OnePage", ok && writes.length === 1 && writes[0].id === "op1")
    check("its draft and its live copy both", (w.social_links as Record<string, unknown>).instagram === "https://www.instagram.com/new" && (w.published_social_links as Record<string, unknown>).instagram === "https://www.instagram.com/new")
    check("the old instagram column follows, as the OnePage page keeps it", w.instagram === "https://www.instagram.com/new")
    check("its website stays", (w.social_links as Record<string, unknown>).website === "https://me.test")
    const never = { id: "op2", owner_id: "u2", social_links: {}, published_social_links: null }
    const second = fakeDb({ onepages: [never] })
    await syncCreatorLinksToOnePage(second.db, "u2", { tiktok: "https://www.tiktok.com/@t" })
    check("a OnePage never published gets no live copy made for it", !("published_social_links" in second.writes[0].update))
    const none = fakeDb({ onepages: [] })
    check("no OnePage: nothing written, no error", (await syncCreatorLinksToOnePage(none.db, "u9", { tiktok: "x" })) === false && none.writes.length === 0)
    const refused = fakeDb({ onepages: [{ ...page }] }, { onepages: true })
    check("a refused write is a false, never a throw", (await syncCreatorLinksToOnePage(refused.db, "u1", { tiktok: "x" })) === false)
    const empty = fakeDb({ onepages: [{ ...page }] })
    check("no changes: not even read", (await syncCreatorLinksToOnePage(empty.db, "u1", {})) === false && empty.writes.length === 0)
  }

  out("\nSYNC: the OnePage's publish reaches the creator page")
  {
    const config = {
      id: "cfg1",
      creator_id: "c1",
      page_type: "shop",
      draft_config: { headerSettings: { bio: "b", socialLinks: { instagram: { enabled: true, url: "https://www.instagram.com/a" }, twitch: { enabled: true, url: "https://www.twitch.tv/t" } } }, sections: [1] },
      published_config: { headerSettings: { socialLinks: { instagram: { enabled: true, url: "https://www.instagram.com/a" } } }, globalSettings: { themePreset: "sage" } },
    }
    const { db, writes } = fakeDb({ creators: [{ id: "c1", user_id: "u1" }], store_builder_configs: [config] })
    const ok = await syncOnePageLinksToCreatorPage(db, "u1", { instagram: "https://instagram.com/new" })
    const w = writes[0]?.update as { draft_config: typeof config.draft_config; published_config: typeof config.published_config }
    check("both configs, in one write", ok && writes.length === 1 && !!w.draft_config && !!w.published_config)
    check("the changed platform", w.draft_config.headerSettings.socialLinks.instagram.url === "https://instagram.com/new" && w.published_config.headerSettings.socialLinks.instagram.url === "https://instagram.com/new")
    check("everything else in the config kept", w.draft_config.headerSettings.bio === "b" && w.draft_config.headerSettings.socialLinks.twitch.url === "https://www.twitch.tv/t" && JSON.stringify(w.draft_config.sections) === "[1]" && w.published_config.globalSettings.themePreset === "sage")
    const noCreator = fakeDb({ creators: [], store_builder_configs: [] })
    check("an account with no creator page: nothing written", (await syncOnePageLinksToCreatorPage(noCreator.db, "u1", { instagram: "x" })) === false && noCreator.writes.length === 0)
  }

  out("\nSYNC: wired where the saves happen")
  {
    const profile = read("app/api/creator-profile/route.ts")
    const publish = read("app/api/onepage/publish/route.ts")
    check("Edit profile compares the page's links before and after its own save", /changedLinks\(creatorPageLinks\(headerBefore\.socialLinks\), creatorPageLinks\(buildSocialLinks\(body\.socialLinks, headerBefore\.socialLinks\)\)\)/.test(profile))
    check("and sends only those, after its own write succeeded", profile.indexOf("syncCreatorLinksToOnePage(db, page.profileId, linksChanged)") > profile.indexOf('console.error("[creator-profile] config update failed", error)'))
    check("the OnePage's publish compares against the copy that was live", /select\("id, owner_id, published_social_links"\)/.test(publish) && /changedLinks\(onePageLinks\(liveBefore\), onePageLinks\(publishData\.published_social_links\)\)/.test(publish))
    check("after its own publish, and the creator page's cached copy is told", publish.indexOf("syncOnePageLinksToCreatorPage(") > publish.indexOf("onePageChangedFor(ownerId") && /creatorPagesChanged\(\{ userId: ownerId \}\)/.test(publish))
  }

  out("\nFIELDS: \"@\" in front, links still welcome, old values kept")
  {
    const saved: Record<string, string> = {
      instagram: "https://www.instagram.com/andrewrullz",
      tiktok: "https://www.tiktok.com/@andrewrullz",
      youtube: "https://www.youtube.com/@filmlab",
      twitter: "https://twitter.com/filmlab",
      facebook: "https://www.facebook.com/filmlab",
      linkedin: "https://www.linkedin.com/in/filmlab",
      twitch: "https://www.twitch.tv/filmlab",
    }
    for (const [key, url] of Object.entries(saved)) {
      const field = socialFieldValue(key, url)
      check(`${key}: a saved profile shows as its name`, !socialFieldIsLink(key, field) && !field.includes("/") && field.length > 0, field)
    }
    check("a link that is not a plain profile shows whole, and the @ steps aside", socialFieldIsLink("youtube", socialFieldValue("youtube", "https://www.youtube.com/c/Some")))
    check("a typed name becomes the profile the route saves", resolveSocialInput("instagram", "newname") === "https://www.instagram.com/newname" && resolveSocialInput("tiktok", "@me") === "https://www.tiktok.com/@me")
    check("a pasted link is still accepted", resolveSocialInput("twitter", "https://twitter.com/filmlab_x") === "https://twitter.com/filmlab_x")
    const button = read("components/storefront/edit-profile-button.tsx")
    check("a field nobody touched sends its saved link back as it was", /now === socialFieldValue\(key, before\) \? before : now/.test(button))
    check("the sheet's fields start from the names, and Save's comparison too", /useState<Record<string, string>>\(\(\) => fieldsFrom\(socialLinks\)\)/.test(button) && /fieldsFrom\(socialLinks\),\s*\{ showReviews/.test(button))
    const editor = read("components/social/social-links-editor.tsx")
    check("the editor's @ is opt in (the store builder's panels keep theirs)", /handles = false/.test(editor) && /handles\s*\n\s*\/>/.test(button))
    check("the @ is a fixed prefix that steps aside for a link, and a typed @ is dropped", /data-social-prefix=""/.test(editor) && /!socialFieldIsLink\(key, current\)/.test(editor) && /replace\(\/\^\\s\*@\+\/, ""\)/.test(editor))
  }

  out("\nSWITCHES: each does what it says")
  {
    const header = read("components/store-builder/unified-section-renderer.tsx")
    const route = read("app/api/creator-profile/route.ts")
    const page = read("app/(marketing)/u/[username]/page.tsx")
    const types = read("lib/store-builder/types.ts")
    check("the icons hide on Edit profile's own flag", /settings\.socialLinks && settings\.hideSocialLinks !== true &&/.test(header) && /hideSocialLinks\?: boolean/.test(types))
    check("never on the builder's stale showSocialMedia", !/settings\.showSocialMedia/.test(header))
    check("the route writes the flag from the switch, and Stats with Reviews on", /next\.hideSocialLinks = !display\.showSocialMedia/.test(route) && /if \(display\.showReviews === true\) next\.showStats = true/.test(route))
    check("the sheet is shown what the page does", /showReviews: \(headerSettings\?\.showStats \?\? true\) && \(headerSettings\?\.showReviews \?\? true\)/.test(page) && /showSocialMedia: headerSettings\?\.hideSocialLinks !== true/.test(page))
  }

  out("\nLIVE: the page shows the form before Save")
  {
    const header = read("components/store-builder/unified-section-renderer.tsx")
    const button = read("components/storefront/edit-profile-button.tsx")
    const draft = read("lib/storefront/profile-draft.ts")
    const viewer = read("app/api/creator-page/viewer/route.ts")
    check("the header reads the draft only where the owner's controls are", /const draft = useProfileDraft\(!!ownerActions\)\s*\n\s*const \{ settings, creator, profile \} = withProfileDraft\(givenSettings, givenCreator, givenProfile, draft\)/.test(header))
    check("the About block's name and sales figure follow it", /draft\.showSales \? totalSales \|\| viewer\.totalSales \|\| 0 : 0/.test(header))
    check("the sheet writes it while open, clears it on Cancel, holds it after Save until the page's values arrive", /setProfileDraft\(\{/.test(button) && /holdDraft\.current = null\s*\n\s*setProfileDraft\(null\)/.test(button) && /holdDraft\.current = savedSignature/.test(button))
    check("nothing about the draft is stored or sent", !/fetch\(|localStorage/.test(draft))
    check("a hidden sales figure reaches the owner only", /const salesRead = owner \? ownerTotalSales\(row\.id\) : Promise\.resolve\(null\)/.test(viewer) && /contactEmail, totalSales \}/.test(viewer))
  }

  out("\nSAVE: four states, each its own look")
  {
    const sheet = read("components/storefront/editor-sheet.tsx")
    check("clean, dirty, saving, saved", /const state: "clean" \| "dirty" \| "saving" \| "saved" = saved \? "saved" : busy \? "saving" : saveDisabled \? "clean" : "dirty"/.test(sheet) && /data-save-state=\{state\}/.test(sheet))
    check("nothing to save is light grey, not the dark button at half opacity", /state === "clean" \? "bg-\[#eceef1\] text-\[#9ca3af\]/.test(sheet) && /disabled:opacity-100/.test(sheet))
    check("colour eases, the words change in place", /transition-\[background-color,color\] duration-\[180ms\]/.test(sheet) && /col-start-1 row-start-1 inline-flex items-center gap-1\.5 transition-\[opacity,translate\]/.test(sheet))
    check("Saved holds the sheet as busy does", /busyRef\.current = busy \|\| saved/.test(sheet) && /dismissible=\{!busy && !saved\}/.test(sheet))
  }

  out("\nSCROLL AND COVER")
  {
    const css = read("app/globals.css")
    const sheet = read("components/storefront/editor-sheet.tsx")
    const frame = read("components/app/cover-crop-frame.tsx")
    check("the drawer's scroller draws no native bar beside its thumb", /\.cp-overlay-scroll\[data-sheet-scroll\] \{\s*scrollbar-width: none;/.test(css))
    check("and that rule comes after the one that gave it the thin bar", css.indexOf(".cp-overlay-scroll[data-sheet-scroll]") > css.indexOf("[data-sheet-scroll],\n[data-wb-sidebar-scroll] {"))
    check("the page's own bar goes while the drawer is open, its width handed back", /html\[data-editor-drawer-open\] \{\s*scrollbar-width: none;/.test(css) && /root\.style\.paddingRight = `\$\{pad \+ gutter\}px`/.test(sheet))
    check("the cover frame can be taller than the band, with the band's window in it", /data-cover-stage=""/.test(frame) && /data-cover-window=""/.test(frame) && /stage < aspect - 0\.01/.test(frame))
    check("gestures still measure the window", /<div ref=\{frameRef\} data-cover-window=""/.test(frame) && /const el = stageRef\.current \?\? frameRef\.current/.test(frame))
    check("the profile sheet asks for it", /stage: COVER_STAGE/.test(read("components/storefront/edit-profile-button.tsx")))
  }

  out("\nPILLS: Analytics' chip, and a list that never blinks")
  {
    const pills = read("components/app/filter-pills.tsx")
    const panel = read("components/app/settings/customer-emails-panel.tsx")
    check("36px, round, white, the analytics hairline ring, 14px semibold", /h-9 shrink-0 items-center gap-1\.5 rounded-full px-3\.5 text-\[14px\] font-semibold/.test(pills) && /shadow-\[0_0_0_1px_rgba\(17,24,39,0\.08\),0_1px_2px_rgba\(17,24,39,0\.05\)\]/.test(pills))
    check("the press eases the pill's own ground on Settings' curve", /transition-\[background-color,color,box-shadow\] duration-150 ease-\[cubic-bezier\(0\.33,1,0\.68,1\)\]/.test(pills))
    check("the chosen pill is kept whole on a phone", /useEdgeFade<HTMLDivElement>\(\)/.test(pills) && /strip\.scrollTo\(\{ left/.test(pills))
    check("the whole list no longer dims on a press", !/opacity: 0\.25/.test(panel))
    check("only a section a press brought in fades, from nothing", /arrive=\{switched\}/.test(panel) && /el\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\], \{ duration: VIEW_FADE_MS, easing: PILL_FADE_EASE \}\)/.test(panel))
    check("each family keeps its title in every view, so its rows do not move", /title=\{FAMILY_NAMES\[family\]\}/.test(panel) && !/title=\{shown === "all"/.test(panel))
    check("the language note sits under the list", panel.indexOf("data-language-rule") > panel.indexOf("families.map((family) =>"))
  }

  out(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

void main()
