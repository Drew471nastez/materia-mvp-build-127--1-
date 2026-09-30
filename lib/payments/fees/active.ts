import "server-only"

import { codeDefaultFeeConfig, CODE_FEE_RULE_VERSION } from "./defaults"
import type { StorelibFeeConfig } from "./types"

type Row = {
  id: string
  version_key: string
  status: string
  effective_at: string
  created_at: string
  created_by: string
  config: StorelibFeeConfig
  change_summary: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

let cached: { at: number; config: StorelibFeeConfig } | null = null
const TTL_MS = 30_000

function missingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  const code = String(error?.code ?? "")
  return code === "PGRST205" || /does not exist/i.test(String(error?.message ?? ""))
}

function normalizeRow(row: Row): StorelibFeeConfig {
  const cfg = row.config
  return {
    ...cfg,
    versionKey: row.version_key || cfg.versionKey || CODE_FEE_RULE_VERSION,
  }
}

export async function loadActiveFeeConfig(db: Db): Promise<{ config: StorelibFeeConfig; source: "database" | "code" }> {
  const now = Date.now()
  if (cached && now - cached.at < TTL_MS) return { config: cached.config, source: "database" }

  try {
    const { data, error } = await db
      .from("storelib_fee_rule_versions")
      .select("id, version_key, status, effective_at, created_at, created_by, config, change_summary")
      .eq("status", "active")
      .maybeSingle()
    if (error && missingTable(error)) return { config: codeDefaultFeeConfig(), source: "code" }
    if (error || !data) return { config: codeDefaultFeeConfig(), source: "code" }
    const config = normalizeRow(data as Row)
    cached = { at: now, config }
    return { config, source: "database" }
  } catch {
    return { config: codeDefaultFeeConfig(), source: "code" }
  }
}

export function clearActiveFeeConfigCache() {
  cached = null
}

export async function listFeeVersions(db: Db, limit = 20): Promise<Row[] | null> {
  try {
    const { data, error } = await db
      .from("storelib_fee_rule_versions")
      .select("id, version_key, status, effective_at, created_at, created_by, config, change_summary")
      .order("created_at", { ascending: false })
      .limit(limit)
    if (error && missingTable(error)) return null
    if (error) return null
    return (data as Row[]) ?? []
  } catch {
    return null
  }
}

export async function getDraftFeeVersion(db: Db): Promise<Row | null> {
  try {
    const { data, error } = await db
      .from("storelib_fee_rule_versions")
      .select("id, version_key, status, effective_at, created_at, created_by, config, change_summary")
      .eq("status", "draft")
      .maybeSingle()
    if (error && missingTable(error)) return null
    if (error || !data) return null
    return data as Row
  } catch {
    return null
  }
}
