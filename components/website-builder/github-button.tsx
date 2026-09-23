"use client"

/**
 * ===========================================================================
 *  GITHUB, IN THE EDITOR'S TOP BAR
 * ===========================================================================
 * GitHub's own mark, because that is what people look for when they want the
 * repository, and it opens Website settings on the GitHub path of
 * Connections. A green dot on its corner when this site is linked to a
 * repository; nothing at all when it is not, so the bar does not nag.
 *
 * Whether it is linked is one small read (`?brief=1`, one row, no call to
 * GitHub), asked when the editor opens and again whenever `recheck` changes,
 * which the editor ties to Website settings closing: that is the only place
 * a link can be made or removed.
 */
import { useEffect, useState } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { GitHubMark } from "@/components/website-builder/github-sync-panel"

export function GitHubTopBarButton({
  installId,
  onOpen,
  recheck,
}: {
  installId: string
  onOpen: () => void
  /** Any value; the link is read again when it changes. */
  recheck?: unknown
}) {
  const [repo, setRepo] = useState<string | null>(null)

  useEffect(() => {
    if (!installId) return
    let live = true
    fetch(`/api/website-builder/themes/${encodeURIComponent(installId)}/github?brief=1`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { linked?: boolean; repo?: string | null } | null) => {
        if (live) setRepo(d?.linked && d.repo ? d.repo : null)
      })
      .catch(() => {
        /* No dot is the honest answer when the question could not be asked. */
      })
    return () => {
      live = false
    }
  }, [installId, recheck])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onOpen}
          aria-label="GitHub"
          data-linked={repo ? "" : undefined}
          className="relative h-8 w-8 flex items-center justify-center rounded-lg text-[var(--wb-chrome-fg-2)] hover:bg-[var(--wb-chrome-hover)] hover:text-[var(--wb-chrome-fg)] transition-colors shrink-0 active:scale-90"
        >
          <GitHubMark className="h-4 w-4" />
          {repo && (
            <span
              aria-hidden
              className="absolute right-[5px] top-[5px] h-[7px] w-[7px] rounded-full bg-emerald-500 ring-2 ring-[var(--wb-chrome-bg)]"
            />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{repo ? `GitHub: ${repo}` : "GitHub"}</TooltipContent>
    </Tooltip>
  )
}
