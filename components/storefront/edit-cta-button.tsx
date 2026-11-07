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
import { useSavedValues } from "@/lib/store-builder/use-saved-values"
import { Pencil } from "lucide-react"

import { EditorField, EditorSelect, EditorSheet, useSaveThenRefresh } from "@/components/storefront/editor-sheet"
import { ColorField } from "@/components/storefront/color-field"
import { saveCreatorProfile } from "@/lib/storefront/creator-profile-client"
import { useFormHistory } from "@/lib/store-builder/form-history"

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
  const { markSaved, onClosed, toast } = useSaveThenRefresh()
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [v, setV] = React.useState<CtaValues>(values)
  /**
   * ===========================================================================
   *  SAVING THE WORDS MUST NOT FREEZE THE COLOURS
   * ===========================================================================
   * These fields are seeded with what the bar IS — which, for a creator who
   * has never picked a colour, is what the scheme decided. Writing all four
   * back on every save turned the scheme's answer into an explicit stored
   * choice, and from that moment the scheme could never paint the bar again:
   * change the page to Astrid and the button stayed the blue the editor had
   * quietly saved. That is "they sometimes override".
   *
   * So a field is sent only if it was TOUCHED in this session. Everything
   * else is left absent, the stored config keeps whatever it had, and the
   * scheme goes on deciding for the ones nobody has chosen.
   */
  const vRef = React.useRef(v)
  vRef.current = v
  const [touched, setTouched] = React.useState<Set<keyof CtaValues>>(() => new Set())

  const set = <K extends keyof CtaValues>(key: K, value: CtaValues[K]) => {
    setTouched((t) => (t.has(key) ? t : new Set(t).add(key)))
    /* Outside the updater (round 50): the preview sets the bar's state, and a
       state update made inside another component's updater is React's
       "Cannot update a component while rendering a different component". */
    const next = { ...vRef.current, [key]: value }
    vRef.current = next
    setV(next)
    onPreview?.(next)
  }

  /**
   * Reopening shows what is SAVED, not what was abandoned — and not what was
   * saved a moment ago either. Watching `open` alone put the pre-save values
   * back on close and never heard about the refreshed ones, so the four
   * colours read as having reset themselves. See
   * lib/store-builder/use-saved-values.
   */
  useSavedValues(open, values, (saved) => {
    setV(saved)
    setTouched(new Set())
    setError(null)
  })

  /*
    UNDO IN THE SHEET (round 50). A field put back to what is saved is
    untouched again, so Save does not send it (a colour would be stored as
    chosen); any other stays touched.
  */
  const formHistory = useFormHistory(open, v, (back) => {
    setTouched((t) => new Set([...t].filter((k) => back[k] !== values[k])))
    setV(back)
    onPreview?.(back)
  })

  const close = () => {
    setOpen(false)
    onPreview?.(null)
  }

  /** The bar's own four, offered under each picker so one can borrow another's. */
  const palette = [v.backgroundColor, v.textColor, v.buttonColor, v.buttonTextColor].filter((c) => /^#[0-9a-f]{6}$/i.test(c))

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      /*
        Only what was touched. The API treats every key it receives as a
        decision — that is right, and it is why an untouched key must not be
        sent. See the note on `touched` above.
      */
      const patch: Partial<CtaValues> = {}
      for (const key of Object.keys(v) as (keyof CtaValues)[]) {
        if (touched.has(key)) patch[key] = v[key] as never
      }
      if (Object.keys(patch).length === 0) {
        setOpen(false)
        return
      }
      const { ok } = await saveCreatorProfile({ subscribeBar: patch }, "bar")
      if (!ok) {
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
      /* The page changes once the sheet has gone, not underneath it on its
         way down. useSaveThenRefresh + onClosed in editor-sheet. */
      markSaved()
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
        onClosed={onClosed}
        onClose={close}
        title="The bar at the top"
        busy={saving}
        error={error}
        onSave={() => void save()}
        history={formHistory}
        /* The spinner is the sheet's, beside the word. `busy` already says
           a save is in flight; a label that changes as well took the word
           away at the moment it was pressed. */
        saveLabel="Save"
      >
        {/*
          A SELECT, NOT SIX PILLS. Six sentences laid out as buttons were six
          things competing for the eye on a form that has one question here:
          which one. A closed control says the current answer and opens on
          request, which is the builder's own shape for a choice like this.
        */}
        <EditorField label="Message">
          <EditorSelect ariaLabel="Message" options={MESSAGE_PRESETS} value={v.style} onChange={(x) => set("style", x)} />
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
          <EditorSelect ariaLabel="Button" options={BUTTON_PRESETS} value={v.buttonStyle} onChange={(x) => set("buttonStyle", x)} />
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

        {/*
          ONE COLUMN. The two-column grid truncated "Background" to "Back..."
          at the width of a phone sheet, and a picker that opens in the flow
          under its row needs the row's full width to open into.
        */}
        <EditorField label="Colours">
          <div className="space-y-2">
            <ColorField label="Background" value={v.backgroundColor} fallback="#ffffff" onChange={(x) => set("backgroundColor", x)} palette={palette} />
            <ColorField label="Text" value={v.textColor} fallback="#111827" onChange={(x) => set("textColor", x)} palette={palette} />
            <ColorField label="Button" value={v.buttonColor} fallback="#2563eb" onChange={(x) => set("buttonColor", x)} palette={palette} />
            <ColorField label="Button text" value={v.buttonTextColor} fallback="#ffffff" onChange={(x) => set("buttonTextColor", x)} palette={palette} />
          </div>
        </EditorField>
      </EditorSheet>
      {/* "Saved", once the sheet has gone (useSaveThenRefresh). */}
      {toast}
    </>
  )
}
