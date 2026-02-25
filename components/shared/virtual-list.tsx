"use client"

import { useRef, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"

/**
 * Virtualized list that only renders visible rows.
 * Use for long lists of orders, products, subscribers, etc.
 *
 * Usage:
 * ```tsx
 * <VirtualList
 *   items={orders}
 *   estimateSize={72}
 *   renderItem={(order, index) => <OrderRow key={order.id} order={order} />}
 * />
 * ```
 */
export function VirtualList<T>({
  items,
  estimateSize = 64,
  overscan = 5,
  renderItem,
  className = "",
  containerHeight,
}: {
  items: T[]
  estimateSize?: number
  overscan?: number
  renderItem: (item: T, index: number) => ReactNode
  className?: string
  containerHeight?: string
}) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  })

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div
      ref={parentRef}
      className={`overflow-auto ${className}`}
      style={{ height: containerHeight || "600px" }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((virtualRow) => (
          <div
            key={virtualRow.key}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualRow.start}px)`,
            }}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
          >
            {renderItem(items[virtualRow.index], virtualRow.index)}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Virtualized table body for use within Table components.
 * Wraps TableBody with virtualization.
 */
export function VirtualTableBody<T>({
  items,
  estimateSize = 52,
  overscan = 10,
  renderRow,
  containerHeight = "500px",
}: {
  items: T[]
  estimateSize?: number
  overscan?: number
  renderRow: (item: T, index: number) => ReactNode
  containerHeight?: string
}) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  })

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div
      ref={parentRef}
      className="overflow-auto"
      style={{ maxHeight: containerHeight }}
    >
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
        {virtualItems.map((virtualRow) => (
          <div
            key={virtualRow.key}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualRow.start}px)`,
            }}
            ref={virtualizer.measureElement}
            data-index={virtualRow.index}
          >
            {renderRow(items[virtualRow.index], virtualRow.index)}
          </div>
        ))}
      </div>
    </div>
  )
}
