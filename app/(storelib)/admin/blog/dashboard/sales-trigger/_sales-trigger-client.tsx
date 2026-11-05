"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import {
  ArrowLeft, Search, Package, User, Zap, CheckCircle, XCircle,
  Loader2, ShoppingCart, Trash2,
} from "lucide-react"

interface Product {
  id: string
  title: string
  price_cents: number
  slug: string
  creator: { id: string; user_id: string; slug: string; display_name: string }
}

interface UserResult {
  id: string
  user_id: string
  slug: string
  display_name: string
  avatar_url: string | null
}

interface LogEntry {
  id: string
  time: string
  product: string
  orderId?: string
  results?: string[]
  status: "pending" | "success" | "error"
  error?: string
}

export default function SalesTriggerClient() {
  // Product selection
  const [productSearch, setProductSearch] = useState("")
  const [productResults, setProductResults] = useState<Product[]>([])
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([])
  const [productLoading, setProductLoading] = useState(false)

  // User selection (optional)
  const [userSearch, setUserSearch] = useState("")
  const [userResults, setUserResults] = useState<UserResult[]>([])
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null)
  const [userLoading, setUserLoading] = useState(false)

  // Trigger state
  const [firing, setFiring] = useState(false)
  const [intervalMs, setIntervalMs] = useState(1000)
  const [log, setLog] = useState<LogEntry[]>([])
  const [totalTriggered, setTotalTriggered] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)
  const counterRef = useRef(0)

  // Search products
  useEffect(() => {
    if (!productSearch.trim() && selectedProducts.length > 0) {
      setProductResults([])
      return
    }
    const timer = setTimeout(async () => {
      setProductLoading(true)
      try {
        const res = await fetch(`/api/admin/sales-trigger?type=products&q=${encodeURIComponent(productSearch)}`)
        const data = await res.json()
        setProductResults(data.products || [])
      } catch { setProductResults([]) }
      setProductLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [productSearch, selectedProducts.length])

  // Search users
  useEffect(() => {
    if (!userSearch.trim()) { setUserResults([]); return }
    const timer = setTimeout(async () => {
      setUserLoading(true)
      try {
        const res = await fetch(`/api/admin/sales-trigger?type=users&q=${encodeURIComponent(userSearch)}`)
        const data = await res.json()
        setUserResults(data.users || [])
      } catch { setUserResults([]) }
      setUserLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [userSearch])

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [log])

  // Fire a single sale
  const fireSale = useCallback(async (product: Product) => {
    const entryId = `${Date.now()}-${counterRef.current++}`
    const entry: LogEntry = {
      id: entryId,
      time: new Date().toLocaleTimeString(),
      product: product.title,
      status: "pending",
    }
    setLog(prev => [...prev.slice(-200), entry])
    setTotalTriggered(prev => prev + 1)

    try {
      const res = await fetch("/api/admin/sales-trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product.id,
          buyer_user_id: selectedUser?.user_id || null,
        }),
      })
      const data = await res.json()
      setLog(prev => prev.map(e => e.id === entryId ? {
        ...e,
        status: res.ok ? "success" : "error",
        orderId: data.order_id,
        results: data.results,
        error: data.error,
      } : e))
    } catch (err) {
      setLog(prev => prev.map(e => e.id === entryId ? {
        ...e,
        status: "error",
        error: err instanceof Error ? err.message : "Network error",
      } : e))
    }
  }, [selectedUser])

  // Single push (fire all selected products once)
  const handlePush = useCallback(() => {
    selectedProducts.forEach(p => fireSale(p))
  }, [selectedProducts, fireSale])

  // Auto-fire toggle
  const toggleAutoFire = useCallback(() => {
    if (firing) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
      setFiring(false)
    } else {
      setFiring(true)
      // Fire immediately
      selectedProducts.forEach(p => fireSale(p))
      intervalRef.current = setInterval(() => {
        selectedProducts.forEach(p => fireSale(p))
      }, intervalMs)
    }
  }, [firing, selectedProducts, fireSale, intervalMs])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  // Stop auto-fire when interval changes
  useEffect(() => {
    if (firing && intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = setInterval(() => {
        selectedProducts.forEach(p => fireSale(p))
      }, intervalMs)
    }
  }, [intervalMs, firing, selectedProducts, fireSale])

  const addProduct = (product: Product) => {
    if (!selectedProducts.find(p => p.id === product.id)) {
      setSelectedProducts(prev => [...prev, product])
    }
    setProductSearch("")
    setProductResults([])
  }

  const removeProduct = (id: string) => {
    setSelectedProducts(prev => prev.filter(p => p.id !== id))
  }

  const selectUser = (user: UserResult) => {
    setSelectedUser(user)
    setUserSearch("")
    setUserResults([])
  }

  const successCount = log.filter(e => e.status === "success").length
  const errorCount = log.filter(e => e.status === "error").length
  const pendingCount = log.filter(e => e.status === "pending").length

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      {/* Header */}
      <div className="bg-white border-b border-neutral-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <Link href="/admin/blog/dashboard" className="text-neutral-500 hover:text-neutral-900 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-neutral-900">Sales Trigger</h1>
            <p className="text-sm text-neutral-500">Admin tool — trigger orders on any product</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Product Selection */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Package className="h-4 w-4 text-violet-600" />
            <h2 className="text-sm font-semibold text-neutral-900">Select Products</h2>
          </div>

          {/* Selected products */}
          {selectedProducts.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {selectedProducts.map(p => (
                <div key={p.id} className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-lg px-3 py-1.5 text-sm">
                  <span className="font-medium text-violet-900">{p.title}</span>
                  <span className="text-violet-500 text-xs">
                    {p.price_cents === 0 ? "Free" : `$${(p.price_cents / 100).toFixed(2)}`}
                  </span>
                  <span className="text-neutral-400 text-xs">by {(p.creator as any)?.display_name || (p.creator as any)?.slug}</span>
                  <button onClick={() => removeProduct(p.id)} className="text-violet-400 hover:text-red-500 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              placeholder="Search products by title..."
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
            />
            {productLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 animate-spin" />}
          </div>

          {/* Results dropdown */}
          {productResults.length > 0 && (
            <div className="mt-2 border border-neutral-200 rounded-lg overflow-hidden max-h-[240px] overflow-y-auto">
              {productResults.map(p => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  disabled={!!selectedProducts.find(sp => sp.id === p.id)}
                  className="w-full text-left px-4 py-2.5 hover:bg-neutral-50 border-b border-neutral-100 last:border-0 flex items-center justify-between disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{p.title}</p>
                    <p className="text-xs text-neutral-500">
                      by {(p.creator as any)?.display_name || (p.creator as any)?.slug}
                      {" · "}
                      {p.price_cents === 0 ? "Free" : `$${(p.price_cents / 100).toFixed(2)}`}
                    </p>
                  </div>
                  {selectedProducts.find(sp => sp.id === p.id) && (
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User Selection (Optional) */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <User className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-neutral-900">Buyer (Optional)</h2>
            <span className="text-xs text-neutral-400">Leave empty for anonymous admin orders</span>
          </div>

          {selectedUser && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 text-sm mb-3">
              <span className="font-medium text-blue-900">{selectedUser.display_name || selectedUser.slug}</span>
              <span className="text-blue-500 text-xs">@{selectedUser.slug}</span>
              <button onClick={() => setSelectedUser(null)} className="text-blue-400 hover:text-red-500 transition-colors ml-auto">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {!selectedUser && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Search users by name or slug..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
                {userLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 animate-spin" />}
              </div>

              {userResults.length > 0 && (
                <div className="mt-2 border border-neutral-200 rounded-lg overflow-hidden max-h-[200px] overflow-y-auto">
                  {userResults.map(u => (
                    <button
                      key={u.id}
                      onClick={() => selectUser(u)}
                      className="w-full text-left px-4 py-2.5 hover:bg-neutral-50 border-b border-neutral-100 last:border-0"
                    >
                      <p className="text-sm font-medium text-neutral-900">{u.display_name || u.slug}</p>
                      <p className="text-xs text-neutral-500">@{u.slug}</p>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Controls */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-neutral-900">Trigger Controls</h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Single push button */}
            <button
              onClick={handlePush}
              disabled={selectedProducts.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ShoppingCart className="h-4 w-4" />
              Push ({selectedProducts.length})
            </button>

            {/* Interval selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500">Interval:</span>
              {[500, 1000, 2000, 5000].map(ms => (
                <button
                  key={ms}
                  onClick={() => setIntervalMs(ms)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                    intervalMs === ms
                      ? "bg-neutral-900 text-white border-neutral-900"
                      : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400"
                  }`}
                >
                  {ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`}
                </button>
              ))}
            </div>

            {/* Auto-fire toggle */}
            <button
              onClick={toggleAutoFire}
              disabled={selectedProducts.length === 0}
              className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                firing
                  ? "bg-red-600 text-white hover:bg-red-700 animate-pulse"
                  : "bg-green-600 text-white hover:bg-green-700"
              }`}
            >
              {firing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Stop Auto-Fire
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Start Auto-Fire
                </>
              )}
            </button>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 mt-4 text-sm">
            <span className="text-neutral-500">
              Total: <span className="font-semibold text-neutral-900">{totalTriggered}</span>
            </span>
            <span className="text-green-600">
              <CheckCircle className="inline h-3.5 w-3.5 mr-0.5" />
              {successCount}
            </span>
            <span className="text-red-600">
              <XCircle className="inline h-3.5 w-3.5 mr-0.5" />
              {errorCount}
            </span>
            {pendingCount > 0 && (
              <span className="text-amber-600">
                <Loader2 className="inline h-3.5 w-3.5 mr-0.5 animate-spin" />
                {pendingCount}
              </span>
            )}
          </div>
        </div>

        {/* Activity Log */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-neutral-900">Activity Log</h2>
            {log.length > 0 && (
              <button onClick={() => setLog([])} className="text-xs text-neutral-400 hover:text-neutral-600 cursor-pointer">
                Clear
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto space-y-1 font-mono text-xs">
            {log.length === 0 && (
              <p className="text-neutral-400 text-center py-8">No activity yet. Select products and push.</p>
            )}
            {log.map(entry => (
              <div
                key={entry.id}
                className={`flex items-start gap-2 px-3 py-1.5 rounded-md ${
                  entry.status === "success" ? "bg-green-50" :
                  entry.status === "error" ? "bg-red-50" :
                  "bg-amber-50"
                }`}
              >
                {entry.status === "success" && <CheckCircle className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />}
                {entry.status === "error" && <XCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />}
                {entry.status === "pending" && <Loader2 className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0 animate-spin" />}
                <div className="min-w-0 flex-1">
                  <span className="text-neutral-400">[{entry.time}]</span>{" "}
                  <span className="text-neutral-700 font-medium">{entry.product}</span>
                  {entry.orderId && <span className="text-neutral-400"> → {entry.orderId.slice(0, 8)}...</span>}
                  {entry.error && <span className="text-red-600"> {entry.error}</span>}
                  {entry.results && (
                    <span className="text-neutral-400"> [{entry.results.join(", ")}]</span>
                  )}
                </div>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  )
}
