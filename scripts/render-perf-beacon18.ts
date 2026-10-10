/**
 * The real collector (lib/perf/beacon-client.ts) on a bare page, for
 * scripts/check-perf-health18.mjs: sendBeacon is replaced by a recorder so
 * the probe can read exactly what would have been sent.
 */
import { startPerfBeacon } from "@/lib/perf/beacon-client"

const sent: string[] = []
;(window as unknown as { __sent: string[] }).__sent = sent
Object.defineProperty(navigator, "sendBeacon", { value: (_url: string, body: Blob) => (void body.text().then((t) => sent.push(t)), true) })
;(window as unknown as { __start: () => void }).__start = startPerfBeacon
