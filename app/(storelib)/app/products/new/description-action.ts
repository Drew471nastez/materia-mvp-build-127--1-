"use server"

/**
 * The product description, cleaned on the server before it is saved.
 *
 * The editor writes the row from the browser (through Supabase and its row
 * level security), so the server does not otherwise see the description on
 * its way in. This is the one step of the save that runs here: the HTML the
 * editor produced goes out, the allow list in lib/rich-text/policy.ts is
 * applied, and what comes back is what is written. The public page cleans
 * it again on read (lib/commerce/product-page-data.ts), for rows written any
 * other way.
 *
 * A server action is a public endpoint, so it asks two things first:
 *
 *   WHO. Only somebody signed in; the editors that call this are only ever
 *   open to a signed-in creator. It reads the session and nothing else.
 *
 *   HOW MUCH. At most MAX_DESCRIPTION_BYTES of HTML, so nobody can hand it
 *   megabytes to parse over and over. The editor shows the same limit, in
 *   the same words, before anybody presses Save.
 *
 * An answer rather than a throw: Next replaces a thrown error's message in
 * production, and the editor has to be able to say what was wrong.
 */
import { descriptionTooLong } from "@/lib/rich-text/policy"
import { sanitizeDescription } from "@/lib/rich-text/sanitize"
import { getServerTt } from "@/lib/i18n/server"
import { routeUser } from "@/lib/auth/route-user"

export type CleanedDescription = { ok: true; html: string } | { ok: false; error: string }

export async function cleanDescription(html: string): Promise<CleanedDescription> {
  const { tt } = await getServerTt()
  if (typeof html !== "string") return { ok: false, error: tt("The description could not be read.") }
  const tooLong = descriptionTooLong(html, tt)
  if (tooLong) return { ok: false, error: tooLong }
  /* The request's one read (round rel2-auth): Auth not answering is "try again", never "sign in again". */
  const who = await routeUser()
  if (who.kind === "unavailable") return { ok: false, error: tt("Something went wrong on our side. Try again in a moment.") }
  if (who.kind !== "user") return { ok: false, error: tt("Sign in again to save the description.") }
  return { ok: true, html: sanitizeDescription(html) }
}
