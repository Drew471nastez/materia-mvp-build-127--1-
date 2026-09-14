"use client"

/**
 * ===========================================================================
 *  THE BAR IS EDITED FROM THE BAR
 * ===========================================================================
 * This was two text fields. The rest of the bar — which generated sentence,
 * which button label, and its four colours — was a panel in the workspace's
 * toolbar, which is the wrong place twice over: it is a control for a thing
 * that is two inches below it and off to one side, and it only exists inside
 * the editor, so a creator looking at their own live page had no way to it.
 *
 * So the whole of the bar is edited from the pencil ON the bar. The panel in
 * the toolbar is gone.
 *
 * ---------------------------------------------------------------------------
 *  IT REPAINTS AS YOU TYPE
 * ---------------------------------------------------------------------------
 * Every change is handed to LiveSubscribeBar through a callback and, when the
 * page is inside the workspace, the bar above re-renders on the keystroke.
 * Cancel puts back what was there. Save writes through the same
 * /api/creator-profile everything else on this page uses, which does the
 * auth, the ownership check, the hex validation and the merge into both the
 * draft and the published config.
 *
 * OWNER ONLY, decided by the page rather than here: this is rendered into a
 * slot the storefront only fills when the viewer owns the page.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2, Pencil } from "lucide-react"

import { EditorField, EditorSheet, SchemeSwatchRow } from "@/components/storefront/editor-sheet"
import { ColorField } from "@/components/storefront/color-field"
import { notifyEditorSaved } from "@/lib/store-builder/editor-channel"

const MAX_TEXT = 120
const MAX_BUTTON = 30

/**
 * SIX SENTENCES, NOT THREE.
 *
 * The bar generates its own line when a creator has not written one, and the
 * three it could generate were all the same sentence: join this, join that.
 * The three added are the other reasons somebody puts an email box at the top
 * of a page — the drop, the discount, the thing that is new. They are stored
 * as `style`, resolved by lib/store-builder/subscribe-text.
 */
export const MESSAGE_PRESETS = [
  { value: "style1", label: "Join <name>'s newsletter" },
  { value: "style2", label: "Join our family" },
  { value: "style3", label: "Join our community" },
  { value: "style4", label: "Get new drops first" },
  { value: "style5", label: "Subscribers get 10% off" },
  { value: "style6", label: "Never miss a release" },
] as const

export const BUTTON_PRESETS = [
  { value: "style1", label: "Subscribe" },
  { value: "style2", label: "Join Now" },
  { value: "style3", label: "Get It" },
  { value: "style4", label: "Follow" },
] as const

export interface CtaValues {
  text: string
  buttonText: string
  style: string
  buttonStyle: string
  backgroundColor: string
  textColor: string
  buttonColor: string
  buttonTextColor: string
}

export function EditCtaButton({
  values,
  onPreview,
}: {
  /** What the bar is set to now, read from the published config. */
  values: CtaValues
  /**
   * Draft values, applied to the bar above as they are typed. The bar owns
   * the state; this only reports. `null` means "put back what you had".
   */
  onPreview?: (draft: CtaValues | null) => void
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [v, setV] = React.useState<CtaValues>(values)

  const set = <K extends keyof CtaValues>(key: K, value: CtaValues[K]) =>
    setV((s) => {
      const next = { ...s, [key]: value }
      onPreview?.(next)
      return next
    })

  /** Reopening after a cancel shows what is saved, not what was abandoned. */
  React.useEffect(() => {
    if (open) return
    setV(values)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const close = () => {
    setOpen(false)
    onPreview?.(null)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/creator-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscribeBar: v }),
      })
      if (!res.ok) {
        setError("That could not be saved. Try again.")
        return
      }
      setOpen(false)
      /*
        Inside the workspace the frame around this reloads the page, which is
        the same render a visitor gets. At its own address there is no frame
        and a refresh is the only way to see it, so both are asked for and
        whichever applies happens.
      */
      notifyEditorSaved()
      router.refresh()
    } catch {
      setError("Could not reach the server. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Edit this bar"
        title="Edit this bar"
        /*
          SMALLER ON A PHONE, and no filled background there. The bar's own
          row on a 390px screen is an avatar, a sentence and this; a 28px
          chip with a panel behind it competes with the sentence for the line
          it is attached to. On a desktop there is room for the chip.

          `bg-current/[0.08]` rather than black or white: the bar can be any
          colour a creator picked, and a fixed tint disappears on half of them.
        */
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-current opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:h-7 sm:w-7 sm:bg-current/[0.08] sm:opacity-70"
      >
        <Pencil className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
      </button>

      <EditorSheet
        open={open}
        onClose={close}
        title="The bar at the top"
        busy={saving}
        error={error}
        onSave={() => void save()}
        saveLabel={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
      >
        <EditorField label="Message">
          <SchemeSwatchRow
            options={MESSAGE_PRESETS}
            value={v.style}
            onChange={(x) => set("style", x)}
          />
        </EditorField>

        <EditorField label="Or your own message" hint={`${v.text.length}/${MAX_TEXT}`}>
          <input
            value={v.text}
            maxLength={MAX_TEXT}
            onChange={(e) => set("text", e.target.value)}
            placeholder="Leave empty to use the message above"
            className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm text-[#111827] outline-none transition-colors focus:border-[#9ca3af] focus:ring-2 focus:ring-neutral-900/10"
          />
        </EditorField>

        <EditorField label="Button">
          <SchemeSwatchRow
            options={BUTTON_PRESETS}
            value={v.buttonStyle}
            onChange={(x) => set("buttonStyle", x)}
          />
        </EditorField>

        <EditorField label="Or your own label" hint={`${v.buttonText.length}/${MAX_BUTTON}`}>
          <input
            value={v.buttonText}
            maxLength={MAX_BUTTON}
            onChange={(e) => set("buttonText", e.target.value)}
            placeholder="Leave empty to use the label above"
            className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm text-[#111827] outline-none transition-colors focus:border-[#9ca3af] focus:ring-2 focus:ring-neutral-900/10"
          />
        </EditorField>

        <div className="grid grid-cols-2 gap-3">
          <ColorField label="Background" value={v.backgroundColor} fallback="#ffffff" onChange={(x) => set("backgroundColor", x)} />
          <ColorField label="Text" value={v.textColor} fallback="#111827" onChange={(x) => set("textColor", x)} />
          <ColorField label="Button" value={v.buttonColor} fallback="#2563eb" onChange={(x) => set("buttonColor", x)} />
          <ColorField label="Button text" value={v.buttonTextColor} fallback="#ffffff" onChange={(x) => set("buttonTextColor", x)} />
        </div>
      </EditorSheet>
    </>
  )
}
