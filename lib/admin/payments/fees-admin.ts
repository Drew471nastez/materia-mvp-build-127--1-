import "server-only"

import { clearActiveFeeConfigCache, getDraftFeeVersion, listFeeVersions, loadActiveFeeConfig } from "@/lib/payments/fees/active"
import { codeDefaultFeeConfig } from "@/lib/payments/fees/defaults"
import type { StorelibFeeConfig } from "@/lib/payments/fees/types"
import { feeConfigWarnings, validateFeeConfig } from "@/lib/payments/fees/validate"

import { recordPaymentsAdminAudit } from "./audit"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export async function getFeesAdminState(db: Db) {
  const active = await loadActiveFeeConfig(db)
  const versions = await listFeeVersions(db, 15)
  const draft = await getDraftFeeVersion(db)
  return {
    active: active.config,
    activeSource: active.source,
    draft: draft ? { id: draft.id, versionKey: draft.version_key, config: draft.config, createdAt: draft.created_at } : null,
    versions:
      versions?.map((v) => ({
        id: v.id,
        versionKey: v.version_key,
        status: v.status,
        effectiveAt: v.effective_at,
        createdAt: v.created_at,
        createdBy: v.created_by,
        summary: v.change_summary,
      })) ?? null,
    tableReady: versions !== null,
  }
}

export async function saveFeeDraft(db: Db, config: StorelibFeeConfig, summary?: string) {
  const issues = validateFeeConfig(config)
  if (issues.length) return { ok: false as const, issues }

  const existingDraft = await getDraftFeeVersion(db)
  const row = {
    version_key: config.versionKey,
    status: "draft",
    config,
    change_summary: summary ?? null,
    created_by: "admin session",
  }

  if (existingDraft) {
    const { error } = await db.from("storelib_fee_rule_versions").update(row).eq("id", existingDraft.id)
    if (error) return { ok: false as const, error: "Could not save draft." }
  } else {
    const { error } = await db.from("storelib_fee_rule_versions").insert(row)
    if (error) return { ok: false as const, error: "Could not create draft." }
  }

  await recordPaymentsAdminAudit(db, {
    action: "fee_configuration_draft_saved",
    after: { versionKey: config.versionKey, summary },
  })

  return { ok: true as const, warnings: feeConfigWarnings(config) }
}

export async function activateFeeVersion(db: Db, versionId: string, effectiveAt?: string) {
  const { data: target, error: readErr } = await db
    .from("storelib_fee_rule_versions")
    .select("id, version_key, status, config")
    .eq("id", versionId)
    .maybeSingle()
  if (readErr || !target) return { ok: false as const, error: "Version not found." }

  const config = target.config as StorelibFeeConfig
  const issues = validateFeeConfig({ ...config, versionKey: target.version_key })
  if (issues.length) return { ok: false as const, issues }

  const { data: prev } = await db.from("storelib_fee_rule_versions").select("id, version_key, config").eq("status", "active").maybeSingle()

  await db.from("storelib_fee_rule_versions").update({ status: "retired" }).eq("status", "active")
  const effective = effectiveAt ?? new Date().toISOString()
  const { error: upErr } = await db
    .from("storelib_fee_rule_versions")
    .update({ status: "active", effective_at: effective, config: { ...config, versionKey: target.version_key } })
    .eq("id", versionId)
  if (upErr) return { ok: false as const, error: "Activation failed." }

  clearActiveFeeConfigCache()
  await recordPaymentsAdminAudit(db, {
    action: "fee_configuration_activated",
    before: prev ? { versionKey: prev.version_key } : { versionKey: codeDefaultFeeConfig().versionKey },
    after: { versionKey: target.version_key, effectiveAt: effective },
  })

  return { ok: true as const, warnings: feeConfigWarnings(config) }
}

export async function activateFeeDraft(db: Db, effectiveAt?: string) {
  const draft = await getDraftFeeVersion(db)
  if (!draft) return { ok: false as const, error: "No draft to activate." }
  return activateFeeVersion(db, draft.id, effectiveAt)
}
