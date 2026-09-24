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
 * It holds nothing and reads nothing, so it needs no session: anybody can
 * ask it to clean some HTML, and all they get back is cleaner HTML.
 */
import { sanitizeDescription } from "@/lib/rich-text/sanitize"

export async function cleanDescription(html: string): Promise<string> {
  return sanitizeDescription(html)
}
