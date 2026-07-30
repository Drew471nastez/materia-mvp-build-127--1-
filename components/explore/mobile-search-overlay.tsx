"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Clock, ArrowUpLeft, X, Store } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { useRecentSearches } from "@/lib/hooks/use-recent-searches"
import { CATEGORIES } from "@/lib/marketplace/categories"
import { SmartLink } from "@/components/smart-link"
import { IosSpinner } from "./ios-spinner"
import { cn } from "@/lib/utils"

type SearchTab = "items" | "categories" | "people"

const TABS: ReadonlyArray<readonly [SearchTab, string]> = [
  ["items", "mfeed.tab_items"],
  ["categories", "mfeed.tab_categories"],
  ["people", "mfeed.tab_people"],
]

// Popular query expansions — the "platform knows what people search" signal.
// Typing a token surfaces the popular full queries people actually run.
const POPULAR_EXPANSIONS: Record<string, string[]> = {
  jordan: ["jordan 4", "jordan 4 black", "jordan 4 white", "jordan 1", "jordan 1 chicago", "jordan retro"],
  "air force": ["air force 1", "air force 1 white", "air force 1 shadow"],
  airforce: ["air force 1", "air force 1 white"],
  nike: ["nike air max", "nike dunk", "nike tech fleece", "nike vintage"],
  dunk: ["nike dunk low", "dunk panda", "dunk low"],
  adidas: ["adidas samba", "adidas gazelle", "adidas spezial", "adidas campus"],
  samba: ["adidas samba", "samba og"],
  gazelle: ["adidas gazelle", "gazelle indoor"],
  yeezy: ["yeezy 350", "yeezy slide", "yeezy boost"],
  newbalance: ["new balance 550", "new balance 990", "new balance 2002r"],
  "new balance": ["new balance 550", "new balance 990", "new balance 2002r"],
  polo: ["polo ralph lauren", "polo shirt", "polo vintage"],
  ralph: ["polo ralph lauren", "ralph lauren vintage"],
  "north face": ["north face jacket", "north face puffer", "north face nuptse"],
  northface: ["north face jacket", "north face puffer"],
  carhartt: ["carhartt jacket", "carhartt pants", "carhartt vintage"],
  stone: ["stone island", "stone island jacket"],
  levis: ["levis 501", "levis vintage", "levis denim"],
  "levi's": ["levis 501", "levis vintage"],
  vintage: ["vintage tee", "vintage jacket", "vintage denim", "vintage nike"],
  tee: ["vintage tee", "graphic tee", "band tee"],
  hoodie: ["nike hoodie", "vintage hoodie", "champion hoodie"],
  bag: ["shoulder bag", "tote bag", "vintage bag"],
  dress: ["summer dress", "vintage dress", "mini dress"],
  jeans: ["baggy jeans", "levis jeans", "vintage jeans"],
}

function buildKeywordSuggestions(raw: string, realTitles: string[]): string[] {
  const query = raw.trim().toLowerCase()
  if (!query) return []
  const out: string[] = []
  const push = (s: string) => {
    const v = s.trim()
    if (v && v.length <= 44 && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v)
  }

  // 1. Popular expansions for any token the query touches.
  for (const [key, vals] of Object.entries(POPULAR_EXPANSIONS)) {
    if (query.includes(key) || key.includes(query)) {
      for (const v of vals) if (v.toLowerCase().includes(query) || query.includes(v.toLowerCase())) push(v)
      for (const v of vals) push(v)
    }
  }
  // 2. Real listing titles that match — reflects actual on-platform inventory.
  for (const title of realTitles) {
    if (out.length >= 8) break
    if (title && title.toLowerCase().includes(query)) push(title)
  }
  // 3. Always let the user search exactly what they typed.
  push(raw.trim())

  return out.slice(0, 6)
}

interface Person {
  id: string
  slug?: string
  headline?: string | null
  products_count?: number | null
  profile?: { display_name?: string | null; avatar_url?: string | null; username?: string | null } | null
}

/**
 * Full-screen mobile search surface (Depop-style). Opens with a smooth blend,
 * three tabs — Items / Categories / People — recent searches, platform-aware
 * keyword suggestions, category tiles and live member search.
 */
export function MobileSearchOverlay({
  open,
  onClose,
  onSelectCategory,
}: {
  open: boolean
  onClose: () => void
  onSelectCategory: (id: string) => void
}) {
  const { t } = useLocale()
  const router = useRouter()
  const { searches, add: addSearch, remove: removeSearch, clear: clearSearches } = useRecentSearches()

  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const [tab, setTab] = useState<SearchTab>("items")
  const [query, setQuery] = useState("")
  const [titles, setTitles] = useState<string[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [peopleLoading, setPeopleLoading] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  // Smooth mount / open / close blend.
  useEffect(() => {
    if (open) {
      setMounted(true)
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(r)
    }
    setShown(false)
    const timer = setTimeout(() => setMounted(false), 300)
    return () => clearTimeout(timer)
  }, [open])

  // Focus the field (and reset transient state) each time it opens.
  useEffect(() => {
    if (!open) return
    setTab("items")
    setQuery("")
    setPeople([])
    const timer = setTimeout(() => inputRef.current?.focus(), 120)
    return () => clearTimeout(timer)
  }, [open])

  const trimmed = query.trim()

  // Debounced live fetch: product titles (for keyword suggestions) + people.
  useEffect(() => {
    if (!open || trimmed.length < 2) {
      setTitles([])
      setPeople([])
      setPeopleLoading(false)
      return
    }
    const ctrl = new AbortController()
    setPeopleLoading(true)
    const timer = setTimeout(async () => {
      try {
        const [itemsRes, peopleRes] = await Promise.all([
          fetch(`/api/v2/search?q=${encodeURIComponent(trimmed)}&limit=8`, { signal: ctrl.signal }).catch(() => null),
          fetch(`/api/v2/search/people?q=${encodeURIComponent(trimmed)}&limit=8`, { signal: ctrl.signal }).catch(() => null),
        ])
        if (itemsRes?.ok) {
          const data = await itemsRes.json()
          setTitles(((data?.results ?? []) as any[]).map((r) => r?.title).filter(Boolean))
        }
        if (peopleRes?.ok) {
          const data = await peopleRes.json()
          setPeople((data?.people ?? []) as Person[])
        }
      } catch {
        /* aborted / offline — keep prior */
      } finally {
        if (!ctrl.signal.aborted) setPeopleLoading(false)
      }
    }, 220)
    return () => {
      ctrl.abort()
      clearTimeout(timer)
    }
  }, [open, trimmed])

  const suggestions = useMemo(() => buildKeywordSuggestions(query, titles), [query, titles])

  const runSearch = useCallback(
    (q: string) => {
      const v = q.trim()
      if (!v) return
      addSearch(v)
      onClose()
      router.push(`/?q=${encodeURIComponent(v)}`)
    },
    [addSearch, onClose, router],
  )

  const pickCategory = useCallback(
    (id: string) => {
      onSelectCategory(id)
      onClose()
    },
    [onSelectCategory, onClose],
  )

  if (!mounted) return null

  const recent = searches.slice(0, 4)

  return (
    <div
      className="md:hidden fixed inset-0 z-[80] flex flex-col bg-white"
      style={{
        height: "100dvh",
        opacity: shown ? 1 : 0,
        transform: shown ? "scale(1)" : "scale(0.97)",
        transformOrigin: "50% 42%",
        transition: "opacity 300ms cubic-bezier(0.22,1,0.36,1), transform 300ms cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      {/* Header: search field + close */}
      <div className="shrink-0 px-4" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.85rem)" }}>
        <div className="flex items-center gap-2">
          <form
            className="relative flex-1"
            onSubmit={(e) => {
              e.preventDefault()
              runSearch(query)
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              inputMode="search"
              enterKeyHint="search"
              placeholder={t("mfeed.search_items_members")}
              className="h-11 w-full rounded-full border border-neutral-200 bg-neutral-100 pl-10 pr-9 text-sm text-neutral-900 outline-none focus:border-neutral-300"
            />
            {query && (
              <button
                type="button"
                aria-label={t("mfeed.clear_all")}
                onClick={() => {
                  setQuery("")
                  inputRef.current?.focus()
                }}
                className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-neutral-300/70 text-neutral-600 active:scale-90"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </form>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 px-1 text-[15px] font-medium text-neutral-900 active:opacity-60"
          >
            {t("mfeed.close")}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 mt-2 flex items-stretch border-b border-neutral-100 px-2">
        {TABS.map(([id, key]) => {
          const active = tab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "flex flex-1 flex-col items-center pb-2.5 pt-1 text-[15px] transition-colors duration-200",
                active ? "font-semibold text-neutral-900" : "font-medium text-neutral-400",
              )}
            >
              <span className="relative inline-flex flex-col items-center">
                {t(key)}
                <span
                  className={cn(
                    "mt-2 h-[2px] w-full rounded-full bg-neutral-900 transition-all duration-300 ease-out",
                    active ? "scale-x-100 opacity-100" : "scale-x-50 opacity-0",
                  )}
                />
              </span>
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide" style={{ scrollbarWidth: "none" }}>
        <div key={`${tab}-${trimmed ? "q" : "e"}`} className="animate-in fade-in-0 duration-200 ease-out">
          {tab === "items" && (
            <ItemsTab
              trimmed={trimmed}
              recent={recent}
              suggestions={suggestions}
              onRun={runSearch}
              onRemoveRecent={removeSearch}
              onClearRecent={clearSearches}
              t={t}
            />
          )}
          {tab === "categories" && <CategoriesTab onPick={pickCategory} t={t} />}
          {tab === "people" && (
            <PeopleTab trimmed={trimmed} people={people} loading={peopleLoading} onClose={onClose} t={t} />
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------------- Items tab ---------------- */

function ItemsTab({
  trimmed,
  recent,
  suggestions,
  onRun,
  onRemoveRecent,
  onClearRecent,
  t,
}: {
  trimmed: string
  recent: { q: string }[]
  suggestions: string[]
  onRun: (q: string) => void
  onRemoveRecent: (q: string) => void
  onClearRecent: () => void
  t: (k: string) => string
}) {
  if (!trimmed) {
    if (recent.length === 0) {
      return (
        <div className="flex min-h-[40vh] flex-col items-center justify-center px-8 text-center">
          <Search className="mb-3 h-7 w-7 text-neutral-300" />
          <p className="text-[13px] text-neutral-500">{t("mfeed.search_placeholder")}</p>
        </div>
      )
    }
    return (
      <div className="px-1 py-2">
        <div className="flex items-center justify-between px-4 pb-1 pt-2">
          <span className="text-[13px] font-semibold text-neutral-500">{t("mfeed.recent_searches")}</span>
          <button type="button" onClick={onClearRecent} className="text-[12px] font-medium text-neutral-400 active:opacity-60">
            {t("mfeed.clear_all")}
          </button>
        </div>
        {recent.map((r) => (
          <Row key={r.q} icon={<Clock className="h-[18px] w-[18px] text-neutral-400" />} label={r.q} onClick={() => onRun(r.q)}>
            <button
              type="button"
              aria-label={t("mfeed.clear_all")}
              onClick={(e) => {
                e.stopPropagation()
                onRemoveRecent(r.q)
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-300 active:scale-90"
            >
              <X className="h-4 w-4" />
            </button>
          </Row>
        ))}
      </div>
    )
  }

  return (
    <div className="px-1 py-2">
      {suggestions.map((s) => (
        <Row
          key={s}
          icon={<Search className="h-[18px] w-[18px] text-neutral-400" />}
          label={s}
          query={trimmed}
          onClick={() => onRun(s)}
        >
          <ArrowUpLeft className="h-[18px] w-[18px] text-neutral-300" />
        </Row>
      ))}
    </div>
  )
}

/** A suggestion / recent row. Bolds the part of the label past the typed query. */
function Row({
  icon,
  label,
  query,
  onClick,
  children,
}: {
  icon: React.ReactNode
  label: string
  query?: string
  onClick: () => void
  children?: React.ReactNode
}) {
  let head = ""
  let tail = label
  if (query) {
    const idx = label.toLowerCase().indexOf(query.toLowerCase())
    if (idx === 0) {
      head = label.slice(0, query.length)
      tail = label.slice(query.length)
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-neutral-50"
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 truncate text-[15px] text-neutral-800">
        {head ? (
          <>
            <span className="text-neutral-500">{head}</span>
            <span className="font-semibold text-neutral-900">{tail}</span>
          </>
        ) : (
          label
        )}
      </span>
      {children}
    </button>
  )
}

/* ---------------- Categories tab ---------------- */

function CategoriesTab({ onPick, t }: { onPick: (id: string) => void; t: (k: string) => string }) {
  const cats = CATEGORIES.filter((c) => c.id !== "all")
  return (
    <div className="px-4 py-4">
      <p className="pb-3 text-[13px] font-semibold text-neutral-500">{t("mfeed.browse_categories")}</p>
      <div className="grid grid-cols-2 gap-2.5">
        <CategoryTile id="all" label={t("category.all")} Icon={CATEGORIES[0].icon} onPick={onPick} />
        {cats.map((c) => (
          <CategoryTile key={c.id} id={c.id} label={t(`category.${c.id}`)} Icon={c.icon} onPick={onPick} />
        ))}
      </div>
    </div>
  )
}

function CategoryTile({
  id,
  label,
  Icon,
  onPick,
}: {
  id: string
  label: string
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  onPick: (id: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(id)}
      className="flex items-center gap-3 rounded-2xl border border-neutral-200/70 bg-neutral-50 px-4 py-3.5 text-left transition-all duration-200 active:scale-[0.97] active:bg-neutral-100"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.04]">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
      </span>
      <span className="truncate text-[14px] font-medium text-neutral-800">{label}</span>
    </button>
  )
}

/* ---------------- People tab ---------------- */

function PeopleTab({
  trimmed,
  people,
  loading,
  onClose,
  t,
}: {
  trimmed: string
  people: Person[]
  loading: boolean
  onClose: () => void
  t: (k: string) => string
}) {
  if (trimmed.length < 2) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center px-8 text-center">
        <Store className="mb-3 h-7 w-7 text-neutral-300" />
        <p className="text-[13px] text-neutral-500">{t("mfeed.search_people_hint")}</p>
      </div>
    )
  }
  if (loading && people.length === 0) {
    return (
      <div className="flex min-h-[35vh] items-center justify-center">
        <IosSpinner size={24} />
      </div>
    )
  }
  if (people.length === 0) {
    return (
      <div className="flex min-h-[35vh] flex-col items-center justify-center px-8 text-center">
        <p className="text-[14px] font-semibold text-neutral-700">{t("mfeed.no_people")}</p>
      </div>
    )
  }
  return (
    <div className="px-1 py-2">
      {people.map((p) => (
        <PersonRow key={p.id} person={p} onClose={onClose} t={t} />
      ))}
    </div>
  )
}

function PersonRow({ person, onClose, t }: { person: Person; onClose: () => void; t: (k: string) => string }) {
  const name = person.profile?.display_name || person.profile?.username || "Membru"
  const username = person.profile?.username || person.slug || ""
  const avatar = person.profile?.avatar_url
  const count = person.products_count ?? 0
  const [failed, setFailed] = useState(false)

  return (
    <SmartLink
      href={username ? `/u/${username}` : "#"}
      useClientNav
      onClick={onClose}
      className="flex w-full items-center gap-3 px-4 py-2.5 transition-colors active:bg-neutral-50"
    >
      {avatar && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          alt={name}
          width={44}
          height={44}
          onError={() => setFailed(true)}
          className="h-11 w-11 shrink-0 rounded-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[16px] font-semibold text-neutral-500">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-semibold text-neutral-900">{name}</span>
        <span className="truncate text-[12px] text-neutral-500">
          {username ? `@${username}` : ""}
          {count > 0 ? ` · ${count} ${t("mfeed.items_count")}` : ""}
        </span>
      </span>
    </SmartLink>
  )
}
