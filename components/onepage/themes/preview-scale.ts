"use client"

import type * as React from "react"
import { useLayoutEffect } from "react"
import { SWATCH_WIDTH } from "./theme-swatch"

/**
 * ONE SCALE FOR A WHOLE GRID OF CARDS (round AQ: the Design tab's theme grid
 * and the onboarding's template step). Every card in a grid is the same
 * width, so one frame (`frame`, a selector inside the grid) is measured, once
 * and again only when the grid's width changes, and the scale is one custom
 * property on the grid that every card's page reads. Returns the cleanup.
 */
export function scaleThemePreviews(grid: HTMLElement, frame: string): () => void {
  let last = 0
  const measure = () => {
    const w = grid.querySelector<HTMLElement>(frame)?.clientWidth ?? 0
    if (!w || w === last) return
    last = w
    grid.style.setProperty("--tp-scale", String(w / SWATCH_WIDTH))
  }
  measure()
  if (typeof ResizeObserver !== "function") return () => {}
  const ro = new ResizeObserver(measure)
  ro.observe(grid)
  return () => ro.disconnect()
}

/** scaleThemePreviews for a grid held in a ref that is set before the effect runs (the Design tab). */
export function useThemePreviewScale(gridRef: React.RefObject<HTMLElement | null>, frame: string) {
  useLayoutEffect(() => {
    const grid = gridRef.current
    return grid ? scaleThemePreviews(grid, frame) : undefined
  }, [gridRef, frame])
}
