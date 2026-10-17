"use client"

/**
 * STORELIB REVIEWS › WIDGETS: the widgets gallery (round K6,
 * components/reviews/widgets/widgets-gallery.tsx), embedded in the managed
 * page: every widget with a preview from the store's own reviews, the
 * customizer, the looks the store saved, and Add to website. It reads its own
 * data (GET /api/reviews/widgets) and keeps the widget it has open in the
 * address (?widget=&config=), so the theme editor's links open it here.
 */
import * as React from "react"
import { ReviewWidgetsGallery } from "@/components/reviews/widgets/widgets-gallery"

export function ReviewsWidgetsTab() {
  return (
    <div data-reviews-widgets="gallery">
      <ReviewWidgetsGallery embedded />
    </div>
  )
}
