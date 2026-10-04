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
 * address was there, and the box under it then shows the chosen file's own
 * address. One value, two ways in, the way the video control already works.
 *
 * An address is sent on as soon as it reads as one (https://..., or a path
 * on this site), so the canvas follows the typing. Half an address is kept
 * in the box and not sent, and leaving the box with one says why.
 */
import * as React from "react"

import { useEchoedValue } from "@/components/website-builder/echo-field"
import { WbImagePicker } from "@/components/website-builder/editor/image-picker"
import { INPUT, PROBLEM } from "./styles"

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
  const [draft, setDraft] = React.useState(shown)
  const [seen, setSeen] = React.useState(shown)
  const [left, setLeft] = React.useState(false)
  if (seen !== shown) {
    setSeen(shown)
    setDraft(shown)
    setLeft(false)
  }
  const typed = draft.trim()
  const unusable = typed !== "" && !isImageAddress(typed)

  return (
    <div className="space-y-1.5" data-image-setting="">
      <WbImagePicker value={shown || undefined} onChange={(next) => commit(next ?? "")} aspectRatio="video" folder="sections" layout="row" />
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
        onBlur={() => setLeft(true)}
      />
      {left && unusable && (
        <p className={PROBLEM} role="alert">
          An image link starts with https:// or with / for a page of this site.
        </p>
      )}
    </div>
  )
}
