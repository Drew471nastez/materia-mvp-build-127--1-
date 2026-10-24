"use client"

/**
 * ===========================================================================
 *  THE PAGE'S SIDE OF THE SECTION SANDBOX
 * ===========================================================================
 * One `<iframe sandbox="allow-scripts">` for the whole page, and every
 * section that has a `<script>` registers with it. The frame has an opaque
 * origin, so what runs in it cannot read the visitor's Storelib session,
 * their cart, their storage, or this document. It sends back small changes;
 * this applies the ones lib/storelib-theme/sandbox/protocol.ts allows, to
 * the one section that asked for them and nothing else.
 *
 * WHY A COPY AND NOT THE REAL NODE. A script cannot be handed the page's own
 * elements, because handing an element across means handing over the window
 * it belongs to, and with it everything above. So the script gets its own
 * copy of its own markup, in its own document, and this mirrors the result.
 *
 * WHAT DOES NOT CROSS, and the docs say so plainly:
 *   - adding or removing elements. React owns this tree; a script that could
 *     delete a node from under it would crash the page on the next render.
 *     A section shows and hides what its template already drew;
 *   - measurements. The copy has no layout, so a script cannot read a real
 *     width. CSS does that better anyway;
 *   - anything that loads: no src, no href, no innerHTML. See ATTR_ALLOWED.
 */
import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  EVENTS_FORWARDED,
  INDEX_ATTR,
  SANDBOX_LIMITS,
  acceptNavigation,
  acceptPatch,
  type GuestMessage,
  type HostMessage,
  type Patch,
} from "@/lib/storelib-theme/sandbox/protocol"
import { GUEST_SOURCE } from "@/lib/storelib-theme/sandbox/guest-source"
import { ownDatabase } from "@/lib/website-builder/own-database"

export interface SandboxSection {
  id: string
  html: string
  bundle: string
  settings: Record<string, unknown>
  blocks: unknown[]
  theme: Record<string, unknown>
  page: Record<string, unknown>
  capabilities: string[]
}

interface SandboxApi {
  /** Registers a section's root element and script. Returns an unregister. */
  register: (section: SandboxSection, root: HTMLElement) => () => void
}

const Ctx = createContext<SandboxApi | null>(null)

/** The same walk the guest does, so an index means the same element in both. */
function elementsOf(root: HTMLElement): HTMLElement[] {
  return [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]
}

function applyPatch(nodes: HTMLElement[], patch: Patch): void {
  const el = nodes[patch.i]
  if (!el) return
  if (patch.k === "attr") {
    if (patch.v === null) el.removeAttribute(patch.n)
    else el.setAttribute(patch.n, patch.v)
    return
  }
  if (patch.k === "text") {
    /* textContent, never innerHTML: a script cannot introduce an element. */
    el.textContent = patch.v
    return
  }
  if (patch.k === "style") {
    if (patch.v === "") el.style.removeProperty(patch.n)
    else el.style.setProperty(patch.n, patch.v)
    return
  }
  if (patch.k === "scroll") {
    el.scrollTo({
      left: patch.left ?? el.scrollLeft,
      top: patch.top ?? el.scrollTop,
      behavior: patch.smooth ? "smooth" : "auto",
    })
  }
}

/**
 * Mounted once by ThemePage, around a whole storefront page or canvas.
 *
 * The frame is created only when a section actually has a script, so a site
 * without one pays nothing at all: no frame, no listeners, no bytes.
 */
export function SectionSandboxProvider({
  children,
  enabled = true,
  inEditor = false,
}: {
  children: ReactNode
  enabled?: boolean
  /** The builder's canvas, so a script can tell designing from visiting. */
  inEditor?: boolean
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [needed, setNeeded] = useState(false)
  const ready = useRef(false)
  const pending = useRef<HostMessage[]>([])
  /** Registered sections, by id: their root, their node list, their cleanup. */
  const live = useRef(
    new Map<string, { root: HTMLElement; nodes: HTMLElement[]; capabilities: string[]; detach: () => void }>(),
  )
  /** Read inside the message handler, which is set up once. */
  const inEditorRef = useRef(inEditor)
  inEditorRef.current = inEditor

  const send = useCallback((msg: HostMessage) => {
    const win = frameRef.current?.contentWindow
    if (!ready.current || !win) {
      pending.current.push(msg)
      return
    }
    win.postMessage(msg, "*")
  }, [])

  useEffect(() => {
    if (!needed || !enabled) return
    const onMessage = (event: MessageEvent) => {
      /**
       * THE FRAME IS THE ONLY SENDER WE LISTEN TO.
       *
       * Its origin is opaque ("null"), which is not a thing to compare
       * against, so the check is the window itself: any other window on the
       * page, or an ad, or another frame, is ignored.
       */
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return
      const msg = event.data as GuestMessage
      if (!msg || typeof msg !== "object") return

      if (msg.k === "ready") {
        ready.current = true
        const queued = pending.current.splice(0)
        for (const m of queued) frameRef.current.contentWindow?.postMessage(m, "*")
        return
      }
      if (msg.k === "patch") {
        const entry = live.current.get(String(msg.id))
        if (!entry) return
        const patches = Array.isArray(msg.patches) ? msg.patches.slice(0, SANDBOX_LIMITS.patchesPerBatch) : []
        for (const raw of patches) {
          const patch = acceptPatch(raw)
          if (patch) applyPatch(entry.nodes, patch)
        }
        return
      }
      if (msg.k === "navigate") {
        /**
         * THE PAGE'S OWN RECORD OF WHAT THE SECTION DECLARED, not the frame's
         * word for it: the capabilities came from the compiled schema when
         * the section registered. And never from the builder's canvas, which
         * does not leave the editor for a section's script.
         */
        const entry = live.current.get(String(msg.id))
        const path = acceptNavigation(msg.path)
        if (!entry || !path || inEditorRef.current) return
        if (!entry.capabilities.includes("navigation")) return
        window.location.assign(path)
        return
      }
      if (msg.k === "error") {
        /* A section's own mistake, said once, and never to a visitor as a
           broken page: the section keeps whatever it had drawn. */
        console.warn("[section script]", typeof msg.message === "string" ? msg.message.slice(0, 300) : "")
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [needed, enabled])

  const register = useCallback(
    (section: SandboxSection, root: HTMLElement) => {
      if (!enabled) return () => {}
      /* Non-urgent, so lazy sections still hydrating keep their server HTML (see site-cart). */
      startTransition(() => setNeeded(true))
      const nodes = elementsOf(root)
      /* The page's own numbering, so a patch names an element rather than
         a selector a script could widen. */
      nodes.forEach((el, i) => el.setAttribute(INDEX_ATTR, String(i)))

      const forward = (event: Event) => {
        const target = event.target as HTMLElement | null
        if (!target || !root.contains(target)) return
        const index = nodes.indexOf(target.closest(`[${INDEX_ATTR}]`) as HTMLElement)
        if (index < 0) return
        const detail: Record<string, unknown> = {}
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          detail.value = target.value.slice(0, SANDBOX_LIMITS.valueChars)
          if (target instanceof HTMLInputElement) detail.checked = target.checked
        }
        if (target instanceof HTMLDetailsElement) detail.open = target.open
        if (event instanceof KeyboardEvent) detail.key = event.key
        send({ k: "event", id: section.id, i: index, type: event.type, detail })
      }

      for (const type of EVENTS_FORWARDED) {
        root.addEventListener(type, forward, { passive: type === "scroll" || type.startsWith("touch"), capture: false })
      }
      const detach = () => {
        for (const type of EVENTS_FORWARDED) root.removeEventListener(type, forward)
      }
      live.current.set(section.id, { root, nodes, capabilities: section.capabilities, detach })

      send({
        k: "run",
        id: section.id,
        html: section.html,
        bundle: section.bundle,
        settings: section.settings,
        blocks: section.blocks,
        theme: section.theme,
        page: section.page,
        capabilities: section.capabilities,
        inEditor,
        /* Decided here, not by the section: only a declared capability and a public key get through. */
        database: section.capabilities.includes("database") ? ownDatabase(section.theme) : null,
      })

      return () => {
        const entry = live.current.get(section.id)
        entry?.detach()
        live.current.delete(section.id)
        send({ k: "stop", id: section.id })
      }
    },
    [enabled, send, inEditor],
  )

  const api = useMemo<SandboxApi>(() => ({ register }), [register])

  return (
    <Ctx.Provider value={api}>
      {children}
      {needed && enabled ? (
        <iframe
          ref={frameRef}
          title="Section scripts"
          aria-hidden
          /**
           * `allow-scripts` and NOTHING else. Without `allow-same-origin`
           * the frame's origin is opaque: no cookies, no storage, no reach
           * into this document. Adding `allow-same-origin` beside
           * `allow-scripts` would undo the whole of this file.
           */
          sandbox="allow-scripts"
          srcDoc={`<!doctype html><meta charset="utf-8"><body><script>${GUEST_SOURCE}</script></body>`}
          style={{ position: "absolute", width: 0, height: 0, border: 0, opacity: 0, pointerEvents: "none" }}
          tabIndex={-1}
        />
      ) : null}
    </Ctx.Provider>
  )
}

/**
 * Runs one section's script, if it has one. A section with no script, or a
 * page with no provider above it, does nothing and costs nothing.
 */
export function useSectionScript(section: SandboxSection | null, root: HTMLElement | null): void {
  const api = useContext(Ctx)
  useEffect(() => {
    if (!api || !section || !root || !section.bundle) return
    return api.register(section, root)
    /**
     * RESTARTED WHEN WHAT IT RUNS AGAINST CHANGES: its code, or its markup.
     * The markup is replaced wholesale when a setting changes in the canvas,
     * and a script left holding the old elements would be changing nodes
     * that are no longer on the page.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, root, section?.id, section?.bundle, section?.html])
}
