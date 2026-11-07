"use client"
/**
 * What happens on the page when a button with an action is pressed
 * (lib/forms/actions). The button stays an ordinary link to the action's
 * address, so it works without JavaScript and keeps its click count; this
 * frame takes the press first for the actions that open something here:
 *
 *   a form, a quiz or a booking form   the form, in a dialog on the page
 *   a chat with a pre-chat form        the form first; its answers fill the
 *                                      message, then the chat opens
 *   a product                          its details sheet, unless the creator
 *                                      chose to go straight to checkout
 *
 * Everything it opens is loaded on that press, so a page without such a
 * button loads none of it.
 */
import { lazy, Suspense, useState, type ReactNode } from "react"
import { isOnePagePreview } from "@/lib/onepage/preview-notice"
import { actionFormId, actionHref, formVars, type ActionVars, type NativeAction } from "@/lib/forms/actions"

const FormDialog = lazy(() => import("./form-dialog"))
const ProductSheet = lazy(() => import("@/components/onepage/product-sheet").then((m) => ({ default: m.ProductSheet })))

type Source = "onepage" | "website" | "creator_page"

export function NativeActionFrame({
  action,
  children,
  source = "onepage",
  preview = false,
  vars,
}: {
  preview?: boolean
  action?: NativeAction | null
  children: ReactNode
  source?: Source
  /** What the message's variables mean on this block (lib/onepage/block-action blockActionVars). */
  vars?: ActionVars
}) {
  const [open, setOpen] = useState<"form" | "product" | null>(null)
  /* The sheet stays mounted once opened, so closing it slides it away instead of cutting it off. */
  const [sheetMounted, setSheetMounted] = useState(false)
  const formId = actionFormId(action)
  const chat = action?.type === "whatsapp" || action?.type === "telegram"
  const product = action?.type === "product" && (action as { open?: string }).open !== "checkout" ? (action as Extract<NativeAction, { type: "product" }>) : null
  if (!formId && !product) return <>{children}</>
  const inPreview = preview || isOnePagePreview()
  return (
    <>
      <div
        onClickCapture={(e) => {
          if (!(e.target as Element).closest("a")) return
          e.preventDefault()
          if (!formId) setSheetMounted(true)
          setOpen(formId ? "form" : "product")
        }}
      >
        {children}
      </div>
      {open === "form" && formId ? (
        <Suspense fallback={null}>
          <FormDialog
            onClose={() => setOpen(null)}
            formId={formId}
            source={source}
            preview={inPreview}
            onSubmitted={
              chat
                ? (answers, fields) => {
                    /* The chat, with the answers in its message. The preview never leaves the editor. */
                    const href = actionHref(action, { ...vars, ...formVars(fields, answers) })
                    setOpen(null)
                    if (href && !inPreview) window.location.assign(href)
                  }
                : undefined
            }
          />
        </Suspense>
      ) : null}
      {product && sheetMounted ? (
        <Suspense fallback={null}>
          <ProductSheet
              open={open === "product"}
              onClose={() => setOpen(null)}
              productId={product.product_id}
              title={product.title || ""}
              image={product.image || null}
              ctaText="Buy now"
              instant={false}
              onBuy={() => {
                const href = actionHref({ ...product, open: "checkout" })
                if (href && !inPreview) window.location.assign(href)
              }}
            />
        </Suspense>
      ) : null}
    </>
  )
}
