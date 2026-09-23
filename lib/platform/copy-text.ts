/**
 * COPYING A LINE OF TEXT
 *
 * `navigator.clipboard` is missing on a page served over plain http (a dev
 * server opened from a phone), refused in some embedded webviews, and
 * `navigator.clipboard?.writeText(x).then(…)` with it missing does nothing
 * at all, not even fail: the button looked dead. So the clipboard API first,
 * and the old selection copy when it is missing or refuses, and a plain
 * true or false either way so the caller can say what happened.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* Refused. Try the selection below. */
  }
  if (typeof document === "undefined") return false
  const area = document.createElement("textarea")
  area.value = text
  area.setAttribute("readonly", "")
  /* Off screen, and at 16px so iOS does not zoom the page to it. */
  area.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;font-size:16px"
  document.body.appendChild(area)
  try {
    area.select()
    area.setSelectionRange(0, text.length)
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    area.remove()
  }
}
