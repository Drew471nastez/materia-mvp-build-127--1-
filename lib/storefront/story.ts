/**
 * The About story's small rules, shared by the save (app/api/creator-profile)
 * and the page (components/store-builder/unified-section-renderer). Pure, so
 * tests/story-r50 runs them in node.
 */

/**
 * NOTHING WRITTEN. An editor emptied with select-all and delete leaves
 * "<p><br></p>" or "<p>&nbsp;</p>" behind, which is markup and so "a story"
 * to a truthiness check: the page drew an empty paragraph with a Read more
 * under it. A story is empty when it has no text and no picture or video.
 */
export function storyIsEmpty(value: string | null | undefined): boolean {
  if (!value) return true
  if (/<(img|iframe|video)\b/i.test(value)) return false
  const text = value
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/[​ \s]+/g, "")
  return text.length === 0
}

/** What the page draws of the About block, and what a save hands back to draw at once. */
export interface StoryValues {
  headline: string
  aboutContent: string
  mediaItems: { id: string; type: string; url: string; caption?: string }[]
}

/**
 * The same story, whatever the order of keys or an absent caption: the test
 * for "the page's props have caught up with the save".
 */
export function storySignature(v: Partial<StoryValues> | null | undefined): string {
  if (!v) return ""
  const media = (v.mediaItems ?? []).map((m) => [m.id, m.type === "image" ? "image" : "video", m.url, (m.caption ?? "").trim()])
  return JSON.stringify([(v.headline ?? "").trim(), storyIsEmpty(v.aboutContent) ? "" : (v.aboutContent ?? "").trim(), media])
}
