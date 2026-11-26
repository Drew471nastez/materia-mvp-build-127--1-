"use client"

import { withSkinOwn } from "./skin-own"
import type React from "react"
import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, useLayoutEffect } from "react"
import { useShellAvatar } from "@/lib/account/avatar-store"
import { useOnePageTeam } from "./team-context"
import type {
  OnePage,
  OnePageBlock,
  OnePageTheme,
  OnePageSocialLinks,
  OnePageBlockType,
  OnePageTemplate,
  GroupBlockData,
} from "./types"
import { defaultTheme, defaultSettings, defaultSocialLinks, createDefaultBlock } from "./types"
import { withoutRetiredThemes } from "./retired-themes"
import { lookFromTemplate, type ThemeTemplateLike } from "./theme-apply"
import {
  canStepBack,
  canStepForward,
  changedFields,
  cleanAfterSave,
  describeSaveFailure,
  editKey,
  recordEdit,
  replaceCurrent,
  retryableSave,
  retryDelay,
  saveRequestBody,
  serializeSaves,
  startHistory,
  stepBack,
  stepForward,
  type HistoryStack,
  type SaveResult,
} from "./editor-state"

import { clearDraft, deviceStore, draftDecision, draftFieldsOf, readDraft, withDraft, writeDraft, type LocalDraft } from "./local-draft"
import { sentBaseVersion } from "./edit-version"
import { withoutProducts } from "./product-removals"
import { onProductDeleted } from "@/lib/products/deleted-signal"

export type { SaveResult } from "./editor-state"

/** Unsaved work is written to the device this long after the last edit (lib/onepage/local-draft). */
const DRAFT_WRITE_MS = 400

type ActiveSection = "profile" | "theme" | "blocks" | "socials" | "leads" | "settings"
type SaveState = "idle" | "saving" | "saved" | "error"

/**
 * HOW AN EDIT THAT NOBODY TYPED IS TOLD APART.
 *
 * `silent` is for what the editor fills in on its own: a thumbnail fetched
 * for a link that was already there, a social row brought in line with the
 * social links on load. It makes no undo step and does not mark the page
 * unsaved. Opening the editor used to leave it saying "Unsaved" with an undo
 * step nobody made, because these ran through the same path as typing.
 *
 * `joinLastStep` is for something that arrived because of an edit, like the
 * cover art for a Spotify address that was just pasted: the page does need
 * saving, but undo takes it away together with the edit that asked for it
 * rather than as a step of its own.
 */
export interface EditOptions {
  silent?: boolean
  joinLastStep?: boolean
}

type BlockDataPatch = Record<string, any>
type BlockDataUpdate =
  | BlockDataPatch
  | ((data: Record<string, any>, block: OnePageBlock, page: OnePage) => BlockDataPatch | null | undefined)

interface OnePageContextType {
  onepage: OnePage | null
  isLoading: boolean
  selectedBlockId: string | null
  activeSection: ActiveSection
  isDirty: boolean
  saveState: SaveState
  /** The last failed save, as the toast should say it. A new object per failure. */
  saveError: { message: string; at: number } | null
  canUndo: boolean
  canRedo: boolean
  templates: OnePageTemplate[]
  archivedBlocks: OnePageBlock[]

  setOnePage: (onepage: OnePage) => void
  setActiveSection: (section: ActiveSection) => void
  setSelectedBlockId: (id: string | null) => void
  /** The page as it is this instant, including edits React has not rendered yet. */
  getLatestOnePage: () => OnePage | null
  /** What was last saved of the fields Settings edits, so each Settings section can say whether it has unsaved changes of its own. */
  getSavedSettings: () => { title: string; slug: string; settings: Record<string, unknown>; share_image_mode: unknown } | null

  updateProfile: (updates: { title?: string; bio?: string; avatar_url?: string | null; avatar_video_url?: string | null; avatar_video_crop?: { x: number; y: number; width: number; height: number } | null }) => void

  updateTheme: (updates: Partial<OnePageTheme>) => void
  applyTemplate: (template: OnePageTemplate) => void
  /** Picks a theme: the whole look, Share and Subscribe, and every block's own colours, in one undo step (lib/onepage/theme-apply). */
  /* `blocks` (round 65, lib/onepage/theme-blocks): the page's blocks after the pick, for a theme that comes with its own; laid on in the same step as the look. */
  applyThemeLook: (template: ThemeTemplateLike, headerLayout?: "classic" | "hero", previous?: ThemeTemplateLike | null, blocks?: OnePageBlock[] | null) => void

  updateSocialLinks: (updates: Partial<OnePageSocialLinks>) => void

  addBlock: (type: OnePageBlockType, afterId?: string, initialData?: Record<string, any>) => OnePageBlock | null
  updateBlock: (blockId: string, updates: Partial<OnePageBlock>, options?: EditOptions) => void
  /**
   * Merges `patch` into the block's data as it is NOW, not as it was when the
   * caller last rendered. Given a function, it is called with the latest data
   * and may return null to change nothing.
   */
  updateBlockData: (blockId: string, patch: BlockDataUpdate, options?: EditOptions) => void
  removeBlock: (blockId: string) => void
  archiveBlock: (blockId: string) => void
  unarchiveBlock: (blockId: string) => void
  reorderBlocks: (blocks: OnePageBlock[]) => void
  moveBlockUp: (blockId: string) => void
  moveBlockDown: (blockId: string) => void
  toggleBlockEnabled: (blockId: string) => void

  updateSettings: (updates: Partial<OnePage["settings"]>, options?: EditOptions) => void
  /** A field of the page's own row that is not a setting (the share picture's choice), recorded like any edit. */
  updateOnePage: (updates: Partial<OnePage>, options?: EditOptions) => void
  updateSlug: (slug: string) => void
  markDirty: () => void

  undo: () => void
  redo: () => void

  save: (force?: boolean) => Promise<SaveResult>
  publish: () => Promise<SaveResult>
  /** A save failed for the network or the server and will be tried again on its own (round AU). */
  retrying: boolean
  /** Unsaved work kept on this device from before the page was saved somewhere else: the editor asks which to keep. */
  draftQuestion: { at: number } | null
  /** The creator's answer: true puts this device's changes back (unsaved), false keeps the saved page. */
  answerDraftQuestion: (useDevice: boolean) => void
  /** When unsaved work kept on the device was put back on opening, for the editor to say so once. */
  draftRestoredAt: number | null
  /** The creator chose Discard on the way out: the unsaved work is dropped from the device too, and leaving does not write it back. */
  discardUnsaved: () => void

  loadTemplates: () => Promise<void>
}

const OnePageContext = createContext<OnePageContextType | null>(null)

export function useOnePage() {
  const context = useContext(OnePageContext)
  if (!context) {
    throw new Error("useOnePage must be used within OnePageProvider")
  }
  return context
}

interface OnePageProviderProps {
  children: React.ReactNode
  initialOnePage?: OnePage | null
}

/** History keeps its own copies, so nothing that edits a live object can reach back into an undo step. */
const clonePage = (page: OnePage): OnePage => JSON.parse(JSON.stringify(page))

/**
 * Gives every block its position as sort_order, as a new object where the
 * number changes. The old code wrote `b.sort_order = i` onto objects the
 * previous state and the undo history still held.
 */
function renumber(blocks: OnePageBlock[]): OnePageBlock[] {
  return blocks.map((b, i) => (b.sort_order === i ? b : { ...b, sort_order: i }))
}

/** What a publish wrote. Undo and redo move the draft, never what is live. */
function publishedPart(page: OnePage): Partial<OnePage> {
  return {
    status: page.status,
    published_at: page.published_at,
    published_blocks: page.published_blocks,
    published_theme: page.published_theme,
    published_profile: page.published_profile,
    published_social_links: page.published_social_links,
  }
}

/**
 * What a save sends that a visitor or the editor can tell apart: two pages
 * with the same answer here save to the same row. Undo and redo use it to
 * know when they have come back to the page as it was last saved.
 */
function savedFields(page: OnePage): string {
  const p = page as OnePage & { archived_blocks?: unknown; share_image_mode?: unknown }
  return JSON.stringify([p.title, p.bio, p.avatar_video_url, p.slug, p.theme, p.settings, p.social_links, p.draft_blocks, p.archived_blocks ?? [], p.share_image_mode ?? null])
}

async function serverError(res: Response): Promise<string | null> {
  try {
    const body = await res.json()
    return typeof body?.error === "string" ? body.error : null
  } catch {
    return null
  }
}

export function OnePageProvider({ children, initialOnePage: givenOnePage }: OnePageProviderProps) {
  /* A page still on a theme no longer offered (Editorial) opens on its successor, the creator's own changes kept; the next save keeps it (lib/onepage/retired-themes). */
  const initialOnePage = useMemo(() => withoutRetiredThemes(givenOnePage), [givenOnePage])
  /*
    Which copy of the page this editor's next save starts from (lib/onepage/edit-version).
    Read once from what the server opened and kept here, never from the page itself:
    the page's own edit_version stays as it was opened, so undo cannot move it.
  */
  const baseVersionRef = useRef<string | null>(sentBaseVersion(givenOnePage?.edit_version))
  /* The last save was refused because the page was saved somewhere else: the next Save is the creator choosing to keep this copy. */
  const overrideConflictRef = useRef(false)
  const [onepage, setOnePageState] = useState<OnePage | null>(initialOnePage || null)
  const team = useOnePageTeam()
  const shellAvatar = useShellAvatar(onepage?.avatar_url, onepage?.owner_id)
  const canonicalAvatar = team ? team.ownerAvatar ?? null : shellAvatar
  const [isLoading, setIsLoading] = useState(false)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<ActiveSection>("blocks")
  const [isDirty, setIsDirty] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [saveError, setSaveError] = useState<{ message: string; at: number } | null>(null)
  const [templates, setTemplates] = useState<OnePageTemplate[]>([])
  // Initialize archived blocks from database (stored in onepage.archived_blocks)
  const [archivedBlocks, setArchivedBlocks] = useState<OnePageBlock[]>(
    () => (initialOnePage as any)?.archived_blocks || []
  )

  /**
   * THE PAGE AS IT IS NOW, WRITTEN BEFORE REACT HEARS OF IT.
   *
   * Every edit below reads the page from this ref, builds the next page, and
   * writes the ref and React's state together, in the same call. It used to
   * be copied into the ref by an effect after each render, so a handler that
   * edited and then saved in one go (Settings' Save: set the title, set the
   * slug, save) sent the page as it was before the title and the slug. Only
   * updateSettings wrote the ref itself; now nothing waits for a render.
   *
   * Building from the ref instead of inside a setState updater is also what
   * keeps side effects out of updaters: StrictMode calls an updater twice,
   * and history, archiving and the returned new block all used to live in
   * one.
   */
  const latestOnepageRef = useRef<OnePage | null>(initialOnePage || null)
  const latestArchivedBlocksRef = useRef<OnePageBlock[]>((initialOnePage as any)?.archived_blocks || [])

  const historyRef = useRef<HistoryStack<OnePage> | null>(
    initialOnePage ? startHistory(clonePage(initialOnePage)) : null
  )
  const [historyFlags, setHistoryFlags] = useState({ canUndo: false, canRedo: false })
  const syncHistoryFlags = useCallback(() => {
    const next = { canUndo: canStepBack(historyRef.current), canRedo: canStepForward(historyRef.current) }
    setHistoryFlags((prev) => (prev.canUndo === next.canUndo && prev.canRedo === next.canRedo ? prev : next))
  }, [])

  /**
   * WHAT "UNSAVED" MEANS: THE EDIT COUNTER HAS MOVED PAST THE LAST SAVE.
   *
   * Every edit, and every markDirty from a field that keeps its text locally
   * until Save, moves editRevision on. A save that succeeds records the
   * revision it sent as savedRevision, and the page is clean only while the
   * two agree (see cleanAfterSave in ./editor-state.ts).
   */
  const editRevisionRef = useRef(0)
  const savedRevisionRef = useRef(0)
  const forceSaveRef = useRef(false)
  /* The page as it was last saved (savedFields), and whether a field that keeps its own text until Save has been typed in since. */
  const savedFieldsRef = useRef<string | null>(initialOnePage ? savedFields(initialOnePage) : null)
  const looseEditRef = useRef(false)

  /* A field that keeps its text locally (Settings) says it changed: undo cannot see that text, so the page stays unsaved until Save. */
  const markLooseDirty = useCallback(() => {
    looseEditRef.current = true
    markDirtyRef.current()
  }, [])
  const markDirtyRef = useRef<() => void>(() => {})
  /* The automatic retry of a save that failed for the network (round AU): its timer, how many tries so far, and whether the button says so. */
  const retryRef = useRef<{ timer: number; attempt: number }>({ timer: 0, attempt: 0 })
  const retryingRef = useRef(false)
  const [retrying, setRetrying] = useState(false)
  const stopRetryRef = useRef<() => void>(() => {})
  stopRetryRef.current = () => {
    if (retryRef.current.timer) window.clearTimeout(retryRef.current.timer)
    retryRef.current = { timer: 0, attempt: 0 }
    if (retryingRef.current) {
      retryingRef.current = false
      setRetrying(false)
    }
  }
  /* A retry runs quietly: its failure does not put the toast up again every few seconds. */
  const quietSaveRef = useRef(false)

  const markDirty = useCallback(() => {
    editRevisionRef.current += 1
    /* Typing after a failed save is a new page: it is sent by the next Save, not by a retry of the old one. */
    if (retryRef.current.timer || retryingRef.current) stopRetryRef.current()
    setIsDirty(true)
    // A new edit is what the Save button is about now, not the last result
    setSaveState((s) => (s === "saved" || s === "error" ? "idle" : s))
  }, [])
  markDirtyRef.current = markDirty

  /**
   * The one place an edited page is put in place. A silent edit or one that
   * joins the last step replaces the step the person is on instead of making
   * a new one; anything else is recorded, and marks the page unsaved.
   */
  const commit = useCallback((next: OnePage, key: string | null, options: EditOptions = {}) => {
    latestOnepageRef.current = next
    setOnePageState(next)
    const snapshot = clonePage(next)
    const stack = historyRef.current
    if (!stack) {
      historyRef.current = startHistory(snapshot)
    } else if (options.silent || options.joinLastStep) {
      historyRef.current = replaceCurrent(stack, snapshot)
    } else {
      historyRef.current = recordEdit(stack, snapshot, key, Date.now())
    }
    syncHistoryFlags()
    if (!options.silent) markDirty()
    /* A fill nobody typed, on a page with nothing unsaved, is part of the page as saved: undo back to it is clean. */
    else if (editRevisionRef.current === savedRevisionRef.current) savedFieldsRef.current = savedFields(next)
  }, [markDirty, syncHistoryFlags])

  const getLatestOnePage = useCallback(() => latestOnepageRef.current, [])
  /* Read back out of savedFields' own list: [title, bio, avatar_video_url, slug, theme, settings, ..., share_image_mode]. */
  const getSavedSettings = useCallback(() => {
    const raw = savedFieldsRef.current
    if (!raw) return null
    try {
      const f = JSON.parse(raw) as unknown[]
      return { title: String(f[0] ?? ""), slug: String(f[3] ?? ""), settings: (f[5] ?? {}) as Record<string, unknown>, share_image_mode: f[9] ?? null }
    } catch {
      return null
    }
  }, [])

  /**
   * Sends the page as it is at the moment this starts, then publishes that
   * same copy. Answers whether it worked, with the reason when it did not; it
   * never throws, and it never calls the page clean if an edit arrived while
   * the requests were out.
   */
  const runSave = useCallback(async (): Promise<SaveResult> => {
    const snapshot = latestOnepageRef.current
    if (!snapshot) return { ok: false, error: describeSaveFailure(0, null), status: null }
    const sentRevision = editRevisionRef.current
    const archived = latestArchivedBlocksRef.current
    const quiet = quietSaveRef.current
    quietSaveRef.current = false
    forceSaveRef.current = false
    setSaveState("saving")

    const fail = (status: number | null, serverMessage: string | null): SaveResult => {
      const message = describeSaveFailure(status, serverMessage)
      console.error("OnePage save failed:", status ?? "no response", serverMessage || "")
      setSaveState("error")
      /*
        A retry is quiet only while it will be tried again. One that will not
        (a conflict, a refusal) is said: a quiet retry that met "saved
        somewhere else" used to arm the next Save to overwrite the other
        device's page without the creator ever being told.
      */
      if (!quiet || !retryableSave(status)) setSaveError({ message, at: Date.now() })
      return { ok: false, error: message, serverMessage: serverMessage || undefined, status }
    }

    try {
      /*
        ONE REQUEST SAVES AND PUBLISHES (the OnePage production audit, S1 and
        S2): app/api/onepage PUT with publish: true writes the draft and the
        live copy in the same checked write. The blocks, archive, look and bio
        go whole, checked against the copy this editor started from; the name,
        address, settings, social links, video and share picture only where
        this editor changed them since its last save (saveRequestBody), so an
        editor left open never puts back what another screen changed since.
        The crop of the profile video is in settings, never sent on its own.
      */
      const body = saveRequestBody(snapshot, archived, savedFieldsRef.current, overrideConflictRef.current ? null : baseVersionRef.current)
      const saveResponse = await fetch("/api/onepage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!saveResponse.ok) {
        if (saveResponse.status === 409) overrideConflictRef.current = true
        return fail(saveResponse.status, await serverError(saveResponse))
      }
      const saved = (await saveResponse.json().catch(() => null)) as { edit_version?: unknown; published?: unknown; published_at?: unknown; removed_products?: unknown } | null
      /*
        Products deleted while this editor was open: the server took them out
        of what it saved (app/api/onepage removed_products), and this copy
        drops them too, every other edit kept, so the next save is the same.
      */
      const removedRaw = saved?.removed_products
      const removed = Array.isArray(removedRaw) ? removedRaw.filter((x): x is string => typeof x === "string" && x !== "") : []
      dropProductsRef.current(removed)
      const sent: OnePage = removed.length > 0 ? { ...snapshot, draft_blocks: withoutProducts(snapshot.draft_blocks, removed) } : snapshot
      /* The version is in a header too, so an answer whose body was cut off does not leave the next save unchecked. */
      baseVersionRef.current = sentBaseVersion(saveResponse.headers.get("X-OnePage-Edit-Version")) ?? sentBaseVersion(saved?.edit_version)
      overrideConflictRef.current = false

      /*
        A server from before one-request saves answers without publishing: published the way it was, with the same copy.
        Its answer has no X-OnePage-Edit-Version, which a server that publishes in the same write always sends, so a
        body cut off on the way back is not taken for an old server (and the page published twice, from this copy).
      */
      const publishedHere = saved?.published === true || saveResponse.headers.get("X-OnePage-Edit-Version") !== null
      let publishedAt: unknown = saved?.published === true ? saved.published_at : null
      if (!publishedHere) {
        const publishResponse = await fetch("/api/onepage/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: snapshot.id,
            draft_blocks: snapshot.draft_blocks,
            theme: snapshot.theme,
            title: snapshot.title,
            bio: snapshot.bio,
            avatar_video_url: snapshot.avatar_video_url,
            avatar_video_crop: (snapshot.settings as any)?.avatar_video_crop || null,
            social_links: snapshot.social_links,
          }),
        })
        if (!publishResponse.ok) return fail(publishResponse.status, await serverError(publishResponse))
        publishedAt = ((await publishResponse.json().catch(() => ({}))) as { published_at?: unknown })?.published_at
      }
      const data = { published_at: typeof publishedAt === "string" ? publishedAt : undefined }

      /* What went live is the copy that was sent, not the draft as it is
         now: anything typed during the request is still only a draft. */
      const latest = latestOnepageRef.current
      if (latest) {
        const published: OnePage = {
          ...latest,
          status: "published",
          published_at: data?.published_at ?? latest.published_at,
          published_blocks: sent.draft_blocks,
          published_theme: snapshot.theme,
          published_profile: {
            title: snapshot.title,
            bio: snapshot.bio,
            avatar_url: snapshot.avatar_url,
            avatar_video_url: snapshot.avatar_video_url,
            avatar_video_crop: (snapshot.settings as any)?.avatar_video_crop || null,
          },
          published_social_links: snapshot.social_links,
        }
        latestOnepageRef.current = published
        setOnePageState(published)
      }
      savedRevisionRef.current = sentRevision
      savedFieldsRef.current = savedFields(sent)
      if (cleanAfterSave(sentRevision, editRevisionRef.current)) looseEditRef.current = false
      if (cleanAfterSave(sentRevision, editRevisionRef.current)) setIsDirty(false)
      setSaveState("saved")
      return { ok: true }
    } catch (error) {
      return fail(null, error instanceof Error ? error.message : null)
    }
  }, [])

  /* A save on its way: undo cannot call the page saved while the row is about to become something else. */
  const savingRef = useRef(false)

  /*
    A SAVE THAT FAILED FOR THE NETWORK IS TRIED AGAIN (round AU). On a train,
    in a lift, or with the app sent to the background mid save, the creator
    pressed Save and got "No connection", and the page stayed unsaved until
    they noticed and pressed it again. Now a failure with no answer, or a busy
    or broken server, is tried again after 2s, 5s, 10s, 20s, 40s and then
    every minute, and at once when the connection or the app comes back. Only
    the save they asked for: an edit made since stops it (markDirty), and that
    edit waits for the next Save. A refusal (signed out, a field, a conflict)
    is never retried. The work is on the device meanwhile (lib/onepage/local-draft).
  */
  const saveNowRef = useRef<() => void>(() => {})
  const afterSaveRef = useRef<(result: SaveResult, sentRevision: number) => void>(() => {})
  afterSaveRef.current = (result, sentRevision) => {
    if (result.ok || !retryableSave(result.status ?? null) || editRevisionRef.current !== sentRevision) {
      stopRetryRef.current()
      return
    }
    const failedRevision = sentRevision
    const attempt = retryRef.current.attempt
    if (retryRef.current.timer) window.clearTimeout(retryRef.current.timer)
    const timer = window.setTimeout(() => {
      retryRef.current.timer = 0
      if (editRevisionRef.current !== failedRevision) return stopRetryRef.current()
      saveNowRef.current()
    }, retryDelay(attempt))
    retryRef.current = { timer, attempt: attempt + 1 }
    if (!retryingRef.current) {
      retryingRef.current = true
      setRetrying(true)
    }
  }
  const requestSave = useMemo(
    () =>
      serializeSaves<SaveResult>(
        async () => {
          savingRef.current = true
          try {
            return await runSave()
          } finally {
            savingRef.current = false
          }
        },
        () => forceSaveRef.current || editRevisionRef.current !== savedRevisionRef.current,
        () => ({ ok: true }),
      ),
    [runSave],
  )

  const updateOnePage = useCallback((updates: Partial<OnePage>, options?: EditOptions) => {
    const prev = latestOnepageRef.current
    if (!prev) return
    const fields = changedFields(prev as any, updates as any)
    if (fields.length === 0) return
    commit({ ...prev, ...updates }, editKey("page", null, fields), options)
  }, [commit])

  const setOnePage = useCallback((newOnepage: OnePage) => {
    latestOnepageRef.current = newOnepage
    setOnePageState(newOnepage)
    historyRef.current = startHistory(clonePage(newOnepage))
    syncHistoryFlags()
    savedRevisionRef.current = editRevisionRef.current
    savedFieldsRef.current = savedFields(newOnepage)
    looseEditRef.current = false
    setIsDirty(false)
    setSaveState("idle")
  }, [syncHistoryFlags])

  const updateProfile = useCallback((updates: { title?: string; bio?: string; avatar_url?: string | null; avatar_video_url?: string | null; avatar_video_crop?: { x: number; y: number; width: number; height: number } | null }) => {
    // The account photo is already committed through /api/account/avatar.
    // It follows the store outside draft history; undo must not resurrect it.
    const { avatar_url: _accountPhoto, avatar_video_crop, ...otherUpdates } = updates
    const current = latestOnepageRef.current
    if (!current) return
    if (otherUpdates.avatar_video_url === null && current.avatar_video_url == null) delete otherUpdates.avatar_video_url
    if (avatar_video_crop === undefined) {
      updateOnePage(otherUpdates)
      return
    }
    const prev = latestOnepageRef.current
    if (!prev) return
    const fields = changedFields(prev as any, otherUpdates as any)
    if (!Object.is((prev.settings as any)?.avatar_video_crop, avatar_video_crop)) fields.push("avatar_video_crop")
    if (fields.length === 0) return
    commit(
      { ...prev, ...otherUpdates, settings: { ...prev.settings, avatar_video_crop } as OnePage["settings"] },
      editKey("page", null, fields.sort()),
    )
  }, [commit, updateOnePage])

  const updateTheme = useCallback((updates: Partial<OnePageTheme>) => {
    const prev = latestOnepageRef.current
    if (!prev) return
    const fields = changedFields(prev.theme as any, updates as any)
    if (fields.length === 0) return
    /* Wave 10: on a skinned theme, a Design change is the creator's own and shows over the skin (lib/onepage/skin-own). */
    const own = withSkinOwn(prev.theme as unknown as Record<string, unknown>, updates as Record<string, unknown>)
    commit({ ...prev, theme: { ...prev.theme, ...own } }, editKey("theme", null, fields))
  }, [commit])

  const applyTemplate = useCallback((template: OnePageTemplate) => {
    const prev = latestOnepageRef.current
    if (!prev) return
    commit({ ...prev, theme: { ...template.theme, template_id: template.id } }, null)
  }, [commit])

  const applyThemeLook = useCallback((template: ThemeTemplateLike, headerLayout?: "classic" | "hero", previous?: ThemeTemplateLike | null, blocks?: OnePageBlock[] | null) => {
    const prev = latestOnepageRef.current
    if (!prev) return
    commit(lookFromTemplate(blocks ? { ...prev, draft_blocks: renumber(blocks) } : prev, template, headerLayout, previous), null)
  }, [commit])

  const updateSocialLinks = useCallback((updates: Partial<OnePageSocialLinks>) => {
    const prev = latestOnepageRef.current
    if (!prev) return
    const fields = changedFields(prev.social_links as any, updates as any)
    if (fields.length === 0) return
    commit({ ...prev, social_links: { ...prev.social_links, ...updates } }, editKey("social", null, fields))
  }, [commit])

  /**
   * THE NEW BLOCK IS MADE HERE, NOT INSIDE A STATE UPDATER.
   *
   * It was created inside setState's updater and handed back through a
   * variable the updater assigned. React does not promise to run an updater
   * before setState returns, so the caller could get null back, and a link
   * added from a preset ("Instagram", with its address) came out as a blank
   * "My Link". Built from the latest page first, the block that is returned
   * is always the block that was added.
   */
  const addBlock = useCallback((type: OnePageBlockType, afterId?: string, initialData?: Record<string, any>): OnePageBlock | null => {
    const prev = latestOnepageRef.current
    if (!prev) return null
    const created = createDefaultBlock(type)
    // Apply initial data overrides if provided
    const newBlock: OnePageBlock = initialData
      ? { ...created, data: { ...created.data, ...initialData } as OnePageBlock["data"] }
      : created
    const blocks = [...prev.draft_blocks]

    if (afterId) {
      // Insert after the specified block
      const index = blocks.findIndex((b) => b.id === afterId)
      if (index !== -1) {
        blocks.splice(index + 1, 0, newBlock)
      } else {
        // Fallback to after header if afterId not found
        const headerIndex = blocks.findIndex((b) => b.type === "header")
        if (headerIndex !== -1) {
          blocks.splice(headerIndex + 1, 0, newBlock)
        } else {
          blocks.unshift(newBlock)
        }
      }
    } else {
      // Smart positioning: check for social_row block
      const socialRowIndex = blocks.findIndex((b) => b.type === "social_row")
      const headerIndex = blocks.findIndex((b) => b.type === "header")

      if (socialRowIndex !== -1) {
        // Check if social_row is at the bottom (last block)
        const isSocialRowAtBottom = socialRowIndex === blocks.length - 1

        if (isSocialRowAtBottom) {
          // Social row is at bottom, insert after header
          if (headerIndex !== -1) {
            blocks.splice(headerIndex + 1, 0, newBlock)
          } else {
            blocks.unshift(newBlock)
          }
        } else {
          // Social row is NOT at bottom, insert after social_row
          blocks.splice(socialRowIndex + 1, 0, newBlock)
        }
      } else {
        // No social_row exists, default: insert AFTER the header block if it exists
        if (headerIndex !== -1) {
          blocks.splice(headerIndex + 1, 0, newBlock)
        } else {
          blocks.unshift(newBlock)
        }
      }
    }

    const placed = renumber(blocks)
    commit({ ...prev, draft_blocks: placed }, null)
    return placed.find((b) => b.id === newBlock.id) || newBlock
  }, [commit])

  const updateBlock = useCallback((blockId: string, updates: Partial<OnePageBlock>, options?: EditOptions) => {
    const prev = latestOnepageRef.current
    if (!prev) return
    const block = prev.draft_blocks.find((b) => b.id === blockId)
    if (!block) return
    const fields = changedFields(block as any, updates as any)
    if (fields.length === 0) return
    /* Named by the data fields that moved, so typing in a label is the same
       undo step whichever of updateBlock and updateBlockData carried it. */
    const keyFields = fields.flatMap((f) =>
      f === "data" && updates.data
        ? changedFields(block.data as any, updates.data as any).map((d) => `data.${d}`)
        : [f],
    )
    commit(
      { ...prev, draft_blocks: prev.draft_blocks.map((b) => (b.id === blockId ? { ...b, ...updates } : b)) },
      editKey("block", blockId, keyFields),
      options,
    )
  }, [commit])

  /**
   * TWO CHANGES IN ONE TICK BOTH LAND.
   *
   * The block editors built their update from the block they were rendered
   * with, `{ ...block.data, ...updates }`, so a second change before the next
   * render overwrote the first, and a thumbnail that finished uploading wrote
   * back the whole block as it was when the upload began. This merges into
   * the block as it is now.
   */
  const updateBlockData = useCallback((blockId: string, patch: BlockDataUpdate, options?: EditOptions) => {
    const prev = latestOnepageRef.current
    if (!prev) return
    const block = prev.draft_blocks.find((b) => b.id === blockId)
    if (!block) return
    const data = (block.data || {}) as Record<string, any>
    const changes = typeof patch === "function" ? patch(data, block, prev) : patch
    if (!changes) return
    const fields = changedFields(data, changes)
    if (fields.length === 0) return
    const nextBlock = { ...block, data: { ...data, ...changes } as OnePageBlock["data"] }
    commit(
      { ...prev, draft_blocks: prev.draft_blocks.map((b) => (b.id === blockId ? nextBlock : b)) },
      editKey("block", blockId, fields.map((f) => `data.${f}`)),
      options,
    )
  }, [commit])

  const removeBlock = useCallback((blockId: string) => {
    const prev = latestOnepageRef.current
    if (!prev) return

    // Get the index of the block being removed
    const groupIndex = prev.draft_blocks.findIndex((b) => b.id === blockId)
    if (groupIndex === -1) return
    const blockToRemove = prev.draft_blocks[groupIndex]

    // If it's a group block with children, move children to main list
    let childrenToAdd: OnePageBlock[] = []
    if (blockToRemove.type === "group") {
      const groupData = blockToRemove.data as GroupBlockData
      if (groupData.children && groupData.children.length > 0) {
        childrenToAdd = groupData.children
      }
    }

    // Filter out the removed block
    const blocks = prev.draft_blocks.filter((b) => b.id !== blockId)

    // Insert children at the position where the group was
    if (childrenToAdd.length > 0) {
      blocks.splice(groupIndex, 0, ...childrenToAdd)
    }

    commit({ ...prev, draft_blocks: renumber(blocks) }, null)
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null)
    }
  }, [commit, selectedBlockId])

  /*
    THE ARCHIVE IS PART OF THE PAGE'S HISTORY. It lived only beside the
    page, so undoing an archive put the block back on the page and left it
    in the archive too: saved like that, it was on the page and in View
    archive at once, and restoring it drew it twice. The archive now rides
    in every history step (the page's own archived_blocks, the column it is
    saved to), and undo and redo put it back with the blocks.
  */
  const putArchive = useCallback((archived: OnePageBlock[]) => {
    latestArchivedBlocksRef.current = archived
    setArchivedBlocks(archived)
  }, [])

  /*
    A PRODUCT DELETED WHILE THE EDITOR IS OPEN (lib/onepage/product-removals).
    Its blocks are taken out of this copy, on the page and in the archive, as
    a silent step: nothing else the creator changed is touched, and a page
    with nothing unsaved stays saved. Said live by the screen that deleted it
    (lib/products/deleted-signal), and by the next save's answer otherwise.
  */
  const dropProductsRef = useRef<(ids: string[]) => void>(() => {})
  dropProductsRef.current = (ids) => {
    const prev = latestOnepageRef.current
    if (!prev || ids.length === 0) return
    const blocks = withoutProducts(prev.draft_blocks, ids)
    const archived = withoutProducts(latestArchivedBlocksRef.current, ids)
    const archiveChanged = JSON.stringify(archived) !== JSON.stringify(latestArchivedBlocksRef.current)
    const blocksChanged = JSON.stringify(blocks) !== JSON.stringify(prev.draft_blocks)
    if (!archiveChanged && !blocksChanged) return
    if (archiveChanged) putArchive(archived)
    const next = { ...prev, draft_blocks: blocks } as OnePage & { archived_blocks?: unknown }
    if (archiveChanged && "archived_blocks" in prev) next.archived_blocks = archived
    commit(next, null, { silent: true })
    if (selectedBlockId && !JSON.stringify(blocks).includes(JSON.stringify(selectedBlockId))) setSelectedBlockId(null)
  }
  useEffect(() => onProductDeleted((productId) => dropProductsRef.current([productId])), [])

  const archiveBlock = useCallback((blockId: string) => {
    const prev = latestOnepageRef.current
    if (!prev) return
    const blockToArchive = prev.draft_blocks.find((b) => b.id === blockId)
    if (!blockToArchive) return
    const archived = [...latestArchivedBlocksRef.current, { ...blockToArchive, archived_at: new Date().toISOString() } as OnePageBlock]
    putArchive(archived)
    commit({ ...prev, draft_blocks: renumber(prev.draft_blocks.filter((b) => b.id !== blockId)), archived_blocks: archived } as OnePage, null)
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null)
    }
  }, [commit, putArchive, selectedBlockId])

  const unarchiveBlock = useCallback((blockId: string) => {
    const prev = latestOnepageRef.current
    if (!prev) return
    const blockToRestore = latestArchivedBlocksRef.current.find((b) => b.id === blockId)
    if (!blockToRestore) return

    const blocks = [...prev.draft_blocks]
    // Insert after header if exists, otherwise at beginning
    const headerIndex = blocks.findIndex((b) => b.type === "header")
    if (headerIndex !== -1) {
      blocks.splice(headerIndex + 1, 0, { ...blockToRestore, archived_at: undefined } as OnePageBlock)
    } else {
      blocks.unshift({ ...blockToRestore, archived_at: undefined } as OnePageBlock)
    }
    const archived = latestArchivedBlocksRef.current.filter((b) => b.id !== blockId)
    putArchive(archived)
    commit({ ...prev, draft_blocks: renumber(blocks), archived_blocks: archived } as OnePage, null)
  }, [commit, putArchive])

  const reorderBlocks = useCallback((blocks: OnePageBlock[]) => {
    const prev = latestOnepageRef.current
    if (!prev) return
    const placed = renumber(blocks)
    const unchanged = placed.length === prev.draft_blocks.length && placed.every((b, i) => b === prev.draft_blocks[i])
    if (unchanged) return
    commit({ ...prev, draft_blocks: placed }, null)
  }, [commit])

  const moveBlockUp = useCallback((blockId: string) => {
    const prev = latestOnepageRef.current
    if (!prev) return
    const blocks = [...prev.draft_blocks]
    const index = blocks.findIndex((b) => b.id === blockId)
    if (index <= 0) return
    /* Never above the profile header, and the header is never moved (the OnePage production audit, B9). */
    if (blocks[index - 1].type === "header" || blocks[index].type === "header") return
    ;[blocks[index - 1], blocks[index]] = [blocks[index], blocks[index - 1]]
    commit({ ...prev, draft_blocks: renumber(blocks) }, null)
  }, [commit])

  const moveBlockDown = useCallback((blockId: string) => {
    const prev = latestOnepageRef.current
    if (!prev) return
    const blocks = [...prev.draft_blocks]
    const index = blocks.findIndex((b) => b.id === blockId)
    if (index === -1 || index >= blocks.length - 1) return
    /* The header itself is not moved; a block above it (an older page) moving down goes below it, which is right. */
    if (blocks[index].type === "header") return
    ;[blocks[index], blocks[index + 1]] = [blocks[index + 1], blocks[index]]
    commit({ ...prev, draft_blocks: renumber(blocks) }, null)
  }, [commit])

  const toggleBlockEnabled = useCallback((blockId: string) => {
    const block = latestOnepageRef.current?.draft_blocks.find((b) => b.id === blockId)
    if (!block) return
    updateBlock(blockId, { enabled: !block.enabled })
  }, [updateBlock])

  const updateSettings = useCallback((updates: Partial<OnePage["settings"]>, options?: EditOptions) => {
    const prev = latestOnepageRef.current
    if (!prev) return
    const fields = changedFields(prev.settings as any, updates as any)
    if (fields.length === 0) return
    commit({ ...prev, settings: { ...prev.settings, ...updates } }, editKey("settings", null, fields), options)
  }, [commit])

  const updateSlug = useCallback((slug: string) => {
    updateOnePage({ slug })
  }, [updateOnePage])

  /**
   * UNDO AND REDO ARE ORDINARY MOVES, WITH NO FLAG LEFT BEHIND.
   *
   * They used to set `isUndoRedoAction` for addToHistory to consume, but they
   * never went through addToHistory themselves, so the flag stayed up and
   * swallowed the next real edit: type, undo, type again, and the second
   * typing was not in the history at all. Now they only move the index; the
   * first edit afterwards starts a new step because stepBack and stepForward
   * close the open one.
   */
  const restore = useCallback((stack: HistoryStack<OnePage>) => {
    const current = latestOnepageRef.current
    const entry = clonePage(stack.entries[stack.index])
    const restored = current ? { ...entry, ...publishedPart(current) } : entry
    historyRef.current = stack
    latestOnepageRef.current = restored
    setOnePageState(restored)
    const archived = (restored as { archived_blocks?: OnePageBlock[] }).archived_blocks
    putArchive(Array.isArray(archived) ? archived : [])
    syncHistoryFlags()
    /*
      BACK AT THE SAVED PAGE IS SAVED. Undoing every edit since the last
      save left the editor saying Unsaved, and asking before leaving, about
      a page identical to the one that is live. When the step undo or redo
      lands on is the page as it was saved, and nothing is typed in a field
      that keeps its own text, the page is clean again.
    */
    if (!looseEditRef.current && !savingRef.current && savedFieldsRef.current !== null && savedFields(restored) === savedFieldsRef.current) {
      editRevisionRef.current += 1
      savedRevisionRef.current = editRevisionRef.current
      setIsDirty(false)
      setSaveState((s) => (s === "error" ? "idle" : s))
    } else {
      markDirty()
    }
  }, [markDirty, putArchive, syncHistoryFlags])

  const undo = useCallback(() => {
    const stack = historyRef.current
    const back = stack && stepBack(stack)
    if (back) restore(back)
  }, [restore])

  const redo = useCallback(() => {
    const stack = historyRef.current
    const forward = stack && stepForward(stack)
    if (forward) restore(forward)
  }, [restore])

  /**
   * Resolves with whether the page was saved. A save asked for while one is
   * running waits and then sends the page as it is by then (serializeSaves),
   * instead of returning straight away as if it had saved.
   */
  const save = useCallback(async (force: boolean = false): Promise<SaveResult> => {
    if (!latestOnepageRef.current) return { ok: false, error: describeSaveFailure(0, null), status: null }
    // Allow force save for special cases like onboarding completion
    if (force) {
      forceSaveRef.current = true
    } else if (!forceSaveRef.current && editRevisionRef.current === savedRevisionRef.current) {
      return { ok: true }
    }
    /* The revision this save is for: a failure is retried only while nothing has been typed since (afterSaveRef). */
    const sent = editRevisionRef.current
    const result = await requestSave()
    afterSaveRef.current(result, sent)
    return result
  }, [requestSave])

  const publish = useCallback(() => save(true), [save])
  saveNowRef.current = () => {
    quietSaveRef.current = true
    void save()
  }

  /*
    BACK ONLINE, OR BACK IN THE APP: a retry that is waiting goes now. Coming
    back to the editor asks nothing else of the server, so a phone that wakes
    the app twenty times a day sends nothing when there is nothing to send.
  */
  const writeDraftNowRef = useRef<() => void>(() => {})
  useEffect(() => {
    const retryNow = () => {
      if (!retryRef.current.timer) return
      window.clearTimeout(retryRef.current.timer)
      retryRef.current.timer = 0
      saveNowRef.current()
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") retryNow()
      /* Going to the background is often the last moment an app gets: the unsaved work is written now, not in 400ms. */
      else writeDraftNowRef.current()
    }
    const onLeave = () => writeDraftNowRef.current()
    window.addEventListener("online", retryNow)
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pagehide", onLeave)
    return () => {
      window.removeEventListener("online", retryNow)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pagehide", onLeave)
      if (retryRef.current.timer) window.clearTimeout(retryRef.current.timer)
    }
  }, [])

  /* ── Unsaved work kept on the device (lib/onepage/local-draft) ── */
  const [draftQuestion, setDraftQuestion] = useState<{ at: number } | null>(null)
  const draftQuestionRef = useRef<LocalDraft | null>(null)
  const [draftRestoredAt, setDraftRestoredAt] = useState<number | null>(null)

  /* The kept work laid over the page as one ordinary edit: unsaved, and one undo takes it away. */
  const applyDraft = useCallback((draft: LocalDraft) => {
    const current = latestOnepageRef.current
    if (!current) return
    const kept = draft.fields.archived_blocks
    if (Array.isArray(kept)) putArchive(kept as OnePageBlock[])
    commit(withDraft(current, draft), null)
  }, [commit, putArchive])

  /* Opening the editor: is there work on this device that never reached a save? Asked once. */
  const draftCheckedRef = useRef(false)
  useEffect(() => {
    if (draftCheckedRef.current) return
    draftCheckedRef.current = true
    const initial = latestOnepageRef.current
    if (!initial?.id) return
    const draft = readDraft(deviceStore(), initial.id)
    if (!draft) return
    const decision = draftDecision(draft, initial, baseVersionRef.current)
    if (decision === "none") {
      clearDraft(deviceStore(), initial.id)
    } else if (decision === "restore") {
      applyDraft(draft)
      setDraftRestoredAt(Date.now())
    } else {
      draftQuestionRef.current = draft
      setDraftQuestion({ at: draft.at })
    }
  }, [applyDraft])

  const answerDraftQuestion = useCallback((useDevice: boolean) => {
    const draft = draftQuestionRef.current
    draftQuestionRef.current = null
    setDraftQuestion(null)
    if (!draft) return
    if (useDevice) applyDraft(draft)
    else clearDraft(deviceStore(), draft.pageId)
  }, [applyDraft])

  /*
    DISCARD MEANS DISCARD (the OnePage production audit, S5). Choosing
    Discard on the way out left the device's copy of the unsaved work in
    place, and pagehide wrote it again on the way out, so the next open said
    "Unsaved changes restored" and the next Save published what was thrown
    away. The copy is dropped, and the page counts as saved so nothing is
    written back while leaving.
  */
  const discardUnsaved = useCallback(() => {
    const page = latestOnepageRef.current
    savedRevisionRef.current = editRevisionRef.current
    looseEditRef.current = false
    draftQuestionRef.current = null
    if (page?.id) clearDraft(deviceStore(), page.id)
  }, [])

  const writeDraftNow = useCallback(() => {
    const page = latestOnepageRef.current
    if (!page?.id || draftQuestionRef.current) return
    if (editRevisionRef.current === savedRevisionRef.current && !looseEditRef.current) return
    writeDraft(deviceStore(), { v: 1, pageId: page.id, base: baseVersionRef.current, at: Date.now(), fields: draftFieldsOf(page, latestArchivedBlocksRef.current), saved: savedFieldsRef.current })
  }, [])
  writeDraftNowRef.current = writeDraftNow

  /* A moment after each edit while the page is unsaved; cleared once it is saved (or undone back to the saved page). */
  const pageId = onepage?.id
  useEffect(() => {
    if (!pageId) return
    if (!isDirty) {
      if (!draftQuestionRef.current && editRevisionRef.current === savedRevisionRef.current) clearDraft(deviceStore(), pageId)
      return
    }
    const id = window.setTimeout(writeDraftNow, DRAFT_WRITE_MS)
    return () => window.clearTimeout(id)
  }, [onepage, pageId, isDirty, writeDraftNow])

  const loadTemplates = useCallback(async () => {
    try {
      const response = await fetch("/api/onepage/templates")
      if (response.ok) {
        const data = await response.json()
        setTemplates(data.templates || [])
      }
    } catch {
      console.error("Failed to load templates")
    }
  }, [])

  useLayoutEffect(() => {
    const page = latestOnepageRef.current
    if (!page || page.avatar_url === canonicalAvatar) return
    const next = { ...page, avatar_url: canonicalAvatar }
    latestOnepageRef.current = next
    setOnePageState(next)
  }, [canonicalAvatar, onepage?.avatar_url])

  return (
    <OnePageContext.Provider
      value={{
        onepage,
        isLoading,
        selectedBlockId,
        activeSection,
        isDirty,
        saveState,
        saveError,
        canUndo: historyFlags.canUndo,
        canRedo: historyFlags.canRedo,
        templates,
        archivedBlocks,
        setOnePage,
        setActiveSection,
        setSelectedBlockId,
        getLatestOnePage,
        getSavedSettings,
        updateProfile,
        updateTheme,
        applyTemplate,
        applyThemeLook,
        updateSocialLinks,
        addBlock,
        updateBlock,
        updateBlockData,
        removeBlock,
        archiveBlock,
        unarchiveBlock,
        reorderBlocks,
        moveBlockUp,
        moveBlockDown,
        toggleBlockEnabled,
        updateSettings,
        updateOnePage,
        updateSlug,
        markDirty: markLooseDirty,
        undo,
        redo,
        save,
        publish,
        retrying,
        draftQuestion,
        answerDraftQuestion,
        draftRestoredAt,
        discardUnsaved,
        loadTemplates,
      }}
    >
      {children}
    </OnePageContext.Provider>
  )
}
