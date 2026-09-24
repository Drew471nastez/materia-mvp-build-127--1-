"use client"

/**
 * ===========================================================================
 *  A POP-UP IN THE CANVAS OPENS IN THE CANVAS
 * ===========================================================================
 * A section may open a menu with no script at all: `<button popovertarget>`
 * and `<div popover>`, or `<button commandfor command="show-modal">` and a
 * `<dialog>`. On a live site that is exactly right. The browser draws what
 * opens in its TOP LAYER, above the whole document, and in the builder the
 * whole document is the editor: the menu covered the bars and the panels,
 * and no containment, clip or z-index on any ancestor can stop the top layer.
 *
 * So in the canvas they never reach it. A click on such a button is taken
 * before the browser acts on it, and the element is opened in place instead:
 * a popover gets `data-sl-open`, a dialog is shown without being modal. Both
 * then sit inside the canvas frame, which contains fixed positioning
 * (app/globals.css, `.wb-canvas-frame`), so a full-screen menu fills the
 * canvas the way it fills a phone. The section compiler widens a section's
 * `:popover-open` and `:modal` to match `data-sl-open`
 * (lib/storelib-theme/storelib/css.ts), so its own open styles apply.
 *
 * What the browser does for a real popover is done here as well: a click
 * outside it or Escape closes it, and opening one closes the others that are
 * not its parents. If anything opens one some other way, `beforetoggle` is
 * cancelled and it is opened in place.
 *
 * Mounted once by the editor. It touches nothing outside `.wb-canvas-frame`.
 */
import { useEffect } from "react"

const FRAME = ".wb-canvas-frame"
const OPEN = "data-sl-open"

function frameOf(node: EventTarget | null): Element | null {
  return node instanceof Element ? node.closest(FRAME) : null
}

function byId(frame: Element, id: string | null): HTMLElement | null {
  if (!id) return null
  return frame.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
}

function isAuto(el: Element): boolean {
  if (el instanceof HTMLDialogElement) return false
  const kind = (el.getAttribute("popover") ?? "").toLowerCase()
  return kind !== "manual"
}

function setOpen(el: HTMLElement, open: boolean) {
  if (el instanceof HTMLDialogElement) {
    if (open && !el.open) el.show()
    if (!open && el.open) el.close()
  }
  el.toggleAttribute(OPEN, open)
  const frame = el.closest(FRAME)
  if (!frame || !el.id) return
  frame
    .querySelectorAll(`[popovertarget="${CSS.escape(el.id)}"], [commandfor="${CSS.escape(el.id)}"]`)
    .forEach((b) => b.setAttribute("aria-expanded", String(open)))
}

/** Opening one closes the others that are not its parents, as the browser does. */
function closeOthers(frame: Element, keep: HTMLElement) {
  frame.querySelectorAll<HTMLElement>(`[${OPEN}]`).forEach((el) => {
    if (el !== keep && isAuto(el) && !el.contains(keep)) setOpen(el, false)
  })
}

const COMMANDS: Record<string, (open: boolean) => boolean> = {
  "show-modal": () => true,
  "show-popover": () => true,
  "toggle-popover": (open) => !open,
  "hide-popover": () => false,
  close: () => false,
  "request-close": () => false,
}

export function CanvasTopLayerGuard() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const frame = frameOf(e.target)
      if (!frame) return
      const t = e.target as Element

      const invoker = t.closest("[popovertarget], [commandfor]")
      if (invoker && frame.contains(invoker)) {
        const viaPopover = invoker.hasAttribute("popovertarget")
        const el = byId(frame, invoker.getAttribute(viaPopover ? "popovertarget" : "commandfor"))
        if (!el) return
        const was = el.hasAttribute(OPEN)
        let next: boolean
        if (viaPopover) {
          const action = (invoker.getAttribute("popovertargetaction") ?? "toggle").toLowerCase()
          next = action === "show" ? true : action === "hide" ? false : !was
        } else {
          const command = COMMANDS[(invoker.getAttribute("command") ?? "").toLowerCase()]
          if (!command) return
          next = command(was)
        }
        /* Cancelling the click cancels the button's own action, which is
           what would have put the element in the top layer. */
        e.preventDefault()
        if (next) closeOthers(frame, el)
        setOpen(el, next)
      }
    }

    /* A press outside an open pop-up closes it, anywhere on the screen. */
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target instanceof Element ? e.target : null
      document.querySelectorAll<HTMLElement>(`${FRAME} [${OPEN}]`).forEach((el) => {
        if (!isAuto(el) || (t && el.contains(t))) return
        const invoker = t?.closest("[popovertarget], [commandfor]")
        if (invoker && (invoker.getAttribute("popovertarget") ?? invoker.getAttribute("commandfor")) === el.id) return
        setOpen(el, false)
      })
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      const open = Array.from(document.querySelectorAll<HTMLElement>(`${FRAME} [${OPEN}]`))
      const last = open[open.length - 1]
      if (!last) return
      setOpen(last, false)
      e.stopPropagation()
    }

    /* Whatever else tries to open one in the canvas, it opens in place. */
    const onBeforeToggle = (e: Event) => {
      const el = e.target
      if (!(el instanceof HTMLElement) || !el.hasAttribute("popover") || !frameOf(el)) return
      if ((e as Event & { newState?: string }).newState !== "open") return
      e.preventDefault()
      setOpen(el, true)
    }

    document.addEventListener("click", onClick, true)
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("keydown", onKeyDown, true)
    document.addEventListener("beforetoggle", onBeforeToggle, true)
    return () => {
      document.removeEventListener("click", onClick, true)
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("keydown", onKeyDown, true)
      document.removeEventListener("beforetoggle", onBeforeToggle, true)
    }
  }, [])
  return null
}
