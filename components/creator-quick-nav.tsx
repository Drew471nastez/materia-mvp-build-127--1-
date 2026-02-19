"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { LayoutDashboard, Package, Settings, BarChart3, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface CreatorQuickNavProps {
  avatarUrl?: string | null
  creatorInitials?: string
}

export function CreatorQuickNav({ avatarUrl, creatorInitials }: CreatorQuickNavProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  const navItems = [
    { href: "/app", label: "Dashboard", icon: LayoutDashboard },
    { href: "/app/products", label: "Products", icon: Package },
    { href: "/app/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/app/settings", label: "Settings", icon: Settings },
  ]

  return (
    <div ref={menuRef} className="fixed bottom-6 right-6 z-[60]">
      {/* Expanded menu */}
      <div
        className={cn(
          "absolute bottom-16 right-0 transition-all duration-200 origin-bottom-right",
          isOpen
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-95 translate-y-2 pointer-events-none",
        )}
      >
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200/60 p-2 min-w-[180px]">
          <p className="px-3 pt-2 pb-1.5 text-[11px] font-medium text-gray-400 uppercase tracking-wider">
            Creator Menu
          </p>
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                {item.label}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Floating circle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95",
          isOpen
            ? "bg-gray-900 text-white"
            : "bg-white border border-gray-200 text-gray-700 hover:shadow-xl",
        )}
      >
        {isOpen ? (
          <X className="h-5 w-5" />
        ) : avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          <span className="text-[14px] font-semibold">
            {creatorInitials || "?"}
          </span>
        )}
      </button>
    </div>
  )
}
