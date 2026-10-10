"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PAYOUTS: WHAT YOU HAVE, WHAT CAME IN, AND WHAT WENT TO YOUR BANK
 * ═══════════════════════════════════════════════════════════════════════════
 * "Update the payouts page to be more like our Polaris / Apple / Shopify /
 * Storelib UI, like we did recently with the entire app."
 *
 * So it is built from the parts the redone pages already use, rather than a
 * look of its own. The bar at the top is the Orders and Products bar
 * (PaneBar, app/app/orders/order-parts), with the title, one line under it,
 * and the page's two actions on the right as depth buttons
 * (components/ui/depth-button): Export, white with a hairline, and Cash out,
 * the near black primary. Those two are drawn by this client into a slot the
 * server page leaves in its bar (`data-payouts-actions`), because the bar
 * lands the moment Payouts is pressed and the balance they act on streams in
 * behind it (app/app/payouts/page.tsx).
 *
 * Then, top to bottom, the order a creator looks for things in:
 *
 *   one notice      the single most important thing about the account, calm,
 *                   with at most one action (a dispute, a failed payout,
 *                   Stripe asking for something)
 *   Balance         three figures in the Home and Analytics figure style:
 *                   available, arriving soon, on the way to the bank. While
 *                   Stripe answers they are drawn soft (blurred), never as
 *                   grey bars, the way MetricTab waits
 *   Revenue         the one chart, with the period picker every page shares
 *   Sales/Payouts   one list card, drawn like Orders and Products: a toolbar,
 *                   light rows with Orders' status badges, a footer with the
 *                   range and the arrows. A phone gets rows, not a table
 *   Payout account  the bank Stripe pays into, and the one button to change it
 *
 * Every read, every write and every figure is the one it was: the Stripe
 * balance and its refresh every 30 seconds, the cash out, the refund, the
 * resend, the invoice, the order timeline, the holds, the CSV exports, the
 * account links. Only how they are drawn changed, and where two panels said
 * the same thing (a Breakdown and a See details, both a balance with rows)
 * they are one Details panel now.
 *
 * On a phone every panel is the shared bottom sheet
 * (components/ui/bottom-sheet), every menu is ResponsiveActionMenu's sheet,
 * every press is at least 44px, and nothing scrolls sideways.
 */

import React, {
  forwardRef,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useLayoutEffect,
  type ButtonHTMLAttributes,
} from "react";
import { StorelibPaymentsInline } from "@/components/app/settings/storelib-payments-inline";
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
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  FileText,
  Landmark,
  ListFilter,
  Loader2,
  Mail,
  Package,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Shimmer, ShimmerBlock, ShimmerChart, ShimmerRows } from "@/components/ui/shimmer";
import { DateRangePicker } from "@/components/app/date-range-picker";
import { HelpLabel } from "@/components/app/help-label";
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu";
import { accentDepth, criticalDepth, primaryDepth, secondaryDepth } from "@/components/ui/depth-button";
import { decimalsOf } from "@/lib/payments/money";
import { pickBalance } from "@/lib/payments/display-currency";
import { forgetOverview, warmOverview } from "@/lib/payments/overview-cache";
import { RowMenuButton, StatusBadge, card, iconButton } from "@/app/app/orders/order-parts";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { useRouter } from "next/navigation";
import { viewerTimeZone } from "@/lib/orders/time-zone";
import { boundsOf, resolveValue, todayIn, type RangeValue } from "@/lib/date-range/range";
import { useToast } from "@/hooks/use-toast";
import { useReasons } from "@/lib/store/use-reasons";
import type { StorelibStatusView } from "@/lib/payments/stripe/status";

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
  /** The currency the sale was charged in. */
  currency?: string | null;
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

/** An amount in its own currency, with that currency's decimals (0 for yen, 2 for lei and dollars). */
function fmt(minor: number, currency = "usd") {
  const code = (currency || "usd").toUpperCase();
  const d = decimalsOf(code);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    }).format(minor / 10 ** d);
  } catch {
    return `${(minor / 10 ** d).toFixed(d)} ${code}`;
  }
}

function fmtCompact(minor: number, currency = "usd") {
  const val = minor / 10 ** decimalsOf(currency);
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

/** A day from Stripe (YYYY-MM-DD) as people read it: "Oct 12". */
function fmtDay(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** The settlement wait in words, from the account's own schedule when Stripe gave it. */
function settleText(days: number | null) {
  return days && days > 0
    ? `New sales become available about ${days} days after they are paid.`
    : "New sales become available after a short settlement wait.";
}

/** The help article on how payouts work (lib/help/articles.ts). */
const HOW_PAYOUTS_WORK = "/help/orders-and-payouts/how-payouts-work";

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

/* ─── Statuses, in Orders' badges ─────────────────────────────────────────── */

/**
 * THE SAME WORDS AND TINTS AS ORDERS. A sale here is an order there, so it
 * says what the Orders list says about it (lib/orders/order-view
 * PAYMENT_LABEL): Paid in grey, Payment pending with the attention ring,
 * Refunded in grey, Disputed and Failed in red with the ring. It used to be
 * a violet "Completed" pill with a tick, which read like a different product.
 */
type Tone = "neutral" | "attention" | "critical" | "success";

function saleStatus(status: string): { tone: Tone; label: string } {
  switch (status) {
    case "completed":
      return { tone: "neutral", label: "Paid" };
    case "pending":
      return { tone: "attention", label: "Payment pending" };
    case "refunded":
      return { tone: "neutral", label: "Refunded" };
    case "disputed":
      return { tone: "critical", label: "Disputed" };
    case "failed":
      return { tone: "critical", label: "Failed" };
    default:
      return { tone: "neutral", label: status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ") : "Unknown" };
  }
}

function SaleBadge({ status }: { status: string }) {
  const s = saleStatus(status);
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>;
}

/**
 * A payout's status. Paid is the one place a green tint is earned: the
 * money is in the bank. On its way is grey, a payout Stripe has not sent
 * yet carries the attention ring, and one that bounced is red.
 */
function payoutStatusConfig(status: string): { tone: Tone; label: string } {
  switch (status) {
    case "paid":
      return { tone: "success", label: "Paid" };
    case "in_transit":
      return { tone: "neutral", label: "In transit" };
    case "pending":
      return { tone: "attention", label: "Pending" };
    case "failed":
      return { tone: "critical", label: "Failed" };
    case "canceled":
      return { tone: "neutral", label: "Canceled" };
    default:
      return { tone: "neutral", label: status };
  }
}

/** The name the list and the order's panel give a buyer. */
function customerNameOf(order: OrderPayment): string | null {
  return (
    order.buyer?.display_name ||
    (order.buyer_first_name && order.buyer_last_name
      ? `${order.buyer_first_name} ${order.buyer_last_name}`
      : null)
  );
}

/* ─── The look ────────────────────────────────────────────────────────────── */

/*
  THE BUTTONS ARE THE APP'S DEPTH BUTTONS, AT THE LIST PAGES' 32px. White
  with a hairline for everything but the one thing the page is for, which
  is near black (the owner asked for no purple on the app's actions). A
  phone draws them the same size and gives each a 44px press around it
  (Press, below), the way the Products bar does.
*/
const LOOK_SECONDARY = cn(secondaryDepth, "h-8 rounded-lg px-3 text-[13px]");
const LOOK_PRIMARY = cn(primaryDepth, "h-8 gap-1.5 rounded-lg px-3 text-[13px]");
/** Cash out, the page's one violet action (the owner: "you can make the Cash out button purple"). */
const LOOK_CASH_OUT = cn(accentDepth, "h-8 gap-1.5 rounded-lg px-3 text-[13px]");
/** The square beside the primary on a phone (Export as a download icon). */
const LOOK_ICON = cn(secondaryDepth, "h-8 w-8 rounded-lg px-0 text-[#4b5563]");
/** A pager arrow in a list's footer. */
const LOOK_ARROW = cn(secondaryDepth, "h-7 w-8 rounded-lg px-0 text-[#4b5563]");

/*
  IN A SHEET OR A PANEL, BIG ENOUGH FOR A THUMB. A phone's sheet has the
  room, so its buttons are drawn at 44px and 12px round, the iOS size, and
  step down to the 32px list size from 640px, where the panels are dialogs.
*/
const SHEET_SECONDARY = cn(secondaryDepth, "h-11 rounded-xl px-4 text-[14px] sm:h-8 sm:rounded-lg sm:px-3 sm:text-[13px]");
const SHEET_PRIMARY = cn(primaryDepth, "h-11 gap-1.5 rounded-xl px-4 text-[14px] sm:h-8 sm:rounded-lg sm:px-3 sm:text-[13px] disabled:cursor-not-allowed disabled:opacity-50");
const SHEET_CASH_OUT = cn(accentDepth, "h-11 gap-1.5 rounded-xl px-4 text-[14px] sm:h-8 sm:rounded-lg sm:px-3 sm:text-[13px] disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:opacity-50");

/** Orders' dialog: white, 16px round, a deep soft shadow, no padding of its own. */
const DIALOG_PANEL =
  "relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_24px_60px_-12px_rgba(17,24,39,0.3)]";

/** A field in a panel: 16px on a phone so iOS does not zoom into it, 13px wider. */
const FIELD =
  "h-11 w-full rounded-lg border border-[#d5d7dd] bg-white px-3 text-[16px] text-[#1a1a2e] outline-none transition-colors focus:border-[#1a1a2e] sm:h-9 sm:px-2.5 sm:text-[13px]";

/**
 * A button that is its drawing on a computer and a 44px press around the
 * same drawing on a phone: Products' Press, for the same reason. Chromium
 * clips a button's hit test to its own box, so the press is the button and
 * the drawing is the span inside it. It passes on its ref and everything it
 * is given, so it can be ResponsiveActionMenu's trigger.
 */
const Press = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { look: string }>(function Press(
  { look, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      {...rest}
      className={cn(
        "group/press inline-flex shrink-0 cursor-pointer items-center justify-center outline-none disabled:cursor-not-allowed max-md:min-h-11 max-md:min-w-11",
        "[&:focus-visible>span]:outline-2 [&:focus-visible>span]:outline-offset-2 [&:focus-visible>span]:outline-[#1a1a2e]/40 [&:focus-visible>span]:outline-solid",
        className,
      )}
    >
      <span className={cn(look, "group-disabled/press:opacity-50 group-aria-disabled/press:opacity-50")}>{children}</span>
    </button>
  );
});

/* ─── A notice ────────────────────────────────────────────────────────────── */

type NoticeTone = "neutral" | "attention" | "critical";

const NOTICE_TONE: Record<NoticeTone, { box: string; dot: string }> = {
  neutral: { box: "border-[#e5e7eb] bg-white", dot: "bg-[#9ca3af]" },
  attention: { box: "border-[#f3e3b3] bg-[#fffaeb]", dot: "bg-[#d9a400]" },
  critical: { box: "border-[#f5c9c3] bg-[#fef3f2]", dot: "bg-[#d92d20]" },
};

/**
 * ONE CALM LINE ABOUT THE ACCOUNT, WITH ONE THING TO DO. What Orders shows
 * when payouts are not set up: a tinted strip with the words and a single
 * action, no icon tile, no second button. The dot says how much it matters
 * without a colour doing all the talking: grey for news, amber for something
 * Stripe wants, red for money that did not arrive or was taken back. On a
 * phone the action drops under the words at a thumb's 44px.
 */
function Notice({
  tone,
  title,
  body,
  action,
  className,
}: {
  tone: NoticeTone;
  title: string;
  body?: React.ReactNode;
  action?: { label: string; onClick: () => void; busy?: boolean };
  className?: string;
}) {
  const t = NOTICE_TONE[tone];
  return (
    <div
      role={tone === "critical" ? "alert" : "status"}
      data-payouts-notice={tone}
      className={cn("flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center", t.box, className)}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <span aria-hidden className={cn("mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full", t.dot)} />
        <div className="min-w-0">
          <p className="text-[13px] font-medium leading-5 text-[#1a1a2e]">{title}</p>
          {body ? <div className="mt-0.5 text-[13px] leading-5 text-[#4b5563]">{body}</div> : null}
        </div>
      </div>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          disabled={action.busy}
          className={cn(secondaryDepth, "h-11 w-full rounded-xl px-4 text-[14px] sm:ml-2 sm:h-8 sm:w-auto sm:rounded-lg sm:px-3 sm:text-[13px]")}
        >
          {action.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

/* ─── A figure ────────────────────────────────────────────────────────────── */

/**
 * ONE FIGURE, DRAWN LIKE A HOME AND ANALYTICS TAB (components/app/metric-tab)
 * without being a tab: there is nothing to switch to. The label in grey, the
 * figure in tight semibold figures of one width, a quiet line under it. While
 * Stripe answers it shows what the server read, soft (2px of blur on the
 * figure, 1px on the line), and clears over 700ms when the answer lands: no
 * grey bar standing in for a number.
 */
function Figure({
  label,
  value,
  foot,
  loading,
  critical = false,
  big = false,
  className,
}: {
  label: string;
  value: string;
  foot: string;
  loading: boolean;
  critical?: boolean;
  /** The one that matters most, larger on a phone where it has the row to itself. */
  big?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 px-4 py-3 sm:py-3.5", className)} data-figure={label}>
      <span className="block truncate text-[12px] font-medium text-[#4b5563]">{label}</span>
      <span
        className={cn(
          "mt-0.5 block truncate font-semibold tabular-nums tracking-tight transition-[filter] duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] sm:text-[22px]",
          big ? "text-[26px] leading-8 sm:leading-normal" : "text-[18px]",
          critical ? "text-[#b42318]" : "text-[#1a1a2e]",
          loading ? "blur-[2px]" : "blur-0",
        )}
      >
        {value}
      </span>
      <span
        className={cn(
          "mt-0.5 block truncate text-[11px] text-[#9ca3af] transition-[filter] duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
          loading ? "blur-[1px]" : "blur-0",
        )}
      >
        {foot}
      </span>
    </div>
  );
}

/** A label and an amount on one line, the way an order's payment card lists them. */
function Line({ label, value, strong, muted }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 py-1 text-[13px]",
        strong ? "font-semibold text-[#1a1a2e]" : muted ? "text-[#6b7280]" : "text-[#303036]",
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

/** A product's picture, or a quiet box where there is none. */
function Thumb({ src, size = 40 }: { src?: string | null; size?: 32 | 40 | 44 }) {
  const box = size === 32 ? "h-8 w-8 rounded-md" : size === 40 ? "h-10 w-10 rounded-lg" : "h-11 w-11 rounded-lg";
  return (
    <span className={cn("relative flex shrink-0 items-center justify-center overflow-hidden border border-[#eceef1] bg-[#f4f5f7] text-[#9ca3af]", box)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size} height={size} decoding="async" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <Package className="h-4 w-4" />
      )}
    </span>
  );
}

/**
 * A DIALOG ON A COMPUTER. Drawn from 640px only; under that the same content
 * is the shared bottom sheet, which each caller draws beside it. Escape and
 * a press outside close it, as they close every dialog in the app.
 */
function DesktopDialog({
  open,
  onClose,
  label,
  width = "max-w-[440px]",
  z = "z-[80]",
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  width?: string;
  z?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && window.matchMedia("(min-width: 640px)").matches) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={cn("fixed inset-0 hidden items-center justify-center p-4 sm:flex", z)}>
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-200" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={label} className={cn(DIALOG_PANEL, width, "animate-in fade-in-0 zoom-in-95 duration-200")}>
        {children}
      </div>
    </div>
  );
}

/** A dialog's or a sheet's heading: the title, a line under it, and the close button on a computer. */
function PanelHead({ title, description, onClose }: { title: string; description?: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-2 sm:pt-5">
      <div className="min-w-0">
        <h2 className="text-[16px] font-semibold text-[#1a1a2e]">{title}</h2>
        {description ? <p className="mt-1 text-[13px] leading-5 text-[#6b7280]">{description}</p> : null}
      </div>
      {onClose ? (
        <button type="button" aria-label="Close" onClick={onClose} className={cn(iconButton, "-mr-1.5 -mt-1 hidden sm:inline-flex")}>
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

// ─── Revenue ──────────────────────────────────────────────────────────────────

/**
 * THE REVENUE CARD. One figure and its chart, the way a chosen tab and its
 * chart sit on Analytics: the label (with its note on a pointer or a press,
 * components/app/help-label), the figure, and the period picker every page
 * in /app shares at the right. While a period is read the figure stays and
 * goes soft, so the card never drops a number for a grey bar; the chart,
 * which has no number to keep, waits as its own shape (ShimmerChart), which
 * shows only after 200ms, so a quick answer never flashes one.
 */
function RevenueChart({ initialCurrency }: { initialCurrency: string }) {
  /* The date picker every page in /app shares. All time by default, as before. */
  const timeZone = useMemo(() => viewerTimeZone(), []);
  const today = todayIn(timeZone, Date.now());
  const [period, setPeriod] = useState<RangeValue>(() => resolveValue({ preset: "all_time" }, today, "all_time"));
  const periodKey = `${period.preset}:${period.start}:${period.end}`;
  const [data, setData] = useState<ChartPoint[]>([]);
  const [total, setTotal] = useState(0);
  const [totalGross, setTotalGross] = useState(0);
  const [totalRefunds, setTotalRefunds] = useState(0);
  const [currency, setCurrency] = useState(initialCurrency);
  /* Sales in another currency in the period: shown beside the chart, never added into it. */
  const [otherCurrencies, setOtherCurrencies] = useState<Array<{ currency: string; gross: number }>>([]);
  const [isHourly, setIsHourly] = useState(false); // true for today/yesterday (hourly buckets)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: RangeValue, silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      /* All time starts at the first sale, which only the server knows. */
      const b = boundsOf(p, timeZone, Date.now());
      const q =
        p.preset === "all_time"
          ? "timeframe=all_time"
          : `start=${encodeURIComponent(new Date(b.start).toISOString())}&end=${encodeURIComponent(new Date(b.end).toISOString())}&tz=${encodeURIComponent(timeZone)}`;
      const r = await fetch(`/api/stripe/revenue-chart?${q}`);
      const json = await r.json();
      if (json.error) throw new Error(json.error);
      setData(json.data || []);
      setTotal(json.total || 0);
      setTotalGross(json.totalGross || 0);
      setTotalRefunds(json.totalRefunds || 0);
      setIsHourly(json.isHourly || false);
      if (json.currency) setCurrency(json.currency.toLowerCase());
      setOtherCurrencies(Array.isArray(json.otherCurrencies) ? json.otherCurrencies : []);
    } catch (e: any) {
      if (!silent) setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [timeZone]);

  useEffect(() => {
    load(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodKey, load]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      load(period, true);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodKey, load]);

  // Clamp each bucket to >= 0 for a clean chart; preserve refundsAbs as-is.
  const chartData = data.map((d) => ({
    ...d,
    gross: Math.max(0, d.gross),
    refundsAbs: d.refundsAbs || 0,
    revenue: Math.max(0, d.revenue),
  }));
  const hasData = chartData.some((d) => d.gross > 0 || d.refundsAbs > 0);

  // Converts a zero-padded hour string "00" to "23" to a readable label
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
      <div className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-[12px] shadow-[0_10px_30px_-8px_rgba(17,24,39,0.18),0_2px_6px_rgba(17,24,39,0.06)]">
        <p className="text-[#6b7280]">{labelText}</p>
        {grossVal && (
          <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-[#1a1a2e]">
            {fmt(grossVal.value, currency)}
          </p>
        )}
        {refundVal && refundVal.value > 0 && (
          <p className="tabular-nums text-[#b42318]">
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
    <section aria-label="Revenue" className={cn(card, "min-w-0 overflow-hidden")}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 pt-3.5">
        <div className="min-w-0">
          <HelpLabel
            label="Revenue"
            description="What your completed sales took in over this period, before fees and refunds."
            className="text-[12px] font-medium text-[#4b5563]"
          />
          {/* The figure it had, soft, while the period is read: never a grey bar. */}
          <p
            data-revenue-figure=""
            className={cn(
              "mt-0.5 text-[22px] font-semibold tabular-nums tracking-tight text-[#1a1a2e] transition-[filter] duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
              loading ? "blur-[2px]" : "blur-0",
            )}
          >
            {fmt(Math.max(0, totalGross), currency)}
          </p>
        </div>

        {/* The period: the same picker as every page in /app, a thumb's 44px on a phone. */}
        <DateRangePicker value={period} onChange={setPeriod} today={today} align="end" className="max-md:h-11 max-md:rounded-xl max-md:px-3.5 max-md:text-[14px]" />
      </div>

      <div className="px-2 pb-1 pt-4 sm:px-3">
        {loading ? (
          <ShimmerChart height={192} />
        ) : error ? (
          <div className="flex h-48 items-center justify-center px-4 text-center">
            <p className="text-[13px] text-[#b42318]">{error}</p>
          </div>
        ) : !hasData && !isHourly ? (
          /* Daily mode, no sales in the period. */
          <div className="flex h-48 flex-col items-center justify-center px-4 text-center">
            <p className="text-[14px] font-medium text-[#1a1a2e]">No revenue in this period</p>
            <p className="mt-1 text-[13px] text-[#6b7280]">Pick a longer period, or come back after your next sale.</p>
          </div>
        ) : !isHourly && chartData.length <= 1 ? (
          /* Daily mode, a single day: a lone dot says nothing, so the day's figure and count instead. */
          <div className="flex h-48 flex-col items-center justify-center text-center">
            <p className="text-[28px] font-semibold tabular-nums tracking-tight text-[#1a1a2e]">
              {fmt(Math.max(0, totalGross), currency)}
            </p>
            <p className="mt-0.5 text-[13px] text-[#6b7280]">
              {chartData[0]?.count
                ? `${chartData[0].count} sale${chartData[0].count !== 1 ? "s" : ""}`
                : "No sales yet"}
            </p>
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
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.14} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="refundGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#f0f1f3"
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
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#e5e7eb" }} />
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
                animationDuration={1200}
                animationEasing="ease-in-out"
                animationBegin={200}
              />
              <Area
                type="monotone"
                dataKey="gross"
                stroke="#8b5cf6"
                strokeWidth={2}
                fill="url(#revGrad)"
                dot={false}
                activeDot={{ r: 4, fill: "#8b5cf6", strokeWidth: 0 }}
                name="Revenue"
                animationDuration={1200}
                animationEasing="ease-in-out"
                animationBegin={0}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* The key, always there so the card never changes height when an answer lands. */}
      <div className="flex h-10 items-center gap-4 border-t border-[#f0f1f3] px-4 text-[12px] text-[#6b7280]">
        <span className="flex items-center gap-1.5">
          <span className="h-[3px] w-3 shrink-0 rounded-full bg-[#8b5cf6]" />
          Revenue
        </span>
        {!loading && !error && totalRefunds > 0 ? (
          <span className="flex items-center gap-1.5">
            <span className="h-[3px] w-3 shrink-0 rounded-full bg-[#f43f5e]" />
            Refunds <span className="tabular-nums">−{fmt(totalRefunds, currency)}</span>
          </span>
        ) : null}
        {!loading && !error && otherCurrencies.length > 0 ? (
          <span className="ml-auto truncate tabular-nums text-[#9ca3af]" data-other-currencies="">
            Plus {otherCurrencies.map((o) => fmt(o.gross, o.currency)).join(", ")}
          </span>
        ) : null}
      </div>
    </section>
  );
}

// ─── Balance ──────────────────────────────────────────────────────────────────

/**
 * THE CASH OUT, AS ONE PIECE OF STATE. The bar's Cash out and the Details
 * panel's both press it, and the balance card shows what came of it, so it
 * lives above all three. The request, the toast and the eight seconds the
 * "on its way" line stays before the page refreshes and shows the payout in
 * the list are exactly what the old panel did.
 */
function useWithdraw(onSuccess: () => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successPayout, setSuccessPayout] = useState<{
    amount: number;
    currency: string;
  } | null>(null);
  const { toast } = useToast();

  const handleWithdraw = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/stripe/cashout", { method: "POST" });
      const json = await r.json();
      if (!r.ok || json.error)
        throw new Error(json.error || "Withdrawal failed");
      setSuccessPayout({
        amount: json.payout.amount,
        currency: json.payout.currency,
      });
      toast({
        title: "Withdrawal sent",
        description: `${fmt(json.payout.amount, json.payout.currency)} is on its way to your bank.`,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Auto-dismiss the success line after 8 seconds
  useEffect(() => {
    if (!successPayout) return;
    const timer = setTimeout(() => {
      setSuccessPayout(null);
      onSuccess();
    }, 8000);
    return () => clearTimeout(timer);
  }, [successPayout, onSuccess]);

  const dismiss = useCallback(() => {
    setSuccessPayout(null);
    onSuccess();
  }, [onSuccess]);

  return { loading, error, successPayout, handleWithdraw, dismiss, clearError: () => setError(null) };
}

type Withdraw = ReturnType<typeof useWithdraw>;

/** Money becoming available on a day, from Stripe's pending balance transactions. */
type Upcoming = { date: string; amount: number; currency: string };

/**
 * THE BALANCE CARD. Three figures on one row from 640px, and on a phone the
 * one that matters (what can be cashed out now) across the top at 26px with
 * the other two under it, the way Wallet leads with the balance. Every
 * figure is Stripe's, in the currency Stripe holds it in; "Arriving soon"
 * says the day the next of it becomes available, from Stripe's own pending
 * transactions, not a guessed "2 to 7 days". Under them one plain line on
 * what Cash out does, or why it cannot yet. Details opens the panel with the
 * days money arrives and the bank it goes to.
 */
function BalanceCard({
  available,
  pending,
  inTransit,
  negativeBalance,
  balanceReady,
  payoutsRead,
  currency,
  upcoming,
  settleDays,
  payoutsEnabled,
  withdraw,
  onDetails,
}: {
  available: number;
  pending: number;
  inTransit: number;
  negativeBalance: number;
  balanceReady: boolean;
  /** "On the way" is the payouts list's, read after the page lands. */
  payoutsRead: boolean;
  currency: string;
  upcoming: Upcoming[];
  settleDays: number | null;
  payoutsEnabled: boolean;
  withdraw: Withdraw;
  onDetails: () => void;
}) {
  /* Stripe's available balance already carries a refund or a dispute taken back; below zero is shown as it is. */
  const effectiveBalance = available;
  const isNegative = effectiveBalance < 0;
  const canCashOut = effectiveBalance > 0 && negativeBalance === 0;
  const next = upcoming[0];

  const helper = !payoutsEnabled
    ? "Finish setting up payments to cash out."
    : isNegative
      ? "Your balance is below zero after a refund or dispute. New sales cover it first, with nothing for you to do."
      : effectiveBalance <= 0
        ? next
          ? `${fmt(next.amount, next.currency)} becomes available on ${fmtDay(next.date)}.`
          : settleText(settleDays)
        : "Cash out sends your whole available balance to your bank.";

  return (
    <section aria-label="Balance" data-balance="" className={cn(card, "overflow-hidden")}>
      {withdraw.successPayout ? (
        <div role="status" className="flex flex-col gap-3 border-b border-[#eef0f2] bg-[#f6fbf7] px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#15803d]" />
            <p className="text-[13px] leading-5 text-[#1a1a2e]">
              <span className="font-semibold tabular-nums">{fmt(withdraw.successPayout.amount, withdraw.successPayout.currency)}</span> is on its way to your bank.
              <span className="text-[#4b5563]"> It usually arrives in 1 to 3 business days.</span>
            </p>
          </div>
          <button type="button" onClick={withdraw.dismiss} className={cn(secondaryDepth, "h-11 w-full rounded-xl px-4 text-[14px] sm:h-8 sm:w-auto sm:rounded-lg sm:px-3 sm:text-[13px]")}>
            View payouts
          </button>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 pl-4 pr-2.5 pt-2 sm:pt-2.5">
        <h2 className="text-[13px] font-semibold text-[#1a1a2e]">Balance</h2>
        <Press look={cn(secondaryDepth, "h-7 rounded-lg px-2.5 text-[12px]")} onClick={onDetails} aria-haspopup="dialog" data-balance-details="">
          Details
        </Press>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3">
        <Figure
          big
          className="col-span-2 border-b border-[#eef0f2] sm:col-span-1 sm:border-b-0"
          label="Available"
          value={isNegative ? `-${fmt(Math.abs(effectiveBalance), currency)}` : fmt(effectiveBalance, currency)}
          foot={isNegative ? "Owed after a refund or dispute" : canCashOut ? "Ready to cash out" : "Nothing ready yet"}
          loading={!balanceReady}
          critical={isNegative}
        />
        <Figure
          className="border-[#eef0f2] sm:border-l"
          label="Arriving soon"
          value={fmt(pending, currency)}
          foot={pending > 0 && next ? `Next on ${fmtDay(next.date)}` : pending > 0 ? "Settling" : "Nothing settling"}
          loading={!balanceReady}
        />
        <Figure
          className="border-l border-[#eef0f2]"
          label="On the way"
          value={fmt(inTransit, currency)}
          foot={inTransit > 0 ? "Due in 1 to 3 days" : "Nothing in transit"}
          loading={!payoutsRead}
        />
      </div>

      {withdraw.error ? (
        <div role="alert" className="flex items-start gap-2 border-t border-[#f5c9c3] bg-[#fef3f2] px-4 py-2.5">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#b42318]" />
          <p className="min-w-0 flex-1 text-[13px] text-[#8a1c0f]">{withdraw.error}</p>
          <button type="button" aria-label="Dismiss" onClick={withdraw.clearError} className="-my-1 -mr-1 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-[#8a1c0f]/70 hover:bg-[#fde8e7]">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-[#eef0f2] bg-[#fafafb] px-4 py-2.5">
        <p className={cn("min-w-0 text-[12px] leading-5", isNegative ? "text-[#8a1c0f]" : "text-[#6b7280]")}>{helper}</p>
        <a
          href={HOW_PAYOUTS_WORK}
          className="shrink-0 text-[12px] font-medium text-[#4b5563] underline-offset-2 hover:text-[#1a1a2e] hover:underline max-md:-my-3 max-md:inline-flex max-md:h-11 max-md:items-center"
        >
          How payouts work
        </a>
      </div>
    </section>
  );
}

/**
 * DETAILS: THE ROWS BEHIND THE FIGURES. A dialog on a computer, the shared
 * sheet on a phone: what is available, what is arriving and the day each
 * part of it becomes available (Stripe's pending transactions, read with
 * the balance), what is on the way to the bank, and the bank it goes to,
 * read from /api/stripe/payout-method the first time it opens.
 */
function BalanceDetails({
  open,
  onClose,
  available,
  pending,
  inTransit,
  currency,
  upcoming,
  upcomingLoading,
  settleDays,
  bank,
  bankLoading,
  onUpdateBank,
  payoutsEnabled,
  canCashOut,
  cashingOut,
  onCashOut,
}: {
  open: boolean;
  onClose: () => void;
  available: number;
  pending: number;
  inTransit: number;
  currency: string;
  upcoming: Upcoming[];
  upcomingLoading: boolean;
  settleDays: number | null;
  bank: { bankName: string | null; last4: string; currency: string } | null;
  bankLoading: boolean;
  onUpdateBank: () => void;
  payoutsEnabled: boolean;
  canCashOut: boolean;
  cashingOut: boolean;
  onCashOut: () => void;
}) {
  const body = (
    <div className="px-5 pb-2 pt-3">
      <div className="rounded-xl border border-[#eceef1] px-3 py-2">
        <Line label="Available to cash out" value={fmt(available, currency)} />
        <Line label="Arriving soon" value={fmt(pending, currency)} />
        {/* The day each part of it becomes available, from Stripe. */}
        {upcomingLoading ? (
          <ShimmerRows className="pb-1 pl-3" rows={3} rowHeight={20} cols={["45%", "22%"]} divided={false} inset={false} />
        ) : upcoming.length > 0 ? (
          <ul className="mb-1 ml-3 border-l border-[#eceef1] pl-3" data-upcoming="">
            {upcoming.map((item) => (
              <li key={item.date} className="flex items-baseline justify-between gap-3 py-0.5 text-[12px] text-[#6b7280]">
                <span className="min-w-0 truncate">Available {fmtDay(item.date)}</span>
                <span className="shrink-0 whitespace-nowrap tabular-nums">{fmt(item.amount, item.currency)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="my-1.5 border-t border-[#f0f1f3]" />
        <Line label="Total balance" value={fmt(available + pending, currency)} strong />
        {inTransit > 0 ? <Line label="On the way to your bank" value={fmt(inTransit, currency)} muted /> : null}
      </div>
      <p className="mt-3 text-[12px] leading-5 text-[#6b7280]">
        {settleDays && settleDays > 0
          ? `Each sale becomes available about ${settleDays} days after it is paid. That wait is set by our payment partner for your country and protects against refunds and disputes.`
          : "Each sale becomes available after a short settlement wait set by our payment partner for your country."}{" "}
        Once it is available you can cash it out, and it usually reaches your bank in 1 to 3 business days.
      </p>
      <div className="mt-3 border-t border-[#f0f1f3] pt-3">
        {bankLoading ? (
          <Shimmer className="flex h-5 items-center">
            <ShimmerBlock className="h-3 w-56 rounded-full" />
          </Shimmer>
        ) : (
          <p className="text-[13px] leading-5 text-[#4b5563]">
            {bank ? (
              <>
                Cash outs go to{" "}
                <span className="font-medium text-[#1a1a2e]">
                  {bank.bankName || "Bank account"} ••••{bank.last4}
                </span>
                .{" "}
              </>
            ) : null}
            <button
              type="button"
              onClick={onUpdateBank}
              className="cursor-pointer font-medium text-[#1a1a2e] underline underline-offset-2"
            >
              {bank ? "Update bank" : "Add a bank account"}
            </button>
          </p>
        )}
      </div>
    </div>
  );
  const footer = (
    <div className="flex flex-col-reverse gap-2 border-t border-[#eef0f2] px-5 py-3 sm:flex-row sm:justify-end">
      <button type="button" className={SHEET_SECONDARY} onClick={onClose}>
        Close
      </button>
      {payoutsEnabled ? (
        <button type="button" className={SHEET_CASH_OUT} onClick={onCashOut} disabled={cashingOut} aria-disabled={!canCashOut || undefined}>
          {cashingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {cashingOut ? "Cashing out" : canCashOut ? `Cash out ${fmt(available, currency)}` : "Cash out"}
        </button>
      ) : null}
    </div>
  );
  return (
    <>
      <DesktopDialog open={open} onClose={onClose} label="Balance details">
        <PanelHead title="Balance details" onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
        {footer}
      </DesktopDialog>
      {/* A phone: the shared sheet. */}
      <BottomSheet isOpen={open} onClose={onClose} label="Balance details">
        <PanelHead title="Balance details" />
        {body}
        {footer}
      </BottomSheet>
    </>
  );
}

// ─── Disputes ─────────────────────────────────────────────────────────────────

type CreatorDispute = {
  id: string;
  amountMinor: number;
  currency: string;
  productTitle: string | null;
  reason: string;
  stage: "inquiry" | "respond" | "review" | "won" | "lost" | "closed";
  label: string;
  line: string;
  tone: "neutral" | "attention" | "critical" | "good";
  openedAt: string | null;
  evidenceDueBy: string | null;
  closedAt: string | null;
  noteSent: boolean;
  canAddNote: boolean;
};

const DISPUTE_TONE: Record<CreatorDispute["tone"], Tone> = { neutral: "neutral", attention: "attention", critical: "critical", good: "success" };

/**
 * DISPUTES, IN STORELIB'S WORDS. Drawn only when there is a case: each one
 * with the sale, Stripe's reason in plain words, where it is, the day
 * evidence is due while it is open, and how it ended once it is closed.
 * Storelib answers the bank (the sale was charged on Storelib's own
 * account), so the creator's part is Add evidence: what proves the sale,
 * kept for Storelib to send. Read from /api/payments/disputes; nothing here
 * names a Stripe id. `#disputes` is where the dispute emails link to.
 */
function DisputesCard() {
  const [rows, setRows] = useState<CreatorDispute[] | null>(null);
  const [noteFor, setNoteFor] = useState<CreatorDispute | null>(null);
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/payments/disputes", { cache: "no-store" });
      const json = await r.json();
      setRows(Array.isArray(json.disputes) ? json.disputes : []);
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* Landing on #disputes from an email: scroll to it once it is drawn. */
  useEffect(() => {
    if (!rows?.length || window.location.hash !== "#disputes") return;
    document.getElementById("disputes")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [rows]);

  if (!rows || rows.length === 0) return null;
  const open = rows.filter((r) => !r.closedAt);
  const past = rows.filter((r) => r.closedAt);
  const shown = showPast ? rows : open.length > 0 ? open : past.slice(0, 3);

  return (
    <section id="disputes" aria-label="Disputes" data-disputes="" className={cn(card, "scroll-mt-24 overflow-hidden animate-in fade-in-0 duration-300")}>
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
        <h2 className="text-[13px] font-semibold text-[#1a1a2e]">Disputes</h2>
        <span className="text-[12px] text-[#6b7280]">{open.length > 0 ? `${open.length} open` : "None open"}</span>
      </div>
      <ul>
        {shown.map((d) => {
          const due = d.evidenceDueBy ? new Date(d.evidenceDueBy).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
          return (
            <li key={d.id} data-dispute={d.stage} className="flex flex-col gap-2.5 border-t border-[#f1f2f4] px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate text-[14px] font-medium text-[#1a1a2e]">{d.productTitle || "A sale"}</span>
                  <StatusBadge tone={DISPUTE_TONE[d.tone]}>{d.label}</StatusBadge>
                </div>
                <p className="mt-1 text-[12.5px] leading-[18px] text-[#4b5563]">{d.reason}</p>
                <p className="mt-0.5 text-[12px] leading-[17px] text-[#6b7280]">
                  {d.line}
                  {due ? <span className="font-medium text-[#1a1a2e]"> Evidence by {due}.</span> : null}
                </p>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end sm:gap-1.5">
                <span className="text-[14px] font-semibold tabular-nums text-[#1a1a2e]">{fmt(d.amountMinor, d.currency)}</span>
                {d.canAddNote ? (
                  <button
                    type="button"
                    onClick={() => setNoteFor(d)}
                    className={cn(secondaryDepth, "h-11 rounded-xl px-4 text-[14px] sm:h-8 sm:rounded-lg sm:px-3 sm:text-[13px]")}
                  >
                    {d.noteSent ? "Update evidence" : "Add evidence"}
                  </button>
                ) : d.noteSent ? (
                  <span className="inline-flex items-center gap-1 text-[12px] text-[#067647]">
                    <Check className="h-3 w-3" strokeWidth={3} /> Evidence sent
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {past.length > 0 && (open.length > 0 || past.length > 3) ? (
        <button
          type="button"
          onClick={() => setShowPast((v) => !v)}
          className="flex h-11 w-full cursor-pointer items-center justify-center border-t border-[#f1f2f4] bg-[#fafafb] text-[12px] font-medium text-[#4b5563] transition-colors hover:text-[#1a1a2e] md:h-10"
        >
          {showPast ? "Show open only" : `Show ${past.length} closed`}
        </button>
      ) : null}
      <EvidencePanel dispute={noteFor} onClose={() => setNoteFor(null)} onSaved={() => { setNoteFor(null); void load(); }} />
    </section>
  );
}

/** Add evidence: a few plain sentences about the sale, kept for Storelib to send to the bank. A dialog on a computer, the shared sheet on a phone. */
function EvidencePanel({ dispute, onClose, onSaved }: { dispute: CreatorDispute | null; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const open = !!dispute;

  useEffect(() => {
    if (open) {
      setText("");
      setError(null);
    }
  }, [open, dispute?.id]);

  const save = async () => {
    if (!dispute || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/payments/disputes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: dispute.id, note: text }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof json.error === "string" ? json.error : "We couldn't save that just now.");
      toast({ title: "Evidence sent", description: "Storelib includes it in the answer to the bank." });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't save that just now.");
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <div className="px-5 pb-2 pt-3">
      <p className="text-[13px] leading-5 text-[#4b5563]">
        Describe what shows the sale was real: what the buyer bought, that the files were delivered or downloaded, and any messages with them. Plain words are best.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 4000))}
        rows={6}
        placeholder="The buyer bought my preset pack on Oct 3, got the download email and downloaded the files twice the same day."
        className="mt-3 w-full resize-y rounded-[10px] border border-[#e3e5e8] bg-white px-3 py-2.5 text-[16px] leading-6 text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:text-[14px] sm:leading-5"
      />
      <div className="mt-1 flex items-center justify-between text-[11px] text-[#9ca3af]">
        <span>{error ? <span className="text-[#c4290c]">{error}</span> : "Only Storelib sees this."}</span>
        <span className="tabular-nums">{text.length} / 4000</span>
      </div>
    </div>
  );
  const footer = (
    <div className="flex flex-col-reverse gap-2 border-t border-[#eef0f2] px-5 py-3 sm:flex-row sm:justify-end">
      <button type="button" className={SHEET_SECONDARY} onClick={onClose}>Cancel</button>
      <button type="button" className={SHEET_PRIMARY} onClick={() => void save()} disabled={busy || text.trim().length < 10}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {busy ? "Sending" : "Send evidence"}
      </button>
    </div>
  );
  return (
    <>
      <DesktopDialog open={open} onClose={onClose} label="Add evidence">
        <PanelHead title="Add evidence" description={dispute ? `${dispute.productTitle || "A sale"}, ${fmt(dispute.amountMinor, dispute.currency)}` : undefined} onClose={onClose} />
        {body}
        {footer}
      </DesktopDialog>
      <BottomSheet isOpen={open} onClose={onClose} label="Add evidence">
        <PanelHead title="Add evidence" description={dispute ? `${dispute.productTitle || "A sale"}, ${fmt(dispute.amountMinor, dispute.currency)}` : undefined} />
        {body}
        {footer}
      </BottomSheet>
    </>
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
    return <p className="text-[13px] text-[#6b7280]">A free order has no payout.</p>;
  /* The timeline's own shape, three steps of it, while it is read. */
  if (loading) return <ShimmerRows rows={3} rowHeight={45} cols={["40%", "20%"]} divided={false} lead inset={false} />;
  if (error) return <p className="text-[13px] text-[#b42318]">{error}</p>;
  if (!timeline.length)
    return <p className="text-[13px] text-[#6b7280]">Nothing to show yet.</p>;

  /*
    Each step a dot on a thin line: done in ink with a tick, waiting on
    Stripe with the attention ring, still to come as an empty ring. The same
    three states the Orders timeline draws, in its colours rather than violet.
  */
  return (
    <ol className="space-y-0.5">
      {timeline.map((item, i) => {
        const isLast = i === timeline.length - 1;
        return (
          <li key={item.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                  item.status === "completed"
                    ? "bg-[#1a1a2e] text-white"
                    : item.status === "pending"
                      ? "border-[1.5px] border-[#d9a400] bg-[#fffaeb]"
                      : "border-[1.5px] border-[#d1d5db] bg-white",
                )}
              >
                {item.status === "completed" ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
              </span>
              {!isLast && (
                <span
                  className={cn(
                    "mt-0.5 min-h-[16px] w-px flex-1",
                    item.status === "completed" ? "bg-[#c9ccd3]" : "bg-[#e5e7eb]",
                  )}
                />
              )}
            </div>
            <div className="min-w-0 pb-3">
              <p
                className={cn(
                  "text-[13px] font-medium leading-5",
                  item.status === "upcoming" ? "text-[#9ca3af]" : "text-[#1a1a2e]",
                )}
              >
                {item.label}
              </p>
              <p className="mt-0.5 text-[12px] leading-snug text-[#6b7280]">
                {item.description}
              </p>
              {item.timestamp && (
                <p className="mt-0.5 text-[12px] tabular-nums text-[#9ca3af]">
                  {fmtDate(item.timestamp)}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ─── An order, opened from the list ────────────────────────────────────────────

/** A titled part of an order's panel, with a hairline above every part but the first. */
function Part({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-[#f0f1f3] pt-3.5 first:border-t-0 first:pt-0">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-[#1a1a2e]">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-baseline gap-3 py-1 text-[13px] sm:grid-cols-[110px_minmax(0,1fr)]">
      <dt className="text-[#6b7280]">{label}</dt>
      <dd className="min-w-0 break-words text-[#303036]">{children}</dd>
    </div>
  );
}

/**
 * ONE SALE, IN THE ORDERS PAGE'S TERMS. What was bought and for how much,
 * then the payment (what was paid, the fee, what the creator keeps, how it
 * was paid, a refund if there was one), the buyer, the details, and when the
 * money reaches the balance. The actions are the order page's: Invoice,
 * Resend receipt, Change email, and Refund as the one dark button. A
 * dialog from 640px, the shared sheet with the actions pinned under it on a
 * phone.
 *
 * Change email used to be a form whose Save closed it and changed nothing.
 * It sends the address to the same route the Orders page does
 * (app/api/app/orders/[id]/email), which checks the order is this creator's,
 * moves every row of it to the new address and emails the receipt there.
 */
function OrderDetailsModal({
  order: orderProp,
  currency,
  refundOnOpen = false,
  onClose,
  onRefundSuccess,
}: {
  order: OrderPayment | null;
  currency: string;
  /** Opened from a row's Refund: the refund's own panel comes up over it. */
  refundOnOpen?: boolean;
  onClose: () => void;
  onRefundSuccess?: (refundedAmountCents: number) => void;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundDone, setRefundDone] = useState(false);
  const [showRefundConfirm, setShowRefundConfirm] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  /* The store's own refund reasons (Settings › Returns and refunds), kept on the order. */
  const REFUND_REASONS = useReasons("refund");
  const [refundError, setRefundError] = useState<string | null>(null);
  // Change email + Resend
  const [showEditEmail, setShowEditEmail] = useState(false);
  const [editEmail, setEditEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  /* The address an order was moved to in this visit, shown at once. */
  const [emailOverrides, setEmailOverrides] = useState<Record<string, string>>({});
  const [resendLoading, setResendLoading] = useState(false);
  const [receiptResendCounts, setReceiptResendCounts] = useState<Record<string, number>>({});
  // A short notice at the top of the screen, the Orders page's
  const [notification, setNotification] = useState<{ message: string; visible: boolean; type: "success" | "error" }>({ message: "", visible: false, type: "success" });
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotification = (message: string, type: "success" | "error" = "success") => {
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    setNotification({ message, visible: true, type });
    notificationTimer.current = setTimeout(() => setNotification(n => ({ ...n, visible: false })), 4000);
  };
  /**
   * THE ORDER IT WAS SHOWING, KEPT WHILE IT LEAVES. The parent clears the
   * order the moment it is closed, and this returned null on that render, so
   * the phone sheet vanished instead of sliding down.
   */
  const lastOrderRef = useRef(orderProp);
  if (orderProp) lastOrderRef.current = orderProp;
  const order = orderProp ?? lastOrderRef.current;
  const isOpen = !!orderProp;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Open (or re-open while closing): always re-trigger the open animation
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
    setShowEditEmail(false);
    setEmailError(null);
  }, [order?.id]);

  /* A row's Refund: the refund's panel over the order's, once the order is there. */
  useEffect(() => {
    if (!orderProp || !refundOnOpen || orderProp.status !== "completed") return;
    setRefundReason("requested_by_customer");
    setRefundError(null);
    setShowRefundConfirm(true);
  }, [orderProp, refundOnOpen]);

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(() => onClose(), 400);
  };

  /* Escape closes the order on a computer, unless one of its own panels is open over it. */
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || showRefundConfirm || showEditEmail) return;
      if (!window.matchMedia("(min-width: 640px)").matches) return;
      handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, showRefundConfirm, showEditEmail]);

  const closeRefundSheet = () => {
    if (refundLoading) return;
    setShowRefundConfirm(false); // useEffect handles the animation
  };

  const openRefund = () => {
    setRefundReason("requested_by_customer");
    setRefundError(null);
    setShowRefundConfirm(true);
  };

  const handleResend = async () => {
    if (!order) return;
    const currentCount = receiptResendCounts[order.id] || 0;
    if (currentCount >= 5) {
      showNotification("Resend limit reached", "error");
      return;
    }
    if (!order.receipt_token) {
      showNotification("This order has no receipt to send", "error");
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
        showNotification(data.error || "Could not resend. Try again.", "error");
      }
    } catch {
      showNotification("Could not resend. Try again.", "error");
    } finally {
      setResendLoading(false);
    }
  };

  const openEditEmail = () => {
    if (!order) return;
    const email = emailOverrides[order.id] || order.buyer?.email || order.buyer_email || order.customer_email || "";
    setEditEmail(email);
    setEmailError(null);
    setShowEditEmail(true);
  };

  const closeEditEmail = () => {
    if (emailSaving) return;
    setShowEditEmail(false);
  };

  const handleSaveEmail = async () => {
    if (!order) return;
    const email = editEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Enter a full address, like name@example.com");
      return;
    }
    setEmailSaving(true);
    setEmailError(null);
    try {
      const r = await fetch(`/api/app/orders/${encodeURIComponent(order.id)}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || "The email was not changed. Try again.");
      const saved = typeof data?.email === "string" ? data.email : email;
      setEmailOverrides((prev) => ({ ...prev, [order.id]: saved }));
      setShowEditEmail(false);
      showNotification(data?.sent > 0 ? "Email changed, receipt sent" : "Email changed");
    } catch (e: any) {
      setEmailError(e?.message || "The email was not changed. Try again.");
    } finally {
      setEmailSaving(false);
    }
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
        body: JSON.stringify({ orderId: order.id, reason: refundReason }),
      });
      const json = await r.json();
      if (!r.ok || json.error) throw new Error(json.error || "Refund failed");
      setShowRefundConfirm(false);
      if (json.pending) {
        showNotification("Refund is processing");
        return;
      }
      setRefundDone(true);
      // Pass the refunded amount so the parent can instantly update the balance UI
      onRefundSuccess?.(order.amount_cents);
      showNotification("Refund issued");
    } catch (e: any) {
      setRefundError(e.message);
      showNotification("Could not refund", "error");
    } finally {
      setRefundLoading(false);
    }
  };

  if (!order || !mounted) return null;

  const net = order.amount_cents - (order.fee_cents || 0);
  const buyerName = customerNameOf(order);
  const buyerEmail =
    emailOverrides[order.id] || order.buyer?.email || order.buyer_email || order.customer_email || null;
  const coverImage = order.product?.thumbnail_url;
  const productTitle = order.product?.title || "Unknown product";
  const productType = order.product?.type || "Digital product";
  const shortId = order.id.slice(0, 8);
  const status = refundDone ? "refunded" : order.status;
  const canRefund = order.status === "completed" && !refundDone;
  const device = [order.buyer_device_type, order.buyer_os, order.buyer_browser].filter(Boolean).join(", ");
  const method =
    order.payment_method === "card" && order.card_brand
      ? `${order.card_brand.charAt(0).toUpperCase()}${order.card_brand.slice(1)}${order.card_last4 ? ` •••• ${order.card_last4}` : ""}`
      : order.payment_method === "paypal"
        ? "PayPal"
        : order.payment_method === "free"
          ? "Free"
          : order.payment_method
            ? order.payment_method.charAt(0).toUpperCase() + order.payment_method.slice(1)
            : "Card";

  const content = (phone: boolean) => (
    <div className="space-y-3.5">
      {/* What was bought */}
      <div className="flex items-center gap-3">
        <Thumb src={coverImage} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{productTitle}</p>
          <p className="truncate text-[12px] capitalize text-[#6b7280]">{productType}</p>
        </div>
        <span className="shrink-0 text-[14px] font-semibold tabular-nums text-[#1a1a2e]">{fmt(order.amount_cents, currency)}</span>
      </div>

      {order.status === "disputed" ? (
        <Notice
          tone="critical"
          title="The buyer disputed this payment"
          body={
            <>
              Your share of this {fmt(order.amount_cents, currency)} sale is held while the buyer&apos;s bank decides, which usually takes 60 to 75 days. Storelib answers the bank for you; add your evidence under Disputes on Payouts.
            </>
          }
        />
      ) : null}

      {refundDone ? (
        <Notice tone="neutral" title="Refund issued" body="The buyer gets the money back on their original payment method." />
      ) : null}

      <div className="space-y-3.5">
        <Part title="Payment">
          <div className="rounded-xl border border-[#eceef1] px-3 py-1.5">
            <Line label="Paid" value={fmt(order.amount_cents, currency)} />
            <Line label="Fee" value={`−${fmt(order.fee_cents || 0, currency)}`} muted />
            <Line label="You receive" value={fmt(net, currency)} strong />
            {order.status === "refunded" && order.refund_amount_cents ? (
              <Line label="Refunded" value={`−${fmt(order.refund_amount_cents, currency)}`} />
            ) : null}
          </div>
          <dl className="mt-1.5">
            <Field label="Method">{method}</Field>
            {order.status === "refunded" && order.refunded_at ? <Field label="Refunded">{fmtFullDate(order.refunded_at)}</Field> : null}
            {order.status === "refunded" && order.refund_reason ? <Field label="Reason">{order.refund_reason}</Field> : null}
          </dl>
        </Part>

        <Part
          title="Customer"
          aside={
            <button type="button" onClick={openEditEmail} className="-mr-1 cursor-pointer rounded-md px-1 text-[12px] font-medium text-[#4b5563] underline-offset-2 hover:text-[#1a1a2e] hover:underline max-sm:-my-3 max-sm:h-11">
              Change email
            </button>
          }
        >
          <dl>
            <Field label="Name">{buyerName || <span className="text-[#9ca3af]">Not given</span>}</Field>
            <Field label="Email">{buyerEmail ? <span className="break-all">{buyerEmail}</span> : <span className="text-[#9ca3af]">No email</span>}</Field>
            {order.buyer_country ? <Field label="Country">{order.buyer_country}</Field> : null}
            {device ? <Field label="Device">{device}</Field> : null}
          </dl>
        </Part>

        <Part title="Details">
          <dl>
            <Field label="Placed">{fmtFullDate(order.created_at)}</Field>
            <Field label="Order">
              <span className="inline-flex items-center gap-1.5">
                <code className="rounded bg-[#f3f4f6] px-1.5 py-0.5 font-mono text-[12px] text-[#303036]">#{shortId}</code>
                <button
                  type="button"
                  onClick={handleCopyId}
                  aria-label="Copy order ID"
                  className="-my-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[#9ca3af] hover:bg-[#f1f2f4] hover:text-[#4b5563] max-sm:-my-2.5 max-sm:h-11 max-sm:w-11"
                >
                  {copiedId ? <Check className="h-3.5 w-3.5 text-[#15803d]" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </span>
            </Field>
          </dl>
        </Part>

        <Part title="Payout">
          {order.amount_cents === 0 ? (
            <p className="text-[13px] text-[#6b7280]">A free order has no payout.</p>
          ) : phone || showTimeline ? (
            <OrderTimeline orderId={order.id} amountCents={order.amount_cents} />
          ) : (
            <button
              type="button"
              onClick={() => setShowTimeline(true)}
              className={cn(secondaryDepth, "h-8 rounded-lg px-3 text-[13px]")}
            >
              <Clock className="h-3.5 w-3.5" /> Show when it reaches your balance
            </button>
          )}
        </Part>
      </div>
    </div>
  );

  /* The four actions, in the order a creator reaches for them. */
  const invoice = order.stripe_payment_intent_id ? (
    <a
      href={`/api/stripe/invoice?orderId=${order.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className={SHEET_SECONDARY}
    >
      <FileText className="h-3.5 w-3.5" />
      Invoice
    </a>
  ) : (
    <button type="button" disabled className={SHEET_SECONDARY} title="No invoice for this order">
      <FileText className="h-3.5 w-3.5" />
      Invoice
    </button>
  );
  const resend = (
    <button type="button" onClick={handleResend} disabled={resendLoading} className={SHEET_SECONDARY}>
      {resendLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
      {resendLoading ? "Sending" : `Resend receipt${receiptResendCounts[order.id] ? ` (${receiptResendCounts[order.id]}/5)` : ""}`}
    </button>
  );
  const changeEmail = (
    <button type="button" onClick={openEditEmail} className={SHEET_SECONDARY}>
      <Mail className="h-3.5 w-3.5" />
      Change email
    </button>
  );
  const refund = canRefund ? (
    <button type="button" onClick={openRefund} className={SHEET_PRIMARY}>
      <RotateCcw className="h-3.5 w-3.5" />
      Refund
    </button>
  ) : null;

  const refundBody = (
    <div className="grid gap-3 px-5 py-4">
      <div className="flex items-center gap-3 rounded-xl border border-[#eceef1] p-3">
        <Thumb src={order.product?.thumbnail_url} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-[#1a1a2e]">{order.product?.title || "Product"}</p>
          <p className="truncate text-[12px] text-[#6b7280]">{order.buyer_email || order.customer_email || ""}</p>
        </div>
        <p className="shrink-0 text-[13px] font-semibold tabular-nums text-[#1a1a2e]">{fmt(order.amount_cents, currency)}</p>
      </div>
      <label className="grid gap-1.5 text-[12px] font-medium text-[#4b5563]">
        Reason
        <select value={refundReason} onChange={(e) => setRefundReason(e.target.value)} className={FIELD}>
          {REFUND_REASONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      {refundError ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-[#fef3f2] px-3 py-2 text-[13px] text-[#8a1c0f]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {refundError}
        </p>
      ) : null}
    </div>
  );
  const refundFooter = (
    <div className="flex flex-col-reverse gap-2 border-t border-[#eef0f2] px-5 py-3 sm:flex-row sm:justify-end">
      <button type="button" onClick={closeRefundSheet} disabled={refundLoading} className={SHEET_SECONDARY}>
        Cancel
      </button>
      <button type="button" onClick={handleRefundConfirm} disabled={refundLoading || !refundReason} className={SHEET_PRIMARY}>
        {refundLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {refundLoading ? "Refunding" : `Refund ${fmt(order.amount_cents, currency)}`}
      </button>
    </div>
  );
  const refundDescription = "The money goes back to the buyer's original payment method, and they get an email about it.";

  const trimmedEmail = editEmail.trim();
  const currentEmail = (buyerEmail || "").trim().toLowerCase();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail) && trimmedEmail.toLowerCase() !== currentEmail;
  const emailBody = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (emailValid) handleSaveEmail();
      }}
    >
      <div className="px-5 py-4">
        <input
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-label="New email address"
          value={editEmail}
          onChange={(e) => setEditEmail(e.target.value)}
          placeholder="name@example.com"
          className={FIELD}
        />
        {emailError ? <p role="alert" className="mt-1.5 text-[12px] text-[#b42318]">{emailError}</p> : null}
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-[#eef0f2] px-5 py-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={closeEditEmail} disabled={emailSaving} className={SHEET_SECONDARY}>
          Cancel
        </button>
        <button type="submit" disabled={!emailValid || emailSaving} className={SHEET_PRIMARY}>
          {emailSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {emailSaving ? "Saving" : "Save and send"}
        </button>
      </div>
    </form>
  );
  const emailDescription = `Order #${shortId} moves to the new address, and the receipt with the download link is sent there.`;

  return createPortal(
    <>
      {/* ── A computer: a dialog ── */}
      {isVisible && (
      <div className="fixed inset-0 z-50 hidden items-center justify-center p-4 sm:flex">
        <div
          className={cn(
            "absolute inset-0 bg-black/40 transition-opacity",
            isAnimating ? "opacity-100" : "opacity-0",
          )}
          style={{ transitionDuration: "400ms" }}
          onClick={handleClose}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Order #${shortId}`}
          className={cn(
            DIALOG_PANEL,
            "max-w-[580px] transition-[opacity,scale]",
            isAnimating ? "opacity-100 scale-100" : "opacity-0 scale-[0.97]",
          )}
          style={{
            transitionDuration: "400ms",
            transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)",
          }}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#eef0f2] px-5 pb-3 pt-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h2 className="text-[16px] font-semibold text-[#1a1a2e]">Order #{shortId}</h2>
                <SaleBadge status={status} />
              </div>
              <p className="mt-0.5 truncate text-[13px] text-[#6b7280]">
                {fmtDate(order.created_at)}
                {buyerName ? ` · ${buyerName}` : buyerEmail ? ` · ${buyerEmail}` : ""}
              </p>
            </div>
            <button type="button" aria-label="Close" onClick={handleClose} className={cn(iconButton, "-mr-1.5")}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {content(false)}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#eef0f2] px-5 py-3">
            {invoice}
            {resend}
            {changeEmail}
            {refund}
          </div>
        </div>
      </div>
      )}

      {/* ── A phone: the shared sheet ──
          Change email and Refund open over it rather than closing it first:
          closing cleared the order, and the refund sheet that was meant to
          follow 450ms later had no order to show. */}
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        label={`Order #${shortId}`}
        fill
        maxHeight="72vh"
        header={
          <div className="flex items-start justify-between gap-3 border-b border-[#eef0f2] px-4 pb-3 pt-1">
            <div className="min-w-0">
              <h3 className="text-[16px] font-semibold text-[#1a1a2e]">Order #{shortId}</h3>
              <p className="mt-0.5 truncate text-[12px] text-[#6b7280]">{fmtDate(order.created_at)}</p>
            </div>
            <SaleBadge status={status} />
          </div>
        }
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 [-webkit-overflow-scrolling:touch]">
          {content(true)}
        </div>
        {/* The actions, pinned under the order: two to a row, each 44px. */}
        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-[#eef0f2] bg-white px-4 pb-2 pt-3">
          {invoice}
          {resend}
          {changeEmail}
          {refund}
        </div>
      </BottomSheet>

      {/* ── Refund: a dialog over the order on a computer ── */}
      <DesktopDialog open={showRefundConfirm} onClose={closeRefundSheet} label="Refund this sale" z="z-[60]">
        <PanelHead title="Refund this sale" description={refundDescription} onClose={closeRefundSheet} />
        {refundBody}
        {refundFooter}
      </DesktopDialog>

      {/* A phone: the shared sheet, over the order's own. */}
      <BottomSheet isOpen={showRefundConfirm} onClose={closeRefundSheet} label="Refund this sale" dismissible={!refundLoading}>
        <PanelHead title="Refund this sale" description={refundDescription} />
        {refundBody}
        {refundFooter}
      </BottomSheet>

      {/* ── Change email: a dialog on a computer ── */}
      {showEditEmail && order && (
        <div data-app-sheet="open" className="fixed inset-0 z-[210] hidden items-center justify-center p-4 sm:flex">
          <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-200" onClick={closeEditEmail} />
          <div role="dialog" aria-modal="true" aria-label="Change customer email" className={cn(DIALOG_PANEL, "max-w-[440px] animate-in fade-in-0 zoom-in-95 duration-200")}>
            <PanelHead title="Change customer email" description={emailDescription} onClose={closeEditEmail} />
            {emailBody}
          </div>
        </div>
      )}

      {/* A phone: the shared sheet, on the keyboard. */}
      <BottomSheet isOpen={showEditEmail} onClose={closeEditEmail} label="Change customer email" aboveKeyboard dismissible={!emailSaving}>
        <PanelHead title="Change customer email" description={emailDescription} />
        {emailBody}
      </BottomSheet>

      {/* The notice at the top of the screen, the Orders page's own */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed left-1/2 top-[calc(68px+env(safe-area-inset-top,0px)+12px)] z-[220] -translate-x-1/2 md:top-[calc(58px+env(safe-area-inset-top,0px)+12px)]"
      >
        {notification.visible ? (
          <div
            className={cn(
              "flex max-w-[calc(100vw-2rem)] items-center gap-2 truncate rounded-xl px-4 py-2.5 text-[13px] font-medium text-white shadow-lg animate-in fade-in-0 slide-in-from-top-2 duration-200",
              notification.type === "error" ? "bg-[#b42318]" : "bg-[#1a1a2e]",
            )}
          >
            {notification.type === "error" ? <AlertCircle className="h-4 w-4 shrink-0 text-white/80" /> : <Check className="h-4 w-4 shrink-0 text-[#86efac]" />}
            <span className="truncate">{notification.message}</span>
          </div>
        ) : null}
      </div>
    </>,
    document.body,
  );
}

// ─── CSV Export helpers ───────────────────────────────────────────────────────

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
  /* Each sale in the currency it was charged in, with that currency's decimals, and the currency in its own column. */
  const plain = (minor: number, c: string) => (minor / 10 ** decimalsOf(c)).toFixed(decimalsOf(c));
  const rows: string[][] = [
    ["Date", "Order ID", "Product", "Customer Email", "Amount", "Currency", "Status", "Refunded Amount"],
    ...orders.map((o) => {
      const c = (o.currency || currency).toUpperCase();
      return [
        new Date(o.created_at).toLocaleDateString("en-US"),
        o.id,
        o.product?.title || "",
        o.buyer_email || o.customer_email || "",
        plain(o.amount_cents, c),
        c,
        o.status,
        o.refund_amount_cents ? plain(o.refund_amount_cents, c) : "",
      ];
    }),
  ];
  downloadCsv(`earnings-${new Date().toISOString().split("T")[0]}.csv`, rows);
}

/** The payouts file. False when there was nothing to put in it. */
async function exportPayoutsCsv(): Promise<boolean> {
  const r = await fetch("/api/stripe/payouts");
  const json = await r.json();
  if (!json.payouts?.length) return false;
  const rows: string[][] = [
    ["Date", "Amount", "Currency", "Status", "Arrival Date", "Destination"],
    ...json.payouts.map((p: any) => [
      new Date(p.created * 1000).toLocaleDateString("en-US"),
      (p.amount / 10 ** decimalsOf(p.currency || "usd")).toFixed(decimalsOf(p.currency || "usd")),
      p.currency.toUpperCase(),
      p.status,
      p.arrival_date
        ? new Date(p.arrival_date * 1000).toLocaleDateString("en-US")
        : "",
      p.destination || "",
    ]),
  ];
  downloadCsv(`payouts-${new Date().toISOString().split("T")[0]}.csv`, rows);
  return true;
}

// ─── Tax Documents Section ────────────────────────────────────────────────────

function TaxDocumentsSection({
  taxData,
  currency,
}: {
  taxData: {
    currentYear: { year: number; grossCents: number; transactionCount: number; isEligible: boolean };
    previousYear: { year: number; grossCents: number; transactionCount: number; isEligible: boolean };
    stripeExpressDashboardUrl: string | null;
  } | null;
  currency: string;
}) {
  const [downloadingYear, setDownloadingYear] = useState<number | null>(null);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [showSummary, setShowSummary] = useState(false);

  if (!taxData) return null;

  const years = [taxData.previousYear, taxData.currentYear].filter(
    (y) => y.grossCents > 0 || y.transactionCount > 0,
  );

  // Don't show section if seller has never earned anything
  if (years.length === 0) return null;

  const handleDownloadDraft = async (year: number) => {
    setDownloadingYear(year);
    try {
      const r = await fetch(`/api/stripe/tax-summary?year=${year}`);
      if (!r.ok) throw new Error("Failed to fetch");
      const data = await r.json();
      setSummaryData(data);
      setShowSummary(true);
    } catch {
      // silent
    } finally {
      setDownloadingYear(null);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const fmtUsd = (cents: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(cents / 100);

  return (
    <>
      <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#f3f4f6] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#f5f3ff] flex items-center justify-center">
              <FileText className="h-4 w-4 text-[#8b5cf6]" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-[#1a1a2e]">Tax Documents</h3>
              <p className="text-[11px] text-[#9ca3af]">1099-K forms and earnings summaries</p>
            </div>
          </div>
        </div>

        <div className="divide-y divide-[#f3f4f6]">
          {years.map((yearData) => {
            const threshold = 2000000; // $20,000 in cents
            const txThreshold = 200;
            const progressPct = Math.min(100, Math.round((yearData.grossCents / threshold) * 100));
            const txProgressPct = Math.min(100, Math.round((yearData.transactionCount / txThreshold) * 100));
            const isCurrentYear = yearData.year === new Date().getFullYear();

            return (
              <div key={yearData.year} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-[#1a1a2e]">
                        {yearData.year} Tax Year
                      </span>
                      {yearData.isEligible ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#dcfce7] text-[#16a34a]">
                          1099-K Eligible
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#f3f4f6] text-[#6b7280]">
                          Below Threshold
                        </span>
                      )}
                    </div>

                    <div className="mt-2 space-y-1.5">
                      {/* Gross earnings progress */}
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[11px] text-[#6b7280]">
                            Gross earnings: {fmtUsd(yearData.grossCents)}
                          </span>
                          <span className="text-[11px] text-[#9ca3af]">
                            {fmtUsd(threshold)} threshold
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-[#f3f4f6] rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              yearData.grossCents >= threshold ? "bg-[#16a34a]" : "bg-[#8b5cf6]",
                            )}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Transaction count progress */}
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[11px] text-[#6b7280]">
                            Transactions: {yearData.transactionCount.toLocaleString()}
                          </span>
                          <span className="text-[11px] text-[#9ca3af]">
                            {txThreshold} threshold
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-[#f3f4f6] rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              yearData.transactionCount >= txThreshold ? "bg-[#16a34a]" : "bg-[#8b5cf6]",
                            )}
                            style={{ width: `${txProgressPct}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {yearData.isEligible ? (
                      <p className="text-[11px] text-[#16a34a] mt-2">
                        {isCurrentYear
                          ? "You're on track to receive a 1099-K. Stripe will email it by January 31."
                          : "Your 1099-K is available. Check your email or download from Stripe."
                        }
                      </p>
                    ) : (
                      <p className="text-[11px] text-[#6b7280] mt-2">
                        {isCurrentYear
                          ? "You haven't met the federal 1099-K threshold yet this year."
                          : "You didn't meet the threshold. Download a draft summary for your tax professional."
                        }
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {yearData.isEligible && !isCurrentYear && taxData.stripeExpressDashboardUrl ? (
                      <a
                        href={taxData.stripeExpressDashboardUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-white bg-[#8b5cf6] hover:bg-[#7c3aed] rounded-lg transition-colors"
                      >
                        <Download className="h-3 w-3" />
                        1099-K
                      </a>
                    ) : null}
                    {!isCurrentYear && (
                      <button
                        onClick={() => handleDownloadDraft(yearData.year)}
                        disabled={downloadingYear === yearData.year}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#374151] bg-[#f3f4f6] hover:bg-[#e5e7eb] rounded-lg transition-colors disabled:opacity-50"
                      >
                        {downloadingYear === yearData.year ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <FileText className="h-3 w-3" />
                        )}
                        Draft Summary
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Info footer */}
        <div className="px-5 py-3 bg-[#fafafa] border-t border-[#f3f4f6]">
          <p className="text-[11px] text-[#9ca3af] leading-relaxed">
            You'll receive a 1099-K if you earned $20,000+ across 200+ transactions in a tax year.
            Stripe sends official forms directly to your email by January 31.
            {taxData.stripeExpressDashboardUrl && (
              <>
                {" "}You can also access forms from your{" "}
                <a
                  href={taxData.stripeExpressDashboardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#8b5cf6] hover:underline"
                >
                  Stripe Dashboard
                </a>.
              </>
            )}
          </p>
        </div>
      </div>

      {/* ── Draft Summary Modal ── */}
      {showSummary && summaryData && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSummary(false); }}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl m-4">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-[#e5e7eb] px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h2 className="text-[16px] font-bold text-[#1a1a2e]">
                  {summaryData.year} Earnings Summary
                </h2>
                <p className="text-[11px] text-[#9ca3af] mt-0.5">Draft, not an official tax document</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#374151] bg-[#f3f4f6] hover:bg-[#e5e7eb] rounded-lg transition-colors"
                >
                  <Download className="h-3 w-3" />
                  Print / Save PDF
                </button>
                <button onClick={() => setShowSummary(false)} className="p-1.5 hover:bg-[#f3f4f6] rounded-lg transition-colors">
                  <X className="h-4 w-4 text-[#6b7280]" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-5 space-y-6 print:px-0">
              {/* Disclaimer */}
              <div className="px-4 py-3 bg-[#fffbeb] border border-[#fde68a] rounded-xl">
                <div className="flex gap-2">
                  <AlertCircle className="h-4 w-4 text-[#d97706] shrink-0 mt-0.5" />
                  <p className="text-[12px] text-[#92400e] leading-relaxed">
                    {summaryData.disclaimer}
                  </p>
                </div>
              </div>

              {/* Summary totals */}
              <div>
                <h3 className="text-[13px] font-semibold text-[#1a1a2e] mb-3">Summary for {summaryData.sellerName}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-[#f9fafb] rounded-xl px-4 py-3">
                    <p className="text-[11px] text-[#6b7280]">Gross Earnings</p>
                    <p className="text-[16px] font-bold text-[#1a1a2e] mt-0.5">{fmtUsd(summaryData.grossEarnings)}</p>
                  </div>
                  <div className="bg-[#f9fafb] rounded-xl px-4 py-3">
                    <p className="text-[11px] text-[#6b7280]">Platform Fees</p>
                    <p className="text-[16px] font-bold text-[#ef4444] mt-0.5">-{fmtUsd(summaryData.platformFees)}</p>
                  </div>
                  <div className="bg-[#f9fafb] rounded-xl px-4 py-3">
                    <p className="text-[11px] text-[#6b7280]">Refunds</p>
                    <p className="text-[16px] font-bold text-[#ef4444] mt-0.5">-{fmtUsd(summaryData.refunds)}</p>
                  </div>
                  <div className="bg-[#f5f3ff] rounded-xl px-4 py-3">
                    <p className="text-[11px] text-[#6b7280]">Net Earnings</p>
                    <p className="text-[16px] font-bold text-[#8b5cf6] mt-0.5">{fmtUsd(summaryData.netEarnings)}</p>
                  </div>
                </div>
                <p className="text-[11px] text-[#9ca3af] mt-2">
                  {summaryData.transactionCount.toLocaleString()} transactions total
                </p>
              </div>

              {/* Monthly breakdown */}
              {summaryData.monthlyBreakdown?.length > 0 && (
                <div>
                  <h3 className="text-[13px] font-semibold text-[#1a1a2e] mb-3">Monthly Breakdown</h3>
                  <div className="border border-[#e5e7eb] rounded-xl overflow-hidden">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="bg-[#f9fafb]">
                          <th className="text-left px-4 py-2.5 text-[#6b7280] font-medium">Month</th>
                          <th className="text-right px-4 py-2.5 text-[#6b7280] font-medium">Gross</th>
                          <th className="text-right px-4 py-2.5 text-[#6b7280] font-medium">Fees</th>
                          <th className="text-right px-4 py-2.5 text-[#6b7280] font-medium">Net</th>
                          <th className="text-right px-4 py-2.5 text-[#6b7280] font-medium"># Txns</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f3f4f6]">
                        {summaryData.monthlyBreakdown.map((m: any) => (
                          <tr key={m.month} className="hover:bg-[#fafafa]">
                            <td className="px-4 py-2.5 text-[#374151] font-medium">{m.monthLabel}</td>
                            <td className="px-4 py-2.5 text-right text-[#374151]">{fmtUsd(m.grossCents)}</td>
                            <td className="px-4 py-2.5 text-right text-[#ef4444]">-{fmtUsd(m.feesCents)}</td>
                            <td className="px-4 py-2.5 text-right text-[#1a1a2e] font-medium">{fmtUsd(m.netCents)}</td>
                            <td className="px-4 py-2.5 text-right text-[#6b7280]">{m.transactionCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Product breakdown */}
              {summaryData.productBreakdown?.length > 0 && (
                <div>
                  <h3 className="text-[13px] font-semibold text-[#1a1a2e] mb-3">By Product</h3>
                  <div className="border border-[#e5e7eb] rounded-xl overflow-hidden">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="bg-[#f9fafb]">
                          <th className="text-left px-4 py-2.5 text-[#6b7280] font-medium">Product</th>
                          <th className="text-right px-4 py-2.5 text-[#6b7280] font-medium">Gross</th>
                          <th className="text-right px-4 py-2.5 text-[#6b7280] font-medium">Net</th>
                          <th className="text-right px-4 py-2.5 text-[#6b7280] font-medium"># Sales</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f3f4f6]">
                        {summaryData.productBreakdown.map((p: any) => (
                          <tr key={p.productId} className="hover:bg-[#fafafa]">
                            <td className="px-4 py-2.5 text-[#374151] font-medium max-w-[200px] truncate">{p.productName}</td>
                            <td className="px-4 py-2.5 text-right text-[#374151]">{fmtUsd(p.grossCents)}</td>
                            <td className="px-4 py-2.5 text-right text-[#1a1a2e] font-medium">{fmtUsd(p.netCents)}</td>
                            <td className="px-4 py-2.5 text-right text-[#6b7280]">{p.transactionCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Eligibility note */}
              <div className="px-4 py-3 bg-[#f9fafb] rounded-xl">
                <p className="text-[11px] text-[#6b7280] leading-relaxed">
                  <strong>1099-K eligibility:</strong>{" "}
                  {summaryData.isEligible ? (
                    <>You met the federal threshold ({fmtUsd(summaryData.grossEarnings)} gross across {summaryData.transactionCount} transactions). Stripe will send your official 1099-K by January 31.</>
                  ) : (
                    <>You did not meet the federal threshold ($20,000 + 200 transactions). This draft summary is for your records. Ask a tax professional for filing guidance.</>
                  )}
                </p>
              </div>

              {/* Generated timestamp */}
              <p className="text-[10px] text-[#9ca3af] text-center">
                Generated {new Date(summaryData.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} · Storelib
              </p>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
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
  chargesEnabled?: boolean;
  detailsSubmitted?: boolean;
  requirementsDue?: string[];
  requirementsPastDue?: string[];
  requirementsEventuallyDue?: string[];
};

// Storelib model: every account is manual, and sellers cash out with the button
function payoutSpeedLabel(_schedule: PayoutMethodData["payoutSchedule"]): string {
  return "Manual cash outs";
}

// Friendly labels for Stripe requirement keys
const REQUIREMENT_LABELS: Record<string, string> = {
  "individual.verification.document": "Photo ID",
  "individual.verification.additional_document": "Additional ID document",
  "individual.id_number": "SSN or tax ID",
  "individual.dob.day": "Date of birth",
  "individual.dob.month": "Date of birth",
  "individual.dob.year": "Date of birth",
  "individual.address.line1": "Home address",
  "individual.address.city": "Home address",
  "individual.address.state": "Home address",
  "individual.address.postal_code": "Home address",
  "individual.first_name": "Legal name",
  "individual.last_name": "Legal name",
  "individual.email": "Email address",
  "individual.phone": "Phone number",
  "individual.ssn_last_4": "Last 4 of SSN",
  "business_profile.url": "Website URL",
  "business_profile.mcc": "Business category",
  "company.tax_id": "Business tax ID",
  "company.name": "Business name",
  "company.address.line1": "Business address",
  "company.address.city": "Business address",
  "company.address.state": "Business address",
  "company.address.postal_code": "Business address",
  "external_account": "Bank account",
  "tos_acceptance.date": "Terms of service",
  "tos_acceptance.ip": "Terms of service",
};

function friendlyRequirements(keys: string[]): string[] {
  const seen = new Set<string>();
  return keys
    .map((k) => REQUIREMENT_LABELS[k] || k.split(".").pop()?.replace(/_/g, " ") || k)
    .filter((label) => {
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
}


/**
 * THE BANK STRIPE PAYS INTO. A card with the bank's name, its last four,
 * the currency and whether Stripe has verified it, and one button to change
 * it in Stripe. When Stripe wants something before it will pay out, the one
 * most pressing thing is a strip at the top of the card with its own button,
 * where it used to be up to three separate banners stacked above it. With no
 * bank at all the card says so and its button is Add bank.
 */
function PayoutMethodCard({
  onManage,
  opening,
  onDisconnected,
  currency,
  available,
  pending,
}: {
  onManage: (mode?: "setup") => void;
  /** The account panel was asked for and is not on screen yet. */
  opening: boolean;
  onDisconnected: () => void;
  currency: string;
  available: number;
  pending: number;
}) {
  const [data, setData] = useState<PayoutMethodData | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  const loadData = useCallback(() => {
    fetch("/api/stripe/payout-method")
      .then((r) => r.json())
      .then((json) => setData(json))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  // Initial load + refresh on focus (catches bank updates from Stripe's hosted form)
  useEffect(() => {
    loadData();
    const onFocus = () => loadData();
    const onVisible = () => {
      if (document.visibilityState === "visible") loadData();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadData]);

  const bank = data?.bankAccount;
  const needsBank = data && !bank;
  // Requirements straight from Stripe: a notice only when something is actually due
  const hasPastDueRequirements = data && (data.requirementsPastDue?.length ?? 0) > 0;
  const hasVerificationNeeded = data && !data.payoutsEnabled && data.detailsSubmitted && !needsBank;
  // "Finish setup" only before the details were first sent (first-time onboarding)
  const needsOnboarding = data && !data.detailsSubmitted && !data.payoutsEnabled;
  const allRequirements = [
    ...(data?.requirementsPastDue || []),
    ...(data?.requirementsDue || []),
  ];
  const friendlyReqs = allRequirements.length > 0 ? friendlyRequirements(allRequirements) : [];

  /*
    Stripe asked for something after setup, or before payouts can start. One
    short line, including while payouts are still on: the email says the same
    thing once, and Continue opens Stripe's setup for whatever is left.
  */
  const moreDue = !!data?.detailsSubmitted && friendlyReqs.length > 0
  const notice: { title: string; body?: string; action: string; setup?: boolean } | null = loading
    ? null
    : moreDue
      ? {
          title: !data?.payoutsEnabled || hasPastDueRequirements ? "More information is needed for payouts" : "Stripe needs a little more",
          body: friendlyReqs.slice(0, 2).join(" · ") + (friendlyReqs.length > 2 ? ` · +${friendlyReqs.length - 2}` : ""),
          action: "Continue",
          setup: true,
        }
      : needsOnboarding && !needsBank
        ? { title: "Finish your account setup to receive payouts", action: "Continue", setup: true }
        : hasVerificationNeeded
          ? { title: "Complete verification to receive payouts", action: "Continue", setup: true }
          : null;

  const meta = bank
    ? [
        bank.currency ? bank.currency.toUpperCase() : null,
        payoutSpeedLabel(data?.payoutSchedule ?? null),
        bank.status && bank.status !== "new" ? bank.status.charAt(0).toUpperCase() + bank.status.slice(1) : null,
      ].filter(Boolean)
    : [];

  return (
    <section aria-label="Payout account" data-payout-account="" className={cn(card, "overflow-hidden")}>
      {notice ? (
        <button
          type="button"
          onClick={() => onManage(notice.setup ? "setup" : undefined)}
          disabled={opening}
          data-payout-notice=""
          className="flex w-full items-center gap-2 border-b border-[#f3e3b3] bg-[#fffaeb] px-4 py-2 text-left [-webkit-tap-highlight-color:transparent]"
        >
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#d9a400]" />
          <span className="min-w-0 flex-1 truncate text-[12px] leading-5 text-[#1a1a2e]">
            <span className="font-medium">{notice.title}</span>
            {notice.body ? <span className="text-[#4b5563]"> · {notice.body}</span> : null}
          </span>
          <span className="shrink-0 text-[12px] font-semibold text-[#1a1a2e]">{opening ? "Opening" : notice.action}</span>
        </button>
      ) : null}

      <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#eceef1] bg-[#f4f5f7] text-[#6b7280]">
            <Landmark className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-[#6b7280]">Payout account</p>
            {loading ? (
              <Shimmer className="flex h-5 items-center">
                <ShimmerBlock className="h-3.5 w-48 rounded-full" />
              </Shimmer>
            ) : bank ? (
              <p className="text-[14px] leading-5 text-[#1a1a2e] sm:truncate">
                <span className="font-semibold">{bank.bankName || "Bank account"}</span>{" "}
                <span className="tabular-nums text-[#6b7280]">••••{bank.last4}</span>
                {meta.length ? (
                  <span className="block truncate text-[13px] text-[#6b7280] sm:inline sm:text-[14px]">
                    <span className="hidden sm:inline">{" · "}</span>
                    {meta.join(" · ")}
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="text-[14px] leading-5 text-[#4b5563]">No bank account yet</p>
            )}
          </div>
        </div>
        {/* The press says so at once: the panel it opens has to be fetched first. */}
        <button
          type="button"
          onClick={() => onManage()}
          disabled={loading || opening}
          aria-busy={opening || undefined}
          className={cn(secondaryDepth, "h-11 gap-1.5 rounded-xl px-4 text-[14px] sm:h-8 sm:rounded-lg sm:px-3 sm:text-[13px]")}
          data-update-bank=""
        >
          {opening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {opening ? "Opening" : needsBank ? "Add bank" : "Update bank"}
        </button>
      </div>

      {/*
        USING A DIFFERENT ACCOUNT. A creator may have set payments up on the
        wrong account, or a business they no longer use. This is the quiet
        way out of it, under the bank rather than beside it, because it is
        rarely what anybody came here for. What it does is spelled out
        before it happens, and the server refuses while money is still in
        the account (lib/payments/stripe/connect disconnectStripeAccount).
      */}
      {!loading && data ? (
        <div className="flex items-center justify-between gap-3 border-t border-[#f1f2f4] bg-[#fafafb] px-4 py-2.5">
          <p className="min-w-0 text-[12px] leading-5 text-[#6b7280]">Selling under a different name or business?</p>
          <button
            type="button"
            onClick={() => setSwitching(true)}
            className="shrink-0 cursor-pointer text-[12px] font-medium text-[#4b5563] underline-offset-2 transition-colors hover:text-[#1a1a2e] hover:underline max-md:-my-3 max-md:inline-flex max-md:h-11 max-md:items-center"
            data-switch-account=""
          >
            Use a different account
          </button>
        </div>
      ) : null}

      <SwitchAccountPanel
        open={switching}
        onClose={() => setSwitching(false)}
        currency={currency}
        available={available}
        pending={pending}
        onDone={() => {
          setSwitching(false);
          onDisconnected();
        }}
      />
    </section>
  );
}

/**
 * LETTING GO OF THIS PAYMENTS ACCOUNT, AND SETTING ONE UP AGAIN. A dialog
 * on a computer and the shared sheet on a phone, because it is the one
 * thing on this page that turns selling off, and it should read like it.
 *
 * It says plainly what stays (orders, payouts, buyers' access, everything
 * already paid out) and what stops (checkout, until payments are set up
 * again). The server decides, not this: it refuses while there is money in
 * the account, so nothing is ever stranded, and the confirmation sent here
 * is the second yes, after this panel is the first.
 */
function SwitchAccountPanel({
  open,
  onClose,
  onDone,
  currency,
  available,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  currency: string;
  available: number;
  pending: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const holding = available + pending;

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const disconnect = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/payments/disconnect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const json = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(json.error || "We couldn't disconnect just now. Nothing was changed.");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't disconnect just now. Nothing was changed.");
      setBusy(false);
    }
  };

  const body = (
    <div className="px-5 pb-2 pt-3">
      <p className="text-[13px] leading-5 text-[#4b5563]">
        Your payments account is disconnected and you set payments up again, on whichever account you like. It is the way to move to a different name, a business, or a different bank country.
      </p>
      <ul className="mt-3 space-y-1.5 text-[13px] leading-5 text-[#4b5563]">
        <li className="flex gap-2">
          <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[#15803d]" strokeWidth={3} />
          <span>Your orders, payouts and everything already paid out stay exactly as they are.</span>
        </li>
        <li className="flex gap-2">
          <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[#15803d]" strokeWidth={3} />
          <span>Buyers keep their files and their access.</span>
        </li>
        <li className="flex gap-2">
          <AlertCircle className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[#b54708]" />
          <span>Checkout is closed until payments are set up again, so buyers cannot pay you in the meantime.</span>
        </li>
      </ul>
      {holding > 0 ? (
        <p className="mt-3 rounded-xl border border-[#f3e3b3] bg-[#fffaeb] px-3.5 py-2.5 text-[12.5px] leading-5 text-[#8a5a08]">
          You still have {fmt(holding, currency)} in this account. Cash out everything available and wait for the rest to settle first: it cannot be moved to a new account afterwards.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-[#f5c9c3] bg-[#fef3f2] px-3.5 py-2.5 text-[12.5px] leading-5 text-[#8a1c0f]">
          {error}
        </p>
      ) : null}
    </div>
  );
  const footer = (
    <div className="flex flex-col-reverse gap-2 border-t border-[#eef0f2] px-5 py-3 sm:flex-row sm:justify-end">
      <button type="button" className={SHEET_SECONDARY} onClick={onClose} disabled={busy}>
        Keep this account
      </button>
      <button
        type="button"
        onClick={() => void disconnect()}
        disabled={busy}
        className={cn(criticalDepth, "h-11 gap-1.5 rounded-xl px-4 text-[14px] sm:h-8 sm:rounded-lg sm:px-3 sm:text-[13px] disabled:cursor-not-allowed disabled:opacity-50")}
        data-confirm-switch=""
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {busy ? "Disconnecting" : "Disconnect and set up again"}
      </button>
    </div>
  );
  return (
    <>
      <DesktopDialog open={open} onClose={onClose} label="Use a different account" width="max-w-[480px]">
        <PanelHead title="Use a different account" onClose={onClose} />
        {body}
        {footer}
      </DesktopDialog>
      <BottomSheet isOpen={open} onClose={onClose} label="Use a different account">
        <PanelHead title="Use a different account" />
        {body}
        {footer}
      </BottomSheet>
    </>
  );
}

// ─── Payouts History List ─────────────────────────────────────────────────────

function PayoutsHistoryList({
  refreshKey,
  page = 0,
  pageSize = 10,
  onCountChange,
}: {
  refreshKey: number;
  page?: number;
  pageSize?: number;
  onCountChange?: (count: number) => void;
}) {
  const [payouts, setPayouts] = useState<StripePayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnce = useRef(false);

  const load = useCallback(async () => {
    // Only the first load waits visibly; later refreshes are silent
    if (!hasLoadedOnce.current) setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/stripe/payouts");
      const json = await r.json();
      if (json.error) throw new Error(json.error);
      setPayouts(json.payouts || []);
      hasLoadedOnce.current = true;
    } catch (e: any) {
      // Only show error on first load; a background refresh fails quietly
      if (!hasLoadedOnce.current) setError(e.message);
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
    return <ShimmerRows rows={3} rowHeight={56} cols={["30%", "18%", "12%"]} />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center gap-2 px-6 py-12 text-center">
        <AlertCircle className="h-4 w-4 text-[#b42318]" />
        <p className="text-[13px] text-[#b42318]">{error}</p>
      </div>
    );
  }

  if (!payouts.length) {
    return (
      <div data-empty="" className="flex flex-col items-center px-6 py-14 text-center">
        <p className="text-[15px] font-semibold text-[#1a1a2e]">No payouts yet</p>
        <p className="mt-1 max-w-[340px] text-[13px] text-[#6b7280]">
          Every cash out to your bank shows up here, with the day it arrives.
        </p>
      </div>
    );
  }

  const arrival = (p: StripePayout) =>
    p.arrival_date ? (p.status === "paid" ? `Arrived ${fmtUnix(p.arrival_date)}` : `Due ${fmtUnix(p.arrival_date)}`) : null;

  return (
    <>
      {/* A phone: one 64px row per payout, the amount and its days, the status at the right. */}
      <ul aria-label="Payouts" className="md:hidden">
        {visiblePayouts.map((p) => {
          const cfg = payoutStatusConfig(p.status);
          return (
            <li key={p.id} className="relative flex h-16 items-center gap-3 px-4 [&+li]:before:absolute [&+li]:before:left-4 [&+li]:before:right-0 [&+li]:before:top-0 [&+li]:before:h-px [&+li]:before:bg-[#eceef1]">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium tabular-nums text-[#1a1a2e]">{fmt(p.amount, p.currency)}</p>
                <p className="mt-0.5 truncate text-[12px] text-[#6b7280]">
                  {fmtUnix(p.created)}
                  {arrival(p) ? ` · ${arrival(p)}` : ""}
                  {p.destination ? ` · ${p.destination}` : ""}
                </p>
              </div>
              <StatusBadge tone={cfg.tone}>{cfg.label}</StatusBadge>
            </li>
          );
        })}
      </ul>

      {/* A computer: the same rows as a light table. */}
      <table className="hidden w-full table-fixed border-separate border-spacing-0 text-[13px] md:table">
        <thead>
          <tr className="h-9 text-left text-[12px] text-[#6b7280]">
            <th scope="col" className="w-[124px] border-b border-[#eef0f2] pl-4 pr-3 font-medium">Date</th>
            <th scope="col" className="w-[120px] border-b border-[#eef0f2] px-3 text-right font-medium">Amount</th>
            <th scope="col" className="w-[124px] border-b border-[#eef0f2] px-3 font-medium">Status</th>
            <th scope="col" className="border-b border-[#eef0f2] px-3 font-medium">Arrival</th>
            <th scope="col" className="hidden border-b border-[#eef0f2] px-3 font-medium lg:table-cell">Destination</th>
            <th scope="col" className="hidden w-[250px] border-b border-[#eef0f2] pl-3 pr-4 font-medium xl:table-cell">Payout ID</th>
          </tr>
        </thead>
        <tbody className="[&>tr+tr>td]:border-t [&>tr+tr>td]:border-[#f1f2f4]">
          {visiblePayouts.map((p) => {
            const cfg = payoutStatusConfig(p.status);
            return (
              <tr key={p.id} className="h-12 hover:[&>td]:bg-[#fafafb]">
                <td className="whitespace-nowrap bg-white pl-4 pr-3 text-[#4b5563]">{fmtUnix(p.created)}</td>
                <td className="whitespace-nowrap bg-white px-3 text-right font-medium tabular-nums text-[#1a1a2e]">{fmt(p.amount, p.currency)}</td>
                <td className="bg-white px-3">
                  <StatusBadge tone={cfg.tone}>{cfg.label}</StatusBadge>
                </td>
                <td className="truncate bg-white px-3 text-[#4b5563]">
                  {arrival(p) ?? <span className="text-[#9ca3af]">Usually 1 to 3 business days</span>}
                </td>
                <td className="hidden truncate bg-white px-3 text-[#4b5563] lg:table-cell">
                  {p.destination || <span className="text-[#9ca3af]">&ndash;</span>}
                </td>
                <td className="hidden truncate bg-white pl-3 pr-4 xl:table-cell">
                  <span className="select-all font-mono text-[12px] text-[#9ca3af]">{p.id}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

interface PayoutsClientProps {
  paymentsReady: boolean;
  creator: Creator;
  initialData: {
    /** The currency Stripe holds the balance in (lib/payments/display-currency pickBalance). */
    balanceCurrency: string;
    /** The currency most sales were charged in. */
    salesCurrency: string;
    pendingAmount: number;
    availableBalance: number;
    /** Stripe answered the server: the figures are real, not a placeholder of 0. */
    stripeRead?: boolean;
    negativeBalance?: number;
    activeDisputeCount?: number;
    totalDisputedAmount?: number;
    taxData?: {
      currentYear: { year: number; grossCents: number; transactionCount: number; isEligible: boolean };
      previousYear: { year: number; grossCents: number; transactionCount: number; isEligible: boolean };
      stripeExpressDashboardUrl: string | null;
    } | null;
  };
  initialOrders?: OrderPayment[];
}

/** How many rows a page of the list holds before the footer's arrows take over. */
const PAGE_SIZE = 10;

type SalesFilter = "all" | "completed" | "refunded" | "disputed";
const FILTER_LABEL: Record<SalesFilter, string> = {
  all: "All",
  completed: "Paid",
  refunded: "Refunded",
  disputed: "Disputed",
};

/**
 * THE SLOT IN THE PAGE'S BAR. The bar is sent with the heading, before
 * Stripe has answered (app/app/payouts/page.tsx), and leaves an empty box
 * for the actions, marked `data-payouts-actions`. Found once this client
 * mounts; where there is no such box (a probe drawing only this client) the
 * actions are drawn at the top of the page instead, so they are never lost.
 */
function usePageSlot(selector: string): HTMLElement | null | undefined {
  const [slot, setSlot] = useState<HTMLElement | null | undefined>(undefined);
  useLayoutEffect(() => {
    setSlot(document.querySelector<HTMLElement>(selector));
  }, [selector]);
  return slot;
}

export function PayoutsClient({
  paymentsReady,
  creator,
  initialData,
  initialOrders = [],
}: PayoutsClientProps) {
  /*
    EVERY FIGURE IN ITS OWN CURRENCY (lib/payments/display-currency). The
    balance in the currency Stripe holds it in, each sale in the currency it
    was charged in, each payout in the currency it was paid in. Nothing is
    converted to dollars for show any more.
  */
  const [balanceCurrency, setBalanceCurrency] = useState(initialData.balanceCurrency);
  const salesCurrency = initialData.salesCurrency;
  /* Stripe's pending transactions, as the days they become available, and the account's settlement delay. */
  const [upcoming, setUpcoming] = useState<Array<{ date: string; amount: number; currency: string }>>([]);
  const [settleDays, setSettleDays] = useState<number | null>(null);
  const [recentTab, setRecentTab] = useState<"sales" | "payouts">("sales");
  const [salesFilter, setSalesFilter] = useState<SalesFilter>("all");
  const [recentPage, setRecentPage] = useState(0);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [payoutCount, setPayoutCount] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<OrderPayment | null>(null);
  const [refundOnOpen, setRefundOnOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  /* Raised by a notice or Update bank: opens the Storelib Payments card's account form on this page. */
  const [manageRequest, setManageRequest] = useState(0);
  /* A notice opens Stripe's setup for what is still due. Update bank does not. */
  const [openAs, setOpenAs] = useState<"setup" | null>(null);
  /* The press is waiting for the panel to appear: the button it came from says so. */
  const [opening, setOpening] = useState(false);
  const openAccountPanel = useCallback((mode?: "setup") => {
    setOpenAs(mode ?? null);
    setOpening(true);
    setManageRequest((n) => n + 1);
  }, []);
  /* The account was let go: the page is a setup page again, so it is read afresh from the server. */
  const onDisconnected = useCallback(() => {
    forgetOverview();
    window.location.reload();
  }, []);
  /* Stripe's balance came with the page: the figures are drawn sharp at once, and the read on mount only freshens them. */
  const [balanceReady, setBalanceReady] = useState(!!initialData.stripeRead);
  /* The payouts list and what is arriving come only from the read on mount. */
  const [payoutsRead, setPayoutsRead] = useState(false);
  const [availableBalance, setAvailableBalance] = useState(
    initialData.availableBalance,
  );
  const [pendingBalance, setPendingBalance] = useState(
    initialData.pendingAmount,
  );
  // Payout status tracking for the notice and the On the way figure
  const [latestPayoutStatus, setLatestPayoutStatus] = useState<{
    hasInTransit: boolean;
    hasFailed: boolean;
    totalPayouts: number;
    failedAmount: number;
    inTransitAmount: number;
  }>({ hasInTransit: false, hasFailed: false, totalPayouts: 0, failedAmount: 0, inTransitAmount: 0 });

  // The account's payments status, for the notice
  const [paymentsStatus, setPaymentsStatus] = useState<StorelibStatusView | null>(null);

  // Dispute & negative balance state
  const [negativeBalance, setNegativeBalance] = useState(
    initialData.negativeBalance || 0,
  );
  const [activeDisputeCount, setActiveDisputeCount] = useState(
    initialData.activeDisputeCount || 0,
  );
  const [totalDisputedAmount, setTotalDisputedAmount] = useState(
    initialData.totalDisputedAmount || 0,
  );

  // 1099-K tax data
  const [taxData, setTaxData] = useState<{
    currentYear: { year: number; grossCents: number; transactionCount: number; isEligible: boolean };
    previousYear: { year: number; grossCents: number; transactionCount: number; isEligible: boolean };
    stripeExpressDashboardUrl: string | null;
  } | null>(initialData.taxData || null);

  const hasStripe = !!creator.stripe_account_id;
  const payoutsEnabled = creator.payouts_enabled !== false;
  const { toast } = useToast();

  const refreshBalances = useCallback(async () => {
    setRefreshKey((k) => k + 1);

    try {
      const r = await fetch("/api/stripe/payouts");
      const json = await r.json();
      /* Stripe's balance, in the currency it holds it in: below zero stays below zero. */
      const picked = pickBalance(json.balance, json.balanceCurrency);
      const shownCurrency = picked?.currency ?? (typeof json.balanceCurrency === "string" ? json.balanceCurrency : null);
      if (picked) {
        setBalanceCurrency(picked.currency);
        setAvailableBalance(picked.available);
        setPendingBalance(picked.pending);
      } else if (shownCurrency) {
        setBalanceCurrency(shownCurrency);
      }
      if (Array.isArray(json.upcoming)) setUpcoming(json.upcoming);
      if (typeof json.payoutScheduleDelay === "number") setSettleDays(json.payoutScheduleDelay);
      // Payout status for the notice and the On the way figure, in the balance's currency
      if (json.payouts) {
        const payouts = json.payouts as Array<{ status: string; amount: number; currency?: string }>;
        const same = (p: { currency?: string }) => !shownCurrency || (p.currency || "").toLowerCase() === shownCurrency.toLowerCase();
        setLatestPayoutStatus({
          hasInTransit: payouts.some((p) => p.status === "in_transit" || p.status === "pending"),
          hasFailed: payouts.some((p) => p.status === "failed"),
          totalPayouts: payouts.length,
          failedAmount: payouts.filter((p) => p.status === "failed" && same(p)).reduce((s, p) => s + p.amount, 0),
          inTransitAmount: payouts.filter((p) => (p.status === "in_transit" || p.status === "pending") && same(p)).reduce((s, p) => s + p.amount, 0),
        });
      }
      // Update account status for the notice
      if (json.paymentsStatus) setPaymentsStatus(json.paymentsStatus);
      // Update dispute data
      if (json.disputeData) {
        setNegativeBalance(json.disputeData.negativeBalance || 0);
        setActiveDisputeCount(json.disputeData.activeDisputes || 0);
        setTotalDisputedAmount(json.disputeData.totalDisputedAmount || 0);
      }
      // Update tax data
      if (json.taxData) {
        setTaxData(json.taxData);
      }
      setBalanceReady(true);
      setPayoutsRead(true);
    } catch {
      // On error, still show values so the figures do not stay soft forever
      setBalanceReady(true);
      setPayoutsRead(true);
    }
  }, []);

  const openOrderDetails = useCallback((order: OrderPayment, refund = false) => {
    setRefundOnOpen(refund);
    setSelectedOrder(order);
  }, []);

  const filteredOrders = salesFilter === "all"
    ? initialOrders
    : initialOrders.filter((o) => o.status === salesFilter);
  const listLength = recentTab === "sales" ? filteredOrders.length : payoutCount;
  const pageCount = Math.max(1, Math.ceil(listLength / PAGE_SIZE));
  const pagedOrders = filteredOrders.slice(recentPage * PAGE_SIZE, recentPage * PAGE_SIZE + PAGE_SIZE);

  // Smooth crossfade: gentle fade out, swap data, fade back in
  const smoothSwitch = useCallback((swapFn: () => void) => {
    setIsPageLoading(true);
    // Wait for the CSS fade-out to finish before swapping content
    setTimeout(() => {
      swapFn();
      // Double rAF ensures the DOM has painted with new content before fading back in
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsPageLoading(false));
      });
    }, 150);
  }, []);
  const changePage = (next: number) => smoothSwitch(() => setRecentPage(next));

  /* The overview the account panel needs, fetched while the page is being read rather than on the press. */
  useEffect(() => {
    if (paymentsReady) warmOverview();
  }, [paymentsReady]);

  useEffect(() => {
    if (!hasStripe) { setBalanceReady(true); return; }
    let lastRefresh = 0;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      // Debounce: skip if refreshed less than 10s ago
      if (now - lastRefresh < 10000) return;
      lastRefresh = now;
      refreshBalances();
    };
    tick();
    const id = window.setInterval(tick, 30000);
    const onVisible = () => tick();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [hasStripe, refreshBalances]);

  /*
    PULL TO REFRESH: Stripe's figures and the sales list, both read again,
    and the spinner waits for the two answers (the list's is the server's
    page arriving with new orders), or 8 seconds.
  */
  const router = useRouter();
  const ordersArrived = useRef<(() => void) | null>(null);
  useEffect(() => {
    ordersArrived.current?.();
    ordersArrived.current = null;
  }, [initialOrders]);
  const onPullRefresh = useCallback(
    () =>
      Promise.all([
        refreshBalances(),
        new Promise<void>((resolve) => {
          ordersArrived.current = resolve;
          router.refresh();
          window.setTimeout(resolve, 8000);
        }),
      ]),
    [refreshBalances, router],
  );

  /* ── The cash out ─────────────────────────────────────────────────────── */
  const onWithdrawn = useCallback(() => {
    refreshBalances();
    setRecentTab("payouts");
    setRecentPage(0);
  }, [refreshBalances]);
  const withdraw = useWithdraw(onWithdrawn);

  /* Stripe's own figures. A dispute or a refund taken back shows in Stripe's available balance itself, so it is not taken off a second time. */
  const available = availableBalance;
  const pending = pendingBalance;
  const inTransit = latestPayoutStatus.inTransitAmount;
  const effectiveBalance = available;
  const canCashOut = effectiveBalance > 0 && negativeBalance === 0;

  /* Cash out with nothing ready says why, rather than doing nothing. */
  const onCashOut = useCallback(() => {
    if (withdraw.loading) return;
    if (!canCashOut) {
      toast({
        title: "Nothing to cash out yet",
        description: effectiveBalance < 0
          ? "Your available balance has to be above zero first."
          : upcoming[0]
            ? `${fmt(upcoming[0].amount, upcoming[0].currency)} becomes available on ${fmtDay(upcoming[0].date)}.`
            : settleText(settleDays),
      });
      return;
    }
    withdraw.handleWithdraw();
  }, [withdraw, canCashOut, effectiveBalance, toast, upcoming, settleDays]);

  /* ── Details: read the first time it opens ─────────────────────────────── */
  const [detailsOpen, setDetailsOpen] = useState(false);
  const closeDetails = useCallback(() => setDetailsOpen(false), []);
  const [detailsBank, setDetailsBank] = useState<{ bankName: string | null; last4: string; currency: string } | null>(null);
  const [detailsBankRead, setDetailsBankRead] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const openDetails = async () => {
    setDetailsOpen(true);
    if (detailsBankRead) return; // already read
    setDetailsLoading(true);
    try {
      const methodRes = await fetch("/api/stripe/payout-method").then((r) => r.json());
      if (methodRes.bankAccount) setDetailsBank(methodRes.bankAccount);
      setDetailsBankRead(true);
    } catch {
      // non-fatal: the panel still shows the balance
    } finally {
      setDetailsLoading(false);
    }
  };

  /* ── The page's actions, in its bar ────────────────────────────────────── */
  const slot = usePageSlot("[data-payouts-actions]");
  const exportItems = useMemo<ActionMenuItem[]>(
    () => [
      {
        label: "Earnings summary (CSV)",
        icon: <FileText />,
        onClick: () => exportOrdersCsv(filteredOrders, salesCurrency),
      },
      {
        label: "Payouts history (CSV)",
        icon: <Landmark />,
        onClick: () => {
          exportPayoutsCsv()
            .then((saved) => {
              if (!saved) toast({ title: "No payouts to export yet" });
            })
            .catch(() => toast({ title: "Export failed. Try again.", variant: "destructive" }));
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredOrders, toast],
  );
  /*
    On a phone Export is the download icon beside Cash out, as on Products,
    each drawn at 32px in a 44px press. Cash out with nothing ready is drawn
    at half strength and still says why when pressed. Without payouts turned
    on there is no Cash out at all: the notice under the bar carries the one
    way forward.
  */
  const actions = paymentsReady ? (
    <>
      <ResponsiveActionMenu
        title="Export"
        align="end"
        menuWidth="w-60"
        trigger={
          <Press aria-label="Export" className="max-md:hidden" look={LOOK_SECONDARY} data-payouts-export="">
            <Download className="h-3.5 w-3.5 text-[#6b7280]" />
            Export
          </Press>
        }
        items={exportItems}
      />
      <ResponsiveActionMenu
        title="Export"
        align="end"
        trigger={
          <Press aria-label="Export" className="md:hidden" look={LOOK_ICON} data-payouts-export="">
            <Download className="h-4 w-4" />
          </Press>
        }
        items={exportItems}
      />
      {payoutsEnabled ? (
        <Press
          look={LOOK_CASH_OUT}
          onClick={onCashOut}
          disabled={withdraw.loading}
          aria-disabled={!canCashOut || undefined}
          data-cash-out=""
        >
          {withdraw.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {withdraw.loading ? "Cashing out" : "Cash out"}
        </Press>
      ) : null}
    </>
  ) : null;

  const actionsInBar = slot && actions ? createPortal(actions, slot) : null;

  /*
    Until payments are on, this page is only the setup card. Balance, export,
    sales and cash out appear after that. Update bank brings the card back.
  */
  if (!paymentsReady) {
    return (
      <div aria-label="Set up payouts" data-payouts-setup="" className="mt-4 w-full">
        <StorelibPaymentsInline compact />
      </div>
    );
  }
  /*
    ONE NOTICE AT A TIME, the most pressing first: an open dispute, a
    balance below zero, a payout that failed, a Stripe setup left unfinished,
    Stripe asking for identity, Stripe reviewing, Cash out not turned on,
    a payout on its way, the first payout being slower. Only the first that
    applies is drawn, and only the ones with something to do have a button.
  */
  const notice = (() => {
    // 0a. Active dispute: highest priority
    if (activeDisputeCount > 0) {
      return (
        <Notice
          tone="critical"
          title={activeDisputeCount === 1 ? "A buyer disputed a payment" : `${activeDisputeCount} payments are disputed`}
          body={
            <>
              Your share of {fmt(totalDisputedAmount, salesCurrency)} in sales is held while the buyer&apos;s bank decides. Storelib answers the bank for you; add anything that proves the sale below.
              {negativeBalance > 0 ? (
                <span className="mt-1 block font-medium text-[#8a1c0f]">
                  Your balance is -{fmt(negativeBalance, salesCurrency)} because of it. New sales cover the difference.
                </span>
              ) : null}
            </>
          }
          action={{ label: "See disputes", onClick: () => document.getElementById("disputes")?.scrollIntoView({ behavior: "smooth", block: "start" }) }}
        />
      );
    }

    // 0b. Negative balance (from disputes or refunds) with no active dispute
    if (negativeBalance > 0 && activeDisputeCount === 0) {
      return (
        <Notice
          tone="attention"
          title="Your balance is below zero after a refund"
          body={`${fmt(negativeBalance, salesCurrency)} was taken back from your balance. New sales cover it first, with nothing for you to do, and Cash out comes back once your balance is above zero.`}
        />
      );
    }

    // 1. Payout failed: needs action
    if (latestPayoutStatus.hasFailed) {
      return (
        <Notice
          tone="critical"
          title="Your last payout failed"
          body="The money is back in your available balance. Check your bank details, then cash out again."
          action={{ label: "Update bank", onClick: openAccountPanel }}
        />
      );
    }

    /* 2 to 4b: while the account is not ready, the Storelib Payments card above says it, with its button. */
    if (paymentsReady) {
      /* 2 to 4: what Stripe needs, in Storelib's words, from the same status as the payments card. */
      if (paymentsStatus && paymentsStatus.status !== "ACTIVE" && paymentsStatus.status !== "NOT_STARTED") {
        const s = paymentsStatus;
        const by = s.deadline ? ` Needed by ${new Date(s.deadline).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}.` : "";
        return (
          <Notice
            tone={s.action ? "attention" : "neutral"}
            title={s.title}
            body={`${s.line}${by}`}
            action={
              s.action === "support"
                ? { label: s.actionLabel ?? "Contact support", onClick: () => { window.location.href = "mailto:support@storelib.com"; } }
                : s.action && s.actionLabel
                  ? { label: s.actionLabel, onClick: openAccountPanel }
                  : undefined
            }
          />
        );
      }

      // 4b. Cash out is not on for this account (what the old cash out panel said in its place)
      if (!payoutsEnabled) {
        return (
          <Notice
            tone="attention"
            title="Finish setting up payments to cash out"
            action={{ label: "Continue", onClick: openAccountPanel }}
          />
        );
      }
    }

    // 5. Payout in transit: money is on the way
    if (latestPayoutStatus.hasInTransit) {
      return (
        <Notice
          tone="neutral"
          title="A payout is on its way to your bank"
          body="It usually arrives in 1 to 3 business days."
        />
      );
    }

    // 6. First payout: the account is ready but has never cashed out.
    // Only once the payouts are read (payoutsRead), so the payout count is real
    if (payoutsRead && latestPayoutStatus.totalPayouts === 0 && (availableBalance > 0 || pendingBalance > 0)) {
      return (
        <Notice
          tone="neutral"
          title="Your first payout can take a little longer"
          body="Stripe takes extra time with a new account. Later payouts are faster."
        />
      );
    }

    return null;
  })();

  const salesCounts: Record<SalesFilter, number> = {
    all: initialOrders.length,
    completed: initialOrders.filter((o) => o.status === "completed").length,
    refunded: initialOrders.filter((o) => o.status === "refunded").length,
    disputed: initialOrders.filter((o) => o.status === "disputed").length,
  };
  const filterItems: ActionMenuItem[] = (["all", "completed", "refunded", "disputed"] as const)
    .filter((f) => f === "all" || salesCounts[f] > 0 || salesFilter === f)
    .map((f) => ({
      label: `${FILTER_LABEL[f]} (${salesCounts[f]})`,
      icon: <Check className={salesFilter === f ? "opacity-100" : "opacity-0"} />,
      onClick: () => {
        if (salesFilter === f) return;
        smoothSwitch(() => { setSalesFilter(f); setRecentPage(0); });
      },
    }));

  const tabs = [
    { value: "sales" as const, label: "Sales" },
    { value: "payouts" as const, label: "Payouts" },
  ];
  const tabIndex = recentTab === "sales" ? 0 : 1;
  const from = listLength === 0 ? 0 : recentPage * PAGE_SIZE + 1;
  const to = Math.min((recentPage + 1) * PAGE_SIZE, listLength);

  return (
    <PullToRefresh onRefresh={onPullRefresh}>
    <div className="space-y-4 pt-2" data-payouts="">
      {/* Where the page has no bar to hold them, the actions lead the page. */}
      {slot === null && actions ? <div className="flex justify-end gap-2">{actions}</div> : null}
      {actionsInBar}

      {/* Update bank and the notices open the setup panel over the dashboard: no second card. */}
      {manageRequest > 0 ? <StorelibPaymentsInline panelOnly manageRequest={manageRequest} openAs={openAs} onPanelShown={() => setOpening(false)} /> : null}

      {notice}

      <DisputesCard />

      <BalanceCard
        available={available}
        pending={pending}
        inTransit={inTransit}
        negativeBalance={negativeBalance}
        balanceReady={balanceReady}
        payoutsRead={payoutsRead}
        currency={balanceCurrency}
        upcoming={upcoming}
        settleDays={settleDays}
        payoutsEnabled={payoutsEnabled}
        withdraw={withdraw}
        onDetails={openDetails}
      />

      <RevenueChart initialCurrency={salesCurrency} />

      {/*
        SALES AND PAYOUTS, ONE LIST CARD. The toolbar is the Products views'
        segmented control (a grey track and a white segment that slides) and,
        on Sales, a status filter that is a menu on a computer and a sheet
        on a phone. The rows are Orders' and Products': light, a hairline
        between them, a tint under the pointer, statuses as Orders' badges.
        A phone has rows of its own, 64px, the whole row the press.
      */}
      <section aria-label="Sales and payouts" data-activity="" className={cn(card, "overflow-hidden")}>
        <div className="flex h-14 items-center gap-2 border-b border-[#eef0f2] pl-2 pr-1.5 md:h-12 md:pl-3 md:pr-2">
          <div
            role="tablist"
            aria-label="Show"
            className="relative grid h-11 w-[176px] shrink-0 grid-cols-2 md:h-8 md:w-[168px]"
          >
            <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[4px] top-[4px] rounded-[9px] bg-[#eceef1] md:inset-y-0" />
            <span
              aria-hidden
              data-segment=""
              className="pointer-events-none absolute bottom-[6px] left-[2px] top-[6px] w-[calc(50%-2px)] rounded-[7px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.08),0_0_0_0.5px_rgba(17,24,39,0.06)] transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none md:bottom-[2px] md:top-[2px]"
              style={{ transform: `translateX(${tabIndex * 100}%)` }}
            />
            {tabs.map((t) => {
              const selected = recentTab === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => {
                    if (selected) return;
                    smoothSwitch(() => { setRecentTab(t.value); setRecentPage(0); });
                  }}
                  className={cn(
                    "relative h-full min-w-0 cursor-pointer truncate rounded-[7px] px-2 text-[13px] font-medium outline-none transition-colors duration-100 focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e] [-webkit-tap-highlight-color:transparent]",
                    selected ? "text-[#1a1a2e]" : "text-[#6b7280] hover:text-[#1a1a2e]",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {recentTab === "sales" && initialOrders.length > 0 ? (
            <div className="ml-auto">
              <ResponsiveActionMenu
                title="Show sales"
                align="end"
                menuWidth="w-52"
                trigger={
                  <Press
                    aria-label={`Showing ${FILTER_LABEL[salesFilter]} sales. Change`}
                    look={cn(LOOK_SECONDARY, salesFilter !== "all" && "bg-[#f1f2f4]")}
                    data-sales-filter=""
                  >
                    <ListFilter className="h-3.5 w-3.5 text-[#6b7280]" />
                    {FILTER_LABEL[salesFilter]}
                  </Press>
                }
                items={filterItems}
              />
            </div>
          ) : null}
        </div>

        <div
          style={{
            opacity: isPageLoading ? 0 : 1,
            transition: "opacity 150ms ease",
          }}
        >
          {recentTab === "payouts" ? (
            <PayoutsHistoryList
              refreshKey={refreshKey}
              page={recentPage}
              pageSize={PAGE_SIZE}
              onCountChange={setPayoutCount}
            />
          ) : pagedOrders.length === 0 ? (
            <div data-empty="" className="flex flex-col items-center px-6 py-14 text-center">
              <p className="text-[15px] font-semibold text-[#1a1a2e]">{initialOrders.length === 0 ? "No sales yet" : "No sales match"}</p>
              <p className="mt-1 max-w-[340px] text-[13px] text-[#6b7280]">
                {initialOrders.length === 0
                  ? "Your sales show up here as soon as someone buys, with what they paid and what you keep."
                  : "Nothing with this status. Show all sales to see the rest."}
              </p>
              {initialOrders.length > 0 ? (
                <button
                  type="button"
                  className={cn(LOOK_SECONDARY, "mt-4 max-md:h-11 max-md:rounded-xl max-md:px-4 max-md:text-[14px]")}
                  onClick={() => smoothSwitch(() => { setSalesFilter("all"); setRecentPage(0); })}
                >
                  Show all sales
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {/*
                A PHONE: one 64px row per sale. The picture, the buyer, and
                under them the product and the day in grey; the amount at the
                right, and a status under it only when the sale is not simply
                paid, so the list is quiet unless something needs a look.
              */}
              <ul aria-label="Sales" className="md:hidden">
                {pagedOrders.map((order) => {
                  const name = customerNameOf(order) || order.buyer?.email || order.buyer_email || "Customer";
                  const day = new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  return (
                    <li key={order.id} className="relative [&+li]:before:absolute [&+li]:before:left-[68px] [&+li]:before:right-0 [&+li]:before:top-0 [&+li]:before:h-px [&+li]:before:bg-[#eceef1]">
                      <button
                        type="button"
                        onClick={() => openOrderDetails(order)}
                        data-sale-row={order.id}
                        className="flex h-16 w-full cursor-pointer items-center gap-3 px-3 text-left outline-none transition-colors duration-100 active:bg-[#eef0f2] focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e] [-webkit-tap-highlight-color:transparent]"
                      >
                        <Thumb src={order.product?.thumbnail_url} size={44} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium leading-[18px] text-[#1a1a2e]">{name}</span>
                          <span className="mt-1 block truncate text-[12px] leading-4 text-[#6b7280]">
                            {day} · {order.product?.title || "Product"}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-[14px] font-medium tabular-nums text-[#1a1a2e]">{fmt(order.amount_cents, order.currency || salesCurrency)}</span>
                          {order.status !== "completed" ? <SaleBadge status={order.status} /> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {/*
                A COMPUTER: the same sales as a light table. 56px rows with a
                32px picture and 13px text, the buyer's name over their email,
                numbers right aligned in figures of one width, and the whole
                row opens the sale. The product joins from 1024px, where the
                sidebar leaves room for it. The more button's menu has View
                and, for a paid sale, Refund.
              */}
              <table className="hidden w-full table-fixed border-separate border-spacing-0 text-[13px] md:table">
                <thead>
                  <tr className="h-9 text-left text-[12px] text-[#6b7280]">
                    <th scope="col" className="border-b border-[#eef0f2] pl-4 pr-3 font-medium">Customer</th>
                    <th scope="col" className="hidden w-[34%] border-b border-[#eef0f2] px-3 font-medium lg:table-cell">Product</th>
                    <th scope="col" className="w-[120px] border-b border-[#eef0f2] px-3 font-medium">Date</th>
                    <th scope="col" className="w-[140px] border-b border-[#eef0f2] px-3 font-medium">Status</th>
                    <th scope="col" className="w-[110px] border-b border-[#eef0f2] px-3 text-right font-medium">Amount</th>
                    <th scope="col" className="w-[52px] border-b border-[#eef0f2]" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody className="[&>tr+tr>td]:border-t [&>tr+tr>td]:border-[#f1f2f4]">
                  {pagedOrders.map((order) => {
                    const name = customerNameOf(order);
                    const email = order.buyer?.email || order.buyer_email || "";
                    const rowItems: ActionMenuItem[] = [
                      { label: "View sale", icon: <FileText />, onClick: () => openOrderDetails(order) },
                      ...(order.status === "completed"
                        ? [{ label: "Refund", icon: <RotateCcw />, variant: "destructive" as const, separatorBefore: true, onClick: () => openOrderDetails(order, true) }]
                        : []),
                    ];
                    return (
                      <tr
                        key={order.id}
                        data-sale-row={order.id}
                        className="h-14 cursor-pointer hover:[&>td]:bg-[#fafafb]"
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (!e.currentTarget.contains(target) || target.closest("a,button,input,label")) return;
                          openOrderDetails(order);
                        }}
                      >
                        <td className="bg-white pl-4 pr-3">
                          <button
                            type="button"
                            onClick={() => openOrderDetails(order)}
                            className="block max-w-full cursor-pointer truncate text-left font-medium text-[#1a1a2e] outline-none hover:underline focus-visible:underline"
                          >
                            {name || email || "Customer"}
                          </button>
                          {name && email ? <span className="block truncate text-[12px] text-[#6b7280]">{email}</span> : null}
                        </td>
                        <td className="hidden bg-white px-3 lg:table-cell">
                          <span className="flex min-w-0 items-center gap-2.5">
                            <Thumb src={order.product?.thumbnail_url} size={32} />
                            <span className="min-w-0 truncate text-[#303036]">{order.product?.title || "Product"}</span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap bg-white px-3 text-[#4b5563]">{fmtDate(order.created_at)}</td>
                        <td className="bg-white px-3">
                          <SaleBadge status={order.status} />
                        </td>
                        <td className="whitespace-nowrap bg-white px-3 text-right font-medium tabular-nums text-[#1a1a2e]">{fmt(order.amount_cents, order.currency || salesCurrency)}</td>
                        <td className="bg-white pr-2.5">
                          <div className="flex justify-end">
                            <ResponsiveActionMenu
                              title={name || "Sale"}
                              align="end"
                              trigger={<RowMenuButton label={`Actions for this sale`} className="h-7 w-7" />}
                              items={rowItems}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>

        {listLength > 0 ? (
          <div className="flex h-12 items-center justify-between gap-3 border-t border-[#eef0f2] bg-[#fafafb] pl-4 pr-1.5 md:h-11 md:pr-3">
            <span className="text-[12px] tabular-nums text-[#6b7280]">
              {from}–{to} of {listLength.toLocaleString("en-US")}
            </span>
            <div className="flex items-center md:gap-1">
              <Press aria-label="Previous page" look={LOOK_ARROW} disabled={recentPage <= 0} onClick={() => changePage(Math.max(0, recentPage - 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Press>
              <Press aria-label="Next page" look={LOOK_ARROW} disabled={recentPage >= pageCount - 1} onClick={() => changePage(Math.min(pageCount - 1, recentPage + 1))}>
                <ChevronRight className="h-4 w-4" />
              </Press>
            </div>
          </div>
        ) : null}
      </section>

      {/* The bank it all goes to */}
      <PayoutMethodCard onManage={openAccountPanel} opening={opening} onDisconnected={onDisconnected} currency={balanceCurrency} available={available} pending={pending} />

      <BalanceDetails
        open={detailsOpen}
        onClose={closeDetails}
        available={available}
        pending={pending}
        inTransit={inTransit}
        currency={balanceCurrency}
        upcoming={upcoming}
        upcomingLoading={!payoutsRead}
        settleDays={settleDays}
        bank={detailsBank}
        bankLoading={detailsLoading}
        onUpdateBank={() => {
          closeDetails();
          openAccountPanel();
        }}
        payoutsEnabled={payoutsEnabled}
        canCashOut={canCashOut}
        cashingOut={withdraw.loading}
        onCashOut={onCashOut}
      />

      {/* An order, opened from the list */}
      <OrderDetailsModal
        order={selectedOrder}
        currency={selectedOrder?.currency || salesCurrency}
        refundOnOpen={refundOnOpen}
        onClose={() => setSelectedOrder(null)}
        onRefundSuccess={(refundedAmountCents) => {
          // Take the refunded amount off the figures at once: the creator
          // sees it the moment the refund confirms, without waiting for
          // Stripe's API to catch up. It may sit in pending or available,
          // so both come down by it (never below zero).
          setPendingBalance((prev) => Math.max(0, prev - refundedAmountCents));
          setAvailableBalance((prev) => Math.max(0, prev - refundedAmountCents));
          // Then re-read the real Stripe balances: now, and again after 3s
          // in case the transfer reversal takes a moment to show.
          refreshBalances();
          setTimeout(() => refreshBalances(), 3000);
        }}
      />
    </div>
    </PullToRefresh>
  );
}
