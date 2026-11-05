"use client"

import { createListReturn, type ListReturnBase } from "@/components/app/list-return"
import type { Offer } from "@/lib/offers/offers"

/** What an offer's page hands back to the list: the row as saved, or the id that is gone. */
export type OfferReturn = ListReturnBase & { saved?: Offer | null }

export const OFFERS_HREF = "/app/offers"

/** Between Upsells and bundles and an offer's own page (components/app/list-return.ts). */
export const offersReturn = createListReturn<OfferReturn>(OFFERS_HREF)

/** A new offer's address, starting on a kind. */
export const newOfferHref = (kind?: string) => (kind ? `${OFFERS_HREF}/new?kind=${encodeURIComponent(kind)}` : `${OFFERS_HREF}/new`)
export const offerHref = (id: string) => `${OFFERS_HREF}/${encodeURIComponent(id)}`
