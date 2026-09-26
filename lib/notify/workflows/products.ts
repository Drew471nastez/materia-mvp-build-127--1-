/**
 * ===========================================================================
 *  PRODUCTS
 * ===========================================================================
 * product.first_published (database trigger on products, once per creator):
 * FIRST_PRODUCT_PUBLISHED in app and by email, and every pending product
 * reminder of the onboarding workflow is cancelled.
 *
 * product.created, product.published after the first, product.updated and
 * product.deleted plan nothing: the reminders' conditions read the products
 * again when they are due, so a product created or deleted in between is
 * seen then.
 */
import { WORKFLOWS, cancelFor, job, plan, str, type Workflow } from "./common"

export const products: Workflow = (event, ctx) => {
  if (event.name !== "product.first_published") return null
  const productId = str(event.payload.productId) ?? event.entityId ?? null
  return plan(
    [
      job("FIRST_PRODUCT_PUBLISHED", event, ctx, {
        step: "once",
        entityType: "creator",
        entityId: ctx.creatorId,
        data: { productId, productTitle: str(event.payload.productTitle) ?? str(event.payload.title) },
      }),
    ],
    cancelFor(ctx, WORKFLOWS.onboardingProduct, "first product published"),
  )
}
