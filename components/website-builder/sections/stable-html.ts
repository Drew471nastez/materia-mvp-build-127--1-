/**
 * ===========================================================================
 *  THE SAME MARKUP IS THE SAME OBJECT
 * ===========================================================================
 * React 19 decides whether to touch a prop by comparing the prop's VALUE
 * with `!==`, and for `dangerouslySetInnerHTML` the value is the object, not
 * the string inside it. So `dangerouslySetInnerHTML={{ __html: body }}` is a
 * new object on every render and React writes `innerHTML` again on every
 * render, even when `body` has not changed by a character.
 *
 * In the builder that is not cosmetic. Typing one letter into a section's
 * heading re-rendered its neighbours and the section library, and each of
 * them threw its whole subtree away and parsed it again: every image decoded
 * again, every `<style>` re-parsed (a style recalculation of the page), a map
 * embed's iframe reloaded. Measured on a phone profile, typing twenty-one
 * letters took twenty-six seconds.
 *
 * `stableHtml` hands back one object per distinct string, so an unchanged
 * string is an unchanged prop and React leaves the DOM alone. It is for the
 * short strings a section draws in a loop (an FAQ answer, a tab's body);
 * a component holding one large string should `useMemo` its own object
 * instead, so this cache never holds a page's worth of markup.
 */
const cache = new Map<string, { __html: string }>()
const MAX_ENTRIES = 200
const MAX_LENGTH = 16_000

export function stableHtml(html: string): { __html: string } {
  if (html.length > MAX_LENGTH) return { __html: html }
  let hit = cache.get(html)
  if (!hit) {
    if (cache.size >= MAX_ENTRIES) cache.clear()
    hit = { __html: html }
    cache.set(html, hit)
  }
  return hit
}
