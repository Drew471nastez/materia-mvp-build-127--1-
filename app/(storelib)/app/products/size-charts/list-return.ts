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
