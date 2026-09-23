"use client"

/**
 * "On this page", with the heading being read marked. The links work with no
 * script at all; this only moves the mark as the page scrolls.
 */
import { useEffect, useState } from "react"

export function Toc({ items }: { items: { id: string; text: string; level: 2 | 3 }[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "")

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e)
    if (!els.length) return
    const seen = new Map<string, boolean>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting)
        /* The first heading on screen; failing that, the last one scrolled past. */
        const onScreen = items.find((i) => seen.get(i.id))
        if (onScreen) { setActive(onScreen.id); return }
        const passed = els.filter((el) => el.getBoundingClientRect().top < 0).pop()
        if (passed) setActive(passed.id)
      },
      { rootMargin: "0px 0px -70% 0px" },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [items])

  if (!items.length) return null
  return (
    <nav aria-label="On this page">
      <p className="text-[12px] font-semibold text-neutral-900">On this page</p>
      <ul className="mt-3 space-y-2 border-l border-neutral-200">
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              className={`-ml-px block border-l py-0.5 text-[13px] leading-[1.45] transition-colors ${i.level === 3 ? "pl-6" : "pl-3"} ${
                active === i.id ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"
              }`}
            >
              {i.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
