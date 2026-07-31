"use client"

/**
 * Route changes that push and pop like a native screen stack.
 *
 * This is a thin naming layer over `screen-transition`, kept because it is what
 * the call sites already import. "enter" is a push, "back" is a pop.
 *
 * The implementation used to be the View Transitions API. It is no longer, and
 * the reason is worth keeping: where that API is missing there is no graceful
 * degradation, only the total absence of an animation — which is invisible from
 * the outside and close to impossible to diagnose from a bug report. It also
 * cannot be driven by a finger, and the edge-drag back gesture needs exactly
 * that. See lib/screen-transition.ts for how the two screens are held on screen
 * without it.
 */

import { navigateScreen, signalArrival as arrived } from "@/lib/screen-transition"

type Blend = "enter" | "back"

export function signalArrival(): void {
  arrived()
}

export function navigateBlended(kind: Blend, go: () => void): void {
  void navigateScreen(kind === "enter" ? "push" : "pop", go)
}
