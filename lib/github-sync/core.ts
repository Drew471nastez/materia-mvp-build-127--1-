/**
 * ===========================================================================
 *  A SITE IN A GITHUB REPOSITORY, THE PARTS THAT NEED NO NETWORK
 * ===========================================================================
 * A creator links one site to one repository. Storelib writes the whole
 * theme into it, laid out as "Export theme" lays it out: a Storelib theme's
 * settings, pages, header and footer groups, sections and blocks; an imported
 * Shopify theme in Shopify's own folders. AGENTS.md and CLAUDE.md tell Claude
 * Code or Codex what the files are. From then on, a push to the linked branch
 * is taken into the site as drafts (lib/github-sync/apply.ts), each kind of
 * file through the same checks the builder's own save runs, and an open
 * builder shows it within seconds.
 *
 * This file is everything about that which can be decided without talking to
 * GitHub or the database: checking a webhook's signature, signing the state
 * carried through GitHub's install page, working out which files a push
 * changed, where a file lives in the repository, and what gets exported.
 * It imports nothing from Next, so tests/github-sync.test.ts runs it as is.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
/* The one rulebook, so a repository's agents read what the builder and MCP agents read. Pure text, no Next. */
import { RULEBOOK_VERSION, ruleGroupsMarkdown } from "@/lib/agent-rules"

/** A section file: the one kind a connected agent writes, and the kind every push took before the whole theme travelled. */
export const SYNCED = /^sections\/[a-z0-9_-]{1,64}\.storelib$/

/** A theme block file. */
export const BLOCK_FILE = /^blocks\/_?[a-z0-9][a-z0-9_-]{0,63}\.storelib$/

/** A Storelib theme's data, as the theme package writes it: each page, the header, footer and overlay groups, the settings. */
export const STORELIB_DATA = /^(?:templates\/[A-Za-z0-9_.-]{1,80}\.json|sections\/(?:header|footer|overlay)-group\.json|config\/settings\.json)$/

/** An imported Shopify theme's own files, in its own folders, as its export writes them. */
export const SHOPIFY_FILE =
  /^(?:(?:layout|sections|blocks|snippets)\/[A-Za-z0-9_][A-Za-z0-9_.-]{0,100}\.liquid|(?:assets|locales)\/[A-Za-z0-9_][A-Za-z0-9_.@ ()+-]{0,120}|config\/settings_(?:schema|data)\.json|templates\/(?:customers\/)?[A-Za-z0-9_.-]{1,80}\.json|sections\/[A-Za-z0-9_-]{1,80}-group\.json)$/

/** Every file the repository holds for its site: what is written there and what a push brings back. */
export function tracked(path: string): boolean {
  return SYNCED.test(path) || BLOCK_FILE.test(path) || STORELIB_DATA.test(path) || SHOPIFY_FILE.test(path)
}

/** The files a site of this kind reads back from its repository. */
export function trackedFor(kind: "storelib" | "shopify", path: string): boolean {
  return kind === "shopify" ? SHOPIFY_FILE.test(path) : SYNCED.test(path) || BLOCK_FILE.test(path) || STORELIB_DATA.test(path)
}

/** A file as people call it: "faq" for sections/faq.storelib, "about" for templates/about.json. */
export function fileName(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.(storelib|liquid|json)$/, "")
}

/** Files one push may change on a site. A whole theme pushed at once is Pull from GitHub's job. */
export const MAX_FILES_PER_PUSH = 60

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

/** A repository path as a theme path the site will accept, or null. */
export function themePathFor(root: string, repoPath: string): string | null {
  if (!repoPath.startsWith(root)) return null
  const rest = repoPath.slice(root.length)
  return tracked(rest) ? rest : null
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
export function changedFiles(commits: PushCommit[], root: string): { changed: string[]; removed: string[] } {
  const state = new Map<string, "changed" | "removed">()
  for (const c of commits) {
    for (const p of [...(c.added ?? []), ...(c.modified ?? [])]) {
      const t = themePathFor(root, p)
      if (t) state.set(t, "changed")
    }
    for (const p of c.removed ?? []) {
      const t = themePathFor(root, p)
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
export function changedFromCompare(files: { filename?: string; status?: string; previous_filename?: string }[], root: string) {
  const changed: string[] = []
  const removed: string[] = []
  for (const f of files) {
    if (f.status === "renamed" && f.previous_filename) {
      const old = themePathFor(root, f.previous_filename)
      if (old) removed.push(old)
    }
    const t = themePathFor(root, f.filename ?? "")
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
/** The guide for an imported Shopify theme's repository: its own folders, and what comes back. */
export function shopifyGuide(opts: { siteName: string; branch: string; root: string }): string {
  return `# ${opts.siteName} on Storelib

This repository is linked to a Storelib site built from an imported Shopify
theme, and holds that theme in Shopify's own folders: \`layout/\`,
\`sections/\`, \`blocks/\`, \`snippets/\`, \`templates/\`, \`config/\`,
\`locales/\` and the text files of \`assets/\`. Pictures stay on Storelib.

## How changes reach the site

1. Change a section's, block's, snippet's or layout's Liquid, a stylesheet or
   script in \`assets/\`, or a locale file.
2. Commit and push to \`${opts.branch}\`.
3. Storelib takes each changed file into the site as a draft and checks its
   Liquid the way the builder does. A builder that is open shows it within a
   few seconds.
4. The commit gets a status named "Storelib": green when every file went in,
   red with the first problem when one did not.
5. Nothing is live until the creator presses Publish in the builder.

A section's \`{% schema %}\` is the theme's import: change the markup, not
the settings, or import the theme again to change those. The pages
(\`templates/*.json\`) and the theme settings (\`config/settings_data.json\`)
are here to read; they are edited in the builder. A new section comes in with
a fresh import of the theme.
`
}

export function agentsGuide(opts: { siteName: string; branch: string; root: string }): string {
  const where = opts.root ? `\`${opts.root}sections/\`` : "`sections/`"
  return `# ${opts.siteName} on Storelib

This repository is linked to a Storelib site and holds its whole theme, laid
out as Storelib's "Export theme" lays it out:

- ${where}: one file per section, written in the Storelib Builder Framework.
- \`blocks/\`: the theme blocks sections hold.
- \`templates/<page>.json\`: each page, its sections in order with their
  settings and blocks.
- \`sections/header-group.json\` and \`sections/footer-group.json\`: the
  header and footer every page shares.
- \`config/settings.json\`: the theme settings (colour schemes, type, layout,
  menus).

## How changes reach the site

1. Change or add a file: a section, a block, a page, a group or the settings.
   A new section is named \`sections/<type>.storelib\` (lower case, digits,
   \`_\` and \`-\`).
2. Commit and push to \`${opts.branch}\`.
3. Storelib takes every changed file into the site as a draft, through the
   same checks the builder's own save runs: a section or block is compiled, a
   page or the settings are cleaned and held to the page limits. A builder
   that is open shows it within a few seconds.
4. The commit gets a status named "Storelib": green when every file went in,
   red with the first error when one did not. A file that fails is not saved;
   fix it and push again.
5. Nothing is live until the creator presses Publish in the builder.

A built-in section is never changed from here. Keep every section and block
\`id\` in a page file as it is: the id is how the creator's content stays with
its section. Other files in this repository are yours and Storelib ignores
them. Deleting a section file here does not remove the section from the site,
because a page may be using it, and deleting a page file does not delete the
page.

## Read the rules before you write anything

https://storelib.com/developers/rules is what every agent follows on a
Storelib site. The short version:

- You write \`sections/<type>.storelib\` files only. The built-in sections
  Storelib ships are in this repository to read; a change to one is refused on
  the commit. To change how one works, add a NEW section beside it with its
  own name, and the creator puts it on the page.
- Every word, picture, link and button a visitor sees is a setting or a block
  in the schema, so the creator can edit it: a \`url\` setting for every link
  and button, one block per menu link, an \`image_picker\` for every picture.
- A page copied from a screenshot is split into one section per part of it
  (header, hero, features, footer...), each with its full schema.
- Menus, sheets and dialogs open with HTML (\`popover\`, \`<details>\`), work
  at 375px wide with 44px targets, and stop moving under reduced motion.
- No generic AI styling and no AI-sounding copy.

## How to work

Every task, in this order. Storelib AI and agents connected over MCP work the
same way.

1. **Inspect.** Read the section files here and the site at
   https://mcp.storelib.com if you are connected to it (storelib_read_project,
   storelib_search_components). If a section already does the job, use it.
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
The rules that are refused most often:

- A section file has \`<template>\`, \`<style scoped>\`, \`<schema>\` and an
  optional \`<script>\`. The template language is \`{{ }}\`, \`{% if %}\`,
  \`{% for %}\` and filters. It is not Vue, React, JSX or Liquid.
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

/**
 * Every file an export writes: the site's theme files, as the builder would
 * open them (lib/github-sync/snapshot.ts), and the two guides. Paths are
 * repository paths.
 */
export function exportPlan(
  files: { path: string; source: string }[],
  opts: { siteName: string; branch: string; root: string; kind?: "storelib" | "shopify" },
): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = []
  for (const s of files) {
    if (tracked(s.path)) out.push({ path: repoPathFor(opts.root, s.path), content: s.source })
  }
  out.sort((a, b) => a.path.localeCompare(b.path))
  out.push({ path: `${opts.root}AGENTS.md`, content: opts.kind === "shopify" ? shopifyGuide(opts) : agentsGuide(opts) })
  out.push({ path: `${opts.root}CLAUDE.md`, content: CLAUDE_MD })
  return out
}

/* ── a change made in the builder, as the repository sees it ────────────── */

export type BuilderChange =
  | { kind: "save"; path: string; content: string }
  | { kind: "delete"; path: string }
  | { kind: "rename"; from: string; to: string; content: string }

export type RepoChange = { path: string; content: string } | { path: string; delete: true }

/** A Storelib section or block file, which sits at the same path in the builder and in the repository. */
export function codeFile(path: string): boolean {
  return SYNCED.test(path) || BLOCK_FILE.test(path)
}

/**
 * The changes, as the repository sees them: a section or block file at its
 * own path. Anything else a builder saves (an imported theme's files, which
 * live in the repository under Shopify's names) goes as a whole-theme export
 * instead (mirrorToGitHub), so this returns nothing for it.
 */
export function changesFor(root: string, change: BuilderChange): RepoChange[] {
  const out: RepoChange[] = []
  if (change.kind === "save" && codeFile(change.path)) out.push({ path: repoPathFor(root, change.path), content: change.content })
  if (change.kind === "delete" && codeFile(change.path)) out.push({ path: repoPathFor(root, change.path), delete: true })
  if (change.kind === "rename") {
    if (codeFile(change.from)) out.push({ path: repoPathFor(root, change.from), delete: true })
    if (codeFile(change.to)) out.push({ path: repoPathFor(root, change.to), content: change.content })
  }
  return out
}

/** The id Git gives a file's bytes, so a file GitHub already has the same as the site is never fetched. */
export function gitBlobSha(content: string): string {
  const body = Buffer.from(content, "utf8")
  return createHash("sha1").update(`blob ${body.length}\0`).update(body).digest("hex")
}

export function describeChange(change: BuilderChange): string {
  const name = (p: string) => p.replace(/^(sections|blocks)\//, "").replace(/\.storelib$/, "")
  if (change.kind === "save") return `Saved ${name(change.path)} in the builder`
  if (change.kind === "delete") return `Deleted ${name(change.path)} in the builder`
  return `Renamed ${name(change.from)} to ${name(change.to)} in the builder`
}

