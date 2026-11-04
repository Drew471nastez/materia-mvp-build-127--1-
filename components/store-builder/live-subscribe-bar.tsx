"use client"

/**
 * ===========================================================================
 *  THE BAR, REPAINTING AS SOMEBODY TYPES IN THE EDITOR
 * ===========================================================================
 * The creator-page editor holds this page in an iframe, which means the only
 * way a change reached the canvas was a save followed by a fresh request: you
 * typed a sentence, pressed Save, and waited for a round trip to find out
 * whether it fitted. "It should show in real time, like the store builder,
 * so I do not have to reload the page or wait" is exactly that.
 *
 * So the editor posts the draft values across, and this applies them on top
 * of what the server rendered. The bar is a client component already and its
 * colours and copy are all props, so there is nothing to re-fetch and nothing
 * to re-render but itself.
 *
 * ---------------------------------------------------------------------------
 *  WHY THIS IS NOT ON THE PUBLIC PAGE
 * ---------------------------------------------------------------------------
 * A `message` listener is an input from outside the page, and the values it
 * carries are painted straight onto a storefront. That is only ever mounted
 * for the OWNER, inside the editor's frame — the page renders the plain bar
 * for everybody else, so a visitor's page has no listener to talk to at all.
 *
 * Two further gates, because "only mounted for the owner" is an argument
 * about one call site and this is a component anybody can mount: the message
 * must come from this exact origin, and it must come from the window that is
 * framing us. Neither is satisfiable by a third-party page.
 *
 * Nothing here writes anything. The draft lives in this component's state for
 * as long as the frame does; saving is the editor's own PATCH.
 */

import { useEffect, useState } from "react"

import dynamic from "next/dynamic"
import type { CtaValues } from "@/components/storefront/edit-cta-button"
/*
  Round 48: the pencil is fetched for the owner. Imported plainly, the editor
  sheet, the colour fields and the website builder's live settings behind them
  were in every visitor's download of the creator page; `editor` is only given
  when the viewer owns the page, which is the only time this renders it.
  Server rendered for the owner as before (ssr stays on).
*/
const EditCtaButton = dynamic(() => import("@/components/storefront/edit-cta-button").then((m) => m.EditCtaButton))
import { CREATOR_EDITOR_CHANNEL } from "@/lib/store-builder/editor-channel"

import { SubscribeBar } from "./subscribe-bar"

/** The four colours and two strings the editor can change. */
export interface SubscribeBarDraft {
  text?: string
  customCtaText?: string
  buttonText?: string
  style?: string
  buttonStyle?: string
  buttonTextPreset?: string
  backgroundColor?: string
  textColor?: string
  buttonColor?: string
  buttonTextColor?: string
}

export { CREATOR_EDITOR_CHANNEL } from "@/lib/store-builder/editor-channel"

/** A hex the browser will accept, or nothing. Never passed through raw. */
const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined)
const line = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined)

function clean(raw: unknown): SubscribeBarDraft | null {
  if (!raw || typeof raw !== "object") return null
  const v = raw as Record<string, unknown>
  const buttonText = line(v.buttonText, 30)
  const draft: SubscribeBarDraft = {
    text: line(v.text, 120),
    customCtaText: line(v.text, 120),
    buttonText,
    /**
     * The same rule the API applies when it stores this: a label with
     * something in it is the creator's own, an empty one hands the button
     * back to the preset. Without it the preview would keep showing the
     * preset while the field says otherwise. See getButtonText.
     */
    buttonTextPreset: buttonText === undefined ? undefined : buttonText.trim() ? "custom" : "subscribe",
    style: line(v.style, 20),
    buttonStyle: line(v.buttonStyle, 20),
    backgroundColor: hex(v.backgroundColor),
    textColor: hex(v.textColor),
    buttonColor: hex(v.buttonColor),
    buttonTextColor: hex(v.buttonTextColor),
  }
  return draft
}

export function LiveSubscribeBar({
  settings,
  creatorId,
  editor,
  leading,
}: {
  settings: React.ComponentProps<typeof SubscribeBar>["settings"]
  creatorId: string
  /** The way back before the photo, as SubscribeBar takes it. */
  leading?: React.ReactNode
  /**
   * THE PENCIL LIVES HERE, not beside this in the page.
   *
   * It has to, now that it edits the bar's colours as well as its words: the
   * draft it produces is state, and the bar is the thing that renders from
   * it. Two siblings in a Server Component cannot share state, which is why
   * the colour half of this used to be a panel in the workspace's toolbar
   * instead — a control for a thing two inches below it and off to one side.
   *
   * Present only when the viewer owns the page; the page decides that.
   */
  editor?: { values: CtaValues }
}) {
  const [draft, setDraft] = useState<SubscribeBarDraft | null>(null)

  useEffect(() => {
    /* Not framed means nobody can be editing us, so there is nothing to listen to. */
    if (window.parent === window) return

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.source !== window.parent) return
      const data = event.data as { channel?: string; kind?: string; values?: unknown } | null
      if (!data || data.channel !== CREATOR_EDITOR_CHANNEL) return
      if (data.kind === "bar") setDraft(clean(data.values))
    }

    window.addEventListener("message", onMessage)
    /*
      The editor cannot post into a frame that has not loaded yet, and it has
      no reliable way to know when this one has. So the frame says so, and the
      editor replays whatever draft it is holding. That is what keeps an open
      panel's unsaved edits on screen across a reload of the canvas.
    */
    try {
      window.parent.postMessage({ channel: CREATOR_EDITOR_CHANNEL, kind: "ready" }, window.location.origin)
    } catch {
      /* A parent on another origin cannot be posted to, and does not need to be. */
    }
    return () => window.removeEventListener("message", onMessage)
  }, [])

  /**
   * Only the keys the editor actually sent. A draft field left undefined must
   * not overwrite the server's value with nothing — that is the difference
   * between "they cleared the message" and "they have not touched it".
   */
  const merged = draft
    ? ({
        ...settings,
        ...(Object.fromEntries(Object.entries(draft).filter(([, value]) => value !== undefined)) as Partial<
          typeof settings
        >),
      } as typeof settings)
    : settings

  if (!editor) return <SubscribeBar settings={merged} creatorId={creatorId} leading={leading} />

  /*
    THE PENCIL GOES IN THE BAR, not over a wrapper around it.

    It was positioned against a `relative` div holding this component, and a
    sticky bar is `position: fixed` plus a 76px spacer — so the wrapper had no
    height of its own and the pencil landed on the spacer, in the empty strip
    below the bar. `ownerAction` puts it in the row, beside the sentence.
  */
  return (
    <SubscribeBar
      leading={leading}
      settings={merged}
      creatorId={creatorId}
      ownerAction={
        <EditCtaButton values={editor.values} onPreview={(next) => setDraft(next ? toDraft(next) : null)} />
      }
    />
  )
}

/** The editor's values in the shape the bar reads. */
function toDraft(values: CtaValues): SubscribeBarDraft {
  const label = values.buttonText.trim()
  return {
    text: values.text,
    customCtaText: values.text,
    buttonText: values.buttonText,
    buttonTextPreset: label ? "custom" : "subscribe",
    style: values.style,
    buttonStyle: values.buttonStyle,
    backgroundColor: hex(values.backgroundColor),
    textColor: hex(values.textColor),
    buttonColor: hex(values.buttonColor),
    buttonTextColor: hex(values.buttonTextColor),
  }
}
