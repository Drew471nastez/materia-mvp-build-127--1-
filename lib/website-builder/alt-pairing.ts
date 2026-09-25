/**
 * ===========================================================================
 *  A PICTURE AND ITS DESCRIPTION ARE ONE FIELD
 * ===========================================================================
 * Sections keep a picture's alt text in a setting of its own, declared after
 * the picture: `image` and `image_alt`, `hero_image` and `hero_image_alt`, a
 * gallery block's `image` and `alt`. The sidebar drew them as two unrelated
 * fields, often with a caption and a colour between them, so the one thing a
 * screen reader says about the picture was the field nobody connected to it.
 *
 * This says which text setting describes which picture, so the upload field
 * can carry the description under the picture it describes and the loose
 * text field is not drawn a second time.
 */

interface FieldLike {
  id: string
  type: string
}

const PICTURE_TYPES = new Set(["image_picker", "image"])
const TEXT_TYPES = new Set(["text"])

/** The id of the text setting that describes this picture, among `fields`, or null. */
export function altFieldFor(picture: FieldLike, fields: FieldLike[]): string | null {
  if (!PICTURE_TYPES.has(picture.type)) return null
  const wanted = [`${picture.id}_alt`, picture.id === "image" ? "alt" : "", `${picture.id}_description`].filter(Boolean)
  for (const id of wanted) {
    const hit = fields.find((f) => f.id === id && TEXT_TYPES.has(f.type))
    if (hit) return hit.id
  }
  return null
}

/** Every text setting that belongs under a picture, so the list can skip drawing it on its own. */
export function pairedAltIds(fields: FieldLike[]): Set<string> {
  const out = new Set<string>()
  for (const f of fields) {
    const alt = altFieldFor(f, fields)
    if (alt) out.add(alt)
  }
  return out
}
