import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { PayoutsClient } from "./payouts-client";
import { AnnouncementBarMobile } from "@/components/app/announcement-bar-mobile";
import { getMarketExchangeRate } from "@/lib/exchange-rate";
import { WaitingArea } from "@/components/ui/activity-spinner";
import { pageUser } from "@/lib/auth/page-user"

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Payouts",
};

export default async function PayoutsPage() {
  const adminSupabase = createAdminClient();

  /* The same answer the /app layout got, through the per-request cache
     (lib/auth/request-scope.ts): no second auth round trip on a full load. */
  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null

  const { data: creator, error: creatorError } = await adminSupabase
    .from("creators")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (creatorError || !creator) {
    redirect("/onboarding");
  }

  return (
    <div className="h-full overflow-y-auto page-scroll bg-[#fafafa] app-page-enter">
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

        {/* The heading and the frame arrive at once; Stripe's answers
            stream in behind them (PayoutsBody). */}
        <Suspense fallback={<WaitingArea className="h-[420px]" />}>
          {/* Called, not written as an element: this project's JSX types do not take
              an async component, and a promise is a child React waits on. */}
          {PayoutsBody({ creator })}
        </Suspense>
      </div>
    </div>
  );
}

/*
  STRIPE DOES NOT STAND BETWEEN THE PRESS AND THE PAGE. Everything below
  waits on Stripe (the balance, the account, the recent transactions, a
  dashboard link) and on a market rate from outside, which on a slow day is
  well over a second. It used to be awaited before anything was sent, so a
  press on Payouts sat on the page you were on, then under the spinner. Now
  the page's heading and frame are sent as soon as the creator row is read,
  the navigation lands on them, and this part streams in behind a
  WaitingArea: nothing for half a second, then the spinner, in the room the
  figures will take. Every read is the one it was.
*/
async function PayoutsBody({ creator }: { creator: any }) {
  const adminSupabase = createAdminClient();

  /*
    FOUR TRIPS, WHERE THERE WERE UP TO ELEVEN. This page asked its questions
    one at a time: the products, then the orders, then Stripe, then the
    ledger, then the tax year's orders, then a dashboard link, then the
    ledger again, then the disputed orders. Most of them need only the
    creator row, or only the product ids, so they are asked together:

      with the creator:   the products, Stripe (balance, account, recent
                          transactions), the dashboard link, and the ledger
                          row (every column this page reads off it, in one
                          read: it was read twice)
      with the products:  the orders, the tax year's orders, the disputed
                          orders

    Every query is the one it was, with the same filters, on the same
    service role client, scoped by the creator row found by the signed in
    user's id. Stripe's answer is used exactly as before, a Stripe failure
    still falls back to the orders' own figures, and a failed tax, link or
    ledger read still leaves its figures at nothing rather than failing the
    page. Only the market rate waits for both Stripe and the orders.
  */
  const stripeAccount: string | null = creator.stripe_account_id || null;
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;

  const [{ data: productsData }, stripeRead, loginLinkUrl, ledger] = await Promise.all([
    adminSupabase.from("products").select("*").eq("creator_id", creator.id),
    stripeAccount
      ? Promise.all([
          stripe.balance.retrieve({}, { stripeAccount }),
          stripe.accounts.retrieve(stripeAccount),
          stripe.balanceTransactions.list({ limit: 10 }, { stripeAccount }),
        ]).then(
          (value) => ({ ok: true as const, value }),
          (error: unknown) => ({ ok: false as const, error }),
        )
      : Promise.resolve(null),
    stripeAccount
      ? stripe.accounts.createLoginLink(stripeAccount).then(
          (link) => link.url as string | null,
          () => null /* Express dashboard not available */,
        )
      : Promise.resolve(null),
    Promise.resolve(
      adminSupabase
        .from("seller_ledger")
        .select("available_amount, pending_amount, negative_balance")
        .eq("creator_id", creator.id)
        .maybeSingle(),
    ).then(
      (r) => r.data as { available_amount: number | null; pending_amount: number | null; negative_balance: number | null } | null,
      () => null,
    ),
  ]);

  const products = productsData || [];
  const productIds = products.map((p) => p.id);

  const nothing = { data: null };
  const [ordersRead, taxRead, disputedRead] = productIds.length > 0
    ? await Promise.all([
        adminSupabase
          .from("orders")
          .select("*")
          .in("product_id", productIds)
          .in("status", ["completed", "refunded", "disputed"])
          .order("created_at", { ascending: false }),
        Promise.resolve(
          adminSupabase
            .from("orders")
            .select("amount_cents, created_at, status")
            .in("product_id", productIds)
            .in("status", ["completed", "refunded", "disputed"])
            .gte("created_at", `${previousYear}-01-01T00:00:00Z`),
        ).then((r) => r, () => nothing),
        Promise.resolve(
          adminSupabase
            .from("orders")
            .select("amount_cents")
            .in("product_id", productIds)
            .eq("status", "disputed"),
        ).then((r) => r, () => nothing),
      ])
    : [nothing, nothing, nothing];

  let totalEarnings = 0;
  let totalFees = 0;
  let totalRefunds = 0;
  let allOrders: any[] = [];

  const ordersData = ordersRead.data as any[] | null;
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

  const orderPendingUsd = Math.max(0, totalEarnings - totalFees);
  const orderNetUsd = Math.max(0, totalEarnings - totalFees - totalRefunds);

  let stripePendingBalance = 0;
  let stripeAvailableBalance = 0;
  const paidOut = 0;
  let detectedCurrency = (creator.default_currency || "usd").toLowerCase();
  let stripeExchangeRate: number | null = null;
  if (stripeRead) {
    try {
      if (!stripeRead.ok) throw stripeRead.error;
      const [balance, account, balanceTx] = stripeRead.value;

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
        if (ledger) {
          const ledgerTotal = (ledger.available_amount || 0) + (ledger.pending_amount || 0);
          if (ledgerTotal > 0) {
            stripeAvailableBalance = ledger.available_amount || 0;
            stripePendingBalance = ledger.pending_amount || 0;
          } else {
            // Ledger also empty: use order net as pending (funds are settling)
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

  // Override with real market rate (ECB via Frankfurter, same source as Google).
  // Stripe's internal rate includes a markup; we display at the actual market rate.
  if (detectedCurrency !== "usd") {
    const marketRate = await getMarketExchangeRate(detectedCurrency, stripeExchangeRate);
    if (marketRate && marketRate > 0) {
      stripeExchangeRate = marketRate;
    }
  }

  if (detectedCurrency !== "usd" && orderPendingUsd > 0) {
    stripePendingBalance = Math.round(orderPendingUsd * (stripeExchangeRate || 1));
  }

  // Net earnings = what seller keeps after all fees (Stripe + platform)
  const netEarnings = orderNetUsd;

  // ── 1099-K Tax Data ──────────────────────────────────────────────────────────
  const taxData: {
    currentYear: { year: number; grossCents: number; transactionCount: number; isEligible: boolean };
    previousYear: { year: number; grossCents: number; transactionCount: number; isEligible: boolean };
    stripeExpressDashboardUrl: string | null;
  } = {
    currentYear: { year: currentYear, grossCents: 0, transactionCount: 0, isEligible: false },
    previousYear: { year: previousYear, grossCents: 0, transactionCount: 0, isEligible: false },
    stripeExpressDashboardUrl: loginLinkUrl,
  };

  if (productIds.length > 0) {
    for (const order of (taxRead.data as { amount_cents: number | null; created_at: string }[] | null) || []) {
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

  // Dispute and negative balance figures, from the ledger row and the disputed orders
  const negativeBalance = ledger?.negative_balance || 0;
  const disputed = (disputedRead.data as { amount_cents: number | null }[] | null) || [];
  const activeDisputeCount = disputed.length;
  const totalDisputedAmount = disputed.reduce((s, o) => s + (o.amount_cents || 0), 0);

  return (
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
  );
}
