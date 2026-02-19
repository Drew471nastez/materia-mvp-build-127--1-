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
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtFullDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function fmtUnix(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
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
        <div className="pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing touch-none">
          <div className="h-[5px] w-10 rounded-full bg-gray-300" />
        </div>
        <div className="px-4 pb-4">
          <h3 className="text-[16px] font-semibold text-[#1a1a2e] mb-4">
            Select time period
          </h3>
          <div className="space-y-1 max-h-[50vh] overflow-y-auto overscroll-contain">
            {CHART_TIMEFRAMES.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onSelect(opt.value);
                  handleClose();
                }}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-xl text-[15px] font-medium transition-colors",
                  selected === opt.value
                    ? "bg-[#f5f3ff] text-[#8b5cf6]"
                    : "text-[#374151] hover:bg-[#f9fafb] active:bg-[#f3f4f6]",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ height: "max(env(safe-area-inset-bottom), 12px)" }} />
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
  const [fxRate, setFxRate] = useState(1);
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

  const load = useCallback(async (tf: ChartTimeframeValue) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/stripe/revenue-chart?timeframe=${tf}`);
      const json = await r.json();
      if (json.error) throw new Error(json.error);
      setData(json.data || []);
      setTotal(json.total || 0);
      setTotalGross(json.totalGross || 0);
      setTotalRefunds(json.totalRefunds || 0);
      if (json.currency) setCurrency(json.currency.toLowerCase());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(timeframe);
  }, [timeframe, load]);

  useEffect(() => {
    if (currency === "usd") return;
    fetch(`/api/fx?from=${currency}&to=usd`)
      .then((r) => r.json())
      .then((json) => setFxRate(json.rate || 1))
      .catch(() => setFxRate(1));
  }, [currency]);

  const toUsd = (cents: number) => Math.round(cents * fxRate);
  // Stripe fees = gross charges - refunds - net
  const fees = Math.max(0, totalGross - totalRefunds - total);
  const hasData = data.some((d) => Math.abs(d.revenue) > 0);
  const selectedLabel =
    CHART_TIMEFRAMES.find((t) => t.value === timeframe)?.label ?? "Last 7 days";

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-xl p-3 shadow-lg text-[13px]">
        <p className="text-[#6b7280] mb-1">
          {new Date(label + "T00:00:00").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
        <p className="font-bold text-[#1a1a2e]">
          {fmt(toUsd(payload[0].value), "usd")}
        </p>
        {payload[0].payload.count > 0 && (
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
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-[13px] font-medium text-[#6b7280]">
            Net Earnings
          </p>
          {loading ? (
            <div className="h-7 w-32 mt-1 rounded-lg bg-gray-200 animate-pulse" />
          ) : (
            <p className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
              {fmt(toUsd(Math.max(0, total)), "usd")}
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
      ) : !hasData ? (
        <div className="h-48 flex flex-col items-center justify-center gap-2 text-center">
          <TrendingUp className="h-8 w-8 text-[#d1d5db]" />
          <p className="text-[14px] text-[#6b7280]">
            No revenue in this period yet
          </p>
          <p className="text-[12px] text-[#9ca3af]">
            Sales will appear here once processed
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart
            data={data}
            margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
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
                new Date(v + "T00:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              }
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${(toUsd(v) / 100).toFixed(0)}`}
              width={52}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#8b5cf6"
              strokeWidth={2.5}
              fill="url(#revGrad)"
              dot={false}
              activeDot={{ r: 4, fill: "#8b5cf6", strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {/* Under-chart stats: Gross • Refunds (if any) • Fees • Net */}
      {!loading && !error && (
        <div className="mt-3 pt-3 border-t border-[#f3f4f6] flex items-center gap-3 flex-wrap text-[11px] text-[#9ca3af]">
          <span>
            Gross sales{" "}
            <span className="font-medium text-[#6b7280]">
              {fmt(toUsd(totalGross), "usd")}
            </span>
          </span>
          {totalRefunds > 0 && (
            <>
              <span className="text-[#d1d5db]">•</span>
              <span>
                Refunds{" "}
                <span className="font-medium text-rose-500">
                  −{fmt(toUsd(totalRefunds), "usd")}
                </span>
              </span>
            </>
          )}
          {fees > 0 && (
            <>
              <span className="text-[#d1d5db]">•</span>
              <span>
                Fees{" "}
                <span className="font-medium text-[#6b7280]">
                  −{fmt(toUsd(fees), "usd")}
                </span>
              </span>
            </>
          )}
          <span className="text-[#d1d5db]">•</span>
          <span>
            Net{" "}
            <span className="font-medium text-[#8b5cf6]">
              {fmt(toUsd(Math.max(0, total)), "usd")}
            </span>
          </span>
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
  onSuccess,
}: {
  availableBalance: number;
  pendingBalance: number;
  currency: string;
  payoutsEnabled: boolean;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openBreakdown, setOpenBreakdown] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const [successPayout, setSuccessPayout] = useState<{
    amount: number;
    currency: string;
  } | null>(null);
  const { toast } = useToast();

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
      ? "Nothing available yet — funds usually become available in 1–3 days."
      : "Transfers typically arrive within 1–3 business days.";

  return (
    <div className="bg-[#f8fafc] rounded-2xl border border-[#e5e7eb] p-5 sm:p-6 flex flex-col gap-5 min-w-[240px]">
      <div className="rounded-xl border border-[#e5e7eb] bg-white p-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[12px] text-[#6b7280] font-medium tracking-wide uppercase">
              Available for cashout
            </p>
            <p className="text-[28px] sm:text-[32px] leading-none font-semibold text-[#1a1a2e] mt-2">
              {fmt(availableBalance, currency)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[12px] text-[#6b7280] font-medium tracking-wide uppercase">
              Available soon
            </p>
            <p className="text-[26px] sm:text-[30px] leading-none font-semibold text-[#1a1a2e] mt-2">
              {fmt(pendingBalance, currency)}
            </p>
            <button
              onClick={() => setOpenBreakdown(true)}
              className="text-[13px] font-medium text-[#8b5cf6] hover:text-[#7c3aed] hover:underline mt-3 transition-colors"
            >
              See breakdown
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
      ) : (
        <>
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-[12px] text-red-700">{error}</p>
            </div>
          )}
          <div className="relative group">
            <button
              onClick={handleWithdraw}
              disabled={loading || availableBalance <= 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-[15px] font-medium text-white bg-[#635bff] rounded-xl hover:bg-[#564de8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Processing…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" /> Withdraw
                </>
              )}
            </button>
            {availableBalance <= 0 && !loading && (
              <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-[#1a1a2e] text-white text-[12px] rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-lg">
                No funds available
                <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-[#1a1a2e]" />
              </div>
            )}
          </div>
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

          {/* Mobile breakdown bottom sheet */}
          <div className="fixed inset-0 z-[80] sm:hidden">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
              style={{
                opacity: dragY > 0 ? Math.max(0, 1 - dragY / 300) : 1,
                transition: isDragging ? "none" : "opacity 350ms ease-out",
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
                transform: `translateY(${dragY}px)`,
                transition: isDragging
                  ? "none"
                  : "transform 380ms cubic-bezier(0.32,0.72,0,1)",
                willChange: "transform",
              }}
            >
              <div className="pt-3 pb-2 flex justify-center">
                <div className="w-10 h-1.5 rounded-full bg-[#d1d5db]" />
              </div>
              <div className="px-5 pb-5">
                <h3 className="text-[18px] font-semibold text-[#1a1a2e]">
                  Earnings Breakdown
                </h3>
                <p className="text-[13px] text-[#6b7280] mt-0.5">
                  Your Stripe connected account balance.
                </p>

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
                    <span className="text-[14px] font-semibold text-[#1a1a2e]">
                      {fmt(pendingBalance, currency)}
                    </span>
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
                    <span className="text-[14px] font-semibold text-[#1a1a2e]">
                      {fmt(availableBalance, currency)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-[#e5e7eb] px-1">
                    <span className="text-[13px] font-medium text-[#1a1a2e]">Total balance</span>
                    <span className="text-[16px] font-bold text-[#8b5cf6]">
                      {fmt(availableBalance + pendingBalance, currency)}
                    </span>
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
        </>
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
  onRefundSuccess?: () => void;
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
  const startY = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

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
      onRefundSuccess?.();
      toast({
        title: "Refund issued",
        description: "The buyer will be notified.",
      });
    } catch (e: any) {
      setRefundError(e.message);
      toast({
        title: "Refund failed",
        description: e.message,
        variant: "destructive",
      });
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

  const ContentSections = ({ compact = false }: { compact?: boolean }) => (
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
          Customer
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
          {order.buyer_first_name && (
            <div>
              <span className="text-[#6b7280]">First Name</span>
              <p className="font-medium text-[#1a1a2e]">
                {order.buyer_first_name}
              </p>
            </div>
          )}
          {order.buyer_last_name && (
            <div>
              <span className="text-[#6b7280]">Last Name</span>
              <p className="font-medium text-[#1a1a2e]">
                {order.buyer_last_name}
              </p>
            </div>
          )}
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
            Platform fee
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
            Net earnings
          </span>
          <span
            className={cn(
              "font-semibold text-[#8b5cf6]",
              compact ? "text-[12px]" : "text-[13px]",
            )}
          >
            {fmt(net, currency)}
          </span>
        </div>
        {order.card_brand && (
          <div className="flex items-center justify-between">
            <span
              className={cn(
                "text-[#6b7280]",
                compact ? "text-[12px]" : "text-[13px]",
              )}
            >
              Card
            </span>
            <span
              className={cn(
                "font-medium text-[#1a1a2e]",
                compact ? "text-[12px]" : "text-[13px]",
              )}
            >
              {order.card_brand.toUpperCase()} •••• {order.card_last4}
            </span>
          </div>
        )}
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
      <div className={cn("bg-[#f9fafb] rounded-xl", compact ? "p-3" : "p-4")}>
        <h4
          className={cn(
            "font-semibold text-[#1a1a2e] flex items-center gap-1.5 mb-2",
            compact ? "text-[12px]" : "text-[13px]",
          )}
        >
          <TrendingUp
            className={cn(
              "text-[#8b5cf6]",
              compact ? "h-3.5 w-3.5" : "h-4 w-4",
            )}
          />{" "}
          Payout timeline
        </h4>
        {order.amount_cents === 0 ? (
          <p className="text-[12px] text-[#9ca3af] italic">
            No payout for free orders.
          </p>
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

      {/* Action buttons */}
      <div className={cn("flex gap-2", compact ? "flex-col" : "flex-row")}>
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
            maxHeight: "78vh",
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
            <ContentSections compact={true} />
          </div>
          <div style={{ height: "max(env(safe-area-inset-bottom), 16px)" }} />
        </div>
      </div>

      {/* ── Refund Confirmation Modal ── */}
      {showRefundConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !refundLoading && setShowRefundConfirm(false)}
          />
          <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200">
            {/* Header */}
            <div className="border-b border-[#e5e7eb] px-6 py-4">
              <h2 className="text-[18px] font-semibold text-[#1a1a2e]">
                Issue Refund
              </h2>
              <p className="text-[13px] text-[#6b7280] mt-1">
                Process a refund for this order. The customer will be notified
                via email.
              </p>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Order summary */}
              <div className="flex items-center gap-3 p-3 bg-[#f9fafb] rounded-xl">
                {order.product?.thumbnail_url ? (
                  <img
                    src={order.product.thumbnail_url}
                    alt=""
                    className="w-10 h-10 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-[#e5e7eb] flex items-center justify-center">
                    <Package className="h-4 w-4 text-[#9ca3af]" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-[#1a1a2e] truncate">
                    {order.product?.title || "Product"}
                  </p>
                  <p className="text-[12px] text-[#9ca3af]">
                    {order.buyer_email || order.customer_email || ""}
                  </p>
                </div>
                <p className="text-[14px] font-semibold text-[#1a1a2e] shrink-0">
                  {fmt(order.amount_cents, currency)}
                </p>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-[13px] font-medium text-[#374151] mb-2">
                  Reason
                </label>
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
                        "px-3 py-2 rounded-lg text-[13px] font-medium transition-colors border",
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
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {refundError}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-[#e5e7eb] px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowRefundConfirm(false)}
                disabled={refundLoading}
                className="px-4 py-2 text-[13px] font-medium text-[#6b7280] hover:text-[#374151] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRefundConfirm}
                disabled={refundLoading || !refundReason}
                className="px-4 py-2 text-[13px] font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {refundLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing…
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4" />
                    Confirm Refund
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
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
  };
  initialOrders?: OrderPayment[];
}

export function PayoutsClient({
  creator,
  initialData,
  initialOrders = [],
}: PayoutsClientProps) {
  const [fxRate, setFxRate] = useState(1);
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

  const sourceCurrency = (creator.default_currency || "usd").toLowerCase();
  const currency = "usd";
  const hasStripe = !!creator.stripe_account_id;
  const payoutsEnabled = creator.payouts_enabled !== false;

  const refreshBalances = useCallback(async () => {
    setRefreshKey((k) => k + 1);

    try {
      const r = await fetch("/api/stripe/payouts");
      const json = await r.json();
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

  useEffect(() => {
    if (sourceCurrency === "usd") return;
    fetch(`/api/fx?from=${sourceCurrency}&to=usd`)
      .then((r) => r.json())
      .then((json) => setFxRate(json.rate || 1))
      .catch(() => setFxRate(1));
  }, [sourceCurrency]);

  const toUsd = useCallback(
    (cents: number) => Math.round(cents * fxRate),
    [fxRate],
  );
  const openOrderDetails = useCallback((order: OrderPayment) => {
    setSelectedOrder(order);
  }, []);
  const pageItems =
    recentTab === "sales" ? initialOrders : new Array(payoutCount);
  const pageCount = Math.max(1, Math.ceil(pageItems.length / 6));
  const pagedOrders = initialOrders.slice(recentPage * 6, recentPage * 6 + 6);
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

  return (
    <div className="space-y-6">
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
              onSuccess={() => {
                refreshBalances();
                setRecentTab("payouts");
              }}
            />
          </div>
        </div>

        {/* Recent activity */}
        {initialOrders.length > 0 ? (
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-[#e5e7eb] flex items-center justify-between gap-3">
              <div className="relative flex items-center bg-[#f3f4f6] rounded-full p-1">
                {/* Sliding pill indicator — flex-1 buttons ensure equal halves */}
                <div
                  className="absolute top-1 bottom-1 bg-white rounded-full shadow-sm transition-all duration-300 ease-out"
                  style={{
                    left: recentTab === "sales" ? "4px" : "calc(50% + 1px)",
                    width: "calc(50% - 5px)",
                  }}
                />
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
                    "relative z-10 flex-1 px-5 py-1.5 text-[12px] font-medium rounded-full transition-colors duration-200 whitespace-nowrap text-center",
                    recentTab === "sales"
                      ? "text-[#1a1a2e]"
                      : "text-[#6b7280] hover:text-[#374151]",
                  )}
                >
                  Recent Sales
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
                    "relative z-10 flex-1 px-5 py-1.5 text-[12px] font-medium rounded-full transition-colors duration-200 whitespace-nowrap text-center",
                    recentTab === "payouts"
                      ? "text-[#1a1a2e]"
                      : "text-[#6b7280] hover:text-[#374151]",
                  )}
                >
                  Recent Payouts
                </button>
              </div>
              <div className="flex items-center gap-0.5 text-[#6b7280]">
                <span className="text-[12px] text-[#9ca3af] hidden sm:inline mr-1">
                  {recentPage + 1} / {pageCount}
                </span>
                <button
                  disabled={recentPage <= 0}
                  onClick={() => changePage(Math.max(0, recentPage - 1))}
                  className="p-1.5 rounded-lg hover:bg-[#f3f4f6] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  disabled={recentPage >= pageCount - 1}
                  onClick={() =>
                    changePage(Math.min(pageCount - 1, recentPage + 1))
                  }
                  className="p-1.5 rounded-lg hover:bg-[#f3f4f6] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
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
                  pageSize={6}
                  pageSwitchLoading={isPageLoading}
                  convertCents={toUsd}
                  onCountChange={setPayoutCount}
                  flat={true}
                />
              ) : (
                <>
                  {isPageLoading && (
                    <div className="p-4 space-y-2">
                      {[1, 2, 3, 4, 5, 6].map((i) => (
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
                      {Math.min((recentPage + 1) * 6, initialOrders.length)} of{" "}
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
      </div>

      {/* Order Details Modal */}
      <OrderDetailsModal
        order={selectedOrder}
        currency={currency}
        onClose={() => setSelectedOrder(null)}
        onRefundSuccess={refreshBalances}
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
