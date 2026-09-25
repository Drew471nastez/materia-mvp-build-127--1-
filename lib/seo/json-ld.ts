/**
 * ===========================================================================
 *  STRUCTURED DATA, PRINTED SO IT CANNOT END ITS OWN SCRIPT ELEMENT
 * ===========================================================================
 * A `<script type="application/ld+json">` ends at the first `</script>` in its
 * text, whatever the JSON around it says. JSON.stringify leaves `<` alone, so a
 * creator whose display name, bio or product title contains `</script>` could
 * close the element and write markup of their own onto the page. Every piece
 * of JSON-LD Storelib prints goes through this one function, and
 * tests/site-seo.test.ts fails if a page prints it any other way.
 *
 * `<` becomes `<`, which every JSON parser reads back as `<`, so the data
 * a search engine receives is exactly the data that was given.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}
