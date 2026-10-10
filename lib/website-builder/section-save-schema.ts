/**
 * ===========================================================================
 *  WHAT A SAVED SECTION LOOKS LIKE, FOR EVERY ROUTE THAT SAVES ONE
 * ===========================================================================
 * The sections route and the header and footer sync read the same shape,
 * so it is written once. It was two copies, and both refused a section
 * with no `name`: a Shopify theme's header and footer groups name none of
 * their sections, so every save of an imported theme's page answered
 * "Invalid body". A missing name is read as the empty one; the sidebar
 * names such a section by its schema.
 */
import { z } from "zod"
import { BlockInstanceSchema } from "./block-tree"

export const SectionSaveSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.string().min(1).max(64),
  name: z.string().max(256).optional().transform((v) => v ?? ""),
  settings: z.record(z.unknown()).optional().transform((v) => v ?? {}),
  blocks: z.array(BlockInstanceSchema).max(500).optional(),
  hidden: z.boolean().optional(),
  /* Which section group it sits in, kept rather than stripped: lib/storelib-theme/section-groups.ts. */
  group: z.enum(["header", "footer", "overlay"]).optional(),
  /* An imported theme's Overlay group section: the theme's group file it is drawn in. */
  slot: z.string().regex(/^[a-z0-9_-]{1,64}$/i).optional(),
})

/** What a save's `issues` say, in words a person can act on. */
export function saveIssue(issues: z.ZodIssue[]): string {
  const first = issues[0]
  if (!first) return "This page could not be read. Reload the editor and try again."
  const at = first.path.filter((p) => typeof p === "number")
  const where = at.length ? `Section ${Number(at[0]) + 1}` : "This page"
  return `${where} has a value the builder cannot store (${first.path.join(".") || "body"}: ${first.message.toLowerCase()}).`
}
