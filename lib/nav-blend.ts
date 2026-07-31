"use client"

/**
 * Thin naming layer over `screen-transition`, kept because it is what the call
 * sites already import. "enter" is a push, "back" is a pop.
 */

import { navigateScreen, signalArrival as arrived } from "@/lib/screen-transition"

type Blend = "enter" | "back"

export function signalArrival(): void {
  arrived()
}

export function navigateBlended(kind: Blend, go: () => void): void {
  void navigateScreen(kind === "enter" ? "push" : "pop", go)
}
