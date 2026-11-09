/**
 * An install's project held in memory: the tests' website, and a dry run's.
 * Behaves like the Supabase store on the points the engine relies on: draft
 * writes only, a write against a moved draft is a conflict, other pages and
 * settings are never touched by a write, and every file write is logged with
 * its author and job (as store_theme_file_versions does after part 401).
 */
import type { FileAuthor } from "../types"
import { versionOf } from "./version"
import type { ProjectStore, StoredFile, StoredPage, StoreWriteResult } from "./ports"

export interface MemoryVersion {
  path: string
  text: string | null
  author: FileAuthor
  jobId: string
}

export interface MemoryProject {
  files: Record<string, string>
  pages: Record<string, StoredPage["sections"]>
  settings: Record<string, unknown>
}

export function memoryStore(initial: Partial<MemoryProject> = {}): ProjectStore & { project: MemoryProject; versions: MemoryVersion[]; clock: number } {
  const project: MemoryProject = {
    files: { ...(initial.files ?? {}) },
    pages: JSON.parse(JSON.stringify(initial.pages ?? { home: [] })) as MemoryProject["pages"],
    settings: JSON.parse(JSON.stringify(initial.settings ?? {})) as Record<string, unknown>,
  }
  const stamps: Record<string, string> = {}
  const self = {
    project,
    versions: [] as MemoryVersion[],
    clock: 0,
    async listFiles(): Promise<StoredFile[]> {
      return Object.keys(project.files)
        .sort()
        .map((path) => ({ path, text: project.files[path], updatedAt: stamps[path] ?? null }))
    },
    async readFile(path: string): Promise<StoredFile | null> {
      return path in project.files ? { path, text: project.files[path], updatedAt: stamps[path] ?? null } : null
    },
    async writeFile(path: string, text: string, meta: { expectedVersion: string | null; author: FileAuthor; jobId: string }): Promise<StoreWriteResult> {
      const had = path in project.files
      const current = had ? versionOf(project.files[path]) : null
      if (current !== meta.expectedVersion) return { ok: false, error: "The file changed since it was read.", conflict: true }
      project.files[path] = text
      stamps[path] = new Date(Date.UTC(2026, 10, 9, 12, 0, ++self.clock)).toISOString()
      self.versions.push({ path, text, author: meta.author, jobId: meta.jobId })
      return { ok: true, updatedAt: stamps[path], created: !had }
    },
    async deleteFile(path: string, meta: { author: FileAuthor; jobId: string }) {
      if (!(path in project.files)) return { ok: false, error: "No such file." }
      delete project.files[path]
      self.versions.push({ path, text: null, author: meta.author, jobId: meta.jobId })
      return { ok: true }
    },
    async listPages(): Promise<StoredPage[]> {
      return Object.entries(project.pages).map(([key, sections]) => ({ key, sections: JSON.parse(JSON.stringify(sections)) }))
    },
    async writePages(pages: StoredPage[]) {
      for (const p of pages) project.pages[p.key] = JSON.parse(JSON.stringify(p.sections))
    },
    async readSettings() {
      return JSON.parse(JSON.stringify(project.settings)) as Record<string, unknown>
    },
    async writeSettings(patch: Record<string, unknown>) {
      Object.assign(project.settings, JSON.parse(JSON.stringify(patch)))
    },
  }
  return self
}
