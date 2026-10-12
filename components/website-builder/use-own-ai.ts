"use client"

/**
 * The creator's own AI connections, as the chat and Connections both read
 * them (GET /api/ai-keys): which sources are connected, never a key. One
 * fetch shared by every reader on the page, refreshed when something
 * changes one (`refreshOwnAi`) or the tab comes back into view, since a
 * key may have been added or removed in another tab.
 */

import { useCallback, useEffect, useState } from "react"
import { tt } from "@/lib/i18n/text"

export type OwnSource = "anthropic" | "openai"

export interface OwnKey {
  source: OwnSource
  hint: string
  connectedAt: string
  lastUsedAt: string | null
  lastError: string | null
}

export interface OwnAiState {
  keys: OwnKey[]
  /** The database has the table: false until supabase/sql/run-now/37_own_ai_keys.sql has run. */
  setUp: boolean
  loaded: boolean
}

const EMPTY: OwnAiState = { keys: [], setUp: true, loaded: false }
let shared: OwnAiState = EMPTY
let inflight: Promise<void> | null = null
const listeners = new Set<(s: OwnAiState) => void>()

function publish(next: OwnAiState) {
  shared = next
  for (const l of listeners) l(next)
}

export function acceptOwnAi(body: { keys?: OwnKey[]; setUp?: boolean }) {
  publish({ keys: Array.isArray(body.keys) ? body.keys : [], setUp: body.setUp !== false, loaded: true })
}

export function refreshOwnAi(): Promise<void> {
  if (inflight) return inflight
  inflight = fetch("/api/ai-keys", { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) return publish({ ...shared, loaded: true })
      acceptOwnAi(await res.json())
    })
    .catch(() => publish({ ...shared, loaded: true }))
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** Which of the creator's connections answers for a vendor: their own key for it, else none. */
export function ownFor(keys: OwnKey[], vendor: "anthropic" | "openai"): OwnSource | null {
  return keys.some((k) => k.source === vendor) ? vendor : null
}

export function ownLabel(source: OwnSource): string {
  return source === "anthropic" ? tt("Your Claude key") : tt("Your OpenAI key")
}

export function useOwnAi(): OwnAiState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<OwnAiState>(shared)
  useEffect(() => {
    listeners.add(setState)
    if (!shared.loaded) void refreshOwnAi()
    else setState(shared)
    const onShow = () => {
      if (document.visibilityState === "visible") void refreshOwnAi()
    }
    document.addEventListener("visibilitychange", onShow)
    return () => {
      listeners.delete(setState)
      document.removeEventListener("visibilitychange", onShow)
    }
  }, [])
  const refresh = useCallback(() => refreshOwnAi(), [])
  return { ...state, refresh }
}
