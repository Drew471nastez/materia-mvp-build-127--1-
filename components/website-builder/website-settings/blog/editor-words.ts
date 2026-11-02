/**
 * The block editor's menus and hints in the person's language. The editor
 * (components/admin/blog-editor.tsx) is storelib.com's own and writes
 * English; given `label`, it passes each menu word and empty line's hint
 * through it. These are those words, marked with msg() so the catalogs and
 * scripts/check-i18n.mjs keep every one translated, and `editorLabel` is the
 * translator handed to it. tests/site-blog-ui.test.ts reads the editor and
 * fails when it passes a word that is not on this list.
 */
import { msg, tt } from "@/lib/i18n/text"

export const EDITOR_WORDS: readonly string[] = [
  /* The "/" menu: each block and its hint. */
  msg("Text"),
  msg("A paragraph"),
  msg("Heading"),
  msg("A section, in the table of contents"),
  msg("Subheading"),
  msg("A smaller heading"),
  msg("Bulleted list"),
  msg("Numbered list"),
  msg("Quote"),
  msg("Callout"),
  msg("A note, a tip or a warning"),
  msg("Code"),
  msg("Table"),
  msg("Divider"),
  msg("Image"),
  msg("Upload or paste an address"),
  msg("YouTube"),
  msg("With chapters and a transcript"),
  msg("Video file"),
  msg("An mp4 or webm address"),
  msg("Embed"),
  msg("Vimeo, Loom, X, Spotify, Figma, CodePen"),
  msg("Call to action"),
  msg("A heading, a line and a button"),
  msg("Gallery"),
  msg("Several pictures in a grid"),
  msg("Button"),
  msg("A link drawn as a button"),
  /* An empty line's hint. */
  msg("Write, or type / for a block"),
  msg("Write the note"),
  /* A block's own menu. */
  msg("Move up"),
  msg("Move down"),
  msg("Duplicate"),
  msg("Turn into"),
  msg("Delete"),
  msg("Bulleted"),
  msg("Numbered"),
  /* A gallery. */
  msg("Pictures in the gallery"),
  msg("Alt text"),
  msg("Move left"),
  msg("Move right"),
  msg("Remove picture"),
  msg("Remove"),
  msg("Some pictures could not be uploaded."),
  msg("Uploading…"),
  msg("Drop pictures here, or"),
  msg("Add pictures"),
  msg("A gallery holds up to 24 pictures."),
  msg("Add alt text to every picture: screen readers read it aloud."),
  msg("Caption"),
  msg("Optional"),
  /* A button. */
  msg("Filled"),
  msg("Outline"),
  msg("Button text"),
  msg("Button style"),
  msg("Shop the collection"),
  msg("Not an address"),
  msg("Goes to"),
]

const KNOWN = new Set(EDITOR_WORDS)

/** The translator the editor is given: a word on the list in the person's language, anything else as it is. */
export function editorLabel(english: string): string {
  return KNOWN.has(english) ? tt(english) : english
}
