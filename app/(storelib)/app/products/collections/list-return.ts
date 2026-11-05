"use client"

import { createListReturn, type ListReturnBase } from "@/components/app/list-return"
import type { Collection } from "./collection-parts"

/** What a collection's page hands back to the list: the store's collections as saved, or the id that is gone. */
export type CollectionReturn = ListReturnBase & { collections?: Collection[] | null }

export const COLLECTIONS_LIST_HREF = "/app/products/collections"

/** Between Products › Collections and a collection's own page (components/app/list-return.ts), as Size charts does. */
export const collectionsReturn = createListReturn<CollectionReturn>(COLLECTIONS_LIST_HREF)

export const newCollectionHref = () => `${COLLECTIONS_LIST_HREF}/new`
export const collectionHref = (id: string) => `${COLLECTIONS_LIST_HREF}/${encodeURIComponent(id)}`
