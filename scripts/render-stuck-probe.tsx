/**
 * Real Radix, real React, real Chromium, driven into each state the guard is
 * supposed to have an opinion about. `scripts/check-stuck-layer.mjs` bundles
 * this and reads what it leaves on the document.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import * as Dialog from "@radix-ui/react-dialog"
import { StuckLayerGuard } from "@/components/platform/stuck-layer-guard"

declare global {
  interface Window {
    mountProbe: (opts: { guard: boolean }) => void
    setDialog: (open: boolean) => void
    setScrim: (on: boolean) => void
    lockState: () => { pointerEvents: string; overflow: string; scrollLocked: boolean }
    pressTarget: (x: number, y: number) => string
  }
}

function Probe() {
  const [dialog, setDialog] = React.useState(false)
  const [scrim, setScrim] = React.useState(false)
  React.useEffect(() => {
    window.setDialog = setDialog
    window.setScrim = setScrim
  }, [])
  return (
    <>
      <button id="control" style={{ position: "fixed", inset: 0, width: "100%", height: "100%" }}>
        the page
      </button>
      {/**
        * A scrim the editor really has: `.wb-leaving` is fixed, full screen,
        * and blocks on purpose for the moment between pressing Back and the
        * next page arriving. Here it is transparent and left up, which is
        * what happens when the thing that was going to take it away does not
        * run.
        */}
      {scrim && (
        <div
          className="wb-leaving"
          aria-hidden="true"
          style={{ position: "fixed", inset: 0, zIndex: 300, opacity: 0, background: "#000" }}
        />
      )}
      <Dialog.Root open={dialog} modal>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content aria-describedby={undefined}>
            <Dialog.Title>Project settings</Dialog.Title>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

window.mountProbe = ({ guard }) => {
  createRoot(document.getElementById("app")!).render(
    <>
      <Probe />
      {guard ? <StuckLayerGuard /> : null}
    </>,
  )
}

window.lockState = () => ({
  pointerEvents: document.body.style.pointerEvents,
  overflow: document.body.style.overflow,
  scrollLocked: document.body.hasAttribute("data-scroll-locked"),
})

/** What a press at this point would actually reach. */
window.pressTarget = (x, y) => {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  if (!el) return "(nothing)"
  document.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, bubbles: true }))
  const after = document.elementFromPoint(x, y) as HTMLElement | null
  return after ? (after.id || after.className || after.tagName).toString() : "(nothing)"
}
