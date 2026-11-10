/**
 * ===========================================================================
 *  FROM "THE HERO PHOTO" TO A PROMPT A PHOTOGRAPHER WOULD RECOGNISE (P1)
 * ===========================================================================
 * The agent says what the picture shows; this adds the art direction the
 * whole site shares (the concept's imagery brief, its mood and palette, the
 * chosen direction from DESIGN.md), a light and a lens fitted to what the
 * picture is for, and the fixed rules: no words, no logos or brands, no real
 * person's likeness, safe for any audience.
 *
 * Also the plain words the progress view shows ("Making the hero photo") and
 * the note the agent's brief carries about which picture service this
 * environment has (none: design text-forward, never a grey box).
 *
 * Pure.
 */
import type { ImageAspect, ImageDirection, ImageProviderId } from "./types"

const LENS: Record<string, string> = {
  hero: "35mm lens at eye level, generous space around the subject, depth that pulls the eye in",
  background: "wide 24mm lens, calm areas of even tone where type can sit",
  product: "100mm macro lens, the object filling most of the frame, real surface texture, shallow depth of field",
  portrait: "85mm lens, natural expression, eyes in focus, background soft",
  people: "50mm lens, candid and mid action, nobody looking at the camera",
  detail: "macro lens, a close crop on material and texture",
  gallery: "50mm lens, a consistent framing across the set",
  place: "28mm lens, the space and its light, straight verticals",
  food: "overhead or 45 degree angle, 50mm, real crumbs and steam",
}

const STYLE: Record<string, string> = {
  photo: "A real photograph, natural colour, believable and unstaged",
  studio: "A studio photograph on a seamless backdrop, controlled light",
  editorial: "An editorial magazine photograph, art directed, strong composition",
  illustration: "A flat illustration with a limited palette, no outlines of text",
  render: "A clean 3D product render with physically correct light",
}

function lightFor(direction: ImageDirection | undefined): string {
  const text = `${direction?.imagery ?? ""} ${(direction?.mood ?? []).join(" ")}`.toLowerCase()
  if (/hard|side light|contrast|dramatic|night|dark/.test(text) || direction?.mode === "dark") return "hard directional side light with deep shadows"
  if (/window|daylight|soft|calm|morning|airy|gentle/.test(text)) return "soft window daylight, gentle shadows"
  if (/golden|warm|sunset|evening/.test(text)) return "warm low sun, long shadows"
  if (/flash|bold|pop|playful/.test(text)) return "direct on-camera flash, crisp and bright"
  return "natural available light"
}

/** The key of the purpose map a free-form purpose falls under. */
export function purposeKey(purpose: string | undefined): string {
  const p = String(purpose ?? "").toLowerCase()
  if (/hero|banner|cover|header|opening/.test(p)) return "hero"
  if (/background|backdrop|texture/.test(p)) return "background"
  if (/product|item|object|packshot/.test(p)) return "product"
  if (/portrait|founder|coach|owner|team|headshot|about/.test(p)) return "portrait"
  if (/people|class|action|lifestyle|customer/.test(p)) return "people"
  if (/detail|close|material/.test(p)) return "detail"
  if (/gallery|collage|grid|card/.test(p)) return "gallery"
  if (/place|room|space|studio|shop|interior|location/.test(p)) return "place"
  if (/food|dish|menu|drink|coffee/.test(p)) return "food"
  return "hero"
}

const clean = (s: string, max: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max)

/** The full prompt sent to an image model. */
export function shapeImagePrompt(input: { prompt: string; aspect: ImageAspect; style?: string; purpose?: string; direction?: ImageDirection }): string {
  const d = input.direction
  const style = STYLE[String(input.style ?? "photo").toLowerCase()] ?? STYLE.photo
  const key = purposeKey(input.purpose)
  const parts = [
    `${style}. ${clean(input.prompt, 900).replace(/\.$/, "")}.`,
    d?.imagery ? `Art direction: ${clean(d.imagery, 300)}.` : "",
    d?.mood?.length ? `Mood: ${d.mood.slice(0, 4).map((m) => clean(m, 30)).join(", ")}.` : "",
    `Light: ${lightFor(d)}. Lens: ${LENS[key]}.`,
    d?.palette?.length ? `Colour: the picture's tones sit with ${d.palette.slice(0, 4).map((c) => clean(c, 20)).join(", ")}${d.mode ? ` on a ${d.mode} page` : ""}; no colour cast that fights them.` : "",
    `Composition: ${input.aspect} frame${key === "hero" || key === "background" ? ", with a quiet area where a headline can sit" : ""}.`,
    d?.avoid?.length ? `Avoid: ${d.avoid.slice(0, 5).map((a) => clean(a, 60)).join("; ")}.` : "",
    "No text, letters, numbers, signage, logos, brand marks or watermarks anywhere in the picture. No recognisable real person or celebrity; any people are anonymous adults. Nothing violent, sexual or unsafe. Not a stock-photo cliche: no handshakes, no laptops on beds, no fake smiles at the camera.",
  ]
  return parts.filter(Boolean).join(" ").slice(0, 3_000)
}

/** Alt text from the prompt when the caller gave none: the subject, plainly, under 125 characters. */
export function altFromPrompt(prompt: string): string {
  const first = clean(prompt, 400).split(/[.;\n]/)[0] ?? ""
  const plain = first.replace(/^(a |an |the )?(photo|photograph|picture|image|shot) of /i, "").trim()
  const text = plain ? plain[0].toUpperCase() + plain.slice(1) : "Photograph"
  return text.length > 125 ? `${text.slice(0, 122).replace(/\s+\S*$/, "")}` : text
}

/** What the progress view says while a picture is being made: "Making the hero photo". */
export function makingWords(purpose: string | undefined, done?: boolean): string {
  const p = clean(String(purpose ?? ""), 40).toLowerCase().replace(/\b(photo|picture|image)\b/g, "").trim()
  const what = p ? `the ${p} photo` : "a photo"
  return `${done ? "Made" : "Making"} ${what}`
}

/** The brief's note on pictures for this environment: what the agent can do, in plain words. */
export function imageBriefNote(available: { generate: ImageProviderId | null; stock: boolean; maxImages: number }): string {
  if (!available.generate && !available.stock) {
    return [
      "PICTURES: no picture service is set up in this environment. generate_image and find_photo will refuse.",
      "Design text-forward: type at scale, colour fields, shape, pattern, real product data where the store has pictures (list_capabilities). Never draw an empty grey box, an icon standing in for a photo, or words like \"add your photo\" for a visitor.",
      "Every image setting is optional in the markup: {% if %} around the picture, and the layout still reads well (and looks designed) when it is empty, so the creator can add photos later.",
    ].join("\n")
  }
  const how = available.generate
    ? `generate_image makes an original photograph (${available.generate === "openai" ? "OpenAI" : "Gemini"})${available.stock ? "; find_photo finds a licensed stock photo (Pexels) when a real-world scene is enough" : ""}.`
    : "generate_image is not set up here; find_photo finds a licensed stock photo (Pexels) and generate_image falls back to it."
  return [
    `PICTURES: ${how} At most ${available.maxImages} pictures for this site, so spend them where the design calls for imagery (the hero, the founder or product, a gallery), not on decoration.`,
    "Each returns a url, width, height and alt: put the url in the image_picker setting's default (or the placed section's settings) and the alt in its alt setting. Ask for several in one turn: they are made side by side.",
    "Describe the subject plainly (who or what, where, doing what). The site's art direction, light and palette are added for you. Never ask for words, logos, brands or a real person in a picture.",
    "When a picture is refused or fails, design that spot text-forward; never leave a grey box or placeholder copy for a visitor.",
  ].join("\n")
}
