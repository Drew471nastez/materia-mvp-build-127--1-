// Bundle canonical SQL with the deployment, never the schema snapshot or duplicate bundles.
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"

const root = "supabase/sql/run-now/"
const dates = new Map()
try {
  let shallow = new Set()
  try { shallow = new Set(readFileSync(execFileSync("git", ["rev-parse", "--git-path", "shallow"], { encoding: "utf8" }).trim(), "utf8").trim().split("\n")) } catch { /* Full clone. */ }
  const history = execFileSync("git", ["log", "--format=@%H|%cI", "--name-only", "--", root], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  let date = null
  for (const line of history.split("\n")) {
    if (line.startsWith("@")) { const [sha, timestamp] = line.slice(1).split("|"); date = shallow.has(sha) ? null : timestamp }
    else if (date && line.startsWith(root) && !dates.has(line)) dates.set(line, date)
  }
} catch { /* Source archives have no Git history. Dates stay explicitly unavailable. */ }
const catalog = readdirSync(root).filter(f => f.endsWith(".sql")).map(file => {
  const bytes = readFileSync(root + file)
  const sql = bytes.toString("utf8")
  if (!Buffer.from(sql).equals(bytes)) throw new Error(`SQL must be UTF-8: ${file}`)
  const part = file.match(/^(\d+)_/)?.[1] ?? null
  // 91 has two different files in the repository. Never let their ledger keys collide.
  const id = part === "91" ? file.slice(0, -4) : part ?? file.slice(0, -4)
  // Part 61 contains the slow historical page-view backfill. Never hold checkout
  // locks from other parts while it runs (the existing bundles also isolate it).
  const manual = !part || ["00", "61", "90", "99"].includes(part) || file === "91_storage_policies_to_remove.sql"
  return { id, file, sql, sha256: createHash("sha256").update(bytes).digest("hex"), updatedAt: dates.get(root + file) ?? null, manual }
}).sort((a, b) => (Number.parseInt(a.id) || 0) - (Number.parseInt(b.id) || 0) || a.file.localeCompare(b.file))
if (new Set(catalog.map(row => row.id)).size !== catalog.length) throw new Error("Duplicate SQL ledger identifiers. Assign distinct IDs before deployment.")
writeFileSync("lib/admin/sql-catalog.generated.json", JSON.stringify(catalog) + "\n")
console.log(`SQL catalog: ${catalog.length} canonical files`)
