/** What lib/perf/infra.ts answers, importable by the page without server code. */

export type SupabaseInfo =
  | { configured: false }
  | { configured: true; ok: false; reason: string }
  | {
      configured: true
      ok: true
      services: { name: string; healthy: boolean }[]
      down: number
      requests: { rest: number; auth: number; storage: number; realtime: number } | null
    }

export type VercelInfo =
  | { configured: false }
  | { configured: true; ok: false; reason: string }
  | { configured: true; ok: true; total: number; failed: number; medianBuildMs: number | null; latest: { state: string; createdAt: string } | null }
