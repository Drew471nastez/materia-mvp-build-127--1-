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
 *   a product                          its details sheet (the full product,
 *                                      read by the sheet), and Buy goes on
 *                                      through the product block's own steps
 *                                      (lib/onepage/purchase-flow): the sheet
 *                                      leaves, then the in-page checkout
 *                                      opens where the product has instant
 *                                      checkout on, else its checkout page
 *
 * Everything it opens is loaded on that press, so a page without such a
 * button loads none of it.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { isOnePagePreview } from "@/lib/onepage/preview-notice"
import { actionFormId, actionHref, formVars, type ActionVars, type NativeAction } from "@/lib/forms/actions"
import { HANDOFF_MAX_MS, PURCHASE_CLOSED, purchaseStep, sheetShown, type PurchaseLayer, type PurchaseStep } from "@/lib/onepage/purchase-flow"
import { pageOrigin } from "@/lib/orders/checkout-origin-browser"

const FormDialog = lazy(() => import("./form-dialog"))
const ProductSheet = lazy(() => import("@/components/onepage/product-sheet").then((m) => ({ default: m.ProductSheet })))
const InstantCheckout = lazy(() => import("@/components/checkout/instant-checkout").then((m) => ({ default: m.InstantCheckout })))

type Source = "onepage" | "website" | "creator_page"

export function NativeActionFrame({
  action,
  children,
  source = "onepage",
  preview = false,
  vars,
  sourceBlock,
  dark = false,
  seller,
}: {
  preview?: boolean
  action?: NativeAction | null
  children: ReactNode
  source?: Source
  /** What the message's variables mean on this block (lib/onepage/block-action blockActionVars). */
  vars?: ActionVars
  /** The block or section title, kept with a lead as where it came from. */
  sourceBlock?: string
  /** The page behind is dark: the checkout window follows it. */
  dark?: boolean
  /** Who sells, for the checkout's head when the product has no picture. */
  seller?: { name?: string | null; avatarUrl?: string | null } | null
}) {
  const [formOpen, setFormOpen] = useState(false)
  /* The product's windows: one state, the product block's own steps. */
  const [layer, setLayer] = useState<PurchaseLayer>(PURCHASE_CLOSED)
  const step = useCallback((s: PurchaseStep) => setLayer((was) => purchaseStep(was, s)), [])
  /* The sheet stays mounted once opened, so closing it slides it away instead of cutting it off. */
  const [sheetMounted, setSheetMounted] = useState(false)
  const trigger = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (layer.kind !== "handoff") return
    const t = window.setTimeout(() => step({ type: "too-long" }), HANDOFF_MAX_MS)
    return () => window.clearTimeout(t)
  }, [layer.kind, step])

  const formId = actionFormId(action)
  const chat = action?.type === "whatsapp" || action?.type === "telegram"
  /* "Checkout" stays the link to the checkout page, which knows a product that ships from one that does not. */
  const product = action?.type === "product" && (action as { open?: string }).open !== "checkout" ? (action as Extract<NativeAction, { type: "product" }>) : null
  if (!formId && !product) return <>{children}</>
  const inPreview = preview || isOnePagePreview()
  const checkout = layer.kind === "checkout" ? layer : null
  return (
    <>
      <div
        onClickCapture={(e) => {
          const link = (e.target as Element).closest("a")
          if (!link) return
          e.preventDefault()
          trigger.current = link
          if (formId) return setFormOpen(true)
          setSheetMounted(true)
          step({ type: "open" })
        }}
      >
        {children}
      </div>
      {formOpen && formId ? (
        <Suspense fallback={null}>
          <FormDialog
            onClose={() => setFormOpen(false)}
            formId={formId}
            source={source}
            preview={inPreview}
            sourceBlock={sourceBlock}
            onSubmitted={
              chat
                ? (answers, fields) => {
                    /* The chat, with the answers in its message. The preview never leaves the editor. */
                    const href = actionHref(action, { ...vars, ...formVars(fields, answers) })
                    setFormOpen(false)
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
            open={sheetShown(layer)}
            onClose={() => step({ type: "close" })}
            productId={product.product_id}
            title={product.title || ""}
            image={product.image || null}
            ctaText="Buy now"
            /* The sheet itself checks the product's facts: Buy opens the checkout here only for a product with instant checkout on that does not ship; otherwise it is the checkout page's link. */
            instant
            onBuy={(variantId) => step({ type: "buy", variantId })}
            onClosed={() => step({ type: "sheet-gone" })}
          />
        </Suspense>
      ) : null}
      {product && checkout ? (
        <Suspense fallback={null}>
          <InstantCheckout
            productId={product.product_id}
            title={product.title || ""}
            productImage={product.image || null}
            sellerName={seller?.name ?? null}
            sellerAvatar={seller?.avatarUrl ?? null}
            variantId={checkout.variantId}
            dark={dark}
            themed
            origin={pageOrigin}
            onClose={() => step({ type: "close" })}
            onBack={checkout.fromSheet ? () => step({ type: "back" }) : null}
            returnFocus={() => trigger.current}
          />
        </Suspense>
      ) : null}
    </>
  )
}
