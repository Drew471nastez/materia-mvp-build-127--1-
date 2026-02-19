import { redirect } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { PayoutsClient } from "./payouts-client";

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
      totalEarnings = paidOrders.reduce(
        (sum, o) => sum + (o.amount_cents || 0),
        0,
      );
      totalFees = paidOrders.reduce((sum, o) => sum + (o.fee_cents || 0), 0);
    }
  }

  // Fetch real Stripe balance for the connected seller account.
  // Important: connected accounts may hold funds in a different currency than creator.default_currency
  // (e.g. a RON account while default_currency says "usd"). We pick the currency with the most funds.
  let stripePendingBalance = 0;
  let stripeAvailableBalance = 0;
  let paidOut = 0;
  let detectedCurrency = (creator.default_currency || "usd").toLowerCase();

  if (creator.stripe_account_id) {
    try {
      const [balance, payouts, account] = await Promise.all([
        stripe.balance.retrieve(
          {},
          { stripeAccount: creator.stripe_account_id },
        ),
        stripe.payouts.list(
          { limit: 100, status: "paid" },
          { stripeAccount: creator.stripe_account_id },
        ),
        stripe.accounts.retrieve(creator.stripe_account_id),
      ]);

      const preferredCurrency = (
        account.default_currency ||
        creator.default_currency ||
        "usd"
      ).toLowerCase();

      // Pick one dominant connected-account balance currency to avoid mixing stale cross-currency cents.
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
        paidOut = payouts.data
          .filter((p) => p.currency?.toLowerCase() === detectedCurrency)
          .reduce((sum, p) => sum + p.amount, 0);
      }
    } catch (err) {
      console.error("[Payouts] Failed to fetch Stripe balance:", err);
    }
  }

  // Cap Stripe pending balance to what non-refunded orders could actually
  // contribute.  When every order has been refunded the cap is 0 — even if
  // Stripe's balance.pending still contains in-flight refund adjustments.
  const completedOrders = allOrders.filter(
    (o: any) => o.status === "completed",
  );
  const maxPossiblePending = completedOrders.reduce(
    (sum: number, o: any) => sum + (o.amount_cents || 0),
    0,
  );
  stripePendingBalance = Math.max(
    0,
    Math.min(stripePendingBalance, maxPossiblePending),
  );

  // No local fallback math here: keep payout balances strictly sourced from Stripe.

  const netEarnings = totalEarnings - totalFees;

  return (
    <div className="h-full overflow-y-auto page-scroll bg-[#fafafa]">
      {/* Announcement Bar */}
      <div className="bg-[#8b5cf6] text-white">
        <div className="py-2 px-4 md:py-2.5">
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
        </div>
      </div>

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
          }}
          initialOrders={allOrders}
        />
      </div>
    </div>
  );
}
