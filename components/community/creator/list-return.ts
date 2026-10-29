"use client"

import { createListReturn, type ListReturnBase } from "@/components/app/list-return"

export const COMMUNITIES_HREF = "/app/community"

/**
 * Between /app/community and one community's admin (components/app/list-return.ts), as Upsells and bundles and an
 * offer's page: the card opens the community one entry after the list, and the way back is a back to that entry
 * however many sections were opened since, so the list is there as it was left: its scroll, no landing, the card
 * tinted for a moment.
 */
export const communitiesReturn = createListReturn<ListReturnBase>(COMMUNITIES_HREF)
