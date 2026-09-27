/**
 * ===========================================================================
 *  ANDROID'S BACK, ANSWERED BY WHAT IS ON TOP
 * ===========================================================================
 * A page that opens something inside itself without a history entry (a
 * panel pushed over a list, as the OnePage editor's Design tab does) marks
 * the element that answers back with `data-native-back`, and listens on it
 * for NATIVE_BACK_EVENT. components/app/native-back-handler sends the event
 * to the last visible one before it goes back in history or offers to leave
 * the app, so Android's back button and its edge gesture do what the page's
 * own back button does, and nothing else.
 */
export const NATIVE_BACK_EVENT = "storelib:native-back"

/** The last element marked `data-native-back` that is on screen, or null. */
export function nativeBackTarget(doc: Document = document): HTMLElement | null {
  const marked = [...doc.querySelectorAll<HTMLElement>("[data-native-back]")]
  for (let i = marked.length - 1; i >= 0; i--) {
    const el = marked[i]
    /* A kept tab out of sight is `visibility: hidden`, and a kept panel `display: none`: neither answers. */
    if (!el.getClientRects().length) continue
    if (getComputedStyle(el).visibility === "hidden") continue
    return el
  }
  return null
}
