import { redirect } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { PayoutsClient } from "./payouts-client";
import { AnnouncementBarMobile } from "@/components/app/announcement-bar-mobile";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Payouts",
};

export default async function PayoutsPage() {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: creator, error: creatorError } = await adminSupabase
    .from("creators")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (creatorError || !creator) {
    redirect("/onboarding");
  }

  // Fetch this creator's products
  const { data: productsData } = await adminSupabase
    .from("products")
    .select("*")
    .eq("creator_id", creator.id);

  const products = productsData || [];
  const productIds = products.map((p) => p.id);

  let totalEarnings = 0;
  let totalFees = 0;
  let totalRefunds = 0;
  let allOrders: any[] = [];

  if (productIds.length > 0) {
    const { data: ordersData } = await adminSupabase
      .from("orders")
      .select("*")
      .in("product_id", productIds)
      .in("status", ["completed", "refunded", "disputed"])
      .order("created_at", { ascending: false });

    if (ordersData) {
      allOrders = ordersData.map((order) => {
        const product = products.find((p) => p.id === order.product_id);
        return {
          ...order,
          product: product
            ? {
                title: product.title,
                thumbnail_url:
                  product.thumbnail_url || product.gallery_images?.[0] || null,
                type: product.type || null,
              }
            : null,
        };
      });

      const paidOrders = ordersData.filter((o) => o.status === "completed");
      const refundedOrders = ordersData.filter((o) => o.status === "refunded");
      totalEarnings = paidOrders.reduce(
        (sum, o) => sum + (o.amount_cents || 0),
        0,
      );
      totalFees = paidOrders.reduce((sum, o) => sum + (o.fee_cents || 0), 0);
      totalRefunds = refundedOrders.reduce(
        (sum, o) => sum + (o.refund_amount_cents || o.amount_cents || 0),
        0,
      );
    }
  }

  const orderPendingUsd = Math.max(0, totalEarnings - totalFees);
  const orderNetUsd = Math.max(0, totalEarnings - totalFees - totalRefunds);

  let stripePendingBalance = 0;
  let stripeAvailableBalance = 0;
  const paidOut = 0;
  let detectedCurrency = (creator.default_currency || "usd").toLowerCase();
  let stripeExchangeRate: number | null = null;
  if (creator.stripe_account_id) {
    try {
      const [balance, account, balanceTx] = await Promise.all([
        stripe.balance.retrieve({}, { stripeAccount: creator.stripe_account_id }),
        stripe.accounts.retrieve(creator.stripe_account_id),
        stripe.balanceTransactions.list(
          { limit: 10 },
          { stripeAccount: creator.stripe_account_id },
        ),
      ]);

      stripeExchangeRate =
        (balanceTx.data.find((tx: any) => tx.exchange_rate) as any)
          ?.exchange_rate || null;

      const preferredCurrency = (
        account.default_currency ||
        creator.default_currency ||
        "usd"
      ).toLowerCase();

      const byCurrency = new Map<
        string,
        { available: number; pending: number }
      >();

      for (const b of balance.available) {
        const row = byCurrency.get(b.currency) || { available: 0, pending: 0 };
        row.available += b.amount;
        byCurrency.set(b.currency, row);
      }
      for (const b of balance.pending) {
        const row = byCurrency.get(b.currency) || { available: 0, pending: 0 };
        row.pending += b.amount;
        byCurrency.set(b.currency, row);
      }

      const dominant =
        [...byCurrency.entries()].sort(
          (a, b) =>
            b[1].available + b[1].pending - (a[1].available + a[1].pending),
        )[0] || null;

      const selected = byCurrency.get(preferredCurrency)
        ? ([preferredCurrency, byCurrency.get(preferredCurrency)!] as const)
        : dominant;

      if (selected) {
        detectedCurrency = selected[0];
        stripeAvailableBalance = selected[1].available;
        stripePendingBalance = selected[1].pending;
      }

      // Fallback: if Stripe returned $0 for both available + pending (e.g. after
      // reconnecting with a new account) but platform has recorded orders, use
      // the platform's seller_ledger as the source of truth for display.
      if (stripeAvailableBalance === 0 && stripePendingBalance === 0 && orderPendingUsd > 0) {
        const { data: ledger } = await adminSupabase
          .from("seller_ledger")
          .select("available_amount, pending_amount")
          .eq("creator_id", creator.id)
          .maybeSingle();

        if (ledger) {
          const ledgerTotal = (ledger.available_amount || 0) + (ledger.pending_amount || 0);
          if (ledgerTotal > 0) {
            stripeAvailableBalance = ledger.available_amount || 0;
            stripePendingBalance = ledger.pending_amount || 0;
          } else {
            // Ledger also empty — use order net as pending (funds are settling)
            stripePendingBalance = orderPendingUsd;
            detectedCurrency = "usd";
          }
        } else {
          stripePendingBalance = orderPendingUsd;
          detectedCurrency = "usd";
        }
      }
    } catch (err) {
      console.error("[Payouts] Failed to fetch Stripe balances:", err);
      stripePendingBalance = Math.round(orderPendingUsd * (stripeExchangeRate || 1));
    }
  } else {
    stripePendingBalance = Math.round(orderPendingUsd * (stripeExchangeRate || 1));
  }

  if (
    detectedCurrency !== "usd" &&
    (!stripeExchangeRate || stripeExchangeRate <= 0)
  ) {
    const nativePending = Math.max(0, stripePendingBalance);
    if (nativePending > 0 && orderPendingUsd > 0) {
      stripeExchangeRate = nativePending / orderPendingUsd;
    }
  }

  if (detectedCurrency !== "usd" && orderPendingUsd > 0) {
    stripePendingBalance = Math.round(orderPendingUsd * (stripeExchangeRate || 1));
  }

  // Net earnings = what seller keeps after all fees (Stripe + platform)
  const netEarnings = orderNetUsd;

  // ── 1099-K Tax Data ──────────────────────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;
  let taxData: {
    currentYear: { year: number; grossCents: number; transactionCount: number; isEligible: boolean };
    previousYear: { year: number; grossCents: number; transactionCount: number; isEligible: boolean };
    stripeExpressDashboardUrl: string | null;
  } = {
    currentYear: { year: currentYear, grossCents: 0, transactionCount: 0, isEligible: false },
    previousYear: { year: previousYear, grossCents: 0, transactionCount: 0, isEligible: false },
    stripeExpressDashboardUrl: null,
  };

  try {
    if (productIds.length > 0) {
      const { data: taxOrders } = await adminSupabase
        .from("orders")
        .select("amount_cents, created_at, status")
        .in("product_id", productIds)
        .in("status", ["completed", "refunded", "disputed"])
        .gte("created_at", `${previousYear}-01-01T00:00:00Z`);

      for (const order of taxOrders || []) {
        const orderYear = new Date(order.created_at).getFullYear();
        const bucket = orderYear === currentYear ? taxData.currentYear : orderYear === previousYear ? taxData.previousYear : null;
        if (bucket) {
          bucket.grossCents += order.amount_cents || 0;
          bucket.transactionCount += 1;
        }
      }

      taxData.currentYear.isEligible = taxData.currentYear.grossCents >= 2000000 && taxData.currentYear.transactionCount >= 200;
      taxData.previousYear.isEligible = taxData.previousYear.grossCents >= 2000000 && taxData.previousYear.transactionCount >= 200;
    }

    // Generate Stripe Express Dashboard login link
    if (creator.stripe_account_id) {
      try {
        const loginLink = await stripe.accounts.createLoginLink(creator.stripe_account_id);
        taxData.stripeExpressDashboardUrl = loginLink.url;
      } catch { /* Express dashboard not available */ }
    }
  } catch { /* non-fatal */ }

  // Fetch dispute/negative balance data from ledger
  let negativeBalance = 0;
  let activeDisputeCount = 0;
  let totalDisputedAmount = 0;
  try {
    const { data: ledger } = await adminSupabase
      .from("seller_ledger")
      .select("negative_balance")
      .eq("creator_id", creator.id)
      .maybeSingle();
    negativeBalance = ledger?.negative_balance || 0;

    // Count active disputed orders
    if (productIds.length > 0) {
      const { data: dOrders } = await adminSupabase
        .from("orders")
        .select("amount_cents")
        .in("product_id", productIds)
        .eq("status", "disputed");
      activeDisputeCount = dOrders?.length || 0;
      totalDisputedAmount = (dOrders || []).reduce((s, o) => s + (o.amount_cents || 0), 0);
    }
  } catch { /* non-fatal */ }

  return (
    <div className="h-full overflow-y-auto page-scroll bg-[#fafafa]">
      {/* Announcement Bar — fixed above black header on mobile */}
      <AnnouncementBarMobile>
        <div className="max-w-[1200px] mx-auto flex items-center justify-center gap-2 md:gap-3 text-center">
          <span className="text-[12px] md:text-[14px] text-white/90">
            <span className="font-semibold text-white">Try Pro</span>
            <span className="hidden md:inline">
              {" "}
              — our most popular plan for content creators and businesses.
            </span>
          </span>
          <Link
            href="/upgrade"
            className="relative inline-flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3 py-0.5 md:py-1 bg-gradient-to-r from-gray-900 to-black text-white text-[11px] md:text-[13px] font-medium rounded-full transition-all shrink-0 overflow-hidden group"
          >
            <span className="absolute inset-0 rounded-full border border-white/30 group-hover:border-white/50 transition-colors" />
            <Sparkles className="h-3 w-3 md:h-3.5 md:w-3.5 relative z-10" />
            <span className="relative z-10">Upgrade</span>
          </Link>
        </div>
      </AnnouncementBarMobile>

      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto space-y-6">
        <div>
          <h1 className="text-[24px] sm:text-[28px] font-bold text-[#1a1a2e]">
            Payouts
          </h1>
          <p className="text-[14px] text-[#6b7280] mt-1">
            Manage your earnings and withdraw funds to your bank
          </p>
        </div>

        <PayoutsClient
          creator={{ ...creator, default_currency: detectedCurrency }}
          initialData={{
            totalEarnings,
            totalFees,
            netEarnings,
            pendingAmount: stripePendingBalance,
            availableBalance: stripeAvailableBalance,
            paidOut,
            exchangeRate: stripeExchangeRate,
            negativeBalance,
            activeDisputeCount,
            totalDisputedAmount,
            taxData,
          }}
          initialOrders={allOrders}
        />
      </div>
    </div>
  );
}
