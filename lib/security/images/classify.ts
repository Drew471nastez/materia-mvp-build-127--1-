import "server-only"

/**
 * ===========================================================================
 *  IS THIS PICTURE ADULT CONTENT (community pictures)
 * ===========================================================================
 * Reads a picture a member put in a post or a comment and says what it looks
 * like. Two readers, both open source, both on Storelib's own servers; no
 * picture ever leaves for an outside service:
 *
 *   SKIN        always there (./skin.ts): how much of the picture is bare
 *               skin, by colour. Cheap (a few milliseconds) and blunt: on 58
 *               ordinary photos (portraits, beaches, yoga, food, wood, sand)
 *               it called 9 skin heavy. So it only ever HOLDS, and only for
 *               a member on their first day (judgePicture below).
 *   CLASSIFIER  NSFWJS (MIT, github.com/infinitered/nsfwjs): a MobileNetV2
 *               network trained on five classes (Drawing, Hentai, Neutral,
 *               Porn, Sexy), run by TensorFlow.js on its WebAssembly backend
 *               inside the Vercel function. OFF unless
 *
 *                 SECURITY_IMAGE_CLASSIFIER=nsfwjs
 *
 *               and the three packages are installed (lib/communities/DATA-SAFETY.md
 *               has the exact steps). They are loaded at run time, not
 *               bundled, so the app builds and runs without them; asked for
 *               and missing, it says so once in the log and the skin reading
 *               carries on alone.
 *
 * MEASURED (this container, Node 22, 58 ordinary photos, round 13):
 *   WebAssembly backend   first load 2.2 s, then about 230 ms a picture
 *                         (decoding included), 260 MB of memory
 *   plain JavaScript      first load 6.3 s, about 2.8 s a picture (too slow)
 *   size                  about 13 MB traced with one model (the package
 *                         carries three, 40 MB; only MobileNetV2 is needed),
 *                         far under a Vercel function's 250 MB
 *   ordinary photos       highest Porn + Hentai 0.44 (two hands holding),
 *                         highest Sexy 0.86 (a yoga class)
 * Its authors give about 90% accuracy for this model on their own test set.
 * Nothing adult was used to test it here, on purpose.
 *
 * An animated GIF is read on up to IMAGE_RULE.frames frames spread through
 * it, and the worst frame counts, so a harmless first frame hides nothing.
 */
import { readSkin, type SkinReading } from "./skin"

export interface ImageClasses {
  porn: number
  hentai: number
  sexy: number
  neutral: number
  drawing: number
}

export interface PictureReading {
  /** Frames read (1 for a still picture). */
  frames: number
  /** The skin reading of the frame with the most skin. */
  skin: SkinReading
  /** The classifier's worst frame, or null when it is off or failed. */
  classes: ImageClasses | null
}

/**
 * The thresholds, in one place for the suite and the notes. "Explicit" is
 * Porn + Hentai. Ordinary photos measured above top out at 0.44 explicit and
 * 0.86 sexy, so the refuse and hold lines sit well clear of them; a member
 * on their first day gets the tighter line (3 of 58 ordinary photos would be
 * held: two hands, a yoga class, a massage).
 */
export const IMAGE_RULE = {
  refuseExplicit: 0.85,
  holdExplicit: 0.55,
  holdSexy: 0.9,
  newMemberExplicit: 0.35,
  newMemberSexy: 0.7,
  /** Frames read from an animated picture. */
  frames: 4,
  /** Larger pictures are not decoded (a decompression bomb); 2560px pictures are 6.6 million. */
  maxPixels: 40_000_000,
  /** The classifier's input edge. */
  input: 224,
} as const

/* ── Which classifier is switched on ───────────────────────────────────── */

export type ClassifierName = "nsfwjs"

export interface ClassifierSetting {
  requested: ClassifierName | null
  /** An unknown name in the flag: treated as off. */
  unknown: string | null
}

/** Pure: reads only the object it is given, so the admin page and the suite can ask about any environment. */
export function readClassifierSetting(env: Record<string, string | undefined> = process.env): ClassifierSetting {
  const raw = String(env.SECURITY_IMAGE_CLASSIFIER ?? "").trim().toLowerCase()
  if (!raw || raw === "none" || raw === "off") return { requested: null, unknown: null }
  if (raw === "nsfwjs") return { requested: "nsfwjs", unknown: null }
  return { requested: null, unknown: raw.slice(0, 40) }
}

export interface ImageClassifier {
  name: ClassifierName
  /** RGB pixels, IMAGE_RULE.input square, row by row. */
  classify(rgb: Uint8Array, width: number, height: number): Promise<ImageClasses>
}

/* Loaded once per warm function; a failed load is not retried until the next cold start. */
let loading: Promise<ImageClassifier | null> | null = null
let saidMissing = false

/** A module by name at run time, never bundled (the packages are optional). */
const runtimeImport = (name: string): Promise<any> => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ name) // eslint-disable-line @typescript-eslint/no-explicit-any

/** Swappable in tests. */
export const classifierDeps = {
  load: async (): Promise<ImageClassifier | null> => {
    const tf = await runtimeImport("@tensorflow/tfjs")
    try {
      await runtimeImport("@tensorflow/tfjs-backend-wasm")
      await tf.setBackend("wasm")
    } catch {
      /* The WebAssembly backend is ten times faster; without it the plain one still answers. */
    }
    tf.enableProdMode()
    await tf.ready()
    const nsfw = await runtimeImport("nsfwjs")
    const model = await nsfw.load("MobileNetV2")
    return {
      name: "nsfwjs",
      async classify(rgb, width, height) {
        const input = tf.tensor3d(Int32Array.from(rgb), [height, width, 3], "int32")
        try {
          const out = (await model.classify(input, 5)) as { className: string; probability: number }[]
          const p = (n: string) => out.find((o) => o.className === n)?.probability ?? 0
          return { porn: p("Porn"), hentai: p("Hentai"), sexy: p("Sexy"), neutral: p("Neutral"), drawing: p("Drawing") }
        } finally {
          input.dispose()
        }
      },
    }
  },
}

/** The classifier when it is switched on and loads, else null (and the skin reading decides). */
export function imageClassifier(env: Record<string, string | undefined> = process.env): Promise<ImageClassifier | null> {
  if (readClassifierSetting(env).requested !== "nsfwjs") return Promise.resolve(null)
  loading ??= classifierDeps.load().catch((e) => {
    if (!saidMissing) console.error(`[image-check] SECURITY_IMAGE_CLASSIFIER=nsfwjs but it did not load (${e instanceof Error ? e.message : String(e)}); the skin reading carries on alone. lib/communities/DATA-SAFETY.md says how to install it.`)
    saidMissing = true
    return null
  })
  return loading
}

/** For the suite: forget a loaded classifier. */
export function resetClassifier(): void {
  loading = null
  saidMissing = false
}

/* ── Reading a picture ──────────────────────────────────────────────────── */

export function explicitOf(c: ImageClasses): number {
  return c.porn + c.hentai
}

/**
 * Reads a picture's bytes: up to IMAGE_RULE.frames frames, each for skin and
 * (when given) by the classifier. Null when it cannot be decoded at all or
 * is too large to decode safely; the caller decides what that means.
 */
export async function readPicture(bytes: Uint8Array, classifier: ImageClassifier | null): Promise<PictureReading | null> {
  const sharp = (await import("sharp")).default
  const options = { failOn: "none" as const, limitInputPixels: IMAGE_RULE.maxPixels }
  let pages = 1
  try {
    const meta = await sharp(bytes, options).metadata()
    if (!meta.width || !meta.height) return null
    pages = Math.max(1, Math.min(meta.pages ?? 1, 1000))
  } catch {
    return null
  }
  const picks = pages === 1 ? [0] : [...new Set(Array.from({ length: Math.min(IMAGE_RULE.frames, pages) }, (_, i) => Math.floor((i * pages) / Math.min(IMAGE_RULE.frames, pages))))]
  let skin: SkinReading | null = null
  let classes: ImageClasses | null = null
  let read = 0
  for (const page of picks) {
    try {
      const frame = sharp(bytes, { ...options, page }).rotate()
      const small = await frame.clone().resize(128, 128, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const s = readSkin(small.data, small.info.width, small.info.height, 4)
      if (!skin || s.skin > skin.skin || (s.heavy && !skin.heavy)) skin = s
      if (classifier) {
        try {
          const square = await frame.clone().resize(IMAGE_RULE.input, IMAGE_RULE.input, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
          const c = await classifier.classify(new Uint8Array(square.data), square.info.width, square.info.height)
          classes = worst(classes, c)
        } catch (e) {
          console.error(`[image-check] classifier failed on a picture: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      read++
    } catch {
      /* A frame that does not decode; the others still count. */
    }
  }
  if (!read || !skin) return null
  return { frames: read, skin, classes }
}

function worst(a: ImageClasses | null, b: ImageClasses): ImageClasses {
  if (!a) return b
  return explicitOf(b) >= explicitOf(a) ? { ...b, sexy: Math.max(a.sexy, b.sexy) } : { ...a, sexy: Math.max(a.sexy, b.sexy) }
}

/* ── What a reading means ───────────────────────────────────────────────── */

export type PictureAction = "ok" | "hold" | "refuse"

export interface PictureVerdict {
  action: PictureAction
  /** For the security log: what decided it. */
  code: "clean" | "adult_explicit" | "adult_likely" | "adult_suggestive" | "skin_heavy" | "unreadable"
}

/**
 * The rule. With the classifier: clearly explicit is refused for everybody;
 * likely explicit or clearly suggestive is held; a member on their first day
 * is held on the tighter line. Without it (or when it failed on this
 * picture): a skin heavy picture from a member on their first day is held,
 * nothing else. A picture that cannot be read is held for a first day
 * member (an undecodable file is how a check is dodged) and let through for
 * anybody else. The team is never held, only refused.
 */
export function judgePicture(reading: PictureReading | null, who: { fresh: boolean; team: boolean; undecodable?: boolean; classifierOn?: boolean }): PictureVerdict {
  if (!reading) {
    /* The bytes were there and would not decode, with the classifier on: a way round it (a HEIC Safari shows), so held for anybody. */
    const hold = !who.team && (who.fresh || (who.undecodable === true && who.classifierOn === true))
    return { action: hold ? "hold" : "ok", code: "unreadable" }
  }
  const c = reading.classes
  if (c) {
    const explicit = explicitOf(c)
    if (explicit >= IMAGE_RULE.refuseExplicit) return { action: "refuse", code: "adult_explicit" }
    if (who.team) return { action: "ok", code: "clean" }
    if (explicit >= IMAGE_RULE.holdExplicit) return { action: "hold", code: "adult_likely" }
    if (c.sexy >= IMAGE_RULE.holdSexy) return { action: "hold", code: "adult_suggestive" }
    if (who.fresh && explicit >= IMAGE_RULE.newMemberExplicit) return { action: "hold", code: "adult_likely" }
    if (who.fresh && c.sexy >= IMAGE_RULE.newMemberSexy) return { action: "hold", code: "adult_suggestive" }
    return { action: "ok", code: "clean" }
  }
  if (who.fresh && !who.team && reading.skin.heavy) return { action: "hold", code: "skin_heavy" }
  return { action: "ok", code: "clean" }
}
