import { cleanDescription } from "./description-action"

/**
 * The description as the save writes it.
 *
 * Changed: through the server's allow list (./description-action), and a
 * refusal there (too long, signed out) is thrown with its words, which the
 * editor's save shows.
 *
 * Unchanged since it was loaded or last saved: written back as it is, with
 * no trip to the server. That is what lets somebody fix a typo in the title
 * of a product whose old description is over the size limit (the old editor
 * stored pictures inside the text); the public page cleans it on read
 * either way (lib/commerce/product-page-data.ts).
 */
export async function descriptionForSave(current: string, stored: string | null): Promise<string> {
  if (stored !== null && current === stored) return current
  const result = await cleanDescription(current)
  if (!result.ok) throw new Error(result.error)
  return result.html
}
