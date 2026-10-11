/**
 * ===========================================================================
 *  TALKING TO GITHUB AS THE STORELIB GITHUB APP
 * ===========================================================================
 * The app signs a short JWT with its private key (RS256, node:crypto, no
 * library), trades it for an installation token that reaches only the
 * repositories the creator chose, and uses that. Nothing is cached in memory:
 * a Vercel function does not keep it, and a token is one request to mint.
 * No token is ever stored or logged.
 *
 * WHAT MADE "LAST SYNC FAILED" (and what is done about each now):
 *   - the whole theme went into one tree request with every file inline:
 *     binary fonts could not travel as text at all, and a large theme was one
 *     huge request that GitHub timed out or refused. Now binary files and big
 *     ones go up as blobs first, and the tree is built in batches.
 *   - one 502 or a secondary rate limit failed the sync. Now every call is
 *     retried with backoff, honouring Retry-After, and the hourly limit is
 *     reported with the time it comes back.
 *   - a push to the branch between Storelib reading it and writing it was a
 *     failure. Now the commit is made again on top of the new head (Storelib's
 *     files win, every other file is the other push's).
 *   - a branch that did not exist yet was "could not find". Now it is made
 *     from the repository's default branch.
 *   - every file was sent every time. Now a file whose bytes GitHub already
 *     has is not sent, so a sync of an unchanged site is no commit at all.
 *
 * Six environment variables, all server side. See docs/github-sync.md.
 */
import "server-only"
import { createSign } from "node:crypto"
import { gitBlobSha } from "./layout"

const API = "https://api.github.com"

export interface GitHubConfig {
  appId: string
  privateKey: string
  slug: string
  clientId: string
  clientSecret: string
  webhookSecret: string
}

/** The app's settings, or null while any is missing. */
export function githubConfig(): GitHubConfig | null {
  const appId = process.env.GITHUB_APP_ID?.trim()
  const rawKey = process.env.GITHUB_APP_PRIVATE_KEY
  const slug = process.env.GITHUB_APP_SLUG?.trim()
  const clientId = process.env.GITHUB_APP_CLIENT_ID?.trim()
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET?.trim()
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET?.trim()
  if (!appId || !rawKey || !slug || !clientId || !clientSecret || !webhookSecret) return null
  /* Pasted into Vercel on one line, a PEM's newlines arrive as "\n". */
  const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey
  return { appId, privateKey, slug, clientId, clientSecret, webhookSecret }
}

const b64url = (s: string | Buffer) =>
  Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

/** The app's own JWT: ten minutes at most, backdated a minute for clock skew. */
function appJwt(cfg: GitHubConfig): string {
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const body = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: cfg.appId }))
  const signer = createSign("RSA-SHA256")
  signer.update(`${head}.${body}`)
  return `${head}.${body}.${b64url(signer.sign(cfg.privateKey))}`
}

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Which call failed, for lib/github-sync/errors.ts. */
    public step: string = "other",
    /** When the hourly limit comes back, ms since the epoch. */
    public resetAt: number | null = null,
  ) {
    super(message)
  }
}

/* ── the transport, swappable so the suite runs against a fake GitHub ──── */

type Transport = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<Response>

let transport: Transport = (url, init) => fetch(url, { ...init, cache: "no-store" })
/** Waiting between retries; the suite makes it instant. */
export const timing = { sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)), maxWaitMs: 20_000 }

/** For tests only: answer GitHub's calls with something else. Null puts fetch back. */
export function setGitHubTransport(t: Transport | null) {
  transport = t ?? ((url, init) => fetch(url, { ...init, cache: "no-store" }))
}

/** Attempts per call. A 5xx, a secondary limit or a dropped connection is tried again; a 4xx is not. */
const ATTEMPTS = 4

async function call<T>(
  path: string,
  token: string,
  init: { method?: string; body?: unknown; scheme?: "Bearer" | "token"; step?: string } = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API}${path}`
  const step = init.step ?? "other"
  let last: GitHubError | null = null
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    let res: Response
    try {
      res = await transport(url, {
        method: init.method ?? "GET",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `${init.scheme ?? "Bearer"} ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "Storelib",
          ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      })
    } catch {
      last = new GitHubError(0, "GitHub could not be reached", step)
      await timing.sleep(backoff(attempt))
      continue
    }
    if (res.ok) {
      if (res.status === 204) return undefined as T
      return (await res.json()) as T
    }
    /* GitHub's own message, which never contains the token that was sent. */
    const detail = await res.json().then((d: { message?: string }) => d?.message ?? "").catch(() => "")
    const remaining = res.headers.get("x-ratelimit-remaining")
    const reset = Number(res.headers.get("x-ratelimit-reset"))
    const resetAt = Number.isFinite(reset) && reset > 0 ? reset * 1000 : null
    const retryAfter = Number(res.headers.get("retry-after"))
    last = new GitHubError(res.status, detail || `GitHub answered ${res.status}`, step, resetAt)
    const secondary = (res.status === 403 || res.status === 429) && (/secondary rate limit|abuse/i.test(detail) || Number.isFinite(retryAfter) && retryAfter > 0)
    const primary = (res.status === 403 || res.status === 429) && remaining === "0"
    if (primary) {
      /* The hourly allowance is spent. Wait only if it comes back in moments; otherwise say when. */
      const wait = resetAt ? resetAt - Date.now() : Infinity
      if (wait > timing.maxWaitMs) throw new GitHubError(429, "rate limit", step, resetAt)
      await timing.sleep(Math.max(0, wait))
      continue
    }
    if (secondary) {
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt) * 4
      if (wait > timing.maxWaitMs) throw new GitHubError(429, "secondary rate limit", step, Date.now() + wait)
      await timing.sleep(wait)
      continue
    }
    if (res.status >= 500 && attempt < ATTEMPTS - 1) {
      await timing.sleep(backoff(attempt))
      continue
    }
    throw last
  }
  throw last ?? new GitHubError(0, "GitHub could not be reached", step)
}

/** 0.5 s, 1 s, 2 s, with a little jitter so many sites do not retry in step. */
function backoff(attempt: number): number {
  return Math.round(500 * 2 ** attempt * (0.8 + Math.random() * 0.4))
}

/** A token for one installation, good for an hour, used for one request's work. */
export async function installationToken(cfg: GitHubConfig, installationId: number): Promise<string> {
  const d = await call<{ token: string }>(`/app/installations/${installationId}/access_tokens`, appJwt(cfg), { method: "POST", step: "token" })
  return d.token
}

/** The account an installation is on, as the app sees it. */
export async function installationAccount(cfg: GitHubConfig, installationId: number): Promise<string> {
  const d = await call<{ account?: { login?: string } }>(`/app/installations/${installationId}`, appJwt(cfg), { step: "token" })
  return d.account?.login ?? ""
}

/**
 * The code GitHub sends back after install, traded for a user token, and
 * asked which installations that user can reach. This is what proves the
 * person connecting owns the installation: an installation id in a URL on
 * its own proves nothing, anyone can type one.
 */
export async function userCanReachInstallation(cfg: GitHubConfig, code: string, installationId: number): Promise<boolean> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "Storelib" },
    body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code }),
    cache: "no-store",
  })
  const d = (await res.json().catch(() => ({}))) as { access_token?: string }
  if (!d.access_token) return false
  for (let page = 1; page <= 5; page++) {
    const list = await call<{ installations?: { id: number }[] }>(`/user/installations?per_page=100&page=${page}`, d.access_token)
    const items = list.installations ?? []
    if (items.some((i) => i.id === installationId)) return true
    if (items.length < 100) break
  }
  return false
}

export interface Repo {
  id: number
  full_name: string
  default_branch: string
  private: boolean
  html_url: string
}

/** The repositories the creator let the app reach. */
export async function installationRepos(token: string): Promise<Repo[]> {
  const out: Repo[] = []
  for (let page = 1; page <= 5; page++) {
    const d = await call<{ repositories?: Repo[] }>(`/installation/repositories?per_page=100&page=${page}`, token, { step: "repos" })
    const items = d.repositories ?? []
    out.push(...items.map((r) => ({ id: r.id, full_name: r.full_name, default_branch: r.default_branch, private: r.private, html_url: r.html_url })))
    if (items.length < 100) break
  }
  return out
}

const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/")

/** One file's text at a commit, or null when it is not there. */
export async function fileAt(token: string, repo: string, path: string, ref: string): Promise<string | null> {
  try {
    const d = await call<{ content?: string; encoding?: string; size?: number; sha?: string }>(
      `/repos/${repo}/contents/${enc(path)}?ref=${encodeURIComponent(ref)}`,
      token,
      { step: "contents" },
    )
    /* Over 1 MB the contents API leaves the content out; the blob has it. */
    if ((d.encoding === "none" || !d.content) && d.sha) return Buffer.from(await blobAt(token, repo, d.sha)).toString("utf8")
    if (d.encoding !== "base64" || typeof d.content !== "string") return null
    return Buffer.from(d.content, "base64").toString("utf8")
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return null
    throw e
  }
}

/** A blob's bytes, by its sha, up to GitHub's 100 MB. */
export async function blobAt(token: string, repo: string, sha: string): Promise<Uint8Array> {
  const d = await call<{ content?: string; encoding?: string }>(`/repos/${repo}/git/blobs/${encodeURIComponent(sha)}`, token, { step: "blob" })
  if (typeof d.content !== "string") return new Uint8Array()
  return new Uint8Array(Buffer.from(d.content, d.encoding === "base64" ? "base64" : "utf8"))
}

export interface TreeEntry {
  sha: string
  size: number
}

/** Every file on a commit, path to blob. `truncated` when GitHub cut a very large tree short. */
export async function treeAt(token: string, repo: string, commitSha: string): Promise<{ files: Map<string, TreeEntry>; truncated: boolean }> {
  const tree = await call<{ tree?: { path?: string; type?: string; sha?: string; size?: number }[]; truncated?: boolean }>(
    `/repos/${repo}/git/trees/${encodeURIComponent(commitSha)}?recursive=1`,
    token,
    { step: "tree" },
  )
  const files = new Map<string, TreeEntry>()
  for (const t of tree.tree ?? []) if (t.type === "blob" && typeof t.path === "string" && typeof t.sha === "string") files.set(t.path, { sha: t.sha, size: t.size ?? 0 })
  return { files, truncated: tree.truncated === true }
}

/** Every file changed between two commits. Compare stops at 300; past that the two trees are compared. */
export async function compareFiles(token: string, repo: string, base: string, head: string) {
  const d = await call<{ files?: { filename?: string; status?: string; previous_filename?: string }[] }>(
    `/repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
    token,
  )
  const files = d.files ?? []
  if (files.length < 300) return files
  const [a, b] = await Promise.all([treeAt(token, repo, base), treeAt(token, repo, head)])
  const out: { filename: string; status: string }[] = []
  for (const [p, e] of b.files) {
    const was = a.files.get(p)
    if (!was) out.push({ filename: p, status: "added" })
    else if (was.sha !== e.sha) out.push({ filename: p, status: "modified" })
  }
  for (const p of a.files.keys()) if (!b.files.has(p)) out.push({ filename: p, status: "removed" })
  return out
}

/**
 * Where `head` stands against `base` in the repository's history: "ahead"
 * (newer), "behind" or "identical" (already had), "diverged" (a rewritten
 * branch). GitHub's own graph, so a commit's claimed date cannot fool it.
 */
export async function compareStatus(token: string, repo: string, base: string, head: string): Promise<string> {
  const d = await call<{ status?: string }>(`/repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}?per_page=1`, token)
  return d.status ?? "unknown"
}

/** The green tick or red cross on a commit, named "Storelib". */
export async function setStatus(
  token: string,
  repo: string,
  sha: string,
  status: { state: "success" | "failure" | "error" | "pending"; description: string; target_url?: string },
) {
  await call(`/repos/${repo}/statuses/${encodeURIComponent(sha)}`, token, {
    method: "POST",
    body: { ...status, context: "Storelib" },
    step: "status",
  })
}

/** A comment on a commit: every file a push could not bring in, each with its line and its fix. */
export async function commentOnCommit(token: string, repo: string, sha: string, body: string) {
  await call(`/repos/${repo}/commits/${encodeURIComponent(sha)}/comments`, token, { method: "POST", body: { body: body.slice(0, 60_000) }, step: "status" })
}

/** One change in a commit: a file's new text or bytes, or its removal. */
export type FileChange = { path: string; content: string } | { path: string; bytes: Uint8Array } | { path: string; delete: true }

/** Text this size and under goes inline in the tree; anything larger, and every binary file, as a blob first. */
const INLINE_MAX = 256 * 1024
/** Entries per tree request. Each builds on the one before. */
const TREE_BATCH = 250
/** Blobs in flight at once. */
const BLOB_CONCURRENCY = 5
/** Times a commit is made again when the branch moved underneath it. */
const MOVED_ON_RETRIES = 3

async function headOf(token: string, repo: string, branch: string): Promise<string | null> {
  try {
    const ref = await call<{ object: { sha: string } }>(`/repos/${repo}/git/ref/heads/${enc(branch)}`, token, { step: "ref" })
    return ref.object.sha
  } catch (e) {
    if (e instanceof GitHubError && (e.status === 404 || e.status === 409)) return null
    throw e
  }
}

/** The branch, made from the repository's default branch if it is not there. Null for an empty repository. */
async function ensureBranch(token: string, repo: string, branch: string): Promise<string | null> {
  const head = await headOf(token, repo, branch)
  if (head) return head
  const info = await call<{ default_branch?: string }>(`/repos/${repo}`, token, { step: "repos" })
  const base = info.default_branch && info.default_branch !== branch ? await headOf(token, repo, info.default_branch) : null
  if (!base) return null
  await call(`/repos/${repo}/git/refs`, token, { method: "POST", body: { ref: `refs/heads/${branch}`, sha: base }, step: "write-ref" })
  return base
}

async function inBatches<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

export interface CommitResult {
  /** The new commit, or null when GitHub already had every file as it is. */
  sha: string | null
  /** Files written and removed in it. */
  written: number
  removed: number
}

/**
 * Write many changes as ONE commit on a branch, through the Git data API,
 * sending only what GitHub does not already have. A removal of a file that
 * is not there is nothing. An empty repository gets its first file through
 * the contents API, and the rest as usual; a branch that is not there is
 * made from the default branch.
 */
export async function commitChanges(token: string, repo: string, branch: string, changes: FileChange[], message: string): Promise<CommitResult> {
  let lastMoved: GitHubError | null = null
  for (let round = 0; round <= MOVED_ON_RETRIES; round++) {
    let head = await ensureBranch(token, repo, branch)
    if (!head) {
      const first = changes.find((c): c is { path: string; content: string } => "content" in c)
      if (!first) return { sha: null, written: 0, removed: 0 }
      const created = await call<{ commit: { sha: string } }>(`/repos/${repo}/contents/${enc(first.path)}`, token, {
        method: "PUT",
        body: { message, content: Buffer.from(first.content, "utf8").toString("base64"), branch },
        step: "contents",
      })
      head = created.commit.sha
    }
    const commit = await call<{ tree: { sha: string } }>(`/repos/${repo}/git/commits/${head}`, token, { step: "commit" })
    /* What the branch has now, so only what differs is sent. A tree GitHub cut short is treated as knowing nothing. */
    let have = new Map<string, TreeEntry>()
    let complete = false
    try {
      const t = await treeAt(token, repo, head)
      have = t.files
      complete = !t.truncated
    } catch {
      complete = false
    }
    const todo = changes.filter((c) => {
      const there = have.get(c.path)
      if ("delete" in c) return complete ? !!there : true
      const sha = gitBlobSha("bytes" in c ? c.bytes : c.content)
      return there?.sha !== sha
    })
    if (todo.length === 0) return { sha: null, written: 0, removed: 0 }

    /* Binary files and big text files go up as blobs first, a few at a time. */
    const entries = await inBatches(todo, BLOB_CONCURRENCY, async (c) => {
      if ("delete" in c) return { path: c.path, mode: "100644", type: "blob", sha: null as string | null }
      if ("content" in c && Buffer.byteLength(c.content, "utf8") <= INLINE_MAX) return { path: c.path, mode: "100644", type: "blob", content: c.content }
      const bytes = "bytes" in c ? Buffer.from(c.bytes) : Buffer.from(c.content, "utf8")
      const blob = await call<{ sha: string }>(`/repos/${repo}/git/blobs`, token, {
        method: "POST",
        body: { content: bytes.toString("base64"), encoding: "base64" },
        step: "blob",
      })
      return { path: c.path, mode: "100644", type: "blob", sha: blob.sha as string | null }
    })
    /* Removing a path that is not there fails the whole tree; a removal is sent only when the tree is known. */
    const send = complete ? entries : entries.filter((e) => !("sha" in e && e.sha === null) || have.has(e.path))

    let tree = commit.tree.sha
    for (let i = 0; i < send.length; i += TREE_BATCH) {
      const made = await call<{ sha: string }>(`/repos/${repo}/git/trees`, token, {
        method: "POST",
        body: { base_tree: tree, tree: send.slice(i, i + TREE_BATCH) },
        step: "tree",
      })
      tree = made.sha
    }
    if (tree === commit.tree.sha) return { sha: null, written: 0, removed: 0 }
    const made = await call<{ sha: string }>(`/repos/${repo}/git/commits`, token, {
      method: "POST",
      body: { message, tree, parents: [head] },
      step: "commit",
    })
    try {
      await call(`/repos/${repo}/git/refs/heads/${enc(branch)}`, token, { method: "PATCH", body: { sha: made.sha, force: false }, step: "write-ref" })
    } catch (e) {
      /* Somebody pushed in between: build it again on top of theirs. */
      if (e instanceof GitHubError && e.status === 422 && /fast.?forward/i.test(e.message)) {
        lastMoved = e
        continue
      }
      throw e
    }
    const removed = todo.filter((c) => "delete" in c).length
    return { sha: made.sha, written: todo.length - removed, removed }
  }
  throw lastMoved ?? new GitHubError(422, "not a fast forward", "write-ref")
}

/** The older shape: the new commit's sha, or null. */
export async function commitFiles(token: string, repo: string, branch: string, changes: FileChange[], message: string): Promise<string | null> {
  return (await commitChanges(token, repo, branch, changes, message)).sha
}

/** Every file path on a branch, for "Pull from GitHub". */
export async function listTree(token: string, repo: string, branch: string): Promise<{ sha: string; paths: string[]; files: Map<string, TreeEntry> }> {
  const ref = await call<{ object: { sha: string } }>(`/repos/${repo}/git/ref/heads/${enc(branch)}`, token, { step: "ref" })
  const tree = await treeAt(token, repo, ref.object.sha)
  return { sha: ref.object.sha, paths: [...tree.files.keys()], files: tree.files }
}
