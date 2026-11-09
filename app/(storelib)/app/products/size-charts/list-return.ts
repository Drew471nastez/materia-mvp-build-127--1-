"use client"

import { createListReturn, type ListReturnBase } from "@/components/app/list-return"
import type { SavedSizeChart } from "@/components/physical/size-chart-editor"

/** What a chart's page hands back to the list: the store's charts as saved, or the id that is gone. */
export type SizeChartReturn = ListReturnBase & { charts?: SavedSizeChart[] | null }

export const SIZE_CHARTS_LIST_HREF = "/app/products/size-charts"

/** Between Products › Size charts and a chart's own page (components/app/list-return.ts). */
export const sizeChartsReturn = createListReturn<SizeChartReturn>(SIZE_CHARTS_LIST_HREF)

export const newSizeChartHref = () => `${SIZE_CHARTS_LIST_HREF}/new`
export const sizeChartHref = (id: string) => `${SIZE_CHARTS_LIST_HREF}/${encodeURIComponent(id)}`

/** In use: a product has it, or it is set for a collection or a category (round 13). Said on the list and beside a chart's name. */
export const sizeChartInUse = (c: SavedSizeChart) => c.productCount > 0 || (c.collectionIds?.length ?? 0) > 0 || (c.categories?.length ?? 0) > 0
