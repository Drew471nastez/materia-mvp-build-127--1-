/**
 * The same dashboard scripts/render-dashboard-scroll.tsx mounts, plus the pull
 * to refresh module hung off `window` so scripts/check-pull-refresh.mjs can
 * read the gesture's own numbers out of the code under test rather than
 * restating them.
 *
 * The module is absent on an older checkout, which is the point: the probe
 * then reports the old curve from what it measures instead.
 */
import "./render-dashboard-scroll"
import * as ptr from "@/hooks/use-pull-to-refresh"

;(window as unknown as { __ptr?: unknown }).__ptr = ptr
