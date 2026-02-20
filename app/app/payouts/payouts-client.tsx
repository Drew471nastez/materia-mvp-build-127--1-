"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Wallet,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  Building2,
  Loader2,
  TrendingUp,
  X,
  RotateCcw,
  ArrowDownLeft,
  Package,
  Copy,
  Check,
  Landmark,
  Send,
  XCircle,
  MoreHorizontal,
  ShoppingCart,
  CreditCard,
  Users,
  Calendar,
  Monitor,
  Smartphone,
  Tablet,
  MapPin,
  Eye,
  Info,
  ChevronLeft,
  ChevronRight,
  FileText,
  ExternalLink,
  Plus,
  HelpCircle,
  Banknote,
  ArrowRight,
  ChevronDown,
  Download,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Creator {
  id: string;
  username?: string;
  stripe_account_id?: string;
  stripe_onboarding_status?: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  default_currency?: string;
  payout_schedule?: string;
}

interface OrderPayment {
  id: string;
  amount_cents: number;
  fee_cents: number;
  created_at: string;
  status: string;
  customer_email?: string;
  buyer_email?: string;
  product_id: string;
  stripe_payment_intent_id?: string;
  refund_reason?: string | null;
  refund_amount_cents?: number | null;
  refunded_at?: string | null;
  stripe_refund_id?: string | null;
  receipt_token?: string;
  buyer_first_name?: string | null;
  buyer_last_name?: string | null;
  payment_method?: string;
  card_brand?: string | null;
  card_last4?: string | null;
  buyer_country?: string | null;
  buyer_device_type?: string | null;
  buyer_os?: string | null;
  buyer_browser?: string | null;
  product?: {
    id?: string;
    title: string;
    thumbnail_url?: string | null;
    type?: string;
  } | null;
  buyer?: { email: string; display_name: string } | null;
}

interface StripePayout {
  id: string;
  amount: number;
  currency: string;
  status: string;
  arrival_date: number | null;
  created: number;
  method: string;
  destination: string | null;
  description?: string | null;
}

interface TimelineItem {
  id: string;
  label: string;
  description: string;
  timestamp: string | null;
  status: "completed" | "pending" | "upcoming";
}

interface ChartPoint {
  date: string;
  revenue: number;
  gross: number;
  refundsAbs: number;
  count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function fmtCompact(cents: number, currency = "usd") {
  const val = cents / 100;
  if (val >= 1_000_000)
    return `${(val / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: val % 1 === 0 ? 0 : 2,
  }).format(val);
}

function fmtDate(dateStr: string) {
  const tz = typeof window !== "undefined" ? localStorage.getItem("storelib_timezone") || undefined : undefined;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: tz,
  });
}

function fmtFullDate(dateStr: string) {
  const tz = typeof window !== "undefined" ? localStorage.getItem("storelib_timezone") || undefined : undefined;
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: tz,
  });
}

function fmtUnix(ts: number) {
  const tz = typeof window !== "undefined" ? localStorage.getItem("storelib_timezone") || undefined : undefined;
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: tz,
  });
}

function payoutStatusConfig(status: string) {
  switch (status) {
    case "paid":
      return {
        label: "Paid",
        cls: "bg-violet-100 text-violet-700",
        Icon: CheckCircle2,
      };
    case "in_transit":
      return {
        label: "In transit",
        cls: "bg-blue-100 text-blue-700",
        Icon: ArrowDownLeft,
      };
    case "pending":
      return {
        label: "Pending",
        cls: "bg-amber-100 text-amber-700",
        Icon: Clock,
      };
    case "failed":
      return {
        label: "Failed",
        cls: "bg-rose-100 text-rose-700",
        Icon: XCircle,
      };
    case "canceled":
      return { label: "Canceled", cls: "bg-gray-100 text-gray-600", Icon: X };
    default:
      return { label: status, cls: "bg-gray-100 text-gray-600", Icon: Clock };
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-100 text-violet-700">
          <CheckCircle2 className="h-3 w-3" /> Completed
        </span>
      );
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700">
          <Clock className="h-3 w-3" /> Pending
        </span>
      );
    case "refunded":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-100 text-rose-700">
          <RotateCcw className="h-3 w-3" /> Refunded
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700">
          <XCircle className="h-3 w-3" /> Failed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700">
          {status}
        </span>
      );
  }
}

function TouchTooltip({
  text,
  children,
  className,
}: {
  text: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("touchstart", onDocClick);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("touchstart", onDocClick);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex"
        aria-label={text}
      >
        {children}
      </button>
      {open && (
        <div className="absolute z-50 bottom-full mb-1.5 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="relative bg-[#1f2937] text-white text-[11px] font-medium rounded-md px-2.5 py-1.5 shadow-lg whitespace-nowrap leading-none">
            {text}
            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[#1f2937]" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Revenue Chart ────────────────────────────────────────────────────────────

const CHART_TIMEFRAMES = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7", label: "Last 7 days" },
  { value: "this_month", label: "This month" },
  { value: "last_90", label: "Last 90 days" },
  { value: "last_365", label: "Last 365 days" },
  { value: "all_time", label: "All time" },
] as const;

type ChartTimeframeValue = (typeof CHART_TIMEFRAMES)[number]["value"];

// Mobile bottom sheet for chart timeframe selection
function ChartTimeframeSheet({
  isOpen,
  onClose,
  selected,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  selected: ChartTimeframeValue;
  onSelect: (v: ChartTimeframeValue) => void;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const lastYRef = useRef(0);
  const lastTimeRef = useRef(0);
  const velocityRef = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && !isVisible) {
      setIsVisible(true);
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setIsAnimating(true)),
      );
    } else if (!isOpen && isVisible) {
      setIsAnimating(false);
      document.body.style.overflow = "";
      const t = setTimeout(() => {
        setIsVisible(false);
        setDragY(0);
      }, 400);
      return () => clearTimeout(t);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, isVisible]);

  const handleClose = () => {
    setIsAnimating(false);
    setIsDragging(false);
    setDragY(0);
    velocityRef.current = 0;
    setTimeout(() => onClose(), 400);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const el = sheetRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (touch.clientY - rect.top <= 80) {
      startYRef.current = touch.clientY;
      lastYRef.current = touch.clientY;
      lastTimeRef.current = Date.now();
      velocityRef.current = 0;
      setIsDragging(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;
    if (diff > 0) {
      e.preventDefault();
      const now = Date.now();
      const dt = Math.max(1, now - lastTimeRef.current);
      velocityRef.current = (currentY - lastYRef.current) / dt;
      lastYRef.current = currentY;
      lastTimeRef.current = now;
      const resisted = diff <= 160 ? diff * 0.92 : 147 + (diff - 160) * 0.4;
      setDragY(resisted);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragY > 92 || velocityRef.current > 0.55) handleClose();
    else setDragY(0);
  };

  if (!isVisible) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] md:hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        style={{
          opacity: isAnimating ? 1 : 0,
          transition: isDragging
            ? "none"
            : "opacity 400ms cubic-bezier(0.32,0.72,0,1)",
        }}
        onClick={handleClose}
      />
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl"
        style={{
          transform: isAnimating
            ? `translate3d(0,${dragY}px,0)`
            : "translate3d(0,100%,0)",
          transition: isDragging
            ? "none"
            : "transform 400ms cubic-bezier(0.32,0.72,0,1)",
          willChange: "transform",
          backfaceVisibility: "hidden",
        }}
      >
        {/* Drag handle */}
        <div className="pt-4 pb-1 flex justify-center touch-none select-none">
          <div className="h-[5px] w-10 rounded-full bg-[#d1d5db]" />
        </div>
        <div className="px-5 pt-5 pb-4">
          <h3 className="text-[17px] font-semibold text-[#1a1a2e] mb-4">
            Select time period
          </h3>
          <div className="space-y-1 max-h-[55vh] overflow-y-auto overscroll-contain">
            {CHART_TIMEFRAMES.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onSelect(opt.value);
                  handleClose();
                }}
                className={cn(
                  "w-full text-left px-4 py-3.5 rounded-xl text-[15px] font-medium transition-colors active:scale-[0.98]",
                  selected === opt.value
                    ? "bg-[#f5f3ff] text-[#8b5cf6]"
                    : "text-[#374151] active:bg-[#f3f4f6]",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ height: "max(env(safe-area-inset-bottom), 20px)" }} />
      </div>
    </div>,
    document.body,
  );
}

function RevenueChart() {
  const [timeframe, setTimeframe] = useState<ChartTimeframeValue>("last_7");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [data, setData] = useState<ChartPoint[]>([]);
  const [total, setTotal] = useState(0);
  const [totalGross, setTotalGross] = useState(0);
  const [totalRefunds, setTotalRefunds] = useState(0);
  const [currency, setCurrency] = useState("usd");
  const [isHourly, setIsHourly] = useState(false); // true for today/yesterday (hourly buckets)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const load = useCallback(async (tf: ChartTimeframeValue, silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const r = await fetch(`/api/stripe/revenue-chart?timeframe=${tf}`);
      const json = await r.json();
      if (json.error) throw new Error(json.error);
      setData(json.data || []);
      setTotal(json.total || 0);
      setTotalGross(json.totalGross || 0);
      setTotalRefunds(json.totalRefunds || 0);
      setIsHourly(json.isHourly || false);
      if (json.currency) setCurrency(json.currency.toLowerCase());
    } catch (e: any) {
      if (!silent) setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(timeframe);
  }, [timeframe, load]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      load(timeframe, true);
    };
    const id = window.setInterval(tick, 15000);
    const onVisible = () => tick();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [timeframe, load]);

  const numReady = !loading; // show amounts as soon as data is ready
  // Clamp each bucket to >= 0 for a clean chart; preserve refundsAbs as-is.
  const chartData = data.map((d) => ({
    ...d,
    gross: Math.max(0, d.gross),
    refundsAbs: d.refundsAbs || 0,
    revenue: Math.max(0, d.revenue),
  }));
  const hasData = chartData.some((d) => d.gross > 0 || d.refundsAbs > 0);
  const selectedLabel =
    CHART_TIMEFRAMES.find((t) => t.value === timeframe)?.label ?? "Last 7 days";

  // Converts a zero-padded hour string "00"–"23" to a human-readable label
  const fmtHour = (h: string) => {
    const n = parseInt(h, 10);
    if (n === 0) return "12am";
    if (n === 12) return "12pm";
    if (n < 12) return `${n}am`;
    return `${n - 12}pm`;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const labelText = isHourly
      ? fmtHour(label)
      : new Date(label + "T00:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
    const grossVal = payload.find((p: any) => p.dataKey === "gross");
    const refundVal = payload.find((p: any) => p.dataKey === "refundsAbs");
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-xl p-3 shadow-lg text-[13px]">
        <p className="text-[#6b7280] mb-1">{labelText}</p>
        {grossVal && (
          <p className="font-bold text-[#1a1a2e]">
            {fmt(grossVal.value, currency)}
          </p>
        )}
        {refundVal && refundVal.value > 0 && (
          <p className="text-[12px] text-rose-500 font-medium">
            −{fmt(refundVal.value, currency)} refunded
          </p>
        )}
        {payload[0]?.payload?.count > 0 && (
          <p className="text-[#9ca3af]">
            {payload[0].payload.count} sale
            {payload[0].payload.count !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 flex-1 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[13px] font-medium text-[#6b7280]">Revenue</p>
          {!numReady ? (
            <div className="h-7 w-32 mt-1 rounded-lg bg-gray-200 animate-pulse" />
          ) : (
            <p className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
              {fmt(Math.max(0, totalGross), currency)}
            </p>
          )}
        </div>

        {/* Timeframe selector — dropdown on desktop, sheet on mobile */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => {
              if (isMobile) setIsSheetOpen(true);
              else setIsDropdownOpen((o) => !o);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e7eb] rounded-xl text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors shadow-sm cursor-pointer"
          >
            {selectedLabel}
            <ChevronDown
              className={cn(
                "h-4 w-4 text-[#9ca3af] transition-transform duration-200",
                isDropdownOpen && "rotate-180",
              )}
            />
          </button>
          {isDropdownOpen && !isMobile && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-[#e5e7eb] rounded-xl shadow-lg z-50 py-1 animate-in fade-in-0 zoom-in-95 duration-100">
              {CHART_TIMEFRAMES.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setTimeframe(opt.value);
                    setIsDropdownOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-4 py-2.5 text-[13px] transition-colors",
                    timeframe === opt.value
                      ? "bg-[#f5f3ff] text-[#8b5cf6] font-medium"
                      : "text-[#374151] hover:bg-[#f9fafb]",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="h-48 w-full rounded-lg bg-gray-100 animate-pulse" />
      ) : error ? (
        <div className="h-48 flex items-center justify-center">
          <p className="text-[13px] text-rose-500">{error}</p>
        </div>
      ) : !hasData && !isHourly ? (
        /* Daily mode, no sales yet — show empty state */
        <div className="h-48 flex flex-col items-center justify-center gap-2 text-center">
          <TrendingUp className="h-8 w-8 text-[#d1d5db]" />
          <p className="text-[14px] text-[#6b7280]">
            No revenue in this period yet
          </p>
          <p className="text-[12px] text-[#9ca3af]">
            Sales will appear here once processed
          </p>
        </div>
      ) : !isHourly && chartData.length <= 1 ? (
        /* Daily mode, single data point — a lone dot looks odd;
           show a clean centered stat instead of the area chart */
        <div className="h-48 flex flex-col items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-full bg-[#f5f3ff] flex items-center justify-center">
            <TrendingUp className="h-6 w-6 text-[#8b5cf6]" />
          </div>
          <div className="text-center">
            <p className="text-[28px] font-bold text-[#1a1a2e] tracking-tight">
              {numReady ? fmt(Math.max(0, totalGross), currency) : "—"}
            </p>
            <p className="text-[13px] text-[#6b7280] mt-0.5">
              {chartData[0]?.count
                ? `${chartData[0].count} sale${chartData[0].count !== 1 ? "s" : ""}`
                : "No sales yet"}
            </p>
          </div>
        </div>
      ) : (
        /* Hourly (today/yesterday) or multi-day area chart */
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart
            data={chartData}
            margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="refundGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#f3f4f6"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) =>
                isHourly
                  ? fmtHour(v)
                  : new Date(v + "T00:00:00").toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
              }
              // For hourly: show a tick every 4 hours (0, 4, 8, 12, 16, 20)
              // For daily:  preserve start + end labels automatically
              interval={isHourly ? 3 : "preserveStartEnd"}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              domain={[0, "auto"]}
              tickFormatter={(v) => fmtCompact(v, currency)}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="refundsAbs"
              stroke="#f43f5e"
              strokeWidth={totalRefunds > 0 ? 1.5 : 0}
              strokeOpacity={totalRefunds > 0 ? 1 : 0}
              fill="url(#refundGrad)"
              fillOpacity={totalRefunds > 0 ? 1 : 0}
              dot={false}
              activeDot={totalRefunds > 0 ? { r: 3, fill: "#f43f5e", strokeWidth: 0 } : false}
              name="Refunds"
            />
            <Area
              type="monotone"
              dataKey="gross"
              stroke="#8b5cf6"
              strokeWidth={2.5}
              fill="url(#revGrad)"
              dot={false}
              activeDot={{ r: 4, fill: "#8b5cf6", strokeWidth: 0 }}
              name="Revenue"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {/* Legend — shown below chart whenever data is ready */}
      {numReady && !loading && !error && (
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#f3f4f6]">
          <span className="flex items-center gap-1.5 text-[11px] text-[#6b7280]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6] shrink-0" />
            Revenue
          </span>
          {totalRefunds > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] text-[#6b7280]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#f43f5e] shrink-0" />
              Refunds −{fmt(totalRefunds, currency)}
            </span>
          )}
        </div>
      )}

      <ChartTimeframeSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        selected={timeframe}
        onSelect={(v) => setTimeframe(v)}
      />
    </div>
  );
}

// ─── Withdraw Panel ────────────────────────────────────────────────────────────

function WithdrawPanel({
  availableBalance,
  pendingBalance,
  currency,
  payoutsEnabled,
  balanceReady = true,
  onSuccess,
  payoutScheduleInterval = null,
  payoutScheduleDelay = null,
}: {
  availableBalance: number;
  pendingBalance: number;
  currency: string;
  payoutsEnabled: boolean;
  balanceReady?: boolean;
  onSuccess: () => void;
  payoutScheduleInterval?: string | null;
  payoutScheduleDelay?: number | null;
}) {
  const isAutomatic = payoutScheduleInterval != null && payoutScheduleInterval !== "manual";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openBreakdown, setOpenBreakdown] = useState(false);
  const [openDetails, setOpenDetails] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsBank, setDetailsBank] = useState<{
    bankName: string | null;
    last4: string;
    currency: string;
  } | null>(null);
  const [inTransitAmount, setInTransitAmount] = useState(0);
  const [detailsDragY, setDetailsDragY] = useState(0);
  const [detailsIsDragging, setDetailsIsDragging] = useState(false);
  const detailsStartY = useRef(0);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  // Smooth animation states for mobile bottom sheets
  const [breakdownVisible, setBreakdownVisible] = useState(false);
  const [breakdownAnimating, setBreakdownAnimating] = useState(false);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [detailsAnimating, setDetailsAnimating] = useState(false);
  const [successPayout, setSuccessPayout] = useState<{
    amount: number;
    currency: string;
  } | null>(null);
  const [showWithdrawHint, setShowWithdrawHint] = useState(false);
  const [stripeLoginLoading, setStripeLoginLoading] = useState(false);
  const { toast } = useToast();

  const openStripeLogin = async () => {
    setStripeLoginLoading(true);
    try {
      const r = await fetch("/api/stripe/login-link", { method: "POST" });
      const json = await r.json();
      if (json.url) {
        window.open(json.url, "_blank", "noopener,noreferrer");
      } else {
        throw new Error("No URL returned");
      }
    } catch {
      toast({
        title: "Could not open Stripe",
        description: "Please visit dashboard.stripe.com directly.",
        variant: "destructive",
      });
    } finally {
      setStripeLoginLoading(false);
    }
  };

  const scheduleLabel = (() => {
    if (!payoutScheduleInterval) return null;
    if (payoutScheduleInterval === "daily") return "Daily (automatic)";
    if (payoutScheduleInterval === "weekly") return "Weekly (automatic)";
    if (payoutScheduleInterval === "monthly") return "Monthly (automatic)";
    if (payoutScheduleInterval === "manual") return "Manual (you control)";
    return "Automatic";
  })();

  const handleWithdraw = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/stripe/withdraw", { method: "POST" });
      const json = await r.json();
      if (!r.ok || json.error)
        throw new Error(json.error || "Withdrawal failed");
      setSuccessPayout({
        amount: json.payout.amount,
        currency: json.payout.currency,
      });
      toast({
        title: "Withdrawal created!",
        description: `${fmt(json.payout.amount, json.payout.currency)} is on its way to your bank.`,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const openDetailsModal = async () => {
    setOpenDetails(true);
    if (detailsBank !== null) return; // already loaded
    setDetailsLoading(true);
    try {
      const [methodRes, payoutsRes] = await Promise.all([
        fetch("/api/stripe/payout-method").then((r) => r.json()),
        fetch("/api/stripe/payouts").then((r) => r.json()),
      ]);
      if (methodRes.bankAccount) setDetailsBank(methodRes.bankAccount);
      // Compute in-transit amount from payouts with status "in_transit"
      const inTransit = (payoutsRes.payouts || [])
        .filter((p: any) => p.status === "in_transit")
        .reduce((sum: number, p: any) => sum + p.amount, 0);
      setInTransitAmount(inTransit);
    } catch {
      // non-fatal — modal still opens showing balance data
    } finally {
      setDetailsLoading(false);
    }
  };

  // Drive smooth slide-in/out animations for the breakdown mobile sheet
  useEffect(() => {
    if (openBreakdown) {
      setBreakdownVisible(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setBreakdownAnimating(true)));
    } else {
      setBreakdownAnimating(false);
      const t = setTimeout(() => setBreakdownVisible(false), 400);
      return () => clearTimeout(t);
    }
  }, [openBreakdown]);

  // Drive smooth slide-in/out animations for the details mobile sheet
  useEffect(() => {
    if (openDetails) {
      setDetailsVisible(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setDetailsAnimating(true)));
    } else {
      setDetailsAnimating(false);
      const t = setTimeout(() => setDetailsVisible(false), 400);
      return () => clearTimeout(t);
    }
  }, [openDetails]);

  if (successPayout) {
    return (
      <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 flex flex-col items-center justify-center text-center h-full min-h-[260px]">
        <div className="w-12 h-12 bg-violet-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="h-6 w-6 text-violet-600" />
        </div>
        <h3 className="text-[16px] font-semibold text-[#1a1a2e] mb-1">
          Withdrawal initiated!
        </h3>
        <p className="text-[13px] text-[#6b7280] mb-1">
          <strong>{fmt(successPayout.amount, successPayout.currency)}</strong>{" "}
          is on its way to your bank.
        </p>
        <p className="text-[12px] text-[#9ca3af] mb-4">
          Most payouts arrive in 1–3 business days.
        </p>
        <button
          onClick={onSuccess}
          className="px-4 py-2 text-[13px] font-medium text-white bg-[#8b5cf6] rounded-lg hover:bg-[#7c3aed] transition-colors"
        >
          View history →
        </button>
      </div>
    );
  }

  const helper =
    availableBalance <= 0
      ? "No funds available yet. Clears in 1–3 business days."
      : "Funds arrive in 1–3 business days.";

  return (
    <div className="bg-[#f8fafc] rounded-2xl border border-[#e5e7eb] p-5 sm:p-6 flex flex-col gap-5 min-w-[240px]">
      <div className="rounded-xl border border-[#e5e7eb] bg-white p-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-[#6b7280] font-semibold tracking-widest uppercase leading-tight">
              Available for cashout
            </p>
            {balanceReady ? (
              <p className="text-[28px] sm:text-[32px] leading-none font-bold text-[#1a1a2e] mt-2 tabular-nums">
                {fmt(availableBalance, currency)}
              </p>
            ) : (
              <div className="h-8 w-24 mt-2 rounded-lg bg-gray-200 animate-pulse" />
            )}
          </div>
          <div className="text-right">
            <p className="text-[10px] text-[#6b7280] font-semibold tracking-widest uppercase leading-tight text-right">
              Arriving soon
            </p>
            {balanceReady ? (
              <p className="text-[24px] sm:text-[28px] leading-none font-bold text-[#6b7280] mt-2 tabular-nums">
                {fmt(pendingBalance, currency)}
              </p>
            ) : (
              <div className="h-7 w-20 mt-2 rounded-lg bg-gray-200 animate-pulse ml-auto" />
            )}
            <button
              onClick={() => setOpenBreakdown(true)}
              className="text-[12px] font-medium text-[#8b5cf6] hover:text-[#7c3aed] hover:underline mt-2 transition-colors"
            >
              See breakdown →
            </button>
          </div>
        </div>
      </div>

      {!payoutsEnabled ? (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-[12px] text-amber-800">
            Payouts not enabled. Complete Stripe onboarding first.
          </p>
        </div>
      ) : isAutomatic ? (
        <>
          {/* Automatic payouts — managed by Stripe */}
          <div className="rounded-xl border border-[#e5e7eb] bg-white p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-[#f0fdf4] flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-[#1a1a2e]">Managed by Stripe</p>
                {scheduleLabel && (
                  <p className="text-[12px] text-[#6b7280]">{scheduleLabel}</p>
                )}
              </div>
            </div>
            {payoutScheduleDelay != null && payoutScheduleDelay > 0 && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-[#f9fafb] rounded-lg">
                <Clock className="h-3.5 w-3.5 text-[#9ca3af] shrink-0" />
                <p className="text-[12px] text-[#6b7280]">
                  {payoutScheduleDelay} business day{payoutScheduleDelay !== 1 ? "s" : ""} rolling delay
                </p>
              </div>
            )}
            <div className="flex items-start gap-2.5 p-3 bg-[#f0fdf4] rounded-xl mb-3">
              <Info className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-emerald-700 leading-relaxed">
                Funds arrive automatically. No action needed.
              </p>
            </div>
            <button
              onClick={openStripeLogin}
              disabled={stripeLoginLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-[14px] font-medium text-[#374151] bg-white border border-[#e2e8f0] rounded-xl hover:bg-[#f8fafc] hover:border-[#cbd5e1] transition-all shadow-sm disabled:opacity-50"
            >
              {stripeLoginLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Opening Stripe…</>
              ) : (
                <><ExternalLink className="h-4 w-4" /> View in Stripe</>
              )}
            </button>
          </div>
          <button
            onClick={openDetailsModal}
            className="w-full px-4 py-3 text-[14px] font-medium text-[#374151] bg-white border border-[#e2e8f0] rounded-xl hover:bg-[#f8fafc] hover:border-[#cbd5e1] transition-all whitespace-nowrap shadow-sm"
          >
            See details
          </button>
        </>
      ) : (
        <>
          {/* Manual payouts — show Withdraw button */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-[12px] text-red-700">{error}</p>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2 relative">
            {/* Withdraw button — faded + tooltip when no funds available */}
            <div className="flex-1 relative group">
              <button
                onClick={() => {
                  if (loading) return;
                  if (availableBalance <= 0) {
                    setShowWithdrawHint(true);
                    window.setTimeout(() => setShowWithdrawHint(false), 2200);
                    return;
                  }
                  handleWithdraw();
                }}
                disabled={loading}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-4 py-3 text-[15px] font-medium text-white rounded-xl transition-colors",
                  availableBalance <= 0
                    ? "bg-[#635bff] opacity-40 cursor-not-allowed"
                    : "bg-[#635bff] hover:bg-[#564de8] disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                ) : availableBalance <= 0 ? (
                  <><Clock className="h-4 w-4" /> Withdraw</>
                ) : (
                  <><Plus className="h-4 w-4" /> Withdraw</>
                )}
              </button>
            </div>
            {/* Tooltip when no funds — shows on tap (mobile) and hover (desktop) */}
            {showWithdrawHint && (
              <div className="absolute left-2 right-2 -top-11 z-30 rounded-xl bg-[#111827] px-3 py-2.5 text-[11px] text-white text-center shadow-lg">
                No funds ready yet — check "See details" for pending balance
              </div>
            )}
            <button
              onClick={openDetailsModal}
              className="px-4 py-3 text-[14px] font-medium text-[#374151] bg-white border border-[#e2e8f0] rounded-xl hover:bg-[#f8fafc] hover:border-[#cbd5e1] transition-all whitespace-nowrap shadow-sm"
            >
              See details
            </button>
          </div>
          {scheduleLabel && (
            <div className="flex items-center gap-2 px-3 py-2 bg-[#f9fafb] rounded-lg">
              <Calendar className="h-3.5 w-3.5 text-[#9ca3af] shrink-0" />
              <p className="text-[12px] text-[#6b7280]">{scheduleLabel}</p>
            </div>
          )}
          <div className="flex items-start gap-2.5 p-3 bg-[#f3f4f6] rounded-xl">
            <Info className="h-3.5 w-3.5 text-[#9ca3af] mt-0.5 shrink-0" />
            <p className="text-[11px] text-[#6b7280] leading-relaxed">
              {helper}
            </p>
          </div>
          <a
            href="/help-center"
            className="flex items-center justify-center gap-1.5 text-[13px] font-medium text-[#8b5cf6] hover:text-[#7c3aed] transition-colors"
          >
            Learn More <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </>
      )}

      {openBreakdown && (
        <>
          {/* Desktop breakdown modal */}
          <div className="fixed inset-0 z-[80] hidden sm:flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/45 animate-in fade-in duration-200"
              onClick={() => setOpenBreakdown(false)}
            />
            <div className="relative bg-white rounded-3xl border border-[#e5e7eb] shadow-2xl w-full max-w-md p-7 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-[22px] font-semibold text-[#1a1a2e]">
                  Earnings Breakdown
                </h3>
                <button
                  onClick={() => setOpenBreakdown(false)}
                  className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center text-[#6b7280] hover:bg-[#e5e7eb] transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-[13px] text-[#6b7280]">
                Your Stripe connected account balance.
              </p>

              <div className="mt-5 space-y-2">
                <div className="flex items-center justify-between bg-[#f9fafb] border border-[#f0f0f0] rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                      <Clock className="h-4 w-4 text-[#6b7280]" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[#1a1a2e]">Available soon</p>
                      <p className="text-[11px] text-[#9ca3af]">Processing by Stripe</p>
                    </div>
                  </div>
                  <span className="text-[15px] font-semibold text-[#1a1a2e]">
                    {fmt(pendingBalance, currency)}
                  </span>
                </div>

                <div className="flex items-center justify-between bg-[#f9fafb] border border-[#f0f0f0] rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#ede9fe] flex items-center justify-center">
                      <CheckCircle2 className="h-4 w-4 text-[#8b5cf6]" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[#1a1a2e]">Available for cashout</p>
                      <p className="text-[11px] text-[#9ca3af]">Ready to withdraw</p>
                    </div>
                  </div>
                  <span className="text-[15px] font-semibold text-[#1a1a2e]">
                    {fmt(availableBalance, currency)}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[#e5e7eb] px-1">
                  <span className="text-[14px] font-medium text-[#1a1a2e]">Total balance</span>
                  <span className="text-[17px] font-bold text-[#8b5cf6]">
                    {fmt(availableBalance + pendingBalance, currency)}
                  </span>
                </div>
              </div>

              <div className="mt-4 bg-[#f9fafb] border border-[#f0f0f0] rounded-xl p-3.5">
                <div className="flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 text-[#9ca3af] mt-0.5 shrink-0" />
                  <p className="text-[12px] text-[#6b7280] leading-relaxed">
                    Pending funds typically become available within 2–7 business days depending on your region.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setOpenBreakdown(false)}
                className="w-full mt-5 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-xl py-3 text-[14px] font-medium transition-colors"
              >
                Okay
              </button>
            </div>
          </div>

        </>
      )}

      {/* Mobile Earnings Breakdown bottom sheet — rendered separately for smooth animation */}
      {breakdownVisible && (
        <div className="fixed inset-0 z-[80] sm:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            style={{
              opacity: breakdownAnimating ? (dragY > 0 ? Math.max(0, 1 - dragY / 300) : 1) : 0,
              transition: isDragging ? "none" : "opacity 400ms cubic-bezier(0.32,0.72,0,1)",
            }}
            onClick={() => setOpenBreakdown(false)}
          />
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl"
            onTouchStart={(e) => {
              startY.current = e.touches[0].clientY;
              setIsDragging(true);
            }}
            onTouchMove={(e) => {
              if (!isDragging) return;
              const diff = e.touches[0].clientY - startY.current;
              if (diff > 0) setDragY(diff * 0.85);
            }}
            onTouchEnd={() => {
              if (dragY > 80) setOpenBreakdown(false);
              setDragY(0);
              setIsDragging(false);
            }}
            style={{
              transform: breakdownAnimating ? `translateY(${dragY}px)` : "translateY(100%)",
              transition: isDragging ? "none" : "transform 420ms cubic-bezier(0.32,0.72,0,1)",
              willChange: "transform",
            }}
          >
            <div className="pt-3 pb-2 flex justify-center">
              <div className="w-10 h-1.5 rounded-full bg-[#d1d5db]" />
            </div>
            <div className="px-5 pb-5">
              <h3 className="text-[18px] font-semibold text-[#1a1a2e]">Earnings Breakdown</h3>
              <p className="text-[13px] text-[#6b7280] mt-0.5">Your Stripe connected account balance.</p>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between bg-[#f9fafb] border border-[#f0f0f0] rounded-xl p-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                      <Clock className="h-3.5 w-3.5 text-[#6b7280]" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[#1a1a2e]">Available soon</p>
                      <p className="text-[10px] text-[#9ca3af]">Processing by Stripe</p>
                    </div>
                  </div>
                  <span className="text-[14px] font-semibold text-[#1a1a2e]">{fmt(pendingBalance, currency)}</span>
                </div>
                <div className="flex items-center justify-between bg-[#f9fafb] border border-[#f0f0f0] rounded-xl p-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-[#ede9fe] flex items-center justify-center">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#8b5cf6]" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[#1a1a2e]">Available for cashout</p>
                      <p className="text-[10px] text-[#9ca3af]">Ready to withdraw</p>
                    </div>
                  </div>
                  <span className="text-[14px] font-semibold text-[#1a1a2e]">{fmt(availableBalance, currency)}</span>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-[#e5e7eb] px-1">
                  <span className="text-[13px] font-medium text-[#1a1a2e]">Total balance</span>
                  <span className="text-[16px] font-bold text-[#8b5cf6]">{fmt(availableBalance + pendingBalance, currency)}</span>
                </div>
              </div>
              <div className="mt-4 bg-[#f9fafb] border border-[#f0f0f0] rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 text-[#9ca3af] mt-0.5 shrink-0" />
                  <p className="text-[11px] text-[#6b7280] leading-relaxed">
                    Pending funds typically become available within 2–7 business days.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpenBreakdown(false)}
                className="w-full mt-5 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-xl py-3 text-[14px] font-medium transition-colors"
              >
                Okay
              </button>
            </div>
            <div style={{ height: "max(env(safe-area-inset-bottom), 12px)" }} />
          </div>
        </div>
      )}

      {/* ── See Details Modal ── */}
      {openDetails && (
        <>
          {/* Desktop */}
          <div className="fixed inset-0 z-[90] hidden sm:flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/45 animate-in fade-in duration-200"
              onClick={() => setOpenDetails(false)}
            />
            <div className="relative bg-white rounded-3xl border border-[#e5e7eb] shadow-2xl w-full max-w-sm p-7 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-[20px] font-semibold text-[#1a1a2e]">Your balance</h3>
                <button
                  onClick={() => setOpenDetails(false)}
                  className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center text-[#6b7280] hover:bg-[#e5e7eb] transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Timeline-style balance breakdown */}
              <div className="rounded-2xl border border-[#e5e7eb] overflow-hidden">
                <div className="px-4 py-4">
                  {[
                    { label: "Available to pay out soon", value: pendingBalance, icon: <Clock className={cn("h-3.5 w-3.5", pendingBalance > 0 ? "text-[#8b5cf6]" : "text-[#9ca3af]")} /> },
                    { label: "Available in your balance", value: availableBalance, icon: <CheckCircle2 className={cn("h-3.5 w-3.5", availableBalance > 0 ? "text-[#8b5cf6]" : "text-[#9ca3af]")} /> },
                    { label: "On the way to your bank", value: inTransitAmount, icon: <Send className={cn("h-3.5 w-3.5", inTransitAmount > 0 ? "text-[#8b5cf6]" : "text-[#9ca3af]")} /> },
                  ].map(({ label, value, icon }, i, arr) => (
                    <div key={i} className="flex gap-3">
                      {/* Timeline column */}
                      <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-[#f3f4f6] flex items-center justify-center shrink-0">
                          {icon}
                        </div>
                        {i < arr.length - 1 && (
                          <div className="w-[2px] flex-1 my-0.5 bg-[#e5e7eb]" />
                        )}
                      </div>
                      {/* Content */}
                      <div className={cn("flex-1 flex items-center justify-between", i < arr.length - 1 ? "pb-3.5" : "")}>
                        <span className="text-[13px] text-[#374151]">{label}</span>
                        <span className="text-[14px] font-semibold text-[#1a1a2e]">{fmt(value, currency)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between px-4 py-3.5 bg-[#f9fafb] border-t border-[#e5e7eb]">
                  <span className="text-[13px] font-semibold text-[#374151]">Total balance</span>
                  <span className="text-[15px] font-bold text-[#1a1a2e]">{fmt(availableBalance + pendingBalance, currency)}</span>
                </div>
              </div>

              {/* Withdrawal time estimate */}
              <p className="text-[11px] text-[#9ca3af] mt-3 leading-relaxed">
                Withdrawals typically take 2–5 business days to reach your bank account, depending on your bank and country.
              </p>

              <div className="relative group/withdraw">
                <button
                  onClick={handleWithdraw}
                  disabled={loading || availableBalance <= 0}
                  className={cn(
                    "w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 text-[14px] font-medium text-white bg-[#635bff] rounded-xl transition-colors",
                    availableBalance <= 0
                      ? "opacity-40 cursor-not-allowed"
                      : "hover:bg-[#564de8] disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                  {availableBalance <= 0 ? "No funds yet" : "Withdraw"}
                </button>
                {availableBalance <= 0 && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-[#1a1a2e] text-white text-[12px] rounded-lg whitespace-nowrap shadow-lg pointer-events-none opacity-0 group-hover/withdraw:opacity-100 transition-opacity duration-150 hidden md:block">
                    No funds available to withdraw
                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-transparent border-t-[#1a1a2e]" />
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-[#f3f4f6]">
                {detailsLoading ? (
                  <div className="h-4 w-48 bg-gray-100 rounded animate-pulse" />
                ) : detailsBank ? (
                  <p className="text-[12px] text-[#9ca3af] leading-relaxed">
                    Your funds are manually paid out to{" "}
                    <span className="font-medium text-[#6b7280]">
                      {detailsBank.bankName || "Bank account"} ••••{detailsBank.last4}
                    </span>.{" "}
                    <button
                      onClick={async () => {
                        const r = await fetch("/api/stripe/login-link", { method: "POST" });
                        const j = await r.json();
                        if (j.url) window.open(j.url, "_blank", "noopener,noreferrer");
                      }}
                      className="text-[#8b5cf6] hover:underline font-medium"
                    >
                      Update payout settings
                    </button>
                  </p>
                ) : (
                  <button
                    onClick={async () => {
                      const r = await fetch("/api/stripe/login-link", { method: "POST" });
                      const j = await r.json();
                      if (j.url) window.open(j.url, "_blank", "noopener,noreferrer");
                    }}
                    className="text-[12px] text-[#8b5cf6] hover:underline font-medium"
                  >
                    Update payout settings →
                  </button>
                )}
              </div>
            </div>
          </div>

        </>
      )}

      {/* Mobile See Details bottom sheet — rendered separately for smooth animation */}
      {detailsVisible && (
        <div className="fixed inset-0 z-[90] sm:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            style={{
              opacity: detailsAnimating ? (detailsDragY > 0 ? Math.max(0, 1 - detailsDragY / 300) : 1) : 0,
              transition: detailsIsDragging ? "none" : "opacity 400ms cubic-bezier(0.32,0.72,0,1)",
            }}
            onClick={() => setOpenDetails(false)}
          />
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl"
            onTouchStart={(e) => {
              detailsStartY.current = e.touches[0].clientY;
              setDetailsIsDragging(true);
            }}
            onTouchMove={(e) => {
              if (!detailsIsDragging) return;
              const diff = e.touches[0].clientY - detailsStartY.current;
              if (diff > 0) setDetailsDragY(diff * 0.85);
            }}
            onTouchEnd={() => {
              if (detailsDragY > 80) setOpenDetails(false);
              setDetailsDragY(0);
              setDetailsIsDragging(false);
            }}
            style={{
              transform: detailsAnimating ? `translateY(${detailsDragY}px)` : "translateY(100%)",
              transition: detailsIsDragging ? "none" : "transform 420ms cubic-bezier(0.32,0.72,0,1)",
              willChange: "transform",
            }}
          >
            <div className="pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1.5 rounded-full bg-[#d1d5db]" />
            </div>
            <div className="px-5 pb-5">
              <h3 className="text-[18px] font-semibold text-[#1a1a2e] mt-1 mb-4">Your balance</h3>
              <div className="space-y-0 rounded-2xl border border-[#e5e7eb] overflow-hidden">
                {[
                  { label: "On the way to your bank", value: inTransitAmount, icon: <Send className="h-3.5 w-3.5 text-[#6b7280]" /> },
                  { label: "Available to pay out soon", value: pendingBalance, icon: <Clock className="h-3.5 w-3.5 text-[#6b7280]" /> },
                  { label: "Available in your balance", value: availableBalance, icon: <CheckCircle2 className="h-3.5 w-3.5 text-[#6b7280]" /> },
                ].map(({ label, value, icon }, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-[#f3f4f6] last:border-0">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-[#f3f4f6] flex items-center justify-center">{icon}</div>
                      <span className="text-[12px] text-[#374151]">{label}</span>
                    </div>
                    <span className="text-[13px] font-semibold text-[#1a1a2e]">{fmt(value, currency)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-3 bg-[#f9fafb]">
                  <span className="text-[13px] font-semibold text-[#374151]">Total balance</span>
                  <span className="text-[14px] font-bold text-[#1a1a2e]">{fmt(availableBalance + pendingBalance, currency)}</span>
                </div>
              </div>
              <button
                onClick={handleWithdraw}
                disabled={loading}
                className={cn(
                  "w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 text-[14px] font-medium text-white bg-[#635bff] rounded-xl transition-colors",
                  availableBalance <= 0
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:bg-[#564de8] disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                {availableBalance <= 0 ? "No funds yet" : "Withdraw"}
              </button>
              <div className="mt-4 pt-4 border-t border-[#f3f4f6]">
                {detailsLoading ? (
                  <div className="h-4 w-48 bg-gray-100 rounded animate-pulse" />
                ) : detailsBank ? (
                  <p className="text-[12px] text-[#9ca3af] leading-relaxed">
                    Your funds are manually paid out to{" "}
                    <span className="font-medium text-[#6b7280]">
                      {detailsBank.bankName || "Bank account"} ••••{detailsBank.last4}
                    </span>.{" "}
                    <button
                      onClick={async () => {
                        const r = await fetch("/api/stripe/login-link", { method: "POST" });
                        const j = await r.json();
                        if (j.url) window.open(j.url, "_blank", "noopener,noreferrer");
                      }}
                      className="text-[#8b5cf6] hover:underline font-medium"
                    >
                      Update payout settings
                    </button>
                  </p>
                ) : (
                  <button
                    onClick={async () => {
                      const r = await fetch("/api/stripe/login-link", { method: "POST" });
                      const j = await r.json();
                      if (j.url) window.open(j.url, "_blank", "noopener,noreferrer");
                    }}
                    className="text-[12px] text-[#8b5cf6] hover:underline font-medium"
                  >
                    Update payout settings →
                  </button>
                )}
              </div>
            </div>
            <div style={{ height: "max(env(safe-area-inset-bottom), 16px)" }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Order Timeline ────────────────────────────────────────────────────────────

function OrderTimeline({
  orderId,
  amountCents,
}: {
  orderId: string;
  amountCents: number;
}) {
  const isFree = !amountCents || amountCents === 0;
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(!isFree);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isFree) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const r = await fetch(`/api/stripe/order-timeline?orderId=${orderId}`);
        const json = await r.json();
        if (cancelled) return;
        if (json.error) throw new Error(json.error);
        setTimeline(json.timeline || []);
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [orderId, isFree]);

  if (isFree)
    return (
      <p className="text-[12px] text-[#9ca3af] italic">
        No payout timeline for free orders.
      </p>
    );
  if (loading)
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-10 w-full rounded-lg bg-gray-100 animate-pulse"
          />
        ))}
      </div>
    );
  if (error) return <p className="text-[12px] text-rose-500">{error}</p>;
  if (!timeline.length)
    return (
      <p className="text-[12px] text-[#9ca3af]">No timeline data available.</p>
    );

  return (
    <div className="space-y-0.5">
      {timeline.map((item, i) => {
        const isLast = i === timeline.length - 1;
        return (
          <div key={item.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
                  item.status === "completed"
                    ? "bg-[#8b5cf6]"
                    : item.status === "pending"
                      ? "bg-amber-400"
                      : "bg-[#e5e7eb]",
                )}
              >
                {item.status === "completed" ? (
                  <CheckCircle2 className="h-3 w-3 text-white" />
                ) : item.status === "pending" ? (
                  <Clock className="h-3 w-3 text-white" />
                ) : (
                  <div className="w-1.5 h-1.5 rounded-full bg-[#9ca3af]" />
                )}
              </div>
              {!isLast && (
                <div
                  className={cn(
                    "w-px flex-1 mt-0.5 min-h-[16px]",
                    item.status === "completed"
                      ? "bg-[#ddd6fe]"
                      : "bg-[#e5e7eb]",
                  )}
                />
              )}
            </div>
            <div className="pb-3 min-w-0">
              <p
                className={cn(
                  "text-[12px] font-semibold",
                  item.status === "upcoming"
                    ? "text-[#9ca3af]"
                    : "text-[#1a1a2e]",
                )}
              >
                {item.label}
              </p>
              <p className="text-[11px] text-[#6b7280] mt-0.5 leading-snug">
                {item.description}
              </p>
              {item.timestamp && (
                <p className="text-[10px] text-[#9ca3af] mt-0.5 font-mono">
                  {fmtDate(item.timestamp)}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Order Details Modal (Desktop centered + Mobile bottom sheet) ──────────────

function OrderDetailsModal({
  order,
  currency,
  onClose,
  onRefundSuccess,
}: {
  order: OrderPayment | null;
  currency: string;
  onClose: () => void;
  onRefundSuccess?: (refundedAmountCents: number) => void;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundDone, setRefundDone] = useState(false);
  const [showRefundConfirm, setShowRefundConfirm] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [refundError, setRefundError] = useState<string | null>(null);
  // Edit Email + Resend
  const [showEditEmail, setShowEditEmail] = useState(false);
  const [editEmail, setEditEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [receiptResendCounts, setReceiptResendCounts] = useState<Record<string, number>>({});
  // Custom notification state (modern smooth toast)
  const [notification, setNotification] = useState<{ message: string; visible: boolean; type: "success" | "error" }>({ message: "", visible: false, type: "success" });
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotification = (message: string, type: "success" | "error" = "success") => {
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    setNotification({ message, visible: true, type });
    notificationTimer.current = setTimeout(() => setNotification(n => ({ ...n, visible: false })), 4000);
  };
  // Smooth refund sheet states
  const [refundSheetVisible, setRefundSheetVisible] = useState(false);
  const [refundSheetAnimating, setRefundSheetAnimating] = useState(false);
  const [refundDragY, setRefundDragY] = useState(0);
  const [refundIsDragging, setRefundIsDragging] = useState(false);
  const refundStartY = useRef(0);
  const startY = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  const isOpen = !!order;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Open (or re-open while closing) — always re-trigger the open animation
      document.body.style.overflow = "hidden";
      setIsVisible(true);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setIsAnimating(true)),
      );
    } else {
      // Close animation
      setIsAnimating(false);
      document.body.style.overflow = "";
      const t = setTimeout(() => {
        setIsVisible(false);
        setDragY(0);
      }, 400);
      return () => clearTimeout(t);
    }
    return () => {
      document.body.style.overflow = "";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // Only depend on isOpen to avoid re-trigger loops

  useEffect(() => {
    setShowTimeline(false);
    setRefundDone(false);
    setCopiedId(false);
    setShowRefundConfirm(false);
    setRefundReason("");
    setRefundError(null);
  }, [order?.id]);

  const handleClose = () => {
    setIsAnimating(false);
    setDragY(0);
    setTimeout(() => onClose(), 400);
  };

  // Drive smooth animation for the refund mobile bottom sheet
  useEffect(() => {
    if (showRefundConfirm) {
      setRefundSheetVisible(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setRefundSheetAnimating(true)));
    } else if (refundSheetVisible) {
      // Animate out, then unmount
      setRefundSheetAnimating(false);
      const t = setTimeout(() => {
        setRefundSheetVisible(false);
        setRefundDragY(0);
      }, 420);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRefundConfirm]);

  const closeRefundSheet = () => {
    if (refundLoading) return;
    setShowRefundConfirm(false); // useEffect handles the animation
  };

  const handleResend = async () => {
    if (!order) return;
    const currentCount = receiptResendCounts[order.id] || 0;
    if (currentCount >= 5) {
      showNotification("Maximum 5 resends per order", "error");
      return;
    }
    if (!order.receipt_token) {
      showNotification("No receipt token available for this order", "error");
      return;
    }
    setResendLoading(true);
    try {
      const r = await fetch("/api/receipt/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptToken: order.receipt_token, orderId: order.id, resendType: "buyer" }),
      });
      const data = await r.json();
      if (r.ok && data.success) {
        const newCounts = { ...receiptResendCounts, [order.id]: currentCount + 1 };
        setReceiptResendCounts(newCounts);
        showNotification(`Receipt sent to buyer (${currentCount + 1}/5)`);
      } else {
        showNotification(data.error || "Failed to resend. Please try again.", "error");
      }
    } catch {
      showNotification("Failed to resend. Please try again.", "error");
    } finally {
      setResendLoading(false);
    }
  };

  const openEditEmail = () => {
    if (!order) return;
    const email = order.buyer?.email || order.buyer_email || order.customer_email || "";
    setEditEmail(email);
    setShowEditEmail(true);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const el = sheetRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (touch.clientY - rect.top <= 60) {
      startY.current = touch.clientY;
      setIsDragging(true);
    }
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const diff = e.touches[0].clientY - startY.current;
    if (diff > 0) setDragY(diff * 0.9);
  };
  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragY > 90) handleClose();
    else setDragY(0);
  };

  const handleCopyId = () => {
    if (!order) return;
    navigator.clipboard.writeText(order.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleRefundConfirm = async () => {
    if (!order || !refundReason) return;
    setRefundLoading(true);
    setRefundError(null);
    try {
      const r = await fetch("/api/stripe/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const json = await r.json();
      if (!r.ok || json.error) throw new Error(json.error || "Refund failed");
      setRefundDone(true);
      setShowRefundConfirm(false);
      // Pass the refunded amount so the parent can instantly update the balance UI
      onRefundSuccess?.(order.amount_cents);
      showNotification("Refund issued — the buyer will be notified");
    } catch (e: any) {
      setRefundError(e.message);
      showNotification(e.message || "Refund failed", "error");
    } finally {
      setRefundLoading(false);
    }
  };

  if (!isVisible || !order || !mounted) return null;

  const net = order.amount_cents - (order.fee_cents || 0);
  const buyerName =
    order.buyer?.display_name ||
    (order.buyer_first_name && order.buyer_last_name
      ? `${order.buyer_first_name} ${order.buyer_last_name}`
      : null);
  const buyerEmail =
    order.buyer?.email || order.buyer_email || order.customer_email || "N/A";
  const coverImage = order.product?.thumbnail_url;
  const productTitle = order.product?.title || "Unknown Product";
  const productType = order.product?.type || "Digital Product";

  const ContentSections = ({ compact = false, hideActions = false }: { compact?: boolean; hideActions?: boolean }) => (
    <>
      {/* Order ID */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "text-[#6b7280]",
            compact ? "text-[12px]" : "text-[12px]",
          )}
        >
          Order ID:
        </span>
        <code
          className={cn(
            "font-mono bg-[#f3f4f6] px-2 py-0.5 rounded",
            compact ? "text-[11px]" : "text-[12px]",
          )}
        >
          #{order.id.slice(0, 8)}
        </code>
        <button
          onClick={handleCopyId}
          className="p-1 text-[#9ca3af] hover:text-[#6b7280] transition-colors"
        >
          {copiedId ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Customer */}
      <div
        className={cn(
          "bg-[#f9fafb] rounded-xl space-y-2",
          compact ? "p-3" : "p-4",
        )}
      >
        <h4
          className={cn(
            "font-semibold text-[#1a1a2e] flex items-center gap-1.5",
            compact ? "text-[12px]" : "text-[13px]",
          )}
        >
          <Users
            className={cn(
              "text-[#8b5cf6]",
              compact ? "h-3.5 w-3.5" : "h-4 w-4",
            )}
          />{" "}
          Customer Information
        </h4>
        <div
          className={cn(
            "grid grid-cols-2 gap-2",
            compact ? "text-[12px]" : "text-[13px]",
          )}
        >
          <div>
            <span className="text-[#6b7280]">Name</span>
            <p className="font-medium text-[#1a1a2e]">
              {buyerName || "Unknown"}
            </p>
          </div>
          <div>
            <span className="text-[#6b7280]">Email</span>
            <p className="font-medium text-[#1a1a2e] break-all">{buyerEmail}</p>
          </div>
          <div>
            <span className="text-[#6b7280]">First Name</span>
            <p className="font-medium text-[#1a1a2e]">
              {order.buyer_first_name || "N/A"}
            </p>
          </div>
          <div>
            <span className="text-[#6b7280]">Last Name</span>
            <p className="font-medium text-[#1a1a2e]">
              {order.buyer_last_name || "N/A"}
            </p>
          </div>
        </div>
      </div>

      {/* Product */}
      <div className={cn("bg-[#f9fafb] rounded-xl", compact ? "p-3" : "p-4")}>
        <h4
          className={cn(
            "font-semibold text-[#1a1a2e] flex items-center gap-1.5 mb-2",
            compact ? "text-[12px]" : "text-[13px]",
          )}
        >
          <Package
            className={cn(
              "text-[#8b5cf6]",
              compact ? "h-3.5 w-3.5" : "h-4 w-4",
            )}
          />{" "}
          Product
        </h4>
        <div className="flex items-center gap-3">
          {coverImage ? (
            <img
              src={coverImage}
              alt=""
              className={cn(
                "rounded-lg object-cover",
                compact ? "w-10 h-10" : "w-12 h-12",
              )}
            />
          ) : (
            <div
              className={cn(
                "rounded-lg bg-[#e5e7eb] flex items-center justify-center",
                compact ? "w-10 h-10" : "w-12 h-12",
              )}
            >
              <Package className="h-4 w-4 text-[#9ca3af]" />
            </div>
          )}
          <div>
            <p
              className={cn(
                "font-medium text-[#1a1a2e]",
                compact ? "text-[13px]" : "text-[14px]",
              )}
            >
              {productTitle}
            </p>
            <p
              className={cn(
                "text-[#6b7280] capitalize",
                compact ? "text-[11px]" : "text-[12px]",
              )}
            >
              {productType}
            </p>
          </div>
        </div>
      </div>

      {/* Payment */}
      <div
        className={cn(
          "bg-[#f9fafb] rounded-xl space-y-2",
          compact ? "p-3" : "p-4",
        )}
      >
        <h4
          className={cn(
            "font-semibold text-[#1a1a2e] flex items-center gap-1.5",
            compact ? "text-[12px]" : "text-[13px]",
          )}
        >
          <CreditCard
            className={cn(
              "text-[#8b5cf6]",
              compact ? "h-3.5 w-3.5" : "h-4 w-4",
            )}
          />{" "}
          Payment
        </h4>
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "text-[#6b7280]",
              compact ? "text-[12px]" : "text-[13px]",
            )}
          >
            Amount
          </span>
          <span
            className={cn(
              "font-semibold text-[#1a1a2e]",
              compact ? "text-[13px]" : "text-[16px]",
            )}
          >
            {fmt(order.amount_cents, currency)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "text-[#6b7280]",
              compact ? "text-[12px]" : "text-[13px]",
            )}
          >
            Fee
          </span>
          <span
            className={cn(
              "font-medium text-[#1a1a2e]",
              compact ? "text-[12px]" : "text-[13px]",
            )}
          >
            {fmt(order.fee_cents || 0, currency)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "text-[#6b7280]",
              compact ? "text-[12px]" : "text-[13px]",
            )}
          >
            Net Revenue
          </span>
          <span
            className={cn(
              "font-medium text-[#1a1a2e]",
              compact ? "text-[12px]" : "text-[13px]",
            )}
          >
            {fmt(net, currency)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "text-[#6b7280]",
              compact ? "text-[12px]" : "text-[13px]",
            )}
          >
            Payment Method
          </span>
          <span
            className={cn(
              "font-medium text-[#1a1a2e] capitalize",
              compact ? "text-[12px]" : "text-[13px]",
            )}
          >
            {order.payment_method === "card" && order.card_brand ? (
              <span className="flex items-center gap-1">
                <span className="capitalize">{order.card_brand}</span>
                {order.card_last4 && (
                  <span className="text-[#6b7280]">•••• {order.card_last4}</span>
                )}
              </span>
            ) : order.payment_method === "paypal" ? (
              "PayPal"
            ) : order.payment_method === "free" ? (
              "Free"
            ) : (
              order.payment_method || "Card"
            )}
          </span>
        </div>
      </div>

      {/* Location */}
      {order.buyer_country && (
        <div className={cn("bg-[#f9fafb] rounded-xl", compact ? "p-3" : "p-4")}>
          <h4
            className={cn(
              "font-semibold text-[#1a1a2e] flex items-center gap-1.5 mb-2",
              compact ? "text-[12px]" : "text-[13px]",
            )}
          >
            <MapPin
              className={cn(
                "text-[#8b5cf6]",
                compact ? "h-3.5 w-3.5" : "h-4 w-4",
              )}
            />{" "}
            Location
          </h4>
          <div className="flex items-center justify-between">
            <span
              className={cn(
                "text-[#6b7280]",
                compact ? "text-[12px]" : "text-[13px]",
              )}
            >
              Country
            </span>
            <span
              className={cn(
                "font-medium text-[#1a1a2e]",
                compact ? "text-[12px]" : "text-[13px]",
              )}
            >
              {order.buyer_country}
            </span>
          </div>
        </div>
      )}

      {/* Device */}
      {(order.buyer_device_type || order.buyer_os || order.buyer_browser) && (
        <div
          className={cn(
            "bg-[#f9fafb] rounded-xl space-y-2",
            compact ? "p-3" : "p-4",
          )}
        >
          <h4
            className={cn(
              "font-semibold text-[#1a1a2e] flex items-center gap-1.5",
              compact ? "text-[12px]" : "text-[13px]",
            )}
          >
            {order.buyer_device_type === "Mobile" ? (
              <Smartphone
                className={cn(
                  "text-[#8b5cf6]",
                  compact ? "h-3.5 w-3.5" : "h-4 w-4",
                )}
              />
            ) : order.buyer_device_type === "Tablet" ? (
              <Tablet
                className={cn(
                  "text-[#8b5cf6]",
                  compact ? "h-3.5 w-3.5" : "h-4 w-4",
                )}
              />
            ) : (
              <Monitor
                className={cn(
                  "text-[#8b5cf6]",
                  compact ? "h-3.5 w-3.5" : "h-4 w-4",
                )}
              />
            )}
            Device
          </h4>
          {order.buyer_device_type && (
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  "text-[#6b7280]",
                  compact ? "text-[12px]" : "text-[13px]",
                )}
              >
                Type
              </span>
              <span
                className={cn(
                  "font-medium text-[#1a1a2e]",
                  compact ? "text-[12px]" : "text-[13px]",
                )}
              >
                {order.buyer_device_type}
              </span>
            </div>
          )}
          {order.buyer_os && (
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  "text-[#6b7280]",
                  compact ? "text-[12px]" : "text-[13px]",
                )}
              >
                OS
              </span>
              <span
                className={cn(
                  "font-medium text-[#1a1a2e]",
                  compact ? "text-[12px]" : "text-[13px]",
                )}
              >
                {order.buyer_os}
              </span>
            </div>
          )}
          {order.buyer_browser && (
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  "text-[#6b7280]",
                  compact ? "text-[12px]" : "text-[13px]",
                )}
              >
                Browser
              </span>
              <span
                className={cn(
                  "font-medium text-[#1a1a2e]",
                  compact ? "text-[12px]" : "text-[13px]",
                )}
              >
                {order.buyer_browser}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Date */}
      <div className={cn("bg-[#f9fafb] rounded-xl", compact ? "p-3" : "p-4")}>
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "text-[#6b7280] flex items-center gap-1.5",
              compact ? "text-[12px]" : "text-[13px]",
            )}
          >
            <Calendar
              className={cn(
                "text-[#8b5cf6]",
                compact ? "h-3.5 w-3.5" : "h-4 w-4",
              )}
            />{" "}
            Date
          </span>
          <span
            className={cn(
              "font-medium text-[#1a1a2e]",
              compact ? "text-[12px]" : "text-[13px]",
            )}
          >
            {fmtFullDate(order.created_at)}
          </span>
        </div>
      </div>

      {/* Refund details */}
      {order.status === "refunded" && (
        <div
          className={cn(
            "bg-[#f9fafb] rounded-xl border border-[#e5e7eb]/60 space-y-1.5",
            compact ? "p-3" : "p-4",
          )}
        >
          <p
            className={cn(
              "font-medium text-[#374151] flex items-center gap-1.5",
              compact ? "text-[12px]" : "text-[13px]",
            )}
          >
            <RotateCcw className="h-3.5 w-3.5 text-[#9ca3af]" /> Refund Details
          </p>
          {order.refund_amount_cents && (
            <p
              className={cn(
                "text-[#6b7280]",
                compact ? "text-[11px]" : "text-[12px]",
              )}
            >
              Amount: {fmt(order.refund_amount_cents, currency)}
            </p>
          )}
          {order.refunded_at && (
            <p
              className={cn(
                "text-[#6b7280]",
                compact ? "text-[11px]" : "text-[12px]",
              )}
            >
              Date: {fmtFullDate(order.refunded_at)}
            </p>
          )}
          {order.refund_reason && (
            <p
              className={cn(
                "text-[#6b7280]",
                compact ? "text-[11px]" : "text-[12px]",
              )}
            >
              Reason: {order.refund_reason}
            </p>
          )}
        </div>
      )}

      {/* Payout Timeline */}
      <div className={cn("bg-[#f9fafb] rounded-xl space-y-2", compact ? "p-3" : "p-4")}>
        <h4
          className={cn(
            "font-semibold text-[#1a1a2e]",
            compact ? "text-[12px]" : "text-[13px]",
          )}
        >
          Payout Timeline
        </h4>
        {order.amount_cents === 0 ? (
          <p className="text-[12px] text-[#9ca3af] italic">
            No payout for free orders.
          </p>
        ) : compact ? (
          <OrderTimeline orderId={order.id} amountCents={order.amount_cents} />
        ) : !showTimeline ? (
          <button
            onClick={() => setShowTimeline(true)}
            className="text-[12px] text-[#8b5cf6] hover:text-[#7c3aed] font-medium flex items-center gap-1 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" /> View timeline
          </button>
        ) : (
          <OrderTimeline orderId={order.id} amountCents={order.amount_cents} />
        )}
      </div>

      {/* Action buttons — hidden when mobile sheet has sticky footer */}
      {!hideActions && (
        <div className={cn("flex gap-2", compact ? "flex-col" : "flex-row flex-wrap")}>
          {/* Invoice button — light gray */}
          {order.stripe_payment_intent_id && (
            <a
              href={`/api/stripe/invoice?orderId=${order.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-[#374151] bg-[#f3f4f6] rounded-xl hover:bg-[#e5e7eb] transition-colors",
                compact ? "text-[12px]" : "text-[13px]",
              )}
            >
              <FileText className="h-3.5 w-3.5" />
              Invoice
            </a>
          )}

          {/* Resend Receipt */}
          <button
            onClick={handleResend}
            disabled={resendLoading}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-[#374151] bg-[#f3f4f6] rounded-xl hover:bg-[#e5e7eb] active:bg-[#e5e7eb] transition-colors disabled:opacity-60",
              compact ? "text-[12px]" : "text-[13px]",
            )}
          >
            <Send className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
            {resendLoading ? "Sending…" : `Resend${receiptResendCounts[order.id] ? ` (${receiptResendCounts[order.id]}/5)` : ""}`}
          </button>

          {/* Edit Email */}
          <button
            onClick={openEditEmail}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-[#374151] bg-[#f3f4f6] rounded-xl hover:bg-[#e5e7eb] active:bg-[#e5e7eb] transition-colors",
              compact ? "text-[12px]" : "text-[13px]",
            )}
          >
            <Mail className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
            Edit Email
          </button>

          {/* Refund button — light gray, opens confirmation modal */}
          {order.status === "completed" && !refundDone && (
            <button
              onClick={() => {
                setRefundReason("");
                setRefundError(null);
                setShowRefundConfirm(true);
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-[#374151] bg-[#f3f4f6] rounded-xl hover:bg-[#e5e7eb] transition-colors",
                compact ? "text-[12px]" : "text-[13px]",
              )}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Issue Refund
            </button>
          )}

          {/* Refunded state */}
          {(order.status === "refunded" || refundDone) && (
            <span
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-[#9ca3af] bg-[#f3f4f6] rounded-xl cursor-not-allowed",
                compact ? "text-[12px]" : "text-[13px]",
              )}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Refunded
            </span>
          )}
        </div>
      )}

      {refundDone && (
        <div className="flex items-center gap-2 p-3 bg-green-50 rounded-xl">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <p className="text-[12px] text-green-700 font-medium">
            Refund issued successfully.
          </p>
        </div>
      )}
    </>
  );

  return createPortal(
    <>
      {/* ── Desktop Modal ── */}
      <div className="fixed inset-0 z-50 hidden sm:flex items-center justify-center">
        <div
          className={cn(
            "absolute inset-0 bg-black/50 transition-opacity",
            isAnimating ? "opacity-100" : "opacity-0",
          )}
          style={{ transitionDuration: "400ms" }}
          onClick={handleClose}
        />
        <div
          className={cn(
            "relative bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl transition-all mx-4",
            isAnimating ? "opacity-100 scale-100" : "opacity-0 scale-95",
          )}
          style={{
            transitionDuration: "400ms",
            transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)",
          }}
        >
          {/* Desktop Header */}
          <div className="sticky top-0 bg-white border-b border-[#e5e7eb] px-6 py-4 flex items-center justify-between">
            <h2 className="text-[18px] font-semibold text-[#1a1a2e]">
              Order Details
            </h2>
            <div className="flex items-center gap-3">
              {getStatusBadge(order.status)}
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center text-[#6b7280] hover:bg-[#e5e7eb] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <ContentSections compact={false} />
          </div>
        </div>
      </div>

      {/* ── Mobile Bottom Sheet ── */}
      <div className="fixed inset-0 z-50 sm:hidden">
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
          style={{
            opacity: isAnimating ? (dragY > 0 ? Math.max(0, 1 - dragY / 350) : 1) : 0,
            transition: isDragging ? "none" : "opacity 380ms cubic-bezier(0.32,0.72,0,1)",
          }}
          onClick={handleClose}
        />
        <div
          ref={sheetRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl flex flex-col"
          style={{
            transform: isAnimating
              ? `translateY(${dragY}px)`
              : "translateY(100%)",
            transition: isDragging
              ? "none"
              : "transform 420ms cubic-bezier(0.32,0.72,0,1)",
            maxHeight: "72vh",
            willChange: "transform",
          }}
        >
          {/* Handle */}
          <div className="pt-3 pb-2 flex-shrink-0">
            <button
              onClick={handleClose}
              className="w-full flex justify-center py-2 cursor-pointer touch-none"
            >
              <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
            </button>
          </div>
          {/* Header */}
          <div className="px-4 pb-3 flex items-center justify-between border-b border-[#e5e7eb] flex-shrink-0">
            <h3 className="text-[16px] font-semibold text-[#1a1a2e]">
              Order Details
            </h3>
            {getStatusBadge(order.status)}
          </div>
          {/* Scrollable content */}
          <div className="px-4 py-4 overflow-y-auto overscroll-contain flex-1 min-h-0 space-y-3 [-webkit-overflow-scrolling:touch]">
            <ContentSections compact={true} hideActions={true} />
          </div>
          {/* Sticky footer — 2×2 action buttons matching Sales page */}
          <div
            className="px-4 pt-4 border-t border-[#e5e7eb] bg-white flex-shrink-0"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 20px)" }}
          >
            {/* Row 1: Invoice + Resend */}
            <div className="flex items-center gap-2 mb-2">
              {order.stripe_payment_intent_id ? (
                <a
                  href={`/api/stripe/invoice?orderId=${order.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 px-3 py-2.5 text-[12px] font-medium text-[#374151] bg-[#f3f4f6] rounded-lg active:bg-[#e5e7eb] transition-colors flex items-center justify-center gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Invoice
                </a>
              ) : (
                <span className="flex-1 px-3 py-2.5 text-[12px] font-medium text-[#9ca3af] bg-[#f3f4f6] rounded-lg flex items-center justify-center gap-1.5 cursor-not-allowed opacity-60">
                  <FileText className="h-3.5 w-3.5" />
                  Invoice
                </span>
              )}
              <button
                onClick={handleResend}
                disabled={resendLoading}
                className="flex-1 px-3 py-2.5 text-[12px] font-medium text-[#374151] bg-[#f3f4f6] rounded-lg active:bg-[#e5e7eb] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {resendLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {resendLoading ? "Sending…" : "Resend"}
              </button>
            </div>
            {/* Row 2: Edit Email + Refund */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => { openEditEmail(); handleClose(); }}
                className="flex-1 px-3 py-2.5 text-[12px] font-medium text-[#374151] bg-[#f3f4f6] rounded-lg active:bg-[#e5e7eb] transition-colors flex items-center justify-center gap-1.5"
              >
                <Mail className="h-3.5 w-3.5" />
                Edit Email
              </button>
              {order.status === "completed" && !refundDone ? (
                <button
                  onClick={() => {
                    handleClose();
                    setTimeout(() => {
                      setRefundReason("");
                      setRefundError(null);
                      setShowRefundConfirm(true);
                    }, 450);
                  }}
                  className="flex-1 px-3 py-2.5 text-[12px] font-medium text-rose-600 bg-rose-50 rounded-lg active:bg-rose-100 transition-colors flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Refund
                </button>
              ) : order.status === "refunded" || refundDone ? (
                <span className="flex-1 px-3 py-2.5 text-[12px] font-medium text-rose-400 bg-rose-50 rounded-lg flex items-center justify-center gap-1.5 cursor-not-allowed opacity-70">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Refunded
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* ── Refund Confirmation — desktop centered modal + mobile bottom sheet ── */}
      {showRefundConfirm && (
        <>
          {/* Desktop: centered modal */}
          <div className="fixed inset-0 z-[60] hidden sm:flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50 animate-in fade-in duration-200"
              onClick={() => !refundLoading && setShowRefundConfirm(false)}
            />
            <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200">
              {/* Header */}
              <div className="border-b border-[#e5e7eb] px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-[18px] font-semibold text-[#1a1a2e]">Issue Refund</h2>
                  <p className="text-[13px] text-[#6b7280] mt-0.5">
                    The customer will be notified via email.
                  </p>
                </div>
                <button
                  onClick={() => !refundLoading && setShowRefundConfirm(false)}
                  className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center text-[#6b7280] hover:bg-[#e5e7eb] transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* Content */}
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3 p-3 bg-[#f9fafb] rounded-xl">
                  {order.product?.thumbnail_url ? (
                    <img src={order.product.thumbnail_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-[#e5e7eb] flex items-center justify-center">
                      <Package className="h-4 w-4 text-[#9ca3af]" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-[#1a1a2e] truncate">{order.product?.title || "Product"}</p>
                    <p className="text-[12px] text-[#9ca3af]">{order.buyer_email || order.customer_email || ""}</p>
                  </div>
                  <p className="text-[14px] font-semibold text-[#1a1a2e] shrink-0">{fmt(order.amount_cents, currency)}</p>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#374151] mb-2">Reason</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "requested_by_customer", label: "Customer request" },
                      { value: "duplicate", label: "Duplicate charge" },
                      { value: "fraudulent", label: "Fraudulent" },
                      { value: "other", label: "Other" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setRefundReason(opt.value)}
                        className={cn(
                          "px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors border",
                          refundReason === opt.value
                            ? "bg-[#f5f3ff] border-[#8b5cf6] text-[#8b5cf6]"
                            : "border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb]",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {refundError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-[13px] text-red-600 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />{refundError}
                    </p>
                  </div>
                )}
              </div>
              {/* Footer */}
              <div className="border-t border-[#e5e7eb] px-6 py-4 flex items-center gap-3">
                <button
                  onClick={() => setShowRefundConfirm(false)}
                  disabled={refundLoading}
                  className="flex-1 px-4 py-2.5 text-[13px] font-medium text-[#6b7280] bg-[#f3f4f6] rounded-xl hover:bg-[#e5e7eb] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRefundConfirm}
                  disabled={refundLoading || !refundReason}
                  className="flex-1 px-4 py-2.5 text-[13px] font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {refundLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                  ) : (
                    <><RotateCcw className="h-4 w-4" /> Confirm Refund</>
                  )}
                </button>
              </div>
            </div>
          </div>

        </>
      )}

      {/* Mobile refund bottom sheet — separate block for smooth slide animation */}
      {refundSheetVisible && (
        <div className="fixed inset-0 z-[60] sm:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            style={{
              opacity: refundSheetAnimating ? (refundDragY > 0 ? Math.max(0, 1 - refundDragY / 280) : 1) : 0,
              transition: refundIsDragging ? "none" : "opacity 400ms cubic-bezier(0.32,0.72,0,1)",
            }}
            onClick={closeRefundSheet}
          />
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl"
            onTouchStart={(e) => {
              refundStartY.current = e.touches[0].clientY;
              setRefundIsDragging(true);
            }}
            onTouchMove={(e) => {
              if (!refundIsDragging) return;
              const diff = e.touches[0].clientY - refundStartY.current;
              if (diff > 0) setRefundDragY(diff * 0.85);
            }}
            onTouchEnd={() => {
              setRefundIsDragging(false);
              if (refundDragY > 80) { closeRefundSheet(); }
              else setRefundDragY(0);
            }}
            style={{
              transform: refundSheetAnimating ? `translateY(${refundDragY}px)` : "translateY(100%)",
              transition: refundIsDragging ? "none" : "transform 420ms cubic-bezier(0.32,0.72,0,1)",
              willChange: "transform",
            }}
          >
            {/* Drag handle */}
            <div className="pt-3 pb-1 flex justify-center touch-none select-none">
              <div className="w-10 h-[5px] rounded-full bg-[#d1d5db]" />
            </div>
            {/* Header */}
            <div className="px-5 pt-2 pb-4 border-b border-[#f3f4f6]">
              <div className="flex items-center justify-between">
                <h2 className="text-[17px] font-semibold text-[#1a1a2e]">Issue Refund</h2>
                <button
                  onClick={closeRefundSheet}
                  className="w-7 h-7 rounded-full bg-[#f3f4f6] flex items-center justify-center text-[#6b7280]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-[12px] text-[#6b7280] mt-0.5">The customer will be notified via email.</p>
            </div>
            {/* Content */}
            <div className="px-5 py-4 space-y-4">
              <div className="flex items-center gap-3 p-3 bg-[#f9fafb] rounded-xl">
                {order.product?.thumbnail_url ? (
                  <img src={order.product.thumbnail_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-[#e5e7eb] flex items-center justify-center">
                    <Package className="h-4 w-4 text-[#9ca3af]" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-[#1a1a2e] truncate">{order.product?.title || "Product"}</p>
                  <p className="text-[12px] text-[#9ca3af]">{order.buyer_email || order.customer_email || ""}</p>
                </div>
                <p className="text-[14px] font-semibold text-[#1a1a2e] shrink-0">{fmt(order.amount_cents, currency)}</p>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#374151] mb-2.5">Select a reason</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "requested_by_customer", label: "Customer request" },
                    { value: "duplicate", label: "Duplicate charge" },
                    { value: "fraudulent", label: "Fraudulent" },
                    { value: "other", label: "Other" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setRefundReason(opt.value)}
                      className={cn(
                        "px-3 py-3 rounded-xl text-[13px] font-medium transition-colors border active:scale-95",
                        refundReason === opt.value
                          ? "bg-[#f5f3ff] border-[#8b5cf6] text-[#8b5cf6]"
                          : "border-[#e5e7eb] text-[#6b7280] bg-white",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {refundError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-[12px] text-red-600 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />{refundError}
                  </p>
                </div>
              )}
            </div>
            {/* Actions */}
            <div className="px-5 pb-4 flex flex-col gap-2.5">
              <button
                onClick={handleRefundConfirm}
                disabled={refundLoading || !refundReason}
                className="w-full py-3.5 text-[15px] font-semibold text-white bg-red-600 rounded-2xl hover:bg-red-700 active:bg-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {refundLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                ) : (
                  <><RotateCcw className="h-4 w-4" /> Confirm Refund</>
                )}
              </button>
              <button
                onClick={closeRefundSheet}
                disabled={refundLoading}
                className="w-full py-3.5 text-[15px] font-medium text-[#374151] bg-[#f3f4f6] rounded-2xl hover:bg-[#e5e7eb] active:bg-[#d1d5db] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            <div style={{ height: "max(env(safe-area-inset-bottom), 12px)" }} />
          </div>
        </div>
      )}

      {/* ── Edit Email Modal ── */}
      {showEditEmail && order && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 animate-in fade-in duration-200"
            onClick={() => setShowEditEmail(false)}
          />
          <div className="relative bg-white rounded-2xl w-full max-w-md shadow-xl animate-in fade-in-0 zoom-in-95 duration-200">
            <div className="border-b border-[#e5e7eb] px-6 py-4 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-[#1a1a2e]">Edit Email Address</h2>
              <button
                onClick={() => setShowEditEmail(false)}
                className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center text-[#6b7280] hover:bg-[#e5e7eb] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-[#374151] mb-1.5">Customer Email</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="customer@example.com"
                  className="w-full px-4 py-2.5 text-[14px] border border-[#e5e7eb] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6] transition-colors"
                />
                <p className="text-[12px] text-[#6b7280] mt-1.5">
                  This will update the email for order #{order.id.slice(0, 8)}
                </p>
              </div>
              <div className="bg-[#f9fafb] rounded-xl p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-[#d1d5db] text-[#8b5cf6] focus:ring-[#8b5cf6]"
                    defaultChecked
                  />
                  <span className="text-[13px] text-[#374151]">Send purchase receipt to new email</span>
                </label>
              </div>
            </div>
            <div className="border-t border-[#e5e7eb] px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowEditEmail(false)}
                className="px-4 py-2 text-[13px] font-medium text-[#6b7280] hover:text-[#374151] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowEditEmail(false)}
                className="px-4 py-2 text-[13px] font-medium text-white bg-[#8b5cf6] rounded-lg hover:bg-[#7c3aed] transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modern smooth notification toast */}
      {notification.visible && (
        <div
          className="fixed top-[calc(68px+env(safe-area-inset-top)+12px)] md:top-4 left-1/2 -translate-x-1/2 z-[200] animate-in fade-in-0 slide-in-from-top-2 duration-300"
        >
          <div className={cn(
            "px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-[13px] font-medium whitespace-nowrap max-w-[calc(100vw-2rem)]",
            notification.type === "error" ? "bg-red-600 text-white" : "bg-[#1a1a2e] text-white",
          )}>
            {notification.type === "error" ? (
              <AlertCircle className="h-4 w-4 shrink-0 text-white/80" />
            ) : (
              <Check className="h-4 w-4 text-emerald-400 shrink-0" />
            )}
            <span className="overflow-hidden text-ellipsis">{notification.message}</span>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}

// ─── CSV Export helpers + Dropdown ────────────────────────────────────────────

function downloadCsv(filename: string, rows: string[][]): void {
  const header = rows[0];
  const body = rows.slice(1);
  const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [header, ...body].map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportOrdersCsv(orders: OrderPayment[], currency: string): void {
  const fmt = (cents: number) =>
    (cents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    });
  const rows: string[][] = [
    ["Date", "Order ID", "Product", "Customer Email", "Amount", "Status", "Refunded Amount"],
    ...orders.map((o) => [
      new Date(o.created_at).toLocaleDateString("en-US"),
      o.id,
      o.product?.title || "",
      o.buyer_email || o.customer_email || "",
      fmt(o.amount_cents),
      o.status,
      o.refund_amount_cents ? fmt(o.refund_amount_cents) : "",
    ]),
  ];
  downloadCsv(`earnings-${new Date().toISOString().split("T")[0]}.csv`, rows);
}

async function exportPayoutsCsv(): Promise<void> {
  const r = await fetch("/api/stripe/payouts");
  const json = await r.json();
  if (!json.payouts?.length) return;
  const rows: string[][] = [
    ["Date", "Amount", "Currency", "Status", "Arrival Date", "Destination"],
    ...json.payouts.map((p: any) => [
      new Date(p.created * 1000).toLocaleDateString("en-US"),
      (p.amount / 100).toFixed(2),
      p.currency.toUpperCase(),
      p.status,
      p.arrival_date
        ? new Date(p.arrival_date * 1000).toLocaleDateString("en-US")
        : "",
      p.destination || "",
    ]),
  ];
  downloadCsv(`payouts-${new Date().toISOString().split("T")[0]}.csv`, rows);
}

function ExportDropdown({
  orders,
  currency,
}: {
  orders: OrderPayment[];
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [payoutsLoading, setPayoutsLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Click-outside for desktop dropdown
  useEffect(() => {
    if (!open || isMobile) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, isMobile]);

  const handleEarnings = () => {
    exportOrdersCsv(orders, currency);
    setOpen(false);
  };

  const handlePayouts = async () => {
    setPayoutsLoading(true);
    try {
      await exportPayoutsCsv();
    } finally {
      setPayoutsLoading(false);
      setOpen(false);
    }
  };

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          title="Download CSV"
          onClick={() => setOpen((o) => !o)}
          className="p-1.5 rounded-lg hover:bg-[#f3f4f6] transition-colors text-[#9ca3af] hover:text-[#6b7280]"
        >
          <Download className="h-4 w-4" />
        </button>

        {/* Desktop dropdown */}
        {open && !isMobile && (
          <div className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-[#e5e7eb] rounded-xl shadow-lg z-50 py-1 animate-in fade-in-0 zoom-in-95 duration-100">
            <p className="px-4 pt-2 pb-1 text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wide">
              Export
            </p>
            <button
              onClick={handleEarnings}
              className="w-full text-left px-4 py-2.5 text-[13px] text-[#374151] hover:bg-[#f9fafb] flex items-center gap-2"
            >
              <Download className="h-3.5 w-3.5 text-[#9ca3af]" />
              Earnings summary (CSV)
            </button>
            <button
              disabled={payoutsLoading}
              onClick={handlePayouts}
              className="w-full text-left px-4 py-2.5 text-[13px] text-[#374151] hover:bg-[#f9fafb] flex items-center gap-2 disabled:opacity-50"
            >
              {payoutsLoading ? (
                <Loader2 className="h-3.5 w-3.5 text-[#9ca3af] animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 text-[#9ca3af]" />
              )}
              Payouts history (CSV)
            </button>
          </div>
        )}
      </div>

      {/* Mobile bottom sheet */}
      {isMobile && (
        <ExportBottomSheet
          isOpen={open}
          onClose={() => setOpen(false)}
          onEarnings={handleEarnings}
          onPayouts={handlePayouts}
          payoutsLoading={payoutsLoading}
        />
      )}
    </>
  );
}

// Mobile bottom sheet for export — GPU-smooth, velocity-based fling-to-close
function ExportBottomSheet({
  isOpen,
  onClose,
  onEarnings,
  onPayouts,
  payoutsLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onEarnings: () => void;
  onPayouts: () => void;
  payoutsLoading: boolean;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const lastYRef = useRef(0);
  const lastTimeRef = useRef(0);
  const velocityRef = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && !isVisible) {
      setIsVisible(true);
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setIsAnimating(true)),
      );
    } else if (!isOpen && isVisible) {
      setIsAnimating(false);
      document.body.style.overflow = "";
      const t = setTimeout(() => {
        setIsVisible(false);
        setDragY(0);
      }, 400);
      return () => clearTimeout(t);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, isVisible]);

  const handleClose = () => {
    setIsAnimating(false);
    setIsDragging(false);
    setDragY(0);
    velocityRef.current = 0;
    setTimeout(() => onClose(), 400);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const el = sheetRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (touch.clientY - rect.top <= 80) {
      startYRef.current = touch.clientY;
      lastYRef.current = touch.clientY;
      lastTimeRef.current = Date.now();
      velocityRef.current = 0;
      setIsDragging(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;
    if (diff > 0) {
      e.preventDefault();
      const now = Date.now();
      const dt = Math.max(1, now - lastTimeRef.current);
      velocityRef.current = (currentY - lastYRef.current) / dt;
      lastYRef.current = currentY;
      lastTimeRef.current = now;
      setDragY(diff <= 160 ? diff * 0.92 : 147 + (diff - 160) * 0.4);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragY > 92 || velocityRef.current > 0.55) handleClose();
    else setDragY(0);
  };

  if (!isVisible) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100]"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        style={{
          opacity: isAnimating ? 1 : 0,
          transition: isDragging
            ? "none"
            : "opacity 400ms cubic-bezier(0.32,0.72,0,1)",
        }}
        onClick={handleClose}
      />
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl"
        style={{
          transform: isAnimating
            ? `translate3d(0,${dragY}px,0)`
            : "translate3d(0,100%,0)",
          transition: isDragging
            ? "none"
            : "transform 400ms cubic-bezier(0.32,0.72,0,1)",
          willChange: "transform",
          backfaceVisibility: "hidden",
        }}
      >
        {/* Drag handle */}
        <div className="pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing touch-none">
          <div className="h-[5px] w-10 rounded-full bg-gray-300" />
        </div>
        <div className="px-4 pb-4">
          <h3 className="text-[16px] font-semibold text-[#1a1a2e] mb-4">
            Export data
          </h3>
          <div className="space-y-2">
            <button
              onClick={() => {
                onEarnings();
                handleClose();
              }}
              className="w-full flex items-center gap-3 px-4 py-3.5 bg-[#f9fafb] rounded-xl text-[14px] font-medium text-[#374151] active:bg-[#f3f4f6] transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-white border border-[#e5e7eb] flex items-center justify-center shrink-0">
                <Download className="h-4 w-4 text-[#8b5cf6]" />
              </div>
              <div className="text-left">
                <p className="text-[14px] font-medium text-[#1a1a2e]">
                  Earnings summary
                </p>
                <p className="text-[12px] text-[#9ca3af]">
                  Sales, amounts, status — CSV
                </p>
              </div>
            </button>
            <button
              disabled={payoutsLoading}
              onClick={() => {
                onPayouts();
              }}
              className="w-full flex items-center gap-3 px-4 py-3.5 bg-[#f9fafb] rounded-xl text-[14px] font-medium text-[#374151] active:bg-[#f3f4f6] transition-colors disabled:opacity-50"
            >
              <div className="w-9 h-9 rounded-xl bg-white border border-[#e5e7eb] flex items-center justify-center shrink-0">
                {payoutsLoading ? (
                  <Loader2 className="h-4 w-4 text-[#8b5cf6] animate-spin" />
                ) : (
                  <Download className="h-4 w-4 text-[#8b5cf6]" />
                )}
              </div>
              <div className="text-left">
                <p className="text-[14px] font-medium text-[#1a1a2e]">
                  Payouts history
                </p>
                <p className="text-[12px] text-[#9ca3af]">
                  Bank transfers, dates, amounts — CSV
                </p>
              </div>
            </button>
          </div>
        </div>
        <div style={{ height: "max(env(safe-area-inset-bottom), 16px)" }} />
      </div>
    </div>,
    document.body,
  );
}

// ─── Payout Method Card ───────────────────────────────────────────────────────

type PayoutMethodData = {
  bankAccount: {
    bankName: string | null;
    last4: string;
    currency: string;
    routingNumber: string | null;
    accountHolderName: string | null;
    status: string | null;
  } | null;
  payoutSchedule: {
    interval: string;
    weeklyAnchor: string | null;
    monthlyAnchor: number | null;
    delayDays: number | null;
  } | null;
  payoutsEnabled: boolean;
};

function payoutSpeedLabel(schedule: PayoutMethodData["payoutSchedule"]): string {
  if (!schedule) return "Standard";
  const { interval, weeklyAnchor, monthlyAnchor, delayDays } = schedule;
  if (interval === "daily") return "Daily (automatic)";
  if (interval === "weekly") {
    const day = weeklyAnchor
      ? weeklyAnchor.charAt(0).toUpperCase() + weeklyAnchor.slice(1)
      : "Monday";
    return `Weekly on ${day}s`;
  }
  if (interval === "monthly") {
    const d = monthlyAnchor ?? 1;
    const suffix = d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th";
    return `Monthly on the ${d}${suffix}`;
  }
  if (interval === "manual") return "Manual (you control)";
  if (delayDays != null) {
    return `${delayDays} business day${delayDays !== 1 ? "s" : ""}`;
  }
  return "Standard (2–3 days)";
}

function PayoutMethodCard() {
  const [data, setData] = useState<PayoutMethodData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/stripe/payout-method")
      .then((r) => r.json())
      .then((json) => setData(json))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const openStripe = async () => {
    setActionLoading(true);
    try {
      const r = await fetch("/api/stripe/login-link", { method: "POST" });
      const json = await r.json();
      if (json.url) {
        window.open(json.url, "_blank", "noopener,noreferrer");
      } else {
        throw new Error("No URL returned");
      }
    } catch {
      toast({
        title: "Could not open Stripe",
        description: "Please visit dashboard.stripe.com directly.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const bank = data?.bankAccount;

  return (
    <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Left: icon + info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#f5f3ff] flex items-center justify-center shrink-0">
            <Building2 className="h-4 w-4 text-[#8b5cf6]" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-[#9ca3af] mb-0.5">
              Payout account
            </p>
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-32 bg-gray-100 rounded animate-pulse" />
                <div className="h-3.5 w-16 bg-gray-100 rounded animate-pulse" />
              </div>
            ) : bank ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-[14px] font-semibold text-[#1a1a2e]">
                  {bank.bankName || "Bank account"}{" "}
                  <span className="font-normal text-[#9ca3af]">
                    ••••{bank.last4}
                  </span>
                </span>
                <span className="text-[#d1d5db] hidden sm:inline">·</span>
                <span className="text-[13px] text-[#6b7280] uppercase font-medium">
                  {bank.currency}
                </span>
                <span className="text-[#d1d5db] hidden sm:inline">·</span>
                <span className="text-[13px] text-[#6b7280]">
                  {payoutSpeedLabel(data?.payoutSchedule ?? null)}
                </span>
                {bank.status && bank.status !== "new" && (
                  <>
                    <span className="text-[#d1d5db] hidden sm:inline">·</span>
                    <span
                      className={cn(
                        "text-[12px] font-medium capitalize",
                        bank.status === "verified"
                          ? "text-green-600"
                          : "text-amber-600",
                      )}
                    >
                      {bank.status}
                    </span>
                  </>
                )}
              </div>
            ) : (
              <p className="text-[13px] text-amber-600 font-medium">
                No bank account connected
              </p>
            )}
          </div>
        </div>

        {/* Right: compact action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={openStripe}
            disabled={actionLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium text-white bg-[#8b5cf6] rounded-lg hover:bg-[#7c3aed] transition-colors disabled:opacity-60 whitespace-nowrap"
          >
            {actionLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ExternalLink className="h-3.5 w-3.5" />
            )}
            Update bank
          </button>
          <button
            onClick={openStripe}
            disabled={actionLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium text-[#374151] bg-[#f3f4f6] rounded-lg hover:bg-[#e5e7eb] transition-colors disabled:opacity-60 whitespace-nowrap"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Stripe dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Payouts History List ─────────────────────────────────────────────────────

function PayoutsHistoryList({
  refreshKey,
  page = 0,
  pageSize = 6,
  pageSwitchLoading = false,
  convertCents = (c) => c,
  onCountChange,
  flat = false,
}: {
  refreshKey: number;
  page?: number;
  pageSize?: number;
  pageSwitchLoading?: boolean;
  convertCents?: (cents: number) => number;
  onCountChange?: (count: number) => void;
  flat?: boolean;
}) {
  const [payouts, setPayouts] = useState<StripePayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/stripe/payouts");
      const json = await r.json();
      if (json.error) throw new Error(json.error);
      setPayouts(json.payouts || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    onCountChange?.(payouts.length);
  }, [payouts.length, onCountChange]);

  const visiblePayouts = payouts.slice(
    page * pageSize,
    page * pageSize + pageSize,
  );

  if (loading) {
    return (
      <div className={cn("overflow-hidden", !flat && "bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]")}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="px-5 py-4 border-b border-[#e5e7eb] flex items-center gap-4"
          >
            <div className="h-4 w-24 rounded bg-gray-100 animate-pulse" />
            <div className="h-4 w-20 rounded bg-gray-100 animate-pulse" />
            <div className="h-5 w-16 rounded-full bg-gray-100 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("p-6 flex items-center gap-2", !flat && "bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]")}>
        <AlertCircle className="h-4 w-4 text-rose-500" />
        <p className="text-[13px] text-rose-600">{error}</p>
      </div>
    );
  }

  if (!payouts.length) {
    return (
      <div className={cn("p-12 text-center", !flat && "bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]")}>
        <div className="w-16 h-16 rounded-2xl bg-[#f3f4f6] flex items-center justify-center mx-auto mb-4">
          <Landmark className="h-7 w-7 text-[#9ca3af]" />
        </div>
        <p className="text-[15px] font-semibold text-[#1a1a2e]">
          No payouts yet
        </p>
        <p className="text-[13px] text-[#6b7280] mt-1">
          Your payout history will appear here after your first withdrawal.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden", !flat && "bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]")}>
      {/* Mobile card view */}
      <div className="sm:hidden divide-y divide-[#e5e7eb]">
        {(pageSwitchLoading ? [] : visiblePayouts).map((p) => {
          const cfg = payoutStatusConfig(p.status);
          return (
            <div key={p.id} className="px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] font-semibold text-[#1a1a2e]">
                  {fmt(convertCents(p.amount), "usd")}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium",
                    cfg.cls,
                  )}
                >
                  <cfg.Icon className="h-3 w-3" /> {cfg.label}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-[#6b7280]">
                  {fmtUnix(p.created)}
                </span>
                {p.arrival_date && (
                  <>
                    <span className="text-[#d1d5db]">·</span>
                    <span className="text-[12px] text-[#6b7280]">
                      {p.status === "paid"
                        ? `Arrived ${fmtUnix(p.arrival_date)}`
                        : `Est. ${fmtUnix(p.arrival_date)}`}
                    </span>
                  </>
                )}
              </div>
              {p.destination && (
                <p className="text-[11px] text-[#9ca3af] mt-0.5">
                  {p.destination}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e5e7eb]">
              <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">
                Date
              </th>
              <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">
                Amount
              </th>
              <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">
                Status
              </th>
              <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider hidden md:table-cell">
                Destination
              </th>
              <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider hidden lg:table-cell">
                Arrival
              </th>
              <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider hidden xl:table-cell">
                Payout ID
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e7eb]">
            {(pageSwitchLoading ? [] : visiblePayouts).map((p) => {
              const cfg = payoutStatusConfig(p.status);
              const arrivalNode = p.arrival_date ? (
                p.status === "paid" ? (
                  <span className="text-green-600 font-medium">
                    Arrived {fmtUnix(p.arrival_date)}
                  </span>
                ) : (
                  <span className="text-[#6b7280]">
                    Est. {fmtUnix(p.arrival_date)}
                  </span>
                )
              ) : (
                <span className="text-[#9ca3af] text-[11px]">
                  Most payouts arrive in 1–3 business days depending on your
                  bank.
                </span>
              );
              return (
                <tr key={p.id} className="hover:bg-[#f9fafb] transition-colors">
                  <td className="px-5 py-4 text-[14px] text-[#6b7280] whitespace-nowrap">
                    {fmtUnix(p.created)}
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-[14px] font-semibold text-[#1a1a2e]">
                      {fmt(convertCents(p.amount), "usd")}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium",
                        cfg.cls,
                      )}
                    >
                      <cfg.Icon className="h-3 w-3" /> {cfg.label}
                    </span>
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell text-[13px] text-[#6b7280]">
                    {p.destination || <span className="text-[#d1d5db]">—</span>}
                  </td>
                  <td className="px-5 py-4 hidden lg:table-cell text-[13px]">
                    {arrivalNode}
                  </td>
                  <td className="px-5 py-4 hidden xl:table-cell">
                    <span className="font-mono text-[11px] text-[#9ca3af] select-all">
                      {p.id}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-3 border-t border-[#e5e7eb] text-[12px] text-[#9ca3af] flex items-center justify-between gap-2">
        <span>
          Most payouts arrive in 1–3 business days depending on your bank and
          region.
        </span>
        <span className="text-[#6b7280]">
          Showing {Math.min((page + 1) * pageSize, payouts.length)} of{" "}
          {payouts.length}
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

interface PayoutsClientProps {
  creator: Creator;
  initialData: {
    totalEarnings: number;
    totalFees: number;
    netEarnings: number;
    pendingAmount: number;
    availableBalance: number;
    paidOut?: number;
    exchangeRate?: number | null;
    payoutScheduleInterval?: string | null;
    payoutScheduleDelay?: number | null;
  };
  initialOrders?: OrderPayment[];
}

export function PayoutsClient({
  creator,
  initialData,
  initialOrders = [],
}: PayoutsClientProps) {
  // Use Stripe's own exchange_rate from balance transactions for accurate USD conversion.
  // Stripe defines: presentment_amount × rate = account_amount
  // To convert native currency → USD: nativeAmount / rate = usdAmount
  const [stripeExchangeRate, setStripeExchangeRate] = useState(
    initialData.exchangeRate || 1,
  );
  const [recentTab, setRecentTab] = useState<"sales" | "payouts">("sales");
  const [recentPage, setRecentPage] = useState(0);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [payoutCount, setPayoutCount] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<OrderPayment | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [availableBalance, setAvailableBalance] = useState(
    initialData.availableBalance,
  );
  const [pendingBalance, setPendingBalance] = useState(
    initialData.pendingAmount,
  );
  const [openMenuOrderId, setOpenMenuOrderId] = useState<string | null>(null);
  const [payoutScheduleInterval, setPayoutScheduleInterval] = useState<string | null>(
    initialData.payoutScheduleInterval ?? null,
  );
  const [payoutScheduleDelay, setPayoutScheduleDelay] = useState<number | null>(
    initialData.payoutScheduleDelay ?? null,
  );

  const sourceCurrency = (creator.default_currency || "usd").toLowerCase();
  const currency = "usd";
  const hasStripe = !!creator.stripe_account_id;
  const payoutsEnabled = creator.payouts_enabled !== false;

  const refreshBalances = useCallback(async () => {
    setRefreshKey((k) => k + 1);

    try {
      const r = await fetch("/api/stripe/payouts");
      const json = await r.json();
      // Update exchange rate from Stripe's balance transactions if provided
      if (json.exchangeRate) setStripeExchangeRate(json.exchangeRate);
      // Update payout schedule from Stripe account settings
      if (json.payoutScheduleInterval !== undefined) setPayoutScheduleInterval(json.payoutScheduleInterval);
      if (json.payoutScheduleDelay !== undefined) setPayoutScheduleDelay(json.payoutScheduleDelay);
      if (json.balance) {
        const byCurrency = new Map<
          string,
          { available: number; pending: number }
        >();
        for (const b of json.balance.available || []) {
          const row = byCurrency.get(b.currency) || {
            available: 0,
            pending: 0,
          };
          row.available += b.amount;
          byCurrency.set(b.currency, row);
        }
        for (const b of json.balance.pending || []) {
          const row = byCurrency.get(b.currency) || {
            available: 0,
            pending: 0,
          };
          row.pending += b.amount;
          byCurrency.set(b.currency, row);
        }
        const preferredCurrency = sourceCurrency;
        const dominant =
          [...byCurrency.entries()].sort(
            (a, b) =>
              b[1].available + b[1].pending - (a[1].available + a[1].pending),
          )[0] || null;

        const selected = byCurrency.get(preferredCurrency)
          ? ([preferredCurrency, byCurrency.get(preferredCurrency)!] as const)
          : dominant;

        if (selected) {
          // Use Stripe's balance directly — it already accounts for
          // pending refunds (payment_refund txns reduce the pending balance)
          setAvailableBalance(Math.max(0, selected[1].available));
          setPendingBalance(Math.max(0, selected[1].pending));
        }
      }
    } catch {
      /* non-fatal */
    }
  }, [initialOrders, sourceCurrency]);

  const toUsd = useCallback(
    (cents: number) => {
      if (sourceCurrency === "usd") return cents;
      const converted = cents / stripeExchangeRate;
      return converted >= 0 ? Math.floor(converted) : Math.ceil(converted);
    },
    [sourceCurrency, stripeExchangeRate],
  );
  const openOrderDetails = useCallback((order: OrderPayment) => {
    setSelectedOrder(order);
  }, []);
  const pageItems =
    recentTab === "sales" ? initialOrders : new Array(payoutCount);
  const pageCount = Math.max(1, Math.ceil(pageItems.length / 4));
  const pagedOrders = initialOrders.slice(recentPage * 4, recentPage * 4 + 4);
  const changePage = (next: number) => {
    setIsPageLoading(true);
    setTimeout(() => {
      setRecentPage(next);
      setIsPageLoading(false);
    }, 200);
  };

  // Close order action menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".order-menu"))
        setOpenMenuOrderId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!hasStripe) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      refreshBalances();
    };
    tick();
    const id = window.setInterval(tick, 15000);
    const onVisible = () => tick();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [hasStripe, refreshBalances]);

  if (!hasStripe) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-[#e5e7eb] p-10 text-center">
        <Building2 className="h-10 w-10 text-[#d1d5db] mx-auto mb-3" />
        <h3 className="text-[17px] font-semibold text-[#1a1a2e] mb-1">
          Connect Stripe to unlock payouts
        </h3>
        <p className="text-[14px] text-[#6b7280] mb-5 max-w-sm mx-auto">
          Connect a Stripe account to view balances, revenue charts, and
          withdraw funds.
        </p>
        <a
          href="/app/settings?tab=payments"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#8b5cf6] text-white text-[14px] font-medium rounded-full hover:bg-[#7c3aed] transition-colors"
        >
          Connect Stripe
        </a>
      </div>
    );
  }

  const hasNoOrders = initialOrders.length === 0;

  return (
    <div className="space-y-6 relative">
      {/* No-data blurred overlay — shown when seller has no orders yet */}
      {hasNoOrders && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[6px] rounded-2xl" />
          <div className="relative z-10 text-center px-6 pointer-events-auto">
            <div className="w-16 h-16 rounded-full bg-[#f5f3ff] flex items-center justify-center mx-auto mb-4 shadow-sm">
              <DollarSign className="h-8 w-8 text-[#8b5cf6]" />
            </div>
            <p className="text-[18px] font-semibold text-[#1a1a2e] mb-1">No sales yet</p>
            <p className="text-[14px] text-[#6b7280] max-w-xs mx-auto">
              Your first sale will appear here. Share your store to get started.
            </p>
          </div>
        </div>
      )}
      <div className="space-y-6">
        {/* Chart + Withdraw panel side-by-side on desktop */}
        <div className="flex flex-col lg:flex-row gap-5">
          <RevenueChart />
          <div className="lg:w-[24rem] xl:w-[26.5rem] shrink-0">
            <WithdrawPanel
              availableBalance={toUsd(availableBalance)}
              pendingBalance={toUsd(pendingBalance)}
              currency={currency}
              payoutsEnabled={payoutsEnabled}
              balanceReady={true}
              onSuccess={() => {
                refreshBalances();
                setRecentTab("payouts");
              }}
              payoutScheduleInterval={payoutScheduleInterval}
              payoutScheduleDelay={payoutScheduleDelay}
            />
          </div>
        </div>

        {/* Recent activity */}
        {initialOrders.length > 0 ? (
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            {/* Tab bar */}
            <div className="px-4 sm:px-5 pt-4 pb-0 border-b border-[#e5e7eb] flex flex-col sm:flex-row sm:items-end sm:justify-between gap-0">
              {/* Tab buttons */}
              <div className="flex items-end gap-0 -mb-px">
                <button
                  onClick={() => {
                    if (recentTab === "sales") return;
                    setIsPageLoading(true);
                    setTimeout(() => {
                      setRecentTab("sales");
                      setRecentPage(0);
                      setIsPageLoading(false);
                    }, 150);
                  }}
                  className={cn(
                    "relative px-5 py-2.5 text-[13px] font-semibold rounded-t-xl border border-b-0 transition-colors duration-150 whitespace-nowrap",
                    recentTab === "sales"
                      ? "bg-white border-[#e5e7eb] text-[#1a1a2e] z-10"
                      : "bg-transparent border-transparent text-[#6b7280] hover:text-[#374151]",
                  )}
                >
                  Sales
                </button>
                <button
                  onClick={() => {
                    if (recentTab === "payouts") return;
                    setIsPageLoading(true);
                    setTimeout(() => {
                      setRecentTab("payouts");
                      setRecentPage(0);
                      setIsPageLoading(false);
                    }, 150);
                  }}
                  className={cn(
                    "relative px-5 py-2.5 text-[13px] font-semibold rounded-t-xl border border-b-0 transition-colors duration-150 whitespace-nowrap ml-1",
                    recentTab === "payouts"
                      ? "bg-white border-[#e5e7eb] text-[#1a1a2e] z-10"
                      : "bg-transparent border-transparent text-[#6b7280] hover:text-[#374151]",
                  )}
                >
                  Payouts
                </button>
              </div>
              {/* Pagination + export */}
              <div className="flex items-center justify-end gap-2 py-2 text-[#6b7280]">
                <div className="hidden sm:block">
                  <ExportDropdown orders={initialOrders} currency={currency} />
                </div>
                <span className="text-[11px] text-[#9ca3af]">
                  {recentPage + 1} / {pageCount}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={recentPage <= 0}
                    onClick={() => changePage(Math.max(0, recentPage - 1))}
                    className="h-7 w-7 flex items-center justify-center rounded-lg border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    disabled={recentPage >= pageCount - 1}
                    onClick={() => changePage(Math.min(pageCount - 1, recentPage + 1))}
                    className="h-7 w-7 flex items-center justify-center rounded-lg border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div
              className="transition-opacity duration-200"
              style={{ opacity: isPageLoading ? 0.4 : 1 }}
            >
              {recentTab === "payouts" ? (
                <PayoutsHistoryList
                  refreshKey={refreshKey}
                  page={recentPage}
                  pageSize={4}
                  pageSwitchLoading={isPageLoading}
                  convertCents={toUsd}
                  onCountChange={setPayoutCount}
                  flat={true}
                />
              ) : (
                <>
                  {isPageLoading && (
                    <div className="p-4 space-y-2">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className="h-10 rounded-lg bg-[#f3f4f6] animate-pulse"
                        />
                      ))}
                    </div>
                  )}

                  {/* Mobile card list */}
                  <div className="sm:hidden divide-y divide-[#f3f4f6]">
                    {(isPageLoading ? [] : pagedOrders).map((order) => {
                      const productImage = order.product?.thumbnail_url;
                      const customerName =
                        order.buyer?.display_name ||
                        (order.buyer_first_name && order.buyer_last_name
                          ? `${order.buyer_first_name} ${order.buyer_last_name}`
                          : "Customer");
                      const mobileDate = new Date(
                        order.created_at,
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      });
                      return (
                        <div
                          key={order.id}
                          className="px-4 py-3.5 active:bg-[#f9fafb] transition-colors"
                          onClick={() => openOrderDetails(order)}
                        >
                          <div className="flex items-center gap-3">
                            {productImage ? (
                              <img
                                src={productImage}
                                alt=""
                                className="w-11 h-11 rounded-xl object-cover flex-shrink-0"
                              />
                            ) : (
                              <div className="w-11 h-11 rounded-xl bg-[#f3f4f6] flex items-center justify-center flex-shrink-0">
                                <Package className="h-5 w-5 text-[#9ca3af]" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-semibold text-[#1a1a2e] truncate">
                                {customerName}
                              </p>
                              <p className="text-[12px] text-[#6b7280] truncate mt-0.5">
                                {order.product?.title || "Product"}
                              </p>
                              <p className="text-[11px] text-[#9ca3af] mt-0.5">
                                {mobileDate}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                              <p className="text-[14px] font-semibold text-[#1a1a2e]">
                                {fmt(order.amount_cents, currency)}
                              </p>
                              {getStatusBadge(order.status)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[#e5e7eb]">
                          <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">
                            Customer
                          </th>
                          <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">
                            Product
                          </th>
                          <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">
                            Date
                          </th>
                          <th className="text-right px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">
                            Amount
                          </th>
                          <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">
                            Status
                          </th>
                          <th className="text-right px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e5e7eb]">
                        {(isPageLoading ? [] : pagedOrders).map((order) => {
                          const productImage = order.product?.thumbnail_url;
                          return (
                            <tr
                              key={order.id}
                              className="hover:bg-[#f9fafb] transition-colors cursor-pointer"
                              onClick={(e) => {
                                if (
                                  (e.target as HTMLElement).closest(
                                    ".order-actions",
                                  )
                                )
                                  return;
                                openOrderDetails(order);
                              }}
                            >
                              <td className="px-5 py-4">
                                <p className="text-[14px] font-medium text-[#1a1a2e]">
                                  {order.buyer?.display_name ||
                                    (order.buyer_first_name &&
                                    order.buyer_last_name
                                      ? `${order.buyer_first_name} ${order.buyer_last_name}`
                                      : "Customer")}
                                </p>
                                <p className="text-[12px] text-[#6b7280]">
                                  {order.buyer?.email ||
                                    order.buyer_email ||
                                    ""}
                                </p>
                              </td>
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-3">
                                  {productImage ? (
                                    <img
                                      src={productImage}
                                      alt=""
                                      className="w-10 h-10 rounded-lg object-cover"
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                                      <Package className="h-4 w-4 text-[#9ca3af]" />
                                    </div>
                                  )}
                                  <span className="text-[14px] text-[#1a1a2e] truncate max-w-[200px]">
                                    {order.product?.title || "Product"}
                                  </span>
                                </div>
                              </td>
                              <td className="px-5 py-4">
                                <span className="text-[14px] text-[#6b7280]">
                                  {fmtDate(order.created_at)}
                                </span>
                              </td>
                              <td className="px-5 py-4 text-right">
                                <span className="text-[14px] font-medium text-[#1a1a2e]">
                                  {fmt(order.amount_cents, currency)}
                                </span>
                              </td>
                              <td className="px-5 py-4">
                                {getStatusBadge(order.status)}
                              </td>
                              <td className="px-5 py-4 text-right">
                                <div className="flex items-center justify-end gap-2 order-actions">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openOrderDetails(order);
                                    }}
                                    className="px-3 py-1.5 text-[12px] font-medium text-[#1a1a2e] bg-[#f3f4f6] rounded-lg hover:bg-[#e5e7eb] transition-colors"
                                  >
                                    View
                                  </button>
                                  <div className="relative order-menu">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenMenuOrderId(
                                          openMenuOrderId === order.id
                                            ? null
                                            : order.id,
                                        );
                                      }}
                                      className="p-1.5 text-[#9ca3af] hover:text-[#6b7280] hover:bg-[#f3f4f6] rounded-lg transition-colors"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </button>
                                    {openMenuOrderId === order.id && (
                                      <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-[#e5e7eb] rounded-xl shadow-lg z-50 py-1 animate-in fade-in-0 zoom-in-95 duration-100">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openOrderDetails(order);
                                            setOpenMenuOrderId(null);
                                          }}
                                          className="w-full text-left px-3 py-2 text-[13px] text-[#374151] hover:bg-[#f9fafb] flex items-center gap-2"
                                        >
                                          <Eye className="h-4 w-4 text-[#9ca3af]" />{" "}
                                          View details
                                        </button>
                                        {order.status === "completed" && (
                                          <>
                                            <div className="border-t border-[#e5e7eb] my-1" />
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                openOrderDetails(order);
                                                setOpenMenuOrderId(null);
                                              }}
                                              className="w-full text-left px-3 py-2 text-[13px] text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                                            >
                                              <RotateCcw className="h-4 w-4" />{" "}
                                              Issue refund
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {initialOrders.length > 0 && (
                    <div className="px-5 py-3 border-t border-[#e5e7eb] text-[12px] text-[#6b7280]">
                      Showing{" "}
                      {Math.min((recentPage + 1) * 4, initialOrders.length)} of{" "}
                      {initialOrders.length} orders
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-[#f5f3ff] flex items-center justify-center mx-auto mb-4">
              <DollarSign className="h-8 w-8 text-[#8b5cf6]" />
            </div>
            <p className="text-[15px] font-semibold text-[#1a1a2e]">
              No sales yet
            </p>
            <p className="text-[13px] text-[#6b7280] mt-1">
              Your first sale will appear here once customers purchase.
            </p>
          </div>
        )}

        {/* Payout method card */}
        <PayoutMethodCard />
      </div>

      {/* Order Details Modal */}
      <OrderDetailsModal
        order={selectedOrder}
        currency={currency}
        onClose={() => setSelectedOrder(null)}
        onRefundSuccess={(refundedAmountCents) => {
          // Optimistically subtract the refunded amount from the displayed
          // balance immediately — the user sees $0 the instant the refund
          // confirms, without waiting for Stripe's API propagation.
          // Refunded amounts may sit in pending or available; reduce both
          // by the refund amount (clamped to 0) so the UI is always correct.
          setPendingBalance((prev) => Math.max(0, prev - refundedAmountCents));
          setAvailableBalance((prev) => Math.max(0, prev - refundedAmountCents));
          // Then re-fetch real Stripe balances: immediately + after 3 s
          // in case the transfer-reversal propagation takes a moment.
          refreshBalances();
          setTimeout(() => refreshBalances(), 3000);
        }}
      />

      <style jsx>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
