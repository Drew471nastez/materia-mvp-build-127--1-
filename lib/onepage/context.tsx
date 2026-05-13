"use client"

import type React from "react"
import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react"
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

const MAX_HISTORY = 50

type ActiveSection = "profile" | "theme" | "blocks" | "socials" | "leads" | "settings"
type SaveState = "idle" | "saving" | "saved" | "error"

interface OnePageContextType {
  onepage: OnePage | null
  isLoading: boolean
  selectedBlockId: string | null
  activeSection: ActiveSection
  isDirty: boolean
  saveState: SaveState
  canUndo: boolean
  canRedo: boolean
  templates: OnePageTemplate[]
  archivedBlocks: OnePageBlock[]

  setOnePage: (onepage: OnePage) => void
  setActiveSection: (section: ActiveSection) => void
  setSelectedBlockId: (id: string | null) => void

  updateProfile: (updates: { title?: string; bio?: string; avatar_url?: string | null; avatar_video_url?: string | null; avatar_video_crop?: { x: number; y: number; width: number; height: number } | null }) => void

  updateTheme: (updates: Partial<OnePageTheme>) => void
  applyTemplate: (template: OnePageTemplate) => void

  updateSocialLinks: (updates: Partial<OnePageSocialLinks>) => void

  addBlock: (type: OnePageBlockType, afterId?: string, initialData?: Record<string, any>) => OnePageBlock | null
  updateBlock: (blockId: string, updates: Partial<OnePageBlock>) => void
  removeBlock: (blockId: string) => void
  archiveBlock: (blockId: string) => void
  unarchiveBlock: (blockId: string) => void
  reorderBlocks: (blocks: OnePageBlock[]) => void
  moveBlockUp: (blockId: string) => void
  moveBlockDown: (blockId: string) => void
  toggleBlockEnabled: (blockId: string) => void

  updateSettings: (updates: Partial<OnePage["settings"]>) => void
  updateSlug: (slug: string) => void
  markDirty: () => void

  undo: () => void
  redo: () => void

  save: (force?: boolean) => Promise<void>
  publish: () => Promise<void>

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

export function OnePageProvider({ children, initialOnePage }: OnePageProviderProps) {
  const [onepage, setOnePageState] = useState<OnePage | null>(initialOnePage || null)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<ActiveSection>("blocks")
  const [isDirty, setIsDirty] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [templates, setTemplates] = useState<OnePageTemplate[]>([])
  // Initialize archived blocks from database (stored in onepage.archived_blocks)
  const [archivedBlocks, setArchivedBlocks] = useState<OnePageBlock[]>(
    () => (initialOnePage as any)?.archived_blocks || []
  )
  
  const [history, setHistory] = useState<OnePage[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const isUndoRedoAction = useRef(false)
  
  const latestOnepageRef = useRef<OnePage | null>(onepage)
  const isSaving = useRef(false)

  // Keep ref in sync with state
  useEffect(() => {
    latestOnepageRef.current = onepage
  }, [onepage])

  const canUndo = historyIndex > 0
  const canRedo = historyIndex < history.length - 1

  useEffect(() => {
    if (onepage && history.length === 0) {
      setHistory([JSON.parse(JSON.stringify(onepage))])
      setHistoryIndex(0)
    }
  }, [onepage, history.length])

  const addToHistory = useCallback((newState: OnePage) => {
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false
      return
    }

    setHistory((prev) => {
      const newHistory = prev.slice(0, historyIndex + 1)
      newHistory.push(JSON.parse(JSON.stringify(newState)))
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift()
      }
      return newHistory
    })
    setHistoryIndex((prev) => Math.min(prev + 1, MAX_HISTORY - 1))
  }, [historyIndex])

  // Mark as dirty when changes are made (NO autosave)
  const markDirty = useCallback(() => {
    setIsDirty(true)
    // Reset saved state when changes are made
    if (saveState === "saved") {
      setSaveState("idle")
    }
  }, [saveState])

  // Ref to track latest archived blocks for save
  const latestArchivedBlocksRef = useRef<OnePageBlock[]>(archivedBlocks)
  useEffect(() => {
    latestArchivedBlocksRef.current = archivedBlocks
  }, [archivedBlocks])

  // Manual save and publish function
  const saveAndPublish = useCallback(async () => {
    const currentOnepage = latestOnepageRef.current
    if (!currentOnepage) return

    // Prevent concurrent saves
    if (isSaving.current) {
      return
    }

    isSaving.current = true
    setSaveState("saving")

    try {
      // Step 1: Save draft to database (include archived_blocks)
      const saveResponse = await fetch("/api/onepage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...currentOnepage,
          archived_blocks: latestArchivedBlocksRef.current,
        }),
      })

      if (!saveResponse.ok) {
        throw new Error("Save failed")
      }

      // Step 2: Publish with the SAME data we just saved
      const publishResponse = await fetch("/api/onepage/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: currentOnepage.id,
          draft_blocks: currentOnepage.draft_blocks,
          theme: currentOnepage.theme,
          title: currentOnepage.title,
          bio: currentOnepage.bio,
          avatar_url: currentOnepage.avatar_url,
          avatar_video_url: currentOnepage.avatar_video_url,
          avatar_video_crop: (currentOnepage.settings as any)?.avatar_video_crop || null,
          social_links: currentOnepage.social_links,
        }),
      })

      if (publishResponse.ok) {
        const data = await publishResponse.json()
        setOnePageState((prev) => prev ? {
          ...prev,
          status: "published",
          published_at: data.published_at,
          published_blocks: prev.draft_blocks,
          published_theme: prev.theme,
          published_profile: {
            title: prev.title,
            bio: prev.bio,
            avatar_url: prev.avatar_url,
            avatar_video_url: prev.avatar_video_url,
            avatar_video_crop: (prev.settings as any)?.avatar_video_crop || null,
          },
          published_social_links: prev.social_links,
        } : prev)
        setSaveState("saved")
        setIsDirty(false)
      } else {
        throw new Error("Publish failed")
      }
    } catch (error) {
      console.error("Save/publish error:", error)
      setSaveState("error")
      setTimeout(() => setSaveState("idle"), 3000)
    } finally {
      isSaving.current = false
    }
  }, [])

  const updateOnePage = useCallback((updates: Partial<OnePage>) => {
    setOnePageState((prev) => {
      if (!prev) return prev
      const newState = { ...prev, ...updates }
      addToHistory(newState)
      return newState
    })
    markDirty()
  }, [addToHistory, markDirty])

  const setOnePage = useCallback((newOnepage: OnePage) => {
    setOnePageState(newOnepage)
    setHistory([JSON.parse(JSON.stringify(newOnepage))])
    setHistoryIndex(0)
    setIsDirty(false)
    setSaveState("idle")
  }, [])

  const updateProfile = useCallback((updates: { title?: string; bio?: string; avatar_url?: string | null; avatar_video_url?: string | null; avatar_video_crop?: { x: number; y: number; width: number; height: number } | null }) => {
    // Extract avatar_video_crop and store it in settings instead of top-level
    const { avatar_video_crop, ...otherUpdates } = updates
    if (avatar_video_crop !== undefined) {
      setOnePageState((prev) => {
        if (!prev) return prev
        const newSettings = {
          ...prev.settings,
          avatar_video_crop
        }
        const newState = { ...prev, ...otherUpdates, settings: newSettings }
        addToHistory(newState)
        return newState
      })
      markDirty()
    } else {
      updateOnePage(otherUpdates)
    }
  }, [updateOnePage, addToHistory, markDirty])

  const updateTheme = useCallback((updates: Partial<OnePageTheme>) => {
    setOnePageState((prev) => {
      if (!prev) return prev
      const newTheme = { ...prev.theme, ...updates }
      const newState = { ...prev, theme: newTheme }
      addToHistory(newState)
      return newState
    })
    markDirty()
  }, [addToHistory, markDirty])

  const applyTemplate = useCallback((template: OnePageTemplate) => {
    setOnePageState((prev) => {
      if (!prev) return prev
      const newTheme = { ...template.theme, template_id: template.id }
      const newState = { ...prev, theme: newTheme }
      addToHistory(newState)
      return newState
    })
    markDirty()
  }, [addToHistory, markDirty])

  const updateSocialLinks = useCallback((updates: Partial<OnePageSocialLinks>) => {
    setOnePageState((prev) => {
      if (!prev) return prev
      const newSocialLinks = { ...prev.social_links, ...updates }
      const newState = { ...prev, social_links: newSocialLinks }
      addToHistory(newState)
      return newState
    })
    markDirty()
  }, [addToHistory, markDirty])

  const addBlock = useCallback((type: OnePageBlockType, afterId?: string, initialData?: Record<string, any>): OnePageBlock | null => {
    let newBlock: OnePageBlock | null = null
    setOnePageState((prev) => {
      if (!prev) return prev
      newBlock = createDefaultBlock(type)
      // Apply initial data overrides if provided
      if (initialData) {
        newBlock.data = { ...newBlock.data, ...initialData }
      }
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

      blocks.forEach((b, i) => {
        b.sort_order = i
      })

      const newState = { ...prev, draft_blocks: blocks }
      addToHistory(newState)
      return newState
    })
    markDirty()
    return newBlock
  }, [addToHistory, markDirty])

  const updateBlock = useCallback((blockId: string, updates: Partial<OnePageBlock>) => {
    setOnePageState((prev) => {
      if (!prev) return prev
      const blocks = prev.draft_blocks.map((b) =>
        b.id === blockId ? { ...b, ...updates } : b
      )
      const newState = { ...prev, draft_blocks: blocks }
      addToHistory(newState)
      return newState
    })
    markDirty()
  }, [addToHistory, markDirty])

  const removeBlock = useCallback((blockId: string) => {
    setOnePageState((prev) => {
      if (!prev) return prev

      // Find the block being removed
      const blockToRemove = prev.draft_blocks.find((b) => b.id === blockId)

      // If it's a group block with children, move children to main list
      let childrenToAdd: OnePageBlock[] = []
      if (blockToRemove?.type === "group") {
        const groupData = blockToRemove.data as GroupBlockData
        if (groupData.children && groupData.children.length > 0) {
          childrenToAdd = groupData.children
        }
      }

      // Get the index of the group block
      const groupIndex = prev.draft_blocks.findIndex((b) => b.id === blockId)

      // Filter out the removed block
      let blocks = prev.draft_blocks.filter((b) => b.id !== blockId)

      // Insert children at the position where the group was
      if (childrenToAdd.length > 0) {
        blocks.splice(groupIndex, 0, ...childrenToAdd)
      }

      // Re-assign sort orders
      blocks.forEach((b, i) => {
        b.sort_order = i
      })

      const newState = { ...prev, draft_blocks: blocks }
      addToHistory(newState)
      return newState
    })
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null)
    }
    markDirty()
  }, [addToHistory, markDirty, selectedBlockId])

  const archiveBlock = useCallback((blockId: string) => {
    setOnePageState((prev) => {
      if (!prev) return prev
      const blockToArchive = prev.draft_blocks.find((b) => b.id === blockId)
      if (blockToArchive) {
        setArchivedBlocks((archived) => [...archived, { ...blockToArchive, archived_at: new Date().toISOString() } as OnePageBlock])
      }
      const blocks = prev.draft_blocks.filter((b) => b.id !== blockId)
      blocks.forEach((b, i) => {
        b.sort_order = i
      })
      const newState = { ...prev, draft_blocks: blocks }
      addToHistory(newState)
      return newState
    })
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null)
    }
    markDirty()
  }, [addToHistory, markDirty, selectedBlockId])

  const unarchiveBlock = useCallback((blockId: string) => {
    const blockToRestore = archivedBlocks.find((b) => b.id === blockId)
    if (!blockToRestore) return

    setOnePageState((prev) => {
      if (!prev) return prev
      const blocks = [...prev.draft_blocks]
      // Insert after header if exists, otherwise at beginning
      const headerIndex = blocks.findIndex((b) => b.type === "header")
      if (headerIndex !== -1) {
        blocks.splice(headerIndex + 1, 0, { ...blockToRestore, archived_at: undefined } as OnePageBlock)
      } else {
        blocks.unshift({ ...blockToRestore, archived_at: undefined } as OnePageBlock)
      }
      blocks.forEach((b, i) => {
        b.sort_order = i
      })
      const newState = { ...prev, draft_blocks: blocks }
      addToHistory(newState)
      return newState
    })
    setArchivedBlocks((archived) => archived.filter((b) => b.id !== blockId))
    markDirty()
  }, [archivedBlocks, addToHistory, markDirty])

  const reorderBlocks = useCallback((blocks: OnePageBlock[]) => {
    setOnePageState((prev) => {
      if (!prev) return prev
      blocks.forEach((b, i) => {
        b.sort_order = i
      })
      const newState = { ...prev, draft_blocks: blocks }
      addToHistory(newState)
      return newState
    })
    markDirty()
  }, [addToHistory, markDirty])

  const moveBlockUp = useCallback((blockId: string) => {
    setOnePageState((prev) => {
      if (!prev) return prev
      const blocks = [...prev.draft_blocks]
      const index = blocks.findIndex((b) => b.id === blockId)
      if (index > 0) {
        ;[blocks[index - 1], blocks[index]] = [blocks[index], blocks[index - 1]]
        blocks.forEach((b, i) => {
          b.sort_order = i
        })
      }
      const newState = { ...prev, draft_blocks: blocks }
      addToHistory(newState)
      return newState
    })
    markDirty()
  }, [addToHistory, markDirty])

  const moveBlockDown = useCallback((blockId: string) => {
    setOnePageState((prev) => {
      if (!prev) return prev
      const blocks = [...prev.draft_blocks]
      const index = blocks.findIndex((b) => b.id === blockId)
      if (index < blocks.length - 1) {
        ;[blocks[index], blocks[index + 1]] = [blocks[index + 1], blocks[index]]
        blocks.forEach((b, i) => {
          b.sort_order = i
        })
      }
      const newState = { ...prev, draft_blocks: blocks }
      addToHistory(newState)
      return newState
    })
    markDirty()
  }, [addToHistory, markDirty])

  const toggleBlockEnabled = useCallback((blockId: string) => {
    updateBlock(blockId, { enabled: !onepage?.draft_blocks.find((b) => b.id === blockId)?.enabled })
  }, [updateBlock, onepage])

  const updateSettings = useCallback((updates: Partial<OnePage["settings"]>) => {
    setOnePageState((prev) => {
      if (!prev) return prev
      const newSettings = { ...prev.settings, ...updates }
      const newState = { ...prev, settings: newSettings }
      // Sync ref immediately so save() called right after sees the new values
      latestOnepageRef.current = newState
      addToHistory(newState)
      return newState
    })
    markDirty()
  }, [addToHistory, markDirty])

  const updateSlug = useCallback((slug: string) => {
    updateOnePage({ slug })
  }, [updateOnePage])

  const undo = useCallback(() => {
    if (!canUndo) return
    isUndoRedoAction.current = true
    const newIndex = historyIndex - 1
    setHistoryIndex(newIndex)
    setOnePageState(JSON.parse(JSON.stringify(history[newIndex])))
    markDirty()
  }, [canUndo, historyIndex, history, markDirty])

  const redo = useCallback(() => {
    if (!canRedo) return
    isUndoRedoAction.current = true
    const newIndex = historyIndex + 1
    setHistoryIndex(newIndex)
    setOnePageState(JSON.parse(JSON.stringify(history[newIndex])))
    markDirty()
  }, [canRedo, historyIndex, history, markDirty])

  const save = useCallback(async (force: boolean = false) => {
    // Allow force save for special cases like onboarding completion
    if (!onepage || (!isDirty && !force)) return
    await saveAndPublish()
  }, [onepage, isDirty, saveAndPublish])

  const publish = useCallback(async () => {
    if (!onepage) return
    await saveAndPublish()
  }, [onepage, saveAndPublish])

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

  return (
    <OnePageContext.Provider
      value={{
        onepage,
        isLoading,
        selectedBlockId,
        activeSection,
        isDirty,
        saveState,
        canUndo,
        canRedo,
        templates,
        archivedBlocks,
        setOnePage,
        setActiveSection,
        setSelectedBlockId,
        updateProfile,
        updateTheme,
        applyTemplate,
        updateSocialLinks,
        addBlock,
        updateBlock,
        removeBlock,
        archiveBlock,
        unarchiveBlock,
        reorderBlocks,
        moveBlockUp,
        moveBlockDown,
        toggleBlockEnabled,
        updateSettings,
        updateSlug,
        markDirty,
        undo,
        redo,
        save,
        publish,
        loadTemplates,
      }}
    >
      {children}
    </OnePageContext.Provider>
  )
}
