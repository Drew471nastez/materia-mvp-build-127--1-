/**
 * ===========================================================================
 *  WHICH LAYOUT AN EMAIL IS ON, AND WHAT CHANGING IT DOES
 * ===========================================================================
 * The composer (components/email/compose/composer.tsx) lets a creator start
 * from a layout (./starters.ts), switch to another, write over it freely,
 * and go back to a blank email. Those four moves share a few questions, and
 * they are answered here, apart from any screen, so they can be tested:
 *
 *   is this email still the layout as it came?     layoutEdited
 *   does changing it throw away somebody's words?   needsConfirm
 *   what happens to the subject and preview text?  envelopeAfter
 *   which layout is a reopened draft on?           detectLayout
 *
 * "As it came" is compared on what the email says, not on how a browser
 * happened to write it down: every text block goes through the same
 * cleaning the editor gives it (lib/rich-text/html cleanStoredHtml), and
 * block ids never count. So opening a layout, clicking into a paragraph and
 * out again does not make it "edited".
 *
 * A subject or preview line the layout filled in belongs to the layout: it
 * changes with it. One the creator typed is theirs and is kept.
 *
 * Pure and browser-safe.
 */
import { cleanStoredHtml, toEditorHtml } from "@/lib/rich-text/html"
import { hasRealContent, newBlock, storeBlocks, type Block } from "./blocks"
import { STARTERS, starterDraft, type StarterContext, type StarterDraft, type StarterId } from "./starters"

/** A layout as it was put into this email: what it wrote, so later edits can be told apart from it. */
export interface AppliedLayout {
  id: StarterId
  /** The body as the layout wrote it, in bodyKey form. */
  body: string
  subject: string
  previewText: string
}

/** An empty text block at the end is where the caret waits, not part of the email. */
export function trimTrailingEmpty(blocks: Block[]): Block[] {
  let end = blocks.length
  while (end > 1 && blocks[end - 1].type === "rich" && !hasRealContent([blocks[end - 1]])) end--
  return blocks.slice(0, end)
}

/** What an email says, in one string that does not change when nothing was changed. */
export function bodyKey(blocks: Block[]): string {
  const normal = trimTrailingEmpty(blocks).map((b) => (b.type === "rich" ? { ...b, html: cleanStoredHtml(toEditorHtml(b.html), { blocks: true }) } : b))
  return storeBlocks(normal)
}

/** The record of a layout just put in. */
export function appliedLayout(id: StarterId, draft: StarterDraft): AppliedLayout {
  return { id, body: bodyKey(draft.blocks), subject: draft.subject, previewText: draft.previewText }
}

/** True once the words or blocks differ from what the layout wrote. */
export function layoutEdited(layout: AppliedLayout, blocks: Block[]): boolean {
  return bodyKey(blocks) !== layout.body
}

/**
 * Changing the layout (or going back to blank) replaces the email. That
 * needs a yes only when it would lose something somebody wrote: an email
 * with words in it that are not the current layout's own.
 */
export function needsConfirm(layout: AppliedLayout | null, blocks: Block[]): boolean {
  if (!hasRealContent(blocks)) return false
  return layout ? layoutEdited(layout, blocks) : true
}

/**
 * The subject and preview text after a change of layout. A line that is
 * empty, or still the old layout's, takes the new layout's (empty for a
 * blank email). A line the creator typed stays.
 */
export function envelopeAfter(
  current: { subject: string; previewText: string },
  from: AppliedLayout | null,
  to: { subject: string; previewText: string } | null,
): { subject: string; previewText: string } {
  const ours = (value: string, old: string | undefined) => !value.trim() || (old !== undefined && value === old)
  return {
    subject: ours(current.subject, from?.subject) ? to?.subject ?? "" : current.subject,
    previewText: ours(current.previewText, from?.previewText) ? to?.previewText ?? "" : current.previewText,
  }
}

/** A blank email: one empty text block. */
export function blankBlocks(): Block[] {
  return [newBlock("rich")]
}

/**
 * A draft reopened with no record of its layout: the layout whose words it
 * still has exactly, if there is one. An email written over is not guessed at.
 */
export function detectLayout(blocks: Block[], ctx: StarterContext): AppliedLayout | null {
  if (!hasRealContent(blocks)) return null
  const key = bodyKey(blocks)
  for (const s of STARTERS) {
    const applied = appliedLayout(s.id, starterDraft(s.id, ctx))
    if (applied.body === key) return applied
  }
  return null
}

/** A stored record, checked, or null. */
export function readAppliedLayout(raw: unknown): AppliedLayout | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (!STARTERS.some((s) => s.id === r.id)) return null
  if (typeof r.body !== "string" || typeof r.subject !== "string" || typeof r.previewText !== "string") return null
  return { id: r.id as StarterId, body: r.body, subject: r.subject, previewText: r.previewText }
}

/** The layout's name, for the line that says which one the email is on. */
export function layoutName(id: StarterId): string {
  return STARTERS.find((s) => s.id === id)?.name ?? "Layout"
}
