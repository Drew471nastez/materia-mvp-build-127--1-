/**
 * ===========================================================================
 *  A SITE IN A GITHUB REPOSITORY, THE PARTS THAT NEED NO NETWORK
 * ===========================================================================
 * A creator links one site to one repository. Storelib writes the whole
 * theme into it (./layout.ts says what goes where), with an AGENTS.md and a
 * CLAUDE.md that tell Claude Code or Codex what the files are. From then on,
 * every push to the linked branch is read back file by file: sections,
 * blocks, settings, pages and an imported theme's own files are checked and
 * saved into the site as a draft, and an open builder shows it within
 * seconds.
 *
 * This file is everything about that which can be decided without talking to
 * GitHub or the database: checking a webhook's signature, signing the state
 * carried through GitHub's install page, working out which files a push
 * changed, where a file lives in the repository, and what gets exported.
 * It imports nothing from Next, so tests/github-sync.test.ts runs it as is.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
/* The one rulebook, so a repository's agents read what the builder and MCP agents read. Pure text, no Next. */
import { RULEBOOK_VERSION, ruleGroupsMarkdown } from "@/lib/agent-rules"
/* Pure text: what Storelib adds to Theme settings, and what the canvas tells a theme's script. */
import { LIVE_PREVIEW_EVENTS, PLATFORM_SETTINGS_PATH } from "@/lib/storelib-theme/platform-settings"

/** The one kind of file a push can change on a site. Same rule as a connected agent. */
export const SYNCED = /^sections\/[a-z0-9_-]{1,64}\.storelib$/

/**
 * Files one push brings in, at most. An agent restyling a whole theme
 * touches a few hundred; past this the push is reported and Pull from
 * GitHub, which picks up where it stopped, finishes it.
 */
export const MAX_FILES_PER_PUSH = 400

/** How long the link in "Connect GitHub" stays good for. */
export const STATE_TTL_MS = 15 * 60 * 1000

/** Written into every commit Storelib makes, so its own pushes are not synced back. */
export const COMMIT_MARKER = "[storelib-sync]"

const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

/* ── the webhook's signature ─────────────────────────────────────────── */

/**
 * True when `header` is GitHub's `X-Hub-Signature-256` for exactly these
 * bytes. Compared in constant time; a missing secret refuses everything
 * rather than accepting everything.
 */
export function verifySignature(rawBody: string, header: string | null, secret: string | undefined): boolean {
  if (!secret || !header || !header.startsWith("sha256=")) return false
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`)
  const given = Buffer.from(header)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/* ── the state carried through GitHub's install page ─────────────────── */

export interface ConnectState {
  installId: string
  creatorId: string
  /** Milliseconds since the epoch. */
  exp: number
  nonce: string
}

/**
 * Signed, so the page GitHub sends the creator back to can trust which site
 * they were connecting. It says nothing secret: the site and creator ids are
 * the creator's own, and the signature is what matters.
 */
export function signState(input: Omit<ConnectState, "exp" | "nonce">, secret: string, now = Date.now()): string {
  const body: ConnectState = { ...input, exp: now + STATE_TTL_MS, nonce: b64url(randomBytes(9)) }
  const payload = b64url(Buffer.from(JSON.stringify(body), "utf8"))
  const sig = b64url(createHmac("sha256", secret).update(payload).digest())
  return `${payload}.${sig}`
}

export function verifyState(state: string | null, secret: string | undefined, now = Date.now()): ConnectState | null {
  if (!state || !secret || state.length > 1024) return null
  const [payload, sig, extra] = state.split(".")
  if (!payload || !sig || extra !== undefined) return null
  const expected = Buffer.from(b64url(createHmac("sha256", secret).update(payload).digest()))
  const given = Buffer.from(sig)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const body = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as ConnectState
    if (typeof body.installId !== "string" || typeof body.creatorId !== "string" || typeof body.exp !== "number") return null
    if (body.exp < now) return null
    return body
  } catch {
    return null
  }
}

/* ── where a site's files live in the repository ─────────────────────── */

/**
 * The folder a site lives in, as stored: "" for the repository's root, or a
 * relative path ending in one slash. Anything that could climb out of the
 * repository, or is not plainly a folder name, becomes the root.
 */
export function normalizeRoot(input: unknown): string {
  if (typeof input !== "string") return ""
  const trimmed = input.trim().replace(/^\/+|\/+$/g, "")
  if (!trimmed) return ""
  if (trimmed.length > 100 || !/^[A-Za-z0-9._/-]+$/.test(trimmed)) return ""
  if (trimmed.split("/").some((part) => part === "" || part === "." || part === "..")) return ""
  return `${trimmed}/`
}

/** A theme path, "sections/faq.storelib", as a path in the repository. */
export function repoPathFor(root: string, themePath: string): string {
  return `${root}${themePath}`
}

/** A repository path as a theme path the site will accept, or null. `accept` widens it past section files. */
export function themePathFor(root: string, repoPath: string, accept: (themePath: string) => boolean = (p) => SYNCED.test(p)): string | null {
  if (!repoPath.startsWith(root)) return null
  const rest = repoPath.slice(root.length)
  return accept(rest) ? rest : null
}

/** A branch name GitHub would accept, and nothing that reads as a path trick. */
export function validBranch(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= 120 &&
    /^[A-Za-z0-9._/-]+$/.test(name) &&
    !name.includes("..") &&
    !name.startsWith("/") &&
    !name.endsWith("/") &&
    !name.endsWith(".lock")
  )
}

/** "owner/name", as GitHub spells a repository. */
export function validRepoName(name: unknown): name is string {
  return typeof name === "string" && /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(name)
}

/* ── what a push changed ─────────────────────────────────────────────── */

export interface PushCommit {
  message?: string
  /** When the commit was made, as GitHub reports it. */
  timestamp?: string
  added?: string[]
  modified?: string[]
  removed?: string[]
}

export interface PushPayload {
  ref?: string
  before?: string
  after?: string
  deleted?: boolean
  commits?: PushCommit[]
  head_commit?: PushCommit | null
  pusher?: { name?: string }
  sender?: { login?: string; type?: string }
  repository?: { id?: number; full_name?: string }
  /** Which installation of the app sent it; every app webhook carries one. */
  installation?: { id?: number }
}

/** "refs/heads/main" → "main"; a tag or anything else → null. */
export function branchOf(ref: string | undefined): string | null {
  return typeof ref === "string" && ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : null
}

/**
 * A push Storelib made itself: sending the site to GitHub. Syncing it back
 * would save every file a second time for nothing.
 */
export function isOwnPush(payload: PushPayload, appSlug: string | undefined): boolean {
  if (appSlug && payload.sender?.login === `${appSlug}[bot]`) return true
  const commits = payload.commits ?? []
  return commits.length > 0 && commits.every((c) => (c.message ?? "").includes(COMMIT_MARKER))
}

/**
 * The section files a push leaves changed, in order, from the commits
 * GitHub lists: a file added and then removed in the same push is removed,
 * and one removed and then added again is changed. Removed files are
 * reported, not applied: a section a page uses is never deleted from under
 * it by a push.
 */
export function changedFiles(commits: PushCommit[], root: string, accept?: (themePath: string) => boolean): { changed: string[]; removed: string[] } {
  const state = new Map<string, "changed" | "removed">()
  for (const c of commits) {
    for (const p of [...(c.added ?? []), ...(c.modified ?? [])]) {
      const t = themePathFor(root, p, accept)
      if (t) state.set(t, "changed")
    }
    for (const p of c.removed ?? []) {
      const t = themePathFor(root, p, accept)
      if (t) state.set(t, "removed")
    }
  }
  const changed: string[] = []
  const removed: string[] = []
  for (const [p, s] of state) (s === "changed" ? changed : removed).push(p)
  return { changed, removed }
}

/**
 * The same, from GitHub's compare API, which lists every file however many
 * commits a push has (a push's own list stops at twenty).
 */
export function changedFromCompare(files: { filename?: string; status?: string; previous_filename?: string }[], root: string, accept?: (themePath: string) => boolean) {
  const changed: string[] = []
  const removed: string[] = []
  for (const f of files) {
    if (f.status === "renamed" && f.previous_filename) {
      const old = themePathFor(root, f.previous_filename, accept)
      if (old) removed.push(old)
    }
    const t = themePathFor(root, f.filename ?? "", accept)
    if (!t) continue
    if (f.status === "removed") removed.push(t)
    else changed.push(t)
  }
  return { changed, removed }
}

/** GitHub's commit status description is at most 140 characters. */
export function statusLine(text: string): string {
  const one = text.replace(/\s+/g, " ").trim()
  return one.length <= 140 ? one : `${one.slice(0, 139)}…`
}

/** Who a push was by, as the builder shows it: "GitHub · drew". */
export function pushedBy(payload: PushPayload): string {
  const who = (payload.pusher?.name || payload.sender?.login || "").replace(/[^\w.-]/g, "").slice(0, 39)
  return who ? `GitHub · ${who}` : "GitHub"
}

/* ── what is written into the repository ─────────────────────────────── */

/**
 * The instructions an agent reads first. Claude Code reads CLAUDE.md, Codex
 * and most others read AGENTS.md; CLAUDE.md imports AGENTS.md so there is
 * one text to keep right.
 */
/** One file of the theme shown whole (or abridged) in AGENTS.md as the example of its folder. */
export interface FolderExample {
  folder: "sections" | "blocks" | "snippets" | "layout" | "templates"
  path: string
  text: string
  abridged?: boolean
}

/** A page file's shape, fixed: a site's own pages change with every edit, and AGENTS.md would change with them. */
const PAGE_EXAMPLE = `{
  "sections": {
    "main": { "type": "<type>", "settings": { "heading": "About us" } },
    "logos": {
      "type": "<another type>",
      "settings": {},
      "blocks": { "logo-1": { "type": "logo", "settings": {} } },
      "block_order": ["logo-1"]
    }
  },
  "order": ["main", "logos"]
}`

/**
 * EACH FOLDER'S FORMAT, EXACTLY, WITH ONE OF THE THEME'S OWN FILES AS THE
 * EXAMPLE. An agent that copies a real file of this theme gets the first line,
 * the schema's place and its keys right the first time; one that writes from
 * memory writes whatever format it saw last. The examples are chosen and
 * abridged by the caller (lib/github-sync/format.ts folderExamples), which
 * reads the theme; this only lays them out.
 */
export function formatGuide(opts: { imported: boolean; examples?: FolderExample[] }): string {
  const ex = (folder: FolderExample["folder"]) => (opts.examples ?? []).find((e) => e.folder === folder)
  const block = (e: FolderExample | undefined, lang: string) =>
    e ? `\n\`${e.path}\`${e.abridged ? ", shortened where it says so" : ""}:\n\n\`\`\`${lang}\n${e.text.replace(/```/g, "``​`").trimEnd()}\n\`\`\`\n` : ""
  const rows = opts.imported
    ? [
        `### sections/<type>.storelib

Line 1 is exactly \`<template compat="shopify">\`. Then the section's markup in
the theme's own template language, then a line that is only \`</template>\`.
Then \`<schema>\`, one JSON object, \`</schema>\`. Inside it, the
\`"shopify"\` object is the theme's own schema (\`name\`, \`settings\`,
\`blocks\`, \`presets\`); the rest is the builder's panel, made again from
\`"shopify"\` on every push, so write only \`"shopify"\`. A Storelib section
(\`<template>\`, \`<style scoped>\`, \`<schema>\`, see below) is also drawn
in this theme and is kept in that format.
${block(ex("sections"), "html")}`,
        `### blocks/<type>.storelib

The same as a section: line 1 \`<template compat="shopify">\`, the markup,
\`</template>\`, then \`<schema>\` with the block's settings under
\`"shopify"\`. A block is always in the theme's format.
${block(ex("blocks"), "html")}`,
        `### snippets/<name>.storelib, layout/<name>.storelib

Line 1 \`<template compat="shopify">\`, the markup, \`</template>\`. No schema.
${block(ex("snippets"), "html")}`,
      ]
    : [
        `### sections/<type>.storelib

\`<template>\` with the markup, \`<style scoped>\` with its CSS, \`<schema>\`
with one JSON object (\`name\`, \`settings\`, \`blocks\`, \`presets\`), and
an optional \`<script>\`. Nothing before \`<template>\`.
${block(ex("sections"), "html")}`,
        `### blocks/<type>.storelib

A theme block, the same parts as a section; its type starts with \`_\` when
only sections that name it may hold it.
${block(ex("blocks"), "html")}`,
      ]
  return `## The format of each folder

Copy the first line and the layout of a file in the same folder. Storelib
checks every file a push brings in, and refuses one it cannot read, naming the
line.

${rows.join("\n")}
### templates/<page>.json, sections/header-group.json, sections/footer-group.json

One JSON object: \`"sections"\`, each section by its id with \`"type"\`,
\`"settings"\`, and \`"blocks"\` with \`"block_order"\` when it has blocks;
and \`"order"\`, the ids in order. Every \`"type"\` must be a
\`sections/<type>.storelib\` in this theme, added in the same push if new.
${block(ex("templates") ?? { folder: "templates", path: "templates/about.json", text: PAGE_EXAMPLE }, "json")}
### config/settings.json

One JSON object of the theme settings' values.${opts.imported ? " The imported theme's own values are under `\"shopify\"`; keep that key." : ""}

### What a push is checked for

- A file name is lowercase letters, digits, \`_\` and \`-\`, ending in \`.storelib\` or \`.json\`. Other files, and anything outside these folders, are not read.
- JSON reads, with no trailing commas or comments.
- ${opts.imported ? "The markup parses in the theme's template language, every tag closed." : "The section compiles: every name the template or CSS reads is in the schema."}
- Every setting id is unique in its schema, and an existing id is kept, because the creator's content is stored under it.
- A page names only sections the theme has.
${opts.imported ? "- A section pushed without its first line, as the theme's original file with a `{% schema %}` tag, is converted by Storelib into this format and the commit comment says so. Write it in this format to begin with.\n" : ""}`
}

export function agentsGuide(opts: { siteName: string; branch: string; root: string; kind?: "storelib" | "shopify"; examples?: FolderExample[] }): string {
  const where = opts.root ? `\`${opts.root}\`` : "this repository"
  const shopify = opts.kind === "shopify"
  return `# ${opts.siteName} on Storelib

${where === "this repository" ? "This repository" : `The folder ${where}`} is a Storelib website${shopify ? " imported from another store's theme" : ""},
the whole theme: settings, pages, sections, blocks${shopify ? ", snippets, layout and the theme's own files under \`shopify/\`" : ""}.
README.md says what each folder is and which ones Storelib reads back.

## How changes reach the site

1. Change a file, or add one. Sections are \`sections/<type>.storelib\`
   (lower case, digits, \`_\` and \`-\`). A page's sections and their
   settings are \`templates/<page>.json\`; the header and footer, once for
   every page, are \`sections/header-group.json\` and
   \`sections/footer-group.json\`; the theme's settings are
   \`config/settings.json\`.
2. Commit and push to \`${opts.branch}\`.
3. Storelib reads every changed file and saves it to the site as a draft. A
   builder that is open shows it within a few seconds.
4. The commit gets a status named "Storelib" and a comment saying which
   files were taken, and listing each one that was not with its line and what
   to fix. The other files in the same push are still taken. Fix the file and
   push again. How to read them is below.
5. Nothing is live until the creator presses Publish in the builder.

## Reading what Storelib said about a push

Storelib writes the same words three ways, so whatever access you have, one
of them reaches you:

- **A git note**, with nothing but this clone:
  \`git fetch origin refs/notes/storelib:refs/notes/storelib\` then
  \`git notes --ref=storelib show HEAD\` (or \`git log --notes=storelib\`).
- **The commit comment**, readable by anyone who can read the code:
  \`gh api repos/{owner}/{repo}/commits/<sha>/comments\`.
- **The commit status** named "Storelib" (\`gh api repos/{owner}/{repo}/commits/<sha>/status\`,
  which needs read access to commit statuses). Its Details link is the comment.

A push Storelib read with nothing to change ("Already up to date") gets only
the status. Give it a few seconds after the push.

${shopify
    ? "Every section here is the theme's own; change it in place. Keep the `<template compat=\"shopify\">` line and the schema block after it."
    : "A built-in section (one Storelib ships, such as `sections/hero.storelib`) can be edited in place here. Storelib keeps your version as this site's own copy, draws it on this site only, and the creator can reset it to Storelib's version. `sections/header.storelib` and `sections/footer.storelib` cannot be replaced; a header of your own is a new section with `\"kind\": \"header\"`."}
${shopify
    ? `## Settings in the builder's sidebar

A section's or block's settings, blocks and presets are the theme's own
schema: the \`"shopify"\` object inside its \`<schema>\`. Change them there,
written the way the theme writes them. When the push comes in, Storelib makes
the builder's panel (the rest of \`<schema>\`) from it again, so a new setting
gets its control and a removed one loses it; a hand edit to that part is
replaced. The theme settings are \`shopify/config/settings_schema.json\`,
read the same way into the builder's Theme settings, with their values in
\`config/settings.json\` under \`shopify\`. A setting the builder has no
control for keeps its value on the page, and the commit comment names it.`
    : `## Settings in the builder's sidebar

A section's settings, blocks and presets are its \`<schema>\`: add, change or
remove one there and the section's panel in the builder follows when the push
comes in. Keep each setting's id, because the creator's content is stored
under it.

## Theme settings

The theme settings are the ones the whole site uses.
\`config/settings_schema.json\` says what they are: a list of
groups, \`{ "name": "Layout", "settings": [ { "type": "range", "id":
"page_width", "label": "Max page width", "min": 900, "max": 1800, "step": 20,
"unit": "px", "default": 1280 } ] }\`. Reorder groups and settings, add a
group or a setting of your own, change a label, default, range, unit or info,
and the builder's Theme settings follow when the push comes in. Storelib's
own settings keep their id, type and group (the theme's stylesheet reads
them); one you leave out of the file is still there, after the ones you list.
A section reads a setting you add as \`theme.settings.<id>\`. The values are
in \`config/settings.json\`; a \`config/settings_data.json\` shaped
\`{ "current": { ... } }\` is taken the same way, and what it leaves
out stays as it is. A file that does not read is refused with its line. A
change to a \`sections/<type>.json\` is refused and the commit says so.`}

## Settings Storelib adds to Theme settings

${shopify
    ? `The builder shows the theme's own groups and then Storelib's Hover and
focus: Buttons on hover (Background, Text, Border, Effect), Links on hover
(Colour) and Fields (Border, Focus ring, Corner radius). They are not in the
theme's schema.`
    : `Theme settings are Storelib's groups (Logo and brand, Page colors,
Typography, Buttons and inputs, Layout, Product cards, Cart, Social links,
Cookie banner, Animations, Menus) with \`config/settings_schema.json\` laid
over them.`} \`${PLATFORM_SETTINGS_PATH}\` lists every one: id, type, label,
options, default and the group it shows in. Storelib writes that file, so
change values, not the file: each value is in \`config/settings.json\`${shopify ? ' under\n\`"shopify"\`' : ""}, written out with its default where none was chosen. A
default you leave as it is stays the default.${shopify ? ` To draw one of
these where the theme wants it, declare its id in
\`shopify/config/settings_schema.json\`: the builder then shows it there and
leaves it out of Hover and focus, and the value stays where it is.` : ""} Menus
are \`menus\` in the same file, as Navigation in the builder shows them.${shopify ? " Colour schemes are under \`\"shopify\"\` by the theme's own setting id, usually \`color_schemes\`." : ` Colour schemes are \`color_schemes\`: a built-in one keeps there only what differs from its colours, which \`${PLATFORM_SETTINGS_PATH}\` lists.`}

## Live preview in the builder

A change in the builder is drawn in the canvas without reloading the page.
In an imported theme's canvas, a script of the theme's that sets itself up
once can listen on \`document\` for:

${LIVE_PREVIEW_EVENTS.map((e) => `- \`${e.event}\`: ${e.when}`).join("\n")}

${formatGuide({ imported: shopify, examples: opts.examples })}
README.md, AGENTS.md, CLAUDE.md and storelib.json are rewritten by Storelib,
so a change to them is not kept. Deleting a section file here does not remove
the section from the site, because a page may be using it. Files outside the
theme's folders are yours and Storelib ignores them.

## Read the rules before you write anything

https://storelib.com/developers/rules is what every agent follows on a
Storelib site. The short version:

- Every word, picture, link and button a visitor sees is a setting or a block
  in the schema, so the creator can edit it: a \`url\` setting for every link
  and button, one block per menu link, an \`image_picker\` for every picture.
- To add something new, add a NEW section beside the others with its own
  name, and put it on the page in \`templates/<page>.json\`.
- A page copied from a screenshot is split into one section per part of it
  (header, hero, features, footer...), each with its full schema.
- Menus, sheets and dialogs open with HTML (\`popover\`, \`<details>\`), work
  at 375px wide with 44px targets, and stop moving under reduced motion.
- Keep every setting id in a file you change, so the creator's content stays.
- No generic AI styling and no AI-sounding copy.

The full rulebook at the end of this file says built-in sections are
read-only. That is for agents connected over MCP; in this repository editing
one in place is allowed, as above.

## How to work

Every task, in this order. Storelib AI and agents connected over MCP work the
same way.

1. **Inspect.** Read the section files here and the site at
   https://mcp.storelib.com if you are connected to it (storelib_read_project,
   storelib_search_components). If a section already does the job, use it.
   Over MCP, storelib_memory_read says what the creator asked to be
   remembered (brand voice, likes, things to avoid); follow it, and keep
   anything new they tell you with storelib_memory_remember.
2. **Plan.** Say in a few lines what will change and where.
3. **Implement.** The smallest change that does it. Change only the lines the
   task needs, and keep every setting id so the creator's content stays.
4. **Test.** The commit status named "Storelib" is the compile check. Over MCP,
   storelib_run_tests runs compile, quality, settings and contrast.
5. **Repair.** Fix exactly what a check names, at the line it names, and test
   again. After three rounds on the same failure, stop and say what is wrong.

## Writing a section

The full reference is at https://storelib.com/developers, and all of it as one
text file is at https://storelib.com/llms-full.txt. Read it before writing.
${shopify ? `This theme's own sections are the theme's original template code inside \`<template compat="shopify">\`,
drawn by Storelib's theme engine: what it supports is at
https://storelib.com/developers/imported-shopify-themes. A new section here is
written the same way: start from a copy of one of the theme's own section
files. The Storelib format below is for Storelib themes.
` : ""}The rules that are refused most often:

- A section file has \`<template>\`, \`<style scoped>\`, \`<schema>\` and an
  optional \`<script>\`. The template language is \`{{ }}\`, \`{% if %}\`,
  \`{% for %}\` and filters. It is not Vue, React or JSX.
- Every name the template or CSS reads must be declared in the schema.
- Colours come from \`--scheme-*\` variables and the root reads
  \`data-scheme="{{ settings.color_scheme }}"\`.
- Links built from a setting go through \`| url\`.
- The schema's \`name\` must not be the name of another section on the site.

## Writing for this website

A section should look and read like the rest of ${opts.siteName}, not like a
template. Before writing one:

- Use the site's colour schemes through \`var(--scheme-*)\` and its type
  styles. Never introduce a new palette or font.
- Write copy about what the site really sells, in its own voice. Never invent
  a product, a price, a discount or a review.
- Products reach a section as \`products\`, block-shaped: \`block.id\` and
  \`block.settings\` with \`title\`, \`price\`, \`compare_price\`, \`currency\`,
  \`image\`, \`images\`, \`url\`, \`slug\`, \`available\`, \`tag\`,
  \`checkout_url\` and \`variants\` (each with its own \`checkout_url\`). A
  section on the product page reads its product as \`page.product\`.
- Link a card to \`{{ block.settings.url | url }}\`, and a buy button to
  \`{{ block.settings.checkout_url | url }}\`, which is
  \`/checkout?productId={{ block.id }}&src=website\`. Checkout sends the
  buyer back to this site after paying.
- Never build a payment form or load a payment or tracking script. Storelib
  checkout takes the payment.

The whole of that, with a product page example, is at
https://storelib.com/developers/selling.

## When something is missing, ask

If a fact that changes the result is not in this repository or on the site
(which product to feature, which page, brand colours the site does not have,
a business fact), ask the person you are working with one short question
with a few options, and wait. Never ask what the files or storelib_site can
tell you.

## The Storelib agent rules, in full (version ${RULEBOOK_VERSION})

The same rules Storelib AI in the builder and every agent over MCP work by.

${ruleGroupsMarkdown(3)}
`
}

export const CLAUDE_MD = `# Instructions for Claude Code

Read AGENTS.md: it says what this repository is and how a push reaches the
Storelib site. Follow https://storelib.com/developers/rules before you change
anything.

@AGENTS.md
`

/* ── a change made in the builder, as the repository sees it ────────────── */

export type BuilderChange =
  | { kind: "save"; path: string; content: string }
  | { kind: "delete"; path: string }
  | { kind: "rename"; from: string; to: string; content: string }

export type RepoChange = { path: string; content: string } | { path: string; delete: true }

/**
 * The changes, as the repository sees them. Section files by default; the
 * mirror widens it to every theme file the repository holds (./layout.ts),
 * never to pages or settings, which are written from the builder's own
 * tables on Push and Publish.
 */
export function changesFor(root: string, change: BuilderChange, accept: (path: string) => boolean = (p) => SYNCED.test(p)): RepoChange[] {
  const out: RepoChange[] = []
  if (change.kind === "save" && accept(change.path)) out.push({ path: repoPathFor(root, change.path), content: change.content })
  if (change.kind === "delete" && accept(change.path)) out.push({ path: repoPathFor(root, change.path), delete: true })
  if (change.kind === "rename") {
    if (accept(change.from)) out.push({ path: repoPathFor(root, change.from), delete: true })
    if (accept(change.to)) out.push({ path: repoPathFor(root, change.to), content: change.content })
  }
  return out
}

export function describeChange(change: BuilderChange): string {
  const name = (p: string) => p.replace(/^(sections|blocks|snippets|layout)\//, "").replace(/\.storelib$/, "")
  if (change.kind === "save") return `Saved ${name(change.path)} in the builder`
  if (change.kind === "delete") return `Deleted ${name(change.path)} in the builder`
  return `Renamed ${name(change.from)} to ${name(change.to)} in the builder`
}

