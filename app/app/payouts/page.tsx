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
      .in("status", ["completed", "refunded"])
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
          { limit: 100 },
          { stripeAccount: creator.stripe_account_id },
        ),
      ]);

      // Strategy 1: get exchange_rate directly from a balance transaction
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
    } catch (err) {
      console.error("[Payouts] Failed to fetch Stripe balances:", err);
      // Fallback: use USD order amounts when Stripe API fails
      stripePendingBalance = orderPendingUsd;
    }
  } else {
    // No Stripe: use USD order amounts directly
    stripePendingBalance = orderPendingUsd;
  }

  if (
    detectedCurrency !== "usd" &&
    (!stripeExchangeRate || stripeExchangeRate <= 0)
  ) {
    // Strategy 2: compute from total Stripe balance vs total USD order amounts.
    // Use pending + available to handle funds that moved between states.
    const nativeTotal = Math.max(0, stripePendingBalance + stripeAvailableBalance);
    if (nativeTotal > 0 && orderPendingUsd > 0) {
      stripeExchangeRate = nativeTotal / orderPendingUsd;
    }
  }

  // Strategy 3: if still no rate, use a recent platform transfer to this connected account.
  // Transfers have the USD amount; matched with a balance transaction in native currency,
  // we can derive the exchange rate.
  if (
    detectedCurrency !== "usd" &&
    (!stripeExchangeRate || stripeExchangeRate <= 0) &&
    creator.stripe_account_id
  ) {
    try {
      const transfers = await stripe.transfers.list({
        destination: creator.stripe_account_id,
        limit: 5,
      });
      if (transfers.data.length > 0) {
        // Sum all transfer amounts (in USD) and compare with total native balance
        const totalTransferredUsd = transfers.data.reduce(
          (sum: number, t: any) => sum + (t.amount || 0), 0
        );
        const nativeTotal = Math.max(0, stripePendingBalance + stripeAvailableBalance);
        if (totalTransferredUsd > 0 && nativeTotal > 0) {
          stripeExchangeRate = nativeTotal / totalTransferredUsd;
        }
      }
    } catch {
      // Non-fatal: continue without this fallback
    }
  }

  // Strategy 4: use Stripe's exchange rates API for a live market rate
  if (
    detectedCurrency !== "usd" &&
    (!stripeExchangeRate || stripeExchangeRate <= 0)
  ) {
    try {
      const rates = await (stripe as any).exchangeRates.retrieve("usd");
      const rateToNative = rates?.rates?.[detectedCurrency];
      if (rateToNative && rateToNative > 0) {
        stripeExchangeRate = rateToNative;
      }
    } catch {
      // Non-fatal: Stripe exchange rates API may not be available
    }
  }

  // Net earnings = what seller keeps after all fees (Stripe + platform)
  const netEarnings = orderNetUsd;

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
          }}
          initialOrders={allOrders}
        />
      </div>
    </div>
  );
}
