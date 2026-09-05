"use client"

interface StickyHeaderWrapperProps {
  children: React.ReactNode
  className?: string
}

export function StickyHeaderWrapper({ children, className = "" }: StickyHeaderWrapperProps) {
  return <div className={`${className} w-full`}>{children}</div>
}
