/**
 * Round 31: the community's content sections in /app (Spaces, Feed, Learn,
 * Calendar). What is pure is run; what is a screen is read from its source
 * (scripts/check-community-content-round31.mjs measures the screens).
 */
import { existsSync } from "node:fs"
import { readCode } from "./_source"
import { checkSpaceIcon, isEmojiIcon, ICON_MAX } from "@/components/community/creator/space-icon"
import { chosenEmoji, iconGraphemes, spaceGlyph } from "@/components/community/member/space-glyph"

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

console.log("\nICON: one emoji, or up to two letters, counted as a person counts them")
{
  const ok = (raw: string) => {
    const c = checkSpaceIcon(raw)
    return c.ok ? c.value : null
  }
  check("one emoji", ok("🔥") === "🔥")
  check("a family is one character, never cut", ok("👨‍👩‍👧") === "👨‍👩‍👧" && iconGraphemes("👨‍👩‍👧").length === 1)
  check("a skin tone and a joiner stay with their emoji", ok("👩🏽‍💻") === "👩🏽‍💻")
  check("a flag is one character", ok("🇷🇴") === "🇷🇴")
  check("two letters of the admin's own", ok("AI") === "AI" && ok("Q") === "Q")
  check("spaces around a paste are taken off", ok("  🚀 ") === "🚀")
  check("empty is fine: the kind's icon is shown", ok("   ") === "")
  check(`more than ${ICON_MAX} characters is refused, in words`, ok("ABC") === null && ok("🔥🔥🔥") === null && !checkSpaceIcon("ABC").ok && /two letters/.test((checkSpaceIcon("ABC") as { error: string }).error))
  check("an emoji is told from letters", isEmojiIcon("🔥") && isEmojiIcon("🇷🇴") && !isEmojiIcon("AI"))
  check("everywhere a space is drawn: the admin's two letters", chosenEmoji("AI") === "AI" && spaceGlyph("AI", "feed") === "AI")
  check("everywhere: a family emoji whole", chosenEmoji("👨‍👩‍👧") === "👨‍👩‍👧")
  check("an old word name is still its kind's emoji", spaceGlyph("megaphone", "announcements") === "📣" && spaceGlyph("hand", "feed") === "💬" && chosenEmoji("messages-square") === null)
  const field = code("components/community/creator/space-icon-field.tsx")
  check("the Icon is a button that opens Storelib's emoji picker (a popover, the shared sheet on a phone)", /<button\s+id=\{id\}/.test(field) && /EmojiPanel/.test(field) && /PopoverPrimitive\.Root/.test(field) && /<BottomSheet/.test(field))
  check("and the old text box with its two code point slice is gone", !/slice\(-2\)/.test(code("components/community/creator/spaces-section.tsx")) && /<SpaceIconField/.test(code("components/community/creator/spaces-section.tsx")))
}

console.log("\nROWS: a row opens what it is; its menu keeps the rest")
{
  for (const [f, open] of [
    /* Changed on purpose (round 33): a space's row is its own sortable component now (the drag), handed edit(s) as onOpen, which its row presses. */
    ["spaces", /onOpen=\{\(\) => edit\(s\)\}[\s\S]*onClick=\{rowPress\(onOpen\)\}/],
    ["classroom", /onClick=\{rowPress\(\(\) => settle\(c\)\)\}/],
    ["events", /onClick=\{rowPress\(\(\) => edit\(e\)\)\}/],
    /* Changed on purpose (round 33): a post row opens the post in the admin's own viewer (post-viewer.tsx), not the community feed. */
    ["feed", /onClick=\{rowPress\(\(\) => openPost\(r\)\)\}/],
  ] as const) {
    const src = code(`components/community/creator/${f}-section.tsx`)
    check(`${f}: the row opens it, and its controls keep their presses (RowControls)`, open.test(src) && /<RowControls/.test(src))
  }
  const rows = code("components/community/creator/rows.tsx")
  check("the row's words are one button a keyboard reaches", /data-row-open=""/.test(rows) && /type="button"/.test(rows))
  check("a press inside a control stops at the control", /onClick=\{\(e\) => e\.stopPropagation\(\)\}/.test(rows))
}

console.log("\nSHEETS: on a phone a form is the New post sheet")
{
  const sheet = code("components/community/creator/form-sheet.tsx")
  check("the website builder's sheet, as the composer uses it", /<MobileEditorSheet/.test(sheet) && /keyboard="sheet"/.test(sheet) && /keyboardRoom=\{keyboardRoom\}/.test(sheet) && /sheetKeyboardRoom\(sheetRef\.current\)/.test(sheet))
  check("the field typed in is kept in sight, a tap into an empty one is calm", /useKeepFieldInSight\(/.test(sheet) && /useCalmFocus\(/.test(sheet))
  check("Cancel and the action sit in its top row", /data-form-sheet-bar=""/.test(sheet) && /data-form-cancel=""/.test(sheet) && /data-form-action=""/.test(sheet))
  check("its content is measured, not the room it was given", /data-sheet-scroll=""/.test(sheet))
  check("on a computer it is the sections' own dialog", /<Dialog/.test(sheet))
  for (const f of ["spaces-section", "classroom-section", "events-section", "event-tickets", "feed-section"]) check(`${f} uses it`, /<FormSheet/.test(code(`components/community/creator/${f}.tsx`)))
}

console.log("\nWRITER AND FEED")
{
  const feed = code("components/community/creator/feed-section.tsx")
  check("the writer is the member composer, not a second one", /import \{ Composer, draftKey \} from "@\/components\/community\/member\/composer"/.test(feed) && /<Composer communityId=\{head\.id\}/.test(feed) && !/<textarea/.test(feed))
  check("Edit post is the same composer, in the row", /edit=\{\{/.test(feed) && /data-feed-editing=""/.test(feed))
  check("the rows show what a post carries", /<PostThumb/.test(feed) && /data-feed-poll=""/.test(feed) && /data-feed-files=/.test(feed) && /data-feed-counts=""/.test(feed))
  check("move, pin, edit and delete in the row's menu", /"move"/.test(feed) && /Pin to the top/.test(feed) && /Edit post/.test(feed) && /Delete post/.test(feed))
  check("the rows are read with their media and polls", /media, space_id/.test(code("lib/communities/server/creator.ts")) && /feedRowPolls\(/.test(code("lib/communities/server/creator.ts")))
  check("the head carries who is signed in, for the writer", /me: \{ userId: ctx\.userId/.test(code("lib/communities/server/creator.ts")))
}

console.log("\nCOPY")
{
  const BANNED = /\b(unlock|elevate|seamless|powerful|effortless|effortlessly|supercharge|transform)\b/i
  for (const f of ["feed-section.tsx", "spaces-section.tsx", "classroom-section.tsx", "events-section.tsx", "event-tickets.tsx", "form-sheet.tsx", "space-icon-field.tsx", "space-icon.ts", "rows.tsx"]) {
    const src = code(`components/community/creator/${f}`)
    check(`${f}: no em dash, none of the banned words`, !src.includes("—") && !BANNED.test(src))
  }
}

console.log("\nPROBES")
check("the round 31 probe and its harness exist", existsSync("scripts/check-community-content-round31.mjs") && existsSync("scripts/render-community-content-round31.tsx"))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
