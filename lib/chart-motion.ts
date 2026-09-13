/**
 * How long a chart line takes to become the next line.
 *
 * One number, shared by the dashboard's KPI chart and the analytics trend
 * chart, which had 900 and 750 for no reason anybody could name. Shorter than
 * either: the morph is the ONLY animation left on a metric switch now that
 * the blur-out and blur-in are gone, and a shape that takes most of a second
 * to settle is what reads as pumping.
 *
 * Its own module, tiny and with no imports, because the two charts that need
 * it must not import each other — the dashboard lazy-loads recharts on
 * purpose, and pulling the analytics chart in would load it eagerly.
 */
export const CHART_ANIM_MS = 650
