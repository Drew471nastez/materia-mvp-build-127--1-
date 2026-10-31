/**
 * The blog's block format: what the /admin editor writes into
 * blog_posts.content and what the public article draws. Both sides import
 * these types, so a block one side adds the other already knows.
 *
 * Old posts keep working: every field is optional, and the original eleven
 * types ("p" … "code") are unchanged.
 */

export type BlockType =
  /* The original types. */
  | "p"
  | "h2"
  | "h3"
  | "hr"
  | "img"
  | "youtube"
  | "table"
  | "quote"
  | "ul"
  | "ol"
  | "code"
  /* Added in the SEO round. */
  | "callout"
  | "cta"
  | "embed"
  | "video"
  | "snippet"

export interface Block {
  id: string
  type: BlockType
  /** p, h2, h3, quote, callout: limited inline HTML (b, i, u, s, a, code, br). Sanitised before it is drawn. */
  html?: string
  /** img: picture address. video: an mp4 or webm address. embed: the page to embed. cta: where the button goes. */
  url?: string
  /** img, video: text for people who can't see it. */
  alt?: string
  /** img, video, embed, table: a line under it. */
  caption?: string
  /** youtube: the 11 character video id. */
  videoId?: string
  /** youtube: chapters as "m:ss Title" lines, drawn as links that seek the player. */
  chapters?: string[]
  /** youtube: the transcript, plain text. Drawn collapsed under the video. */
  transcript?: string
  /** table */
  headers?: string[]
  rows?: string[][]
  /** ul, ol: limited inline HTML per item. */
  items?: string[]
  /** code */
  lang?: string
  text?: string
  /** h2, h3: the anchor the table of contents links to. Made from the text when missing. */
  anchor?: string
  /** callout: "note" | "tip" | "warning". */
  tone?: "note" | "tip" | "warning"
  /**
   * cta: heading, a short line, and the button's words.
   * youtube (optional): the video's own title, the VideoObject's name; the caption or the post's title when missing.
   */
  title?: string
  /**
   * youtube (optional): the day the video went up on YouTube, "YYYY-MM-DD" or a full ISO time.
   * The public article prints a VideoObject only when this is set: Google requires uploadDate,
   * and the article never asks YouTube for it while rendering (lib/blog/structured-data).
   */
  uploadDate?: string
  body?: string
  label?: string
  /** embed: which provider the url is from. Only these are drawn; anything else shows as a link. */
  provider?: "youtube" | "vimeo" | "loom" | "x" | "spotify" | "figma" | "codepen"
  /** snippet: the id of a reusable block in blog_snippets. */
  snippetId?: string
}

export const LEGACY_BLOCK_TYPES: readonly BlockType[] = ["p", "h2", "h3", "hr", "img", "youtube", "table", "quote", "ul", "ol", "code"]
export const NEW_BLOCK_TYPES: readonly BlockType[] = ["callout", "cta", "embed", "video", "snippet"]

/** A heading's anchor: its text, lower case, letters and digits joined by single hyphens. */
export function headingAnchor(block: Pick<Block, "anchor" | "html" | "text">): string {
  if (block.anchor) return block.anchor
  const text = (block.html ?? block.text ?? "").replace(/<[^>]*>/g, "").replace(/&[a-z#0-9]+;/gi, " ")
  return (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "section"
  )
}
