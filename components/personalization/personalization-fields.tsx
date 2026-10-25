"use client"

/**
 * ===========================================================================
 *  THE BUYER'S PERSONALIZATION FIELDS, ABOVE THE BUY BUTTONS
 * ===========================================================================
 * What a product that ships asks for (lib/products/personalization.ts),
 * drawn the same on a Storelib theme's product section (its Personalization
 * block, or above the buy buttons when the section has none) and on the
 * storelib.com product page's buy box. Each field shows its label exactly
 * as the creator typed it, "Optional" beside one that is not required, its
 * hint and its line of help; a text field with a limit counts down; a photo
 * field uploads to the store's private cart uploads (lib/products/
 * personalization-upload, lib/cart-uploads) and shows the photo once it is
 * checked. A line's answers are shown by components/website-builder/
 * cart-line-properties and the order panel, as every line property is.
 *
 * usePersonalization keeps the answers and says what is missing; the buy
 * buttons ask it before adding (`check`), and it then shows every problem
 * under its field and moves to the first. The server checks again.
 */
import * as React from "react"
import { ImagePlus, Loader2, X } from "lucide-react"
import { UPLOAD_ACCEPT, answerLimit, checkAnswers, filledAnswers, type AnswerProblem, type PersonalizationField } from "@/lib/products/personalization"
import { uploadPersonalizationPhoto } from "@/lib/products/personalization-upload"

export interface PersonalizationWords {
  optional: string
  upload_photo: string
  change_photo: string
  remove_photo: string
  uploading: string
  photo_added: string
  photo_types: string
  photo_wait: string
  fill_in: string
  characters_left: string
}

export const ENGLISH_WORDS: PersonalizationWords = {
  optional: "Optional",
  upload_photo: "Upload a photo",
  change_photo: "Change photo",
  remove_photo: "Remove photo",
  uploading: "Uploading",
  photo_added: "Photo added",
  photo_types: "JPG, PNG or WEBP, up to 10 MB",
  photo_wait: "Wait for the photo to finish uploading.",
  fill_in: "Fill in {label}",
  characters_left: "{count} characters left",
}

export interface PersonalizationLook {
  ink: string
  muted: string
  line: string
  field?: string
  radius?: number | string
  danger?: string
}

type Photo = { state: "uploading" | "done" | "failed"; preview: string | null; error?: string }

export interface PersonalizationState {
  fields: PersonalizationField[]
  values: Record<string, string>
  set: (label: string, value: string) => void
  photos: Record<string, Photo>
  setPhoto: (fieldId: string, photo: Photo | null) => void
  /** Problems are shown under their fields once a buy button was pressed. */
  shown: boolean
  problems: Map<string, string>
  /** The answers for the cart line, or null (and every problem shown) when something is missing or still uploading. */
  check: () => Record<string, string> | undefined | null
  reset: () => void
}

function problemWords(p: AnswerProblem, words: PersonalizationWords): string {
  return p.code === "required" ? words.fill_in.replace("{label}", p.label) : p.message
}

export function usePersonalization(fields: PersonalizationField[] | undefined, words: PersonalizationWords = ENGLISH_WORDS): PersonalizationState {
  const list = React.useMemo(() => fields ?? [], [fields])
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [photos, setPhotos] = React.useState<Record<string, Photo>>({})
  const [shown, setShown] = React.useState(false)
  const key = list.map((f) => `${f.id}:${f.label}`).join("|")
  const last = React.useRef(key)
  React.useEffect(() => {
    if (last.current === key) return
    last.current = key
    setValues({})
    setPhotos({})
    setShown(false)
  }, [key])

  const problems = React.useMemo(() => {
    const out = new Map<string, string>()
    for (const f of list) {
      if (photos[f.id]?.state === "uploading") {
        out.set(f.id, words.photo_wait)
        continue
      }
      const one = checkAnswers([f], { [f.label]: values[f.label] ?? "" })
      if (one.ok === false) out.set(f.id, problemWords(one.problem, words))
    }
    return out
  }, [list, values, photos, words])

  const set = React.useCallback((label: string, value: string) => setValues((v) => ({ ...v, [label]: value })), [])
  const setPhoto = React.useCallback(
    (fieldId: string, photo: Photo | null) =>
      setPhotos((p) => {
        const next = { ...p }
        if (photo) next[fieldId] = photo
        else delete next[fieldId]
        return next
      }),
    [],
  )

  const check = React.useCallback(() => {
    if (!list.length) return undefined
    if (problems.size) {
      setShown(true)
      /* To the first field with a problem, after it is drawn. */
      const first = list.find((f) => problems.has(f.id))
      if (first && typeof document !== "undefined") {
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLElement>(`[data-personalization-input="${first.id}"]`)
          el?.scrollIntoView({ block: "center", behavior: "smooth" })
          el?.focus({ preventScroll: true })
        })
      }
      return null
    }
    const checked = checkAnswers(list, values)
    return filledAnswers(checked.properties)
  }, [list, problems, values])

  const reset = React.useCallback(() => {
    setValues({})
    setPhotos({})
    setShown(false)
  }, [])

  return { fields: list, values, set, photos, setPhoto, shown, problems, check, reset }
}

const radiusOf = (r: number | string | undefined) => (typeof r === "number" ? `${r}px` : r ?? "10px")

export function PersonalizationFields({
  state,
  productId,
  look,
  words = ENGLISH_WORDS,
  inert = false,
  className,
}: {
  state: PersonalizationState
  productId: string
  look: PersonalizationLook
  words?: PersonalizationWords
  /** The builder's canvas: drawn, never uploads. */
  inert?: boolean
  className?: string
}) {
  if (!state.fields.length) return null
  const danger = look.danger ?? "#b42318"
  const box: React.CSSProperties = { borderColor: look.line, color: look.ink, background: look.field ?? "transparent", borderRadius: radiusOf(look.radius) }
  return (
    <div className={className ?? "space-y-4"} data-personalization="">
      {state.fields.map((f) => {
        const id = `pz-${productId.slice(0, 8)}-${f.id}`
        const problem = state.shown ? state.problems.get(f.id) : undefined
        const value = state.values[f.label] ?? ""
        const limit = answerLimit(f)
        const counted = f.type !== "image" && f.maxLength !== null
        const described = [f.help ? `${id}-help` : "", problem ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined
        return (
          <div key={f.id} className="space-y-1.5" data-personalization-field={f.id} data-type={f.type}>
            <label htmlFor={id} className="flex items-baseline justify-between gap-3 text-[14px] font-medium" style={{ color: look.ink }}>
              <span className="min-w-0 break-words">
                {f.label}
                {!f.required ? <span className="ml-1.5 text-[13px] font-normal" style={{ color: look.muted }}>{words.optional}</span> : null}
              </span>
              {counted ? (
                <span className="shrink-0 text-[12px] font-normal tabular-nums" style={{ color: look.muted }} aria-live="polite">
                  {words.characters_left.replace("{count}", String(Math.max(0, limit - value.length)))}
                </span>
              ) : null}
            </label>
            {f.type === "image" ? (
              <PhotoField field={f} id={id} productId={productId} state={state} look={look} words={words} inert={inert} invalid={!!problem} described={described} />
            ) : f.type === "multiline" ? (
              <textarea
                id={id}
                data-personalization-input={f.id}
                rows={3}
                value={value}
                maxLength={limit}
                placeholder={f.placeholder || undefined}
                readOnly={inert}
                required={f.required}
                aria-invalid={problem ? true : undefined}
                aria-describedby={described}
                onChange={(e) => state.set(f.label, e.target.value)}
                className="block w-full resize-y border px-3 py-2.5 text-[16px] leading-6 outline-none transition-[border-color,box-shadow] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.08)] sm:text-[15px]"
                style={{ ...box, borderColor: problem ? danger : look.line }}
              />
            ) : (
              <input
                id={id}
                data-personalization-input={f.id}
                type="text"
                value={value}
                maxLength={limit}
                placeholder={f.placeholder || undefined}
                readOnly={inert}
                required={f.required}
                autoComplete="off"
                aria-invalid={problem ? true : undefined}
                aria-describedby={described}
                onChange={(e) => state.set(f.label, e.target.value)}
                className="block h-12 w-full border px-3 text-[16px] outline-none transition-[border-color,box-shadow] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.08)] sm:h-11 sm:text-[15px]"
                style={{ ...box, borderColor: problem ? danger : look.line }}
              />
            )}
            {f.help ? (
              <p id={`${id}-help`} className="text-[13px] leading-5" style={{ color: look.muted }}>
                {f.help}
              </p>
            ) : null}
            {problem ? (
              <p id={`${id}-error`} role="alert" className="text-[13px] font-medium leading-5" style={{ color: danger }} data-personalization-error="">
                {problem}
              </p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function PhotoField({ field, id, productId, state, look, words, inert, invalid, described }: { field: PersonalizationField; id: string; productId: string; state: PersonalizationState; look: PersonalizationLook; words: PersonalizationWords; inert: boolean; invalid: boolean; described?: string }) {
  const input = React.useRef<HTMLInputElement>(null)
  const photo = state.photos[field.id]
  const aborter = React.useRef<AbortController | null>(null)
  React.useEffect(() => () => aborter.current?.abort(), [])
  const pick = async (file: File | undefined) => {
    if (!file || inert) return
    aborter.current?.abort()
    const ctl = new AbortController()
    aborter.current = ctl
    let preview: string | null = null
    try {
      preview = URL.createObjectURL(file)
    } catch {
      preview = null
    }
    state.set(field.label, "")
    state.setPhoto(field.id, { state: "uploading", preview })
    const done = await uploadPersonalizationPhoto(file, { productId, fieldId: field.id }, { signal: ctl.signal })
    if (ctl.signal.aborted) return
    if (done.ok) {
      state.set(field.label, done.url)
      state.setPhoto(field.id, { state: "done", preview })
    } else {
      state.setPhoto(field.id, { state: "failed", preview: null, error: (done as { error: string }).error })
      if (preview) URL.revokeObjectURL(preview)
    }
    if (input.current) input.current.value = ""
  }
  const clear = () => {
    aborter.current?.abort()
    if (photo?.preview) URL.revokeObjectURL(photo.preview)
    state.setPhoto(field.id, null)
    state.set(field.label, "")
  }
  const danger = look.danger ?? "#b42318"
  const radius = typeof look.radius === "number" ? `${look.radius}px` : look.radius ?? "10px"
  const busy = photo?.state === "uploading"
  const has = photo && photo.state !== "failed"
  return (
    <div>
      <input ref={input} id={id} type="file" accept={UPLOAD_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" disabled={inert} onChange={(e) => void pick(e.target.files?.[0])} />
      {has ? (
        <div className="flex items-center gap-3 border p-2 pr-3" style={{ borderColor: invalid ? danger : look.line, borderRadius: radius, background: look.field ?? "transparent" }} data-personalization-photo={photo.state}>
          <div className="relative h-14 w-14 shrink-0 overflow-hidden" style={{ borderRadius: `calc(${radius} - 4px)`, background: look.line }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {photo.preview ? <img src={photo.preview} alt="" className="h-full w-full object-cover" /> : null}
            {busy ? (
              <span className="absolute inset-0 grid place-items-center bg-black/35">
                <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden />
              </span>
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium" style={{ color: look.ink }} aria-live="polite">
              {busy ? words.uploading : words.photo_added}
            </p>
            <button type="button" data-personalization-input={field.id} onClick={() => input.current?.click()} disabled={busy || inert} className="text-[13px] underline underline-offset-2 disabled:opacity-50" style={{ color: look.muted }}>
              {words.change_photo}
            </button>
          </div>
          <button type="button" onClick={clear} disabled={inert} aria-label={words.remove_photo} className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ color: look.muted }}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-personalization-input={field.id}
          aria-describedby={described}
          aria-invalid={invalid ? true : undefined}
          disabled={inert}
          onClick={() => input.current?.click()}
          className="flex min-h-12 w-full items-center gap-3 border px-3 py-2.5 text-left transition-[border-color] disabled:cursor-default"
          style={{ borderColor: invalid ? danger : look.line, borderRadius: radius, background: look.field ?? "transparent", color: look.ink }}
        >
          <ImagePlus className="h-5 w-5 shrink-0" style={{ color: look.muted }} aria-hidden />
          <span className="min-w-0">
            <span className="block text-[15px] font-medium">{words.upload_photo}</span>
            <span className="block text-[12.5px]" style={{ color: look.muted }}>
              {words.photo_types}
            </span>
          </span>
        </button>
      )}
      {photo?.state === "failed" && photo.error ? (
        <p role="alert" className="mt-1.5 text-[13px] font-medium" style={{ color: danger }}>
          {photo.error}
        </p>
      ) : null}
    </div>
  )
}
