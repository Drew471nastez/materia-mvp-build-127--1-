/**
 * THE ANALYTICS PAGE WITH THE SHELL'S PARTS AND FOUR KINDS OF DIALOG.
 *
 * scripts/render-analytics-page.tsx draws the real AnalyticsClient (about
 * 1,400 elements, the page behind every dialog here). Over it, in a root of
 * its own: the pill's shape ([data-app-nav-pill] with its tap parts) and the
 * cookie card's ([data-cookie-banner]), which are what the shell's
 * dialog rules style, and buttons that open
 *
 *   [data-open="dialog"]   the shared Radix Dialog (components/ui/dialog), as
 *                          the settings dialogs use it: a title, three fields,
 *                          two buttons
 *   [data-open="custom"]   a hand-made modal (role=dialog aria-modal=true), as
 *                          fifty-odd screens in /app draw theirs
 *   [data-open="nested"]   the hand-made one with a second one over it
 *   [data-open="menu"]     the products page's ... menu: the shared action
 *                          sheet on a phone (components/ui/responsive-action-menu)
 *
 * The watch that keeps `data-modal-open` on <html> (lib/ui/modal-open) is
 * held here as the pill holds it in the app; under a checkout that has none
 * scripts/check-dialogs-r49.mjs points the import at a stand-in that does nothing.
 *
 * scripts/check-dialogs-r49.mjs drives it.
 */
import "./render-analytics-page"
import React from "react"
import { createRoot } from "react-dom/client"
import { MoreHorizontal } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { holdModalWatch } from "@/lib/ui/modal-open"

const field = "h-10 w-full rounded-xl border border-[#e5e7eb] px-3 text-[14px]"

function Custom({ onClose, z = 100, children }: { onClose: () => void; z?: number; children?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex items-end justify-center p-4 sm:items-center" style={{ zIndex: z }} role="dialog" aria-modal="true" aria-label="Coupon" data-probe-custom="">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[440px] rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-[17px] font-semibold">New coupon</h2>
        <div className="mt-4 space-y-3">
          <input className={field} defaultValue="SPRING" />
          <input className={field} defaultValue="15" />
        </div>
        {children}
        <button type="button" className="mt-5 h-10 rounded-xl bg-[#1a1a2e] px-4 text-white" onClick={onClose}>Save</button>
      </div>
    </div>
  )
}

function Probe() {
  const [open, setOpen] = React.useState<null | "dialog" | "custom" | "nested">(null)
  const [inner, setInner] = React.useState(false)
  React.useEffect(() => holdModalWatch(), [])
  const items = [
    { label: "Edit", onClick: () => {} },
    { label: "Duplicate", onClick: () => {} },
    { label: "Copy link", onClick: () => {} },
    { label: "Share", onClick: () => {} },
    { label: "Delete", onClick: () => {}, variant: "destructive" as const, separatorBefore: true },
  ]
  return (
    <>
      <div data-probe-bar="" className="fixed right-2 top-2 z-[30] flex gap-1">
        <button type="button" data-open="dialog" className="h-8 rounded bg-white px-2 text-[12px]" onClick={() => setOpen("dialog")}>Dialog</button>
        <button type="button" data-open="custom" className="h-8 rounded bg-white px-2 text-[12px]" onClick={() => setOpen("custom")}>Custom</button>
        <button type="button" data-open="nested" className="h-8 rounded bg-white px-2 text-[12px]" onClick={() => { setOpen("nested"); setInner(false) }}>Nested</button>
        <ResponsiveActionMenu title="Product" items={items} trigger={<button type="button" data-open="menu" aria-label="More" className="h-8 w-8 rounded bg-white"><MoreHorizontal className="mx-auto h-4 w-4" /></button>} />
      </div>
      <div data-app-nav-pill="" className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex justify-center pb-4 md:hidden">
        <div className="pointer-events-auto flex h-14 items-center gap-6 rounded-full bg-white px-6 shadow-lg">
          {["Home", "Orders", "Products", "Analytics"].map((t) => <a key={t} href="#">{t}</a>)}
        </div>
      </div>
      <div data-cookie-banner="" className="pointer-events-none fixed bottom-0 left-0 z-[9999] p-4">
        <section className="pointer-events-auto rounded-2xl bg-white p-4 shadow">Cookies</section>
      </div>
      <Dialog open={open === "dialog"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent data-probe-radix="">
          <DialogHeader>
            <DialogTitle>Store details</DialogTitle>
            <DialogDescription>What buyers see on receipts.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input className={field} defaultValue="Studio" />
            <input className={field} defaultValue="hello@example.com" />
            <input className={field} defaultValue="Bucharest" />
          </div>
          <DialogFooter>
            <button type="button" className="h-10 rounded-xl px-4" onClick={() => setOpen(null)}>Cancel</button>
            <button type="button" className="h-10 rounded-xl bg-[#1a1a2e] px-4 text-white" onClick={() => setOpen(null)}>Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {open === "custom" && <Custom onClose={() => setOpen(null)} />}
      {open === "nested" && (
        <Custom onClose={() => setOpen(null)}>
          <button type="button" data-open="inner" className="mt-3 h-9 rounded-xl border px-3" onClick={() => setInner(true)}>Pick a product</button>
          {inner && <Custom z={110} onClose={() => setInner(false)} />}
        </Custom>
      )}
    </>
  )
}

const host = document.createElement("div")
host.id = "probe-shell"
document.body.appendChild(host)
createRoot(host).render(<Probe />)
