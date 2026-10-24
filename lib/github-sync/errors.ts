/**
 * ===========================================================================
 *  WHY A SYNC FAILED, IN WORDS A CREATOR CAN ACT ON
 * ===========================================================================
 * "Last sync failed" with nothing after it was the report. Every way a sync
 * goes wrong is named here once: what happened, and the one thing to do
 * about it. The card, the activity list, the commit status and the webhook
 * all say the same sentence.
 *
 * Pure. GitHub's own message is read to tell cases apart, and is never shown
 * as it is: it can name internals, and it is not written for a creator.
 */

export type SyncProblem =
  | "app-key"
  | "installation-gone"
  | "no-access"
  | "repo-missing"
  | "branch-protected"
  | "secret-blocked"
  | "workflow-permission"
  | "moved-on"
  | "rate-limited"
  | "too-large"
  | "github-down"
  | "unreachable"
  | "not-configured"
  | "unknown"

export interface Explained {
  problem: SyncProblem
  /** What happened, one sentence. */
  message: string
  /** What to do, one sentence. */
  fix: string
}

/** The pieces of a failed GitHub call this needs. GitHubError (./github.ts) has them. */
export interface FailedCall {
  status: number
  message: string
  /** Which call: "token", "ref", "write-ref", "tree", "blob", "commit", "contents", "status", "repos", "other". */
  step?: string
  /** When the hourly limit comes back, ms since the epoch. */
  resetAt?: number | null
  /** Secret types GitHub's push protection named, when it was that. */
  secrets?: string[]
  /** What the call needed, from X-Accepted-GitHub-Permissions, e.g. "contents=write". */
  permissions?: string | null
  /** The branch's rules as GitHub reported them after the refusal; null or absent when not asked. */
  protection?: { protected: boolean; rules: string[] } | null
}

/** GitHub's permission names, as its app settings page shows them. */
const PERMISSION_WORDS: Record<string, string> = {
  contents: "Contents",
  workflows: "Workflows",
  metadata: "Metadata",
  statuses: "Commit statuses",
  pull_requests: "Pull requests",
}

/** "contents=write" as "Contents: Read and write". The first one GitHub listed. */
function permissionWords(raw: string | null | undefined): string | null {
  const first = (raw ?? "").split(/[;,]/)[0]?.trim()
  const m = /^([a-z_]+)=(read|write)$/.exec(first ?? "")
  if (!m) return null
  return `${PERMISSION_WORDS[m[1]] ?? m[1].replace(/_/g, " ")}: ${m[2] === "write" ? "Read and write" : "Read"}`
}

/** A ruleset rule, in words. */
const RULE_WORDS: Record<string, string> = {
  update: "no direct pushes",
  pull_request: "changes through a pull request",
  required_status_checks: "required status checks",
  required_signatures: "signed commits",
  non_fast_forward: "no force pushes",
  required_linear_history: "linear history",
  required_deployments: "required deployments",
  merge_queue: "a merge queue",
  commit_message_pattern: "a commit message pattern",
  commit_author_email_pattern: "an author email pattern",
  committer_email_pattern: "a committer email pattern",
  file_path_restriction: "restricted file paths",
  max_file_path_length: "a path length limit",
  file_extension_restriction: "restricted file types",
  max_file_size: "a file size limit",
  workflows: "required workflows",
  code_scanning: "code scanning",
}

function clock(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`
}

export function explainFailure(e: FailedCall, ctx: { repo?: string | null; branch?: string | null } = {}): Explained {
  const repo = ctx.repo ? ctx.repo : "the repository"
  const branch = ctx.branch ? ctx.branch : "the branch"
  const said = (e.message || "").toLowerCase()

  if (e.status === 0) {
    return { problem: "unreachable", message: "Storelib could not reach GitHub.", fix: "Check GitHub's status page, then press Push again." }
  }
  if (e.status === 401) {
    if (e.step === "token") {
      return { problem: "app-key", message: "GitHub did not accept Storelib's app key.", fix: "This is on Storelib's side. Try again in a few minutes, and tell support if it keeps happening." }
    }
    return { problem: "app-key", message: "GitHub turned down Storelib's sign in for this repository.", fix: "Press Push again. If it keeps happening, disconnect GitHub and connect it again." }
  }
  if (e.status === 429 || ((e.status === 403 || e.status === 429) && /rate limit|secondary/.test(said))) {
    const when = e.resetAt && e.resetAt > Date.now() ? ` until ${clock(e.resetAt)}` : " for a few minutes"
    return { problem: "rate-limited", message: `GitHub is limiting how often Storelib can write${when}.`, fix: "Nothing is lost. Press Push after that, or keep working: the next push is synced as usual." }
  }
  if (e.step === "token" && e.status === 404) {
    return { problem: "installation-gone", message: "The Storelib app is no longer installed on your GitHub account.", fix: "Disconnect GitHub here, then connect it again." }
  }
  /*
    PUSH PROTECTION. GitHub's secret scanning turns a commit down when a file
    looks like it holds a key, and says "Repository rule violations found"
    while doing it. That is not the branch: it is checked first, so it is
    never reported as a protected one.
  */
  if ((e.secrets?.length ?? 0) > 0 || /push cannot contain secrets|secret detected|contains? (a )?secrets?|secret scanning/.test(said)) {
    const kinds = (e.secrets ?? []).map((t) => t.replace(/_/g, " ")).slice(0, 3)
    return {
      problem: "secret-blocked",
      message: `GitHub's secret scanning would not take it: it looks like it holds ${kinds.length ? `a key (${kinds.join(", ")})` : "a key or token"}.`,
      fix: "Everything else was sent, and the site still uses the file. Change it in the builder, then press Push.",
    }
  }
  if (/workflow/.test(said) && (e.status === 403 || e.status === 422 || e.status === 409)) {
    return {
      problem: "workflow-permission",
      message: `GitHub only lets an app change files in .github/workflows with the Workflows permission, and ${repo} has one in this send.`,
      fix: "Leave .github/workflows out of the theme, or accept the Workflows permission for Storelib on GitHub under Settings, Applications, Storelib.",
    }
  }
  /*
    PROTECTED, ONLY WHEN GITHUB SAYS SO. A refusal used to be read as a
    protected branch whenever it came from moving the branch, so a branch
    GitHub reports with protected: false was called protected. Now it is
    protected when GitHub's own words say "protected branch", or when the
    branch's rules were asked for after the refusal and some apply.
  */
  const rules = e.protection?.rules ?? []
  const verified = e.protection ? e.protection.protected || rules.length > 0 : null
  const saysProtected = /protected branch|branch is protected|required status check|must be made through a pull request|required review|changes must be made through/.test(said)
  const saysRules = /push declined due to repository rule|repository rule violation/.test(said)
  if (saysProtected || verified === true || (saysRules && verified === null)) {
    const which = rules.map((r) => RULE_WORDS[r] ?? r.replace(/_/g, " ")).slice(0, 3)
    return {
      problem: "branch-protected",
      message: which.length
        ? `${branch} in ${repo} has rules Storelib's commits do not meet (${which.join(", ")}).`
        : `${branch} is protected on GitHub, so Storelib cannot push to it.`,
      fix: `Let the Storelib app bypass the rule in ${repo}'s settings under Rules or Branches, or link a branch of its own, such as storelib, under Change repository.`,
    }
  }
  if (saysRules) {
    /* GitHub named a rule, and the branch has none: an organisation's rule or a check on the commit itself. */
    return {
      problem: "unknown",
      message: `A rule on ${repo} turned Storelib's commit down, though ${branch} itself is not protected.`,
      fix: "Check the rulesets for this repository and its organisation on GitHub, then press Push.",
    }
  }
  if (/not a fast.?forward|reference cannot be updated|update is not a fast forward/.test(said) || (e.status === 409 && e.step === "write-ref")) {
    return { problem: "moved-on", message: `Someone pushed to ${branch} while Storelib was sending.`, fix: "Press Push again. Their commit stays; Storelib adds its changes on top." }
  }
  if (e.status === 403 && (/resource not accessible|not accessible by integration|permission/.test(said) || e.permissions || e.step === "write-ref" || e.step === "contents")) {
    const needs = permissionWords(e.permissions)
    return {
      problem: "no-access",
      message: `The Storelib app does not have write access to ${repo}.`,
      fix: needs && !/^Contents/.test(needs)
        ? `On GitHub open Settings, Applications, Storelib, and accept the permission it asks for (${needs}).`
        : "On GitHub open Settings, Applications, Storelib, Configure, and give it this repository. Its Contents permission must be Read and write.",
    }
  }
  if (e.status === 403) {
    return { problem: "no-access", message: `GitHub refused Storelib's change to ${repo}.`, fix: "Check the Storelib app still has this repository under Settings, Applications, Storelib, Configure on GitHub." }
  }
  if (e.status === 404) {
    if (e.step === "ref") return { problem: "repo-missing", message: `The branch ${branch} was not found in ${repo}.`, fix: "Press Push to make it, or pick another branch under Change repository." }
    return { problem: "repo-missing", message: `GitHub could not find ${repo}.`, fix: "It may have been renamed, deleted, or taken away from the Storelib app. Pick it again under Change repository." }
  }
  if (e.status === 413 || /too large|exceeds|larger than/.test(said)) {
    return { problem: "too-large", message: "A file was too large for GitHub.", fix: "Storelib leaves files over 20 MB out. Press Push again; if it fails again, tell support which site it was." }
  }
  if (e.status === 409 && /empty/.test(said)) {
    return { problem: "repo-missing", message: `${repo} has no commits yet, and GitHub would not take the first one.`, fix: "Add a README on GitHub, then press Push." }
  }
  if (e.status >= 500) {
    return { problem: "github-down", message: "GitHub had a problem on its side.", fix: "Storelib tried a few times. Press Push in a minute." }
  }
  if (e.status === 422) {
    return { problem: "unknown", message: `GitHub would not take Storelib's commit on ${branch}.`, fix: "Press Push again. If it fails twice, link a fresh branch under Change repository." }
  }
  return { problem: "unknown", message: "Something went wrong talking to GitHub.", fix: "Press Push again." }
}

/** One line for a card or a commit status: what happened, then what to do. */
export function failureLine(x: Explained): string {
  return `${x.message} ${x.fix}`
}
