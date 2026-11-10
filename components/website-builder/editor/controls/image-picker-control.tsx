"use client"

/**
 * ===========================================================================
 *  A PICTURE: CHOSEN, OR LINKED
 * ===========================================================================
 * The control for every image setting: `image_picker`, the older `image`,
 * and a text or url setting the engine reads as a picture because it holds
 * one (lib/storelib-theme/schema/normalise.ts).
 *
 * The picker box, then an address box under it. Typing or pasting an
 * address sets the picture; choosing a file in the picker replaces whatever
 * address was there. The box never shows the picture's address back (round
 * 22, the owner: "I don't want them to display the url"): the picture above
 * is what is chosen, and the box is only a way in. It empties once a link
 * typed into it has been taken.
 *
 * An address is sent on as soon as it reads as one (https://..., or a path
 * on this site), so the canvas follows the typing. Half an address is kept
 * in the box and not sent, and leaving the box with one says why.
 *
 * A picture the AI made (round P: in the store's ai-images folder) has a
 * small Regenerate under it: a new one from the same description, through
 * /api/website-builder/images/regenerate (owner only, limited, capped). The
 * new picture replaces this one in the setting; the old one stays in Files,
 * so Undo brings it back.
 */
import * as React from "react"

import { useEchoedValue } from "@/components/website-builder/echo-field"
import { WbImagePicker } from "@/components/website-builder/editor/image-picker"
import { pictureAddress } from "@/lib/website-builder/picture-address"
import { aiImagePathOf } from "@/lib/storelib-ai/images/paths"
import { useEditorFieldEnv } from "./context"
import { INPUT, NOTE, PROBLEM, TEXT_BUTTON } from "./styles"

/** Asks for a new picture in place of an AI one. The new address, or the reason in plain words. */
async function regenerate(url: string): Promise<{ url: string } | { error: string }> {
  try {
    const res = await fetch("/api/website-builder/images/regenerate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) })
    const body = (await res.json().catch(() => null)) as { url?: unknown; error?: unknown } | null
    if (res.ok && typeof body?.url === "string") return { url: body.url }
    return { error: typeof body?.error === "string" ? body.error : "Could not make a new picture. Try again." }
  } catch {
    return { error: "Could not make a new picture. Try again." }
  }
}

/** An address an <img> can load: https, http, or a path on this site. */
export function isImageAddress(value: string): boolean {
  return /^(https?:\/\/[^\s/]+\S*|\/(?![/\\])\S*)$/i.test(value.trim())
}

export function ImagePickerControl({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (v: string) => void
  label?: string
}) {
  /* The value as this control last set it, ahead of the editor's echo (echo-field.ts). */
  const [shown, commit] = useEchoedValue(typeof value === "string" ? value : "", onChange)
  /* What is in the address box. Follows the value whenever that changes from outside: a file chosen, an undo. */
  /* Only what is being typed: never the chosen picture's address, whoever chose it. */
  const [draft, setDraft] = React.useState("")
  const [seen, setSeen] = React.useState(shown)
  const [left, setLeft] = React.useState(false)
  if (seen !== shown) {
    setSeen(shown)
    setDraft("")
    setLeft(false)
  }
  const typed = draft.trim()
  const unusable = typed !== "" && !isImageAddress(typed)
  /*
    WHAT THE PICTURE IS DRAWN FROM, which is not always what is saved: an
    imported theme names its pictures by its old store's address, and the
    theme's own copy of that picture is what the live site draws
    (lib/website-builder/picture-address.ts). The saved value is unchanged.
  */
  const env = useEditorFieldEnv()
  const drawn = shown ? pictureAddress(shown, env?.pictureMedia) : ""
  /* Only a picture the AI made can be made again. */
  const madeByAi = !!aiImagePathOf(shown)
  const [making, setMaking] = React.useState(false)
  const [madeError, setMadeError] = React.useState<string | null>(null)
  const remake = async () => {
    if (making || !shown) return
    setMaking(true)
    setMadeError(null)
    const r = await regenerate(shown)
    setMaking(false)
    if ("url" in r) commit(r.url)
    else setMadeError(r.error)
  }

  return (
    <div className="space-y-1.5" data-image-setting="">
      <WbImagePicker value={drawn || undefined} onChange={(next) => commit(next ?? "")} aspectRatio="video" folder="sections" layout="row" />
      {madeByAi && (
        <div className="flex items-center gap-2" data-image-regenerate="">
          <button type="button" className={TEXT_BUTTON} onClick={() => void remake()} disabled={making} aria-busy={making}>
            {making ? "Making a new one" : "Regenerate"}
          </button>
          {!making && !madeError && <span className={NOTE}>Made by AI</span>}
        </div>
      )}
      {madeError && (
        <p className={PROBLEM} role="alert">
          {madeError}
        </p>
      )}
      <input
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        aria-label={label ? `${label} address` : "Image address"}
        aria-invalid={left && unusable}
        data-image-address=""
        className={INPUT}
        placeholder="Or paste an image link"
        value={draft}
        onChange={(e) => {
          const next = e.target.value
          setDraft(next)
          setLeft(false)
          const t = next.trim()
          if (t === "" || isImageAddress(t)) {
            setSeen(t)
            commit(t)
          }
        }}
        onBlur={() => {
          /* A link that was taken has done its job: the picture above shows it, and the box goes back to empty. */
          if (typed !== "" && !unusable) setDraft("")
          else setLeft(true)
        }}
      />
      {left && unusable && (
        <p className={PROBLEM} role="alert">
          An image link starts with https:// or with / for a page of this site.
        </p>
      )}
    </div>
  )
}
