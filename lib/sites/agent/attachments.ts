/**
 * ===========================================================================
 *  A PICTURE THE CREATOR HANDED TO THE ASSISTANT
 * ===========================================================================
 * "Attach a screenshot and tell it to build a section like that, and it
 * should know how to do it precisely, detail by detail. Even if I say
 * nothing and only upload an image."
 *
 * This is the shape one of those travels in, and the rules it has to clear
 * before it is allowed near a model. It is deliberately the ONLY door: the
 * composer, the route and both providers all speak this type, so there is
 * one place where the limits live and one place to read them.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: store anything. An image is carried with
 * the request that mentions it and is gone afterwards. Persisting it would
 * mean a bucket, a path, and a whole authorisation surface to keep one
 * creator's screenshots away from another's; a section is written in one
 * exchange, so nothing here needs to outlive it.
 */

import { imageInfo, MAX_IMAGE_SIDE } from "./image-info"

/** What a model can actually look at. Everything else is refused. */
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number]

/**
 * TWO MEGABYTES A PICTURE, THREE ACROSS THE REQUEST, FOUR PICTURES.
 *
 * The caps are on the DECODED bytes, which is what the provider counts and
 * bills, not on the base64 that is a third larger. The ceiling is not ours:
 * this runs on a Node serverless function, whose request body is capped at
 * 4.5MB by the platform. Base64 inflates by a third, so 3MB of pictures is
 * 4.1MB on the wire and one byte more than that is refused by the platform
 * with a 413 — before any of this code runs, so the creator would get a
 * failure nobody here could explain.
 *
 * Which is why the composer shrinks a picture before it sends it. A
 * screenshot is scaled to LONG_EDGE and lands at a few hundred kilobytes,
 * so four of them fit with room to spare and these numbers are a backstop
 * rather than something anybody meets.
 */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
export const MAX_TOTAL_IMAGE_BYTES = 3 * 1024 * 1024
export const MAX_IMAGES = 4

/**
 * The longest edge a picture is sent at.
 *
 * Anthropic scales anything larger than about 1568px down before the model
 * sees it, and charges for the pixels either way, so sending a 4K screenshot
 * buys nothing and costs real money. At this size the text in a screenshot
 * is still legible, which is the whole point of attaching one.
 */
export const LONG_EDGE = 1568

export interface AgentImage {
  /** One of ALLOWED_IMAGE_TYPES. */
  mediaType: AllowedImageType
  /** Base64, no data: prefix. */
  data: string
  /** The file's own name, only ever shown back to the person. */
  name?: string
}

export function isAllowedImageType(value: unknown): value is AllowedImageType {
  return typeof value === "string" && (ALLOWED_IMAGE_TYPES as readonly string[]).includes(value)
}

/** Decoded size of a base64 payload, without decoding it. */
export function base64Bytes(data: string): number {
  const clean = data.replace(/=+$/, "")
  return Math.floor((clean.length * 3) / 4)
}

/**
 * Base64 and nothing else.
 *
 * A data URL, a URL, or anything with a scheme in it is refused rather than
 * unwrapped: the point is that this value is never fetched, never resolved
 * and never treated as a reference to somewhere. What arrives is what the
 * model sees.
 */
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

export interface ImageRejection {
  index: number
  reason: string
}

/**
 * Everything the caller sent, split into what may go to the model and what
 * may not, with a reason for each refusal so the person can be told.
 */
export function reviewImages(input: unknown): { images: AgentImage[]; rejected: ImageRejection[] } {
  if (!Array.isArray(input)) return { images: [], rejected: [] }
  const images: AgentImage[] = []
  const rejected: ImageRejection[] = []
  let total = 0
  input.forEach((raw, index) => {
    if (images.length >= MAX_IMAGES) {
      rejected.push({ index, reason: `Only ${MAX_IMAGES} images at a time.` })
      return
    }
    const item = raw as { mediaType?: unknown; data?: unknown; name?: unknown }
    if (!isAllowedImageType(item?.mediaType)) {
      rejected.push({ index, reason: "That is not a PNG, JPEG, WebP or GIF." })
      return
    }
    if (typeof item.data !== "string" || item.data.length === 0 || !BASE64.test(item.data)) {
      rejected.push({ index, reason: "That image could not be read." })
      return
    }
    const size = base64Bytes(item.data)
    if (size > MAX_IMAGE_BYTES) {
      rejected.push({ index, reason: `Images have to be under ${MAX_IMAGE_BYTES / (1024 * 1024)}MB.` })
      return
    }
    /**
     * And under the total, because four pictures each inside the per-image
     * cap can still be more than the platform will carry.
     */
    if (total + size > MAX_TOTAL_IMAGE_BYTES) {
      rejected.push({ index, reason: `That is more than ${MAX_TOTAL_IMAGE_BYTES / (1024 * 1024)}MB of pictures in one go.` })
      return
    }
    /**
     * And a size the header can stand behind. A picture that claims to be
     * wider than any screen is refused rather than handed to a model; one
     * whose header cannot be read at all is still sent, because an unusual
     * encoder is not a reason to lose somebody's screenshot.
     */
    const info = imageInfo({ mediaType: item.mediaType, data: item.data })
    if (info && (info.width > MAX_IMAGE_SIDE || info.height > MAX_IMAGE_SIDE)) {
      rejected.push({ index, reason: "That image is larger than any screen. Attach a screenshot of the part you want." })
      return
    }
    total += size
    images.push({
      mediaType: item.mediaType,
      data: item.data,
      name: typeof item.name === "string" ? item.name.slice(0, 120) : undefined,
    })
  })
  return { images, rejected }
}

/**
 * ===========================================================================
 *  WHAT THE MODEL IS TOLD TO DO WITH IT
 * ===========================================================================
 * Without this the picture is decoration: a model shown a screenshot and a
 * request will use it as a hint about mood and then write whatever it was
 * going to write. The instruction is specific about WHAT to read off the
 * image, in the order the answer is built, so "detail by detail" is a
 * procedure rather than an adjective.
 *
 * "Create me something similar" means the SHAPE of the picture on THIS site:
 * its layout, its hierarchy and its style, built with the theme's colour
 * schemes, fonts and controls, and filled with the creator's own words and
 * products. A picture is usually somebody else's page, and copying its
 * headline, its logo or its prices onto a creator's site would put another
 * business's words and claims there. So the words are the creator's, every
 * time (the rulebook's "A picture as the brief", lib/agent-rules).
 *
 * Each picture's size is read from its header (./image-info.ts) and said: a
 * phone screenshot is built phone first, a full page is split into sections,
 * and one too tall to read once shrunk is a reason to ask, not to guess.
 *
 * The last paragraph is the case the request names directly: a picture on
 * its own, with nothing typed. That is not an empty request. It is the whole
 * request.
 */
export function describeImages(
  images: AgentImage[],
  hasPrompt: boolean,
  /**
   * How this surface asks and where its content is. The builder's assistant
   * has ask_creator and read_store; the section writer has neither, and
   * answers REPLY: with a question and reads the site it was handed.
   */
  how: { ask?: string; content?: string } = {},
): string {
  if (images.length === 0) return ""
  const many = images.length > 1
  const ask = how.ask ?? "ask one question with ask_creator"
  const content = how.content ?? "this creator's store, products and page (read_store)"
  const sizes = images
    .map((image, i) => {
      const info = imageInfo(image)
      if (!info) return null
      const what =
        info.shape === "tall page"
          ? "a whole page, scrolled: split it into sections, top to bottom; small text in it may be unreadable once it is scaled down"
          : info.shape === "phone"
            ? "a phone screenshot: build the phone layout from it and widen from there"
            : info.shape === "wide strip"
              ? "a narrow strip, probably one band of a page"
              : info.shape === "desktop"
                ? "a desktop screenshot"
                : "square"
      return `  ${many ? `Picture ${i + 1}: ` : ""}${info.width} x ${info.height}, ${what}.`
    })
    .filter(Boolean)
  return [
    `THE CREATOR ATTACHED ${many ? `${images.length} IMAGES` : "AN IMAGE"}. ${many ? "They are" : "It is"} the reference for layout, hierarchy and style, and the specification for what to build. Build ${many ? "them" : "it"} closely, on this site, with this theme.`,
    ...(sizes.length ? ["", ...sizes] : []),
    "",
    "Read it in this order and write down what you find as you go:",
    "  1. LAYOUT. How many columns, at what widths, in what order. Where the",
    "     text sits against the picture. What is centred and what is not.",
    "  2. HIERARCHY. What is read first, second and third. What is large, what",
    "     is quiet, what is a button and what is a link.",
    "  3. SPACING. How much room above and below, between the heading and the",
    "     text under it, between the cards. Generous or tight.",
    "  4. TYPE. The size of the heading against the body. Its weight. Whether",
    "     it is set in capitals. Use the theme's fonts and type scale for it.",
    "  5. COLOUR. Light or dark, where the accent is used. Use the colour",
    "     scheme of this site closest to it; set the section's own colours",
    "     only when no scheme is close.",
    "  6. SHAPE. Corner radius, borders, shadows, dividers.",
    "  7. THE PARTS. Every eyebrow, heading, paragraph, button, price, image",
    "     and icon slot in the picture becomes a setting or a block.",
    "",
    "  8. THE WORDS. Read every heading, label, button and line you can make",
    "     out. They are the starting copy, in the same places and the same",
    "     lengths: the creator usually shows their own page, or the one they",
    "     want rebuilt.",
    "",
    "DESCRIBE IT BEFORE YOU BUILD IT, to yourself, in that order, then build it",
    "CLOSELY: the same layout, spacing, colours, type, imagery and words.",
    "",
    "NEVER ANOTHER BRAND'S NAME, LOGO OR CLAIMS on this site. Where the picture",
    `shows another business, swap its name, logo, products and prices for ${content};`,
    "keep everything else as you see it. A product or price becomes one of the",
    "creator's real products, or is left out. Where a photograph belongs, give",
    "it an image setting with an in-editor placeholder of the same shape, so the",
    "creator drops their own in.",
    "",
    "WHAT NOT TO COPY: a browser's chrome, a phone's status bar, a cursor, a",
    "watermark, or anything belonging to the tool the screenshot was taken in.",
    "Reproduce the page, not the screenshot of it.",
    "",
    "IF YOU CANNOT READ IT, because it is too small, blurred, cropped or not",
    `a web page, ${ask} instead of guessing.`,
    "",
    hasPrompt
      ? "What they typed comes first where the two disagree: the image shows what it should look like, their words say what it is for."
      : "THEY TYPED NOTHING, AND THAT IS THE WHOLE REQUEST. Build the section in the picture. Do not ask what they want or offer alternatives, because they have already shown you; ask only if you cannot read it. Make it, then say in one line what you read off the image, so they can correct you if you read it wrong.",
  ].join("\n")
}
