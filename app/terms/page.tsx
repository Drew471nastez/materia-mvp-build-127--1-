import type { Metadata } from "next"
import { FileText } from "lucide-react"
import { BackButton } from "@/components/back-button"

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of Service for Storelib Inc. — read our terms and conditions for using the platform.",
}

const TOC = [
  { id: "s1",  label: "1. Introduction and Acceptance" },
  { id: "s2",  label: "2. Definitions" },
  { id: "s3",  label: "3. Eligibility" },
  { id: "s4",  label: "4. Account Registration & Security" },
  { id: "s5",  label: "5. Subscription Plans & Billing" },
  { id: "s6",  label: "6. Seller Terms" },
  { id: "s7",  label: "7. Buyer Terms" },
  { id: "s8",  label: "8. Payments, Payouts & Stripe" },
  { id: "s9",  label: "9. Refund Policy" },
  { id: "s10", label: "10. Intellectual Property" },
  { id: "s11", label: "11. Prohibited Conduct" },
  { id: "s12", label: "12. Account Suspension & Termination" },
  { id: "s13", label: "13. Disclaimers" },
  { id: "s14", label: "14. Limitation of Liability" },
  { id: "s15", label: "15. Indemnification" },
  { id: "s16", label: "16. Dispute Resolution" },
  { id: "s17", label: "17. Affiliate Program" },
  { id: "s18", label: "18. Discover Marketplace" },
  { id: "s19", label: "19. Mobile Applications" },
  { id: "s20", label: "20. Confidentiality" },
  { id: "s21", label: "21. Export Compliance" },
  { id: "s22", label: "22. Force Majeure" },
  { id: "s23", label: "23. Severability" },
  { id: "s24", label: "24. Entire Agreement" },
  { id: "s25", label: "25. Assignment" },
  { id: "s26", label: "26. Waiver" },
  { id: "s27", label: "27. Notices" },
  { id: "s28", label: "28. Contact Information" },
]

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-10 scroll-mt-24">
      <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4 pb-2 border-b border-[#f3f4f6]">{title}</h2>
      <div className="space-y-3 text-[15px] text-[#4b5563] leading-relaxed">{children}</div>
    </section>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="text-[16px] font-semibold text-[#374151] mb-2">{title}</h3>
      <div className="space-y-2 text-[15px] text-[#4b5563] leading-relaxed">{children}</div>
    </div>
  )
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5 mt-2">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  )
}

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Page header */}
      <div className="bg-gradient-to-b from-[#fafafa] to-white border-b border-[#e5e7eb]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <BackButton />
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#8b5cf6]/10 flex items-center justify-center shrink-0 mt-1">
              <FileText className="h-6 w-6 text-[#8b5cf6]" />
            </div>
            <div>
              <h1 className="text-[32px] sm:text-[42px] font-bold text-[#1a1a2e] tracking-tight leading-tight">
                Terms of Service
              </h1>
              <p className="text-[14px] text-[#6b7280] mt-2">
                <span className="font-medium text-[#374151]">Storelib Inc.</span> — storelib.com
              </p>
              <div className="flex flex-wrap gap-4 mt-3 text-[13px] text-[#9ca3af]">
                <span><span className="font-medium text-[#6b7280]">Effective Date:</span> February 28, 2026</span>
                <span><span className="font-medium text-[#6b7280]">Last Updated:</span> February 28, 2026</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="flex gap-12">
          {/* Sticky TOC — desktop only */}
          <aside className="hidden lg:block w-56 shrink-0">
            <div className="sticky top-8">
              <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-3">Contents</p>
              <nav className="space-y-1">
                {TOC.map(item => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="block text-[13px] text-[#6b7280] hover:text-[#1a1a2e] transition-colors py-0.5 leading-snug"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* Content */}
          <main className="flex-1 min-w-0">

            <Section id="s1" title="1. Introduction and Acceptance of Terms">
              <p>
                Welcome to Storelib. These Terms of Service (&ldquo;Terms,&rdquo; &ldquo;Agreement&rdquo;) constitute a legally binding
                agreement between you and Storelib Inc. (&ldquo;Storelib,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) governing your access to
                and use of the Storelib platform, including the website at storelib.com, all associated subdomains,
                the Storelib iOS application, the Storelib Android application, and all related tools, features,
                APIs, and services (collectively, the &ldquo;Services&rdquo;).
              </p>
              <p>
                By creating an account, accessing, or using our Services in any way, you acknowledge that you have
                read, understood, and agree to be bound by these Terms, as well as our{" "}
                <a href="https://storelib.com/privacy" className="text-[#8b5cf6] hover:underline">Privacy Policy</a>,
                which is incorporated herein by reference. If you do not agree to these Terms, you must not use our
                Services.
              </p>
              <p>
                We reserve the right to modify these Terms at any time. When we make material changes, we will
                update the &ldquo;Last Updated&rdquo; date at the top of this page and may notify you by email or through a
                prominent notice on the Services. Your continued use of the Services after any such modification
                constitutes your acceptance of the modified Terms. It is your responsibility to review these Terms
                periodically.
              </p>
            </Section>

            <Section id="s2" title="2. Definitions">
              <p>Throughout these Terms, the following definitions apply:</p>
              <div className="space-y-3 mt-3">
                {[
                  ['"Platform"', 'means the Storelib website (storelib.com), all associated subdomains (e.g., yourstore.storelib.com), the Storelib iOS and Android mobile applications, and all related services, tools, and features.'],
                  ['"User"', 'means any individual or entity that accesses or uses the Platform, including Sellers, Buyers, and general visitors.'],
                  ['"Seller"', '(also referred to as "Creator" or "Entrepreneur") means a User who creates an account on Storelib to list, market, and sell digital products, manage a storefront, operate a OnePage link-in-bio, capture email subscribers, or otherwise use the Platform\'s seller tools.'],
                  ['"Buyer"', '(also referred to as "Customer") means a User who browses, purchases, downloads, or otherwise acquires digital products from Sellers through the Platform.'],
                  ['"Digital Products"', 'means any digital goods, files, downloads, templates, courses, ebooks, presets, sample packs, design assets, software, plugins, or other digital content listed for sale or distribution on the Platform.'],
                  ['"Store"', 'means the customizable online storefront provided to Sellers on the Platform for listing and selling Digital Products.'],
                  ['"OnePage"', 'means the link-in-bio page feature provided to Sellers on the Platform for showcasing links, social profiles, products, and collecting email subscribers.'],
                  ['"Discover"', 'means the public marketplace section of the Platform where Buyers can browse and discover Digital Products from various Sellers.'],
                  ['"Content"', 'means all text, images, graphics, audio, video, data, files, product listings, reviews, messages, and other materials that Users upload, post, transmit, or make available through the Platform.'],
                  ['"Stripe Connect"', 'means the payment processing service provided by Stripe, Inc. ("Stripe") that Storelib uses to process transactions between Buyers and Sellers.'],
                ].map(([term, def], i) => (
                  <p key={i}>
                    <span className="font-semibold text-[#374151]">{term}</span>{" "}{def}
                  </p>
                ))}
              </div>
            </Section>

            <Section id="s3" title="3. Eligibility">
              <SubSection title="3.1 Age Requirement">
                <p>
                  You must be at least 18 years of age (or the age of legal majority in your jurisdiction, whichever
                  is greater) to create an account and use the Services. By creating an account, you represent and
                  warrant that you meet this age requirement. If you are under the required age, you must not use our
                  Services.
                </p>
              </SubSection>
              <SubSection title="3.2 Legal Capacity">
                <p>
                  By using the Services, you represent and warrant that you have the full legal right, power, and
                  authority to enter into this Agreement, to perform your obligations under this Agreement, and to
                  comply with all applicable local, state, national, and international laws, rules, and regulations.
                </p>
              </SubSection>
              <SubSection title="3.3 Account Restrictions">
                <p>
                  You may not use the Services if you have been previously suspended or removed from the Platform,
                  or if you are prohibited from using the Services under applicable law. Storelib reserves the right
                  to refuse service to anyone for any reason at any time.
                </p>
              </SubSection>
            </Section>

            <Section id="s4" title="4. Account Registration and Security">
              <SubSection title="4.1 Account Creation">
                <p>
                  To access certain features of the Services, you must create an account. You may register using
                  your email address and password, or through supported third-party authentication providers (such
                  as Google or Apple Sign-In). You agree to provide accurate, current, and complete information
                  during registration and to update such information as necessary to keep it accurate and complete.
                </p>
              </SubSection>
              <SubSection title="4.2 Account Types">
                <p>
                  Storelib offers different account types, including Seller accounts and Buyer accounts. The
                  features available to you depend on your account type and subscription plan. Account types and
                  their associated features may be modified by Storelib at any time.
                </p>
              </SubSection>
              <SubSection title="4.3 Account Security">
                <p>
                  You are solely responsible for maintaining the confidentiality and security of your account
                  credentials, including your password. You agree to notify Storelib immediately at{" "}
                  <a href="mailto:team@storelib.com" className="text-[#8b5cf6] hover:underline">team@storelib.com</a>{" "}
                  if you become aware of any unauthorized access to or use of your account. Storelib is not liable
                  for any loss or damage arising from your failure to protect your account credentials. You are
                  responsible for all activities that occur under your account, whether or not authorized by you.
                </p>
              </SubSection>
              <SubSection title="4.4 One Account Per Person">
                <p>
                  Each individual or entity may only maintain one Seller account on the Platform unless explicitly
                  authorized by Storelib. Creating multiple accounts to circumvent Platform rules, fees, or
                  restrictions is strictly prohibited and may result in the termination of all associated accounts.
                </p>
              </SubSection>
            </Section>

            <Section id="s5" title="5. Subscription Plans, Fees, and Billing">
              <SubSection title="5.1 Subscription Plans">
                <p>
                  Storelib offers multiple subscription plans for Sellers, including a free plan and paid plans.
                  Each plan provides different features, email limits, and transaction fee rates. The current plans
                  and their features are described on our{" "}
                  <a href="https://storelib.com/pricing" className="text-[#8b5cf6] hover:underline">Pricing page</a>.
                  Storelib reserves the right to change plan features, pricing, and fee structures at any time with
                  reasonable notice to affected Users.
                </p>
              </SubSection>
              <SubSection title="5.2 Transaction Fees">
                <p>
                  Storelib charges a platform transaction fee on each sale made through the Platform. The fee
                  varies based on the Seller&apos;s current subscription plan:
                </p>
                <Ul items={[
                  "Free Plan: 5% + $0.25 per transaction",
                  "Pro Plan: 3% + $0.25 per transaction",
                ]} />
                <p>
                  Sellers who subscribed to a plan that is no longer offered keep that plan&apos;s transaction fee
                  rate for as long as that subscription remains active.
                </p>
                <p>
                  Transaction fees are automatically deducted from each sale via Stripe Connect&apos;s application fee
                  mechanism before the remaining amount is deposited into the Seller&apos;s connected Stripe account.
                  Storelib&apos;s transaction fees are separate from any fees charged by Stripe for payment processing.
                </p>
              </SubSection>
              <SubSection title="5.3 Subscription Billing">
                <p>
                  Paid subscription plans are billed on a monthly recurring basis. By subscribing to a paid plan,
                  you authorize Storelib to charge your designated payment method on a recurring monthly basis until
                  you cancel. All subscription fees are quoted in U.S. dollars (USD) unless otherwise stated.
                </p>
              </SubSection>
              <SubSection title="5.4 Plan Changes">
                <p>
                  You may upgrade, downgrade, or cancel your subscription plan at any time through your account
                  settings. Upgrades take effect immediately, and you will be charged the prorated difference for
                  the remainder of the current billing cycle. Downgrades and cancellations take effect at the end
                  of the current billing cycle.
                </p>
              </SubSection>
              <SubSection title="5.5 No Refunds on Subscriptions">
                <p>
                  Subscription fees are non-refundable except as required by applicable law. If you cancel your
                  subscription, you will continue to have access to paid features until the end of your current
                  billing period, after which your account will revert to the free plan.
                </p>
              </SubSection>
              <SubSection title="5.6 Taxes">
                <p>
                  You are responsible for all applicable taxes, duties, and levies associated with your use of the
                  Services, including sales tax, VAT, GST, and any other taxes that may apply to your transactions.
                  Storelib may collect and remit taxes on your behalf where required by law.
                </p>
              </SubSection>
              <SubSection title="5.7 Stripe Connected Account Agreement">
                <p>
                  Payment processing for Sellers is provided by Stripe and is subject to the{" "}
                  <a href="https://stripe.com/connect-account/legal" target="_blank" rel="noopener noreferrer" className="text-[#8b5cf6] hover:underline">
                    Stripe Connected Account Agreement
                  </a>, which includes the{" "}
                  <a href="https://stripe.com/legal/ssa" target="_blank" rel="noopener noreferrer" className="text-[#8b5cf6] hover:underline">
                    Stripe Services Agreement
                  </a>. By setting up payments on Storelib you agree to those terms, as they may be modified by
                  Stripe from time to time, and you authorize Storelib to instruct Stripe on payments, payouts,
                  refunds and reversals relating to your sales. Storelib is not a bank, a payment institution or a
                  money transmitter, and does not hold your funds on deposit. Continuing to receive payments
                  through the Services is conditional on your agreement with Stripe remaining in force.
                </p>
              </SubSection>
              <SubSection title="5.8 Identity Verification">
                <p>
                  Before a Seller can accept payments, applicable law and the card networks require that the
                  Seller&apos;s identity is verified. Stripe collects and verifies identity information and
                  documents, which may include a government issued identity document, a photograph or selfie
                  processed with biometric technology, a date of birth, an address, and for a business its
                  registration and beneficial ownership details. That information is collected by and provided
                  directly to Stripe; Storelib does not receive or store identity documents or biometric data. See
                  the <a href="/privacy" className="text-[#8b5cf6] hover:underline">Privacy Policy</a>.
                </p>
                <p>
                  Verification is required, not optional. Checkout remains closed and payouts remain unavailable
                  until verification is complete, and Stripe may require further information at any time as a
                  Seller&apos;s activity changes. Where required information is not provided by the deadline given,
                  charges or payouts may be paused or the connected account may be closed.
                </p>
              </SubSection>
              <SubSection title="5.9 Settlement, Holds, and Payouts">
                <p>
                  Funds from a sale are not available immediately. Each payment settles after a period set by
                  Stripe for the Seller&apos;s country and account, after which the amount becomes available in the
                  Seller&apos;s balance, and the Seller may request a payout to their bank account. Payouts are
                  made in the currency of the connected account. Storelib does not guarantee any settlement or
                  arrival time, and Stripe may hold, delay or reverse funds where required by law, by the card
                  networks, or for risk reasons.
                </p>
              </SubSection>
              <SubSection title="5.10 Chargebacks, Disputes, and Negative Balances">
                <p>
                  A Buyer may dispute a payment with their card issuer. Where that happens, the disputed amount is
                  withdrawn by the card networks while the dispute is decided, and Storelib may reverse the
                  corresponding amount from the Seller&apos;s share of that sale, up to the amount the Seller
                  received for it. Storelib responds to disputes on the Seller&apos;s behalf and may include
                  evidence the Seller supplies; the Seller&apos;s card issuer, not Storelib or Stripe, decides the
                  outcome. If the dispute is resolved in the Seller&apos;s favour, the reversed amount is returned
                  to their balance.
                </p>
                <p>
                  Sellers remain responsible for refunds, chargebacks and related fees arising from their sales.
                  Where these exceed the Seller&apos;s available balance, the balance may become negative and is
                  recovered from subsequent sales; payouts are unavailable while a balance is negative. Storelib
                  may suspend payouts or close a connected account where chargeback levels are excessive or where
                  it reasonably suspects fraud.
                </p>
              </SubSection>
            </Section>

            <Section id="s6" title="6. Seller Terms">
              <SubSection title="6.1 Seller Obligations">
                <p>As a Seller on Storelib, you agree to:</p>
                <Ul items={[
                  "Provide accurate and truthful information in your account profile, store, product listings, and all Content you publish on the Platform.",
                  "Ensure that all Digital Products you list for sale are of adequate quality, function as described, and meet the reasonable expectations of Buyers.",
                  "Respond to Buyer inquiries and support requests in a timely and professional manner.",
                  "Comply with all applicable laws, regulations, and third-party rights in connection with your use of the Platform and the sale of your Digital Products.",
                  "Not engage in deceptive, misleading, or fraudulent practices of any kind.",
                ]} />
              </SubSection>
              <SubSection title="6.2 Product Listings">
                <p>
                  Sellers may create product listings that include a title, description, pricing, cover images,
                  product gallery images, and digital files for download. All product listings must accurately
                  represent the Digital Product being offered. Storelib reserves the right to remove, modify, or
                  restrict any product listing that violates these Terms, our content policies, or applicable law.
                </p>
              </SubSection>
              <SubSection title="6.3 Pricing">
                <p>
                  Sellers set their own prices for their Digital Products. Prices must be displayed in a clear and
                  accurate manner. Sellers may offer discount codes, sales, and promotions at their discretion.
                  Sellers may also offer free products (priced at $0.00), which still require Buyers to provide
                  their email address for delivery.
                </p>
              </SubSection>
              <SubSection title="6.4 Digital Product Delivery">
                <p>
                  When a Buyer purchases a Digital Product, Storelib automatically delivers the product via email
                  with download links and a receipt page. Sellers are responsible for ensuring that all uploaded
                  files are complete, functional, and free from viruses or malware.
                </p>
              </SubSection>
              <SubSection title="6.5 Intellectual Property">
                <p>
                  Sellers represent and warrant that they own or have obtained all necessary rights, licenses,
                  permissions, and consents to list, sell, and distribute their Digital Products on the Platform.
                  If Storelib receives a notice of intellectual property infringement regarding a Seller&apos;s product
                  (including a DMCA takedown notice), Storelib may remove the product from the Platform immediately
                  and may suspend or terminate the Seller&apos;s account in cases of repeated infringement.
                </p>
              </SubSection>
              <SubSection title="6.6 Prohibited Products">
                <p>Sellers must not list or sell any of the following on the Platform:</p>
                <Ul items={[
                  "Products that infringe upon any third-party intellectual property rights",
                  "Stolen, pirated, or illegally obtained content",
                  "Products that contain malware, viruses, spyware, or other harmful code",
                  "Products that promote hate, violence, discrimination, harassment, or illegal activity",
                  "Products that contain child sexual abuse material or exploitation content of any kind",
                  "Products that are misleading, deceptive, or fraudulent",
                  "Products that violate any applicable law or regulation",
                  "Weapons, drugs, controlled substances, or any illegal items",
                  "Personal data, credentials, or private information of other individuals",
                  "Products designed to facilitate spam, phishing, or other malicious activities",
                  "Resale of products originally purchased on Storelib or other platforms without the original creator's explicit permission",
                ]} />
              </SubSection>
              <SubSection title="6.7 Email System Usage">
                <p>Sellers who use Storelib&apos;s built-in email system agree to:</p>
                <Ul items={[
                  "Only send emails to users who have voluntarily subscribed or purchased a product (no purchased or scraped email lists).",
                  "Include truthful and non-misleading content in all emails.",
                  "Comply with all applicable anti-spam laws, including CAN-SPAM, GDPR, and CASL.",
                  "Not send emails that contain malware, phishing attempts, or deceptive content.",
                  "Respect the email sending limits associated with their subscription plan.",
                ]} />
              </SubSection>
              <SubSection title="6.8 Store and OnePage Content">
                <p>
                  Sellers are responsible for all Content displayed on their Store and OnePage pages. Sellers must
                  not include content that violates these Terms, applicable law, or third-party rights.
                </p>
              </SubSection>
              <SubSection title="6.9 Custom Domains">
                <p>
                  Sellers on eligible plans may connect a custom domain to their Storelib store. Sellers are
                  responsible for owning or having the right to use the custom domain and for maintaining the domain
                  registration. Storelib is not responsible for any issues arising from the Seller&apos;s custom domain
                  configuration, expiration, or transfer.
                </p>
              </SubSection>
            </Section>

            <Section id="s7" title="7. Buyer Terms">
              <SubSection title="7.1 Purchasing Digital Products">
                <p>
                  When you purchase a Digital Product on Storelib, you are entering into a transaction with the
                  Seller of that product, not with Storelib. Storelib acts as the platform that facilitates the
                  transaction between you and the Seller, processing payments through Stripe Connect on behalf of
                  the Seller.
                </p>
              </SubSection>
              <SubSection title="7.2 License to Digital Products">
                <p>
                  Unless otherwise specified by the Seller, when you purchase a Digital Product, you receive a
                  personal, non-exclusive, non-transferable, revocable license to use the Digital Product for your
                  own personal or commercial purposes as described in the product listing. You may not resell,
                  redistribute, sublicense, or share the Digital Product with third parties unless the Seller&apos;s
                  license terms explicitly permit such use.
                </p>
              </SubSection>
              <SubSection title="7.3 Download Access">
                <p>
                  After purchasing a Digital Product, you will receive download access via email and/or through a
                  receipt page on the Platform. Download links may be subject to expiration and/or download limits.
                  It is your responsibility to download your purchased products within the available timeframe.
                </p>
              </SubSection>
              <SubSection title="7.4 Reviews and Ratings">
                <p>
                  Buyers may submit reviews and ratings for Digital Products they have purchased. Reviews must be
                  honest, accurate, and based on your genuine experience with the product. Storelib reserves the
                  right to remove reviews that violate these Terms.
                </p>
              </SubSection>
              <SubSection title="7.5 No Buyer Account Required">
                <p>
                  Buyers may complete purchases without creating a full account. An email address is required for
                  all transactions (including free products) to facilitate delivery and communication.
                </p>
              </SubSection>
            </Section>

            <Section id="s8" title="8. Payments, Payouts, and Stripe Connect">
              <SubSection title="8.1 Payment Processing">
                <p>
                  All payments on the Platform are processed through Stripe Connect. Storelib does not directly
                  process, handle, or store Buyer payment card information. By making a purchase, you agree to
                  Stripe&apos;s terms of service and privacy policy. Accepted payment methods include credit cards,
                  debit cards, Apple Pay, Google Pay, and other methods supported by Stripe.
                </p>
              </SubSection>
              <SubSection title="8.2 Seller Payouts">
                <p>
                  To receive payouts, Sellers must connect a Stripe account via Stripe Connect. Storelib
                  automatically deducts the applicable platform transaction fee from each sale before the remaining
                  amount is transferred to the Seller&apos;s connected Stripe account. Payouts are processed according
                  to Stripe&apos;s standard payout schedule for the Seller&apos;s region.
                </p>
              </SubSection>
              <SubSection title="8.3 Payout Holds and Disputes">
                <p>Storelib and/or Stripe may hold, delay, or reverse payouts in the following circumstances:</p>
                <Ul items={[
                  "A Buyer initiates a payment dispute (chargeback) with their bank or card issuer",
                  "Suspected fraudulent activity on the Seller's account",
                  "Violation of these Terms or Stripe's terms of service",
                  "Required by law or regulation",
                  "A refund is issued for a transaction",
                ]} />
              </SubSection>
              <SubSection title="8.4 Currency">
                <p>
                  All prices and fees on the Platform are denominated in U.S. dollars (USD) unless otherwise
                  stated. Currency conversion for international transactions is handled by Stripe.
                </p>
              </SubSection>
            </Section>

            <Section id="s9" title="9. Refund Policy">
              <SubSection title="9.1 Digital Products Are Non-Refundable by Default">
                <p>
                  Due to the nature of digital products (which can be downloaded and copied immediately upon
                  purchase), all sales on Storelib are final by default.
                </p>
              </SubSection>
              <SubSection title="9.2 Seller-Initiated Refunds">
                <p>
                  Sellers may, at their sole discretion, issue refunds to Buyers. Sellers can process refunds
                  through their Storelib dashboard, which initiates the refund through Stripe Connect.
                </p>
              </SubSection>
              <SubSection title="9.3 Exceptions and Buyer Protection">
                <p>A Buyer may request a refund or file a complaint if:</p>
                <Ul items={[
                  "The Digital Product was not delivered or the download link did not work",
                  "The Digital Product was materially different from what was described in the listing",
                  "The Digital Product contained malware or harmful code",
                  "The transaction was unauthorized or fraudulent",
                ]} />
                <p>
                  In such cases, Buyers should first contact the Seller directly. If unresolved, the Buyer may
                  contact Storelib at{" "}
                  <a href="mailto:team@storelib.com" className="text-[#8b5cf6] hover:underline">team@storelib.com</a>{" "}
                  for assistance.
                </p>
              </SubSection>
              <SubSection title="9.4 Chargeback Policy">
                <p>
                  If a Buyer files a chargeback with their bank, the chargeback will be processed through Stripe.
                  The Seller is responsible for any chargeback fees imposed by Stripe. Storelib encourages Buyers
                  to contact the Seller or Storelib support before filing a chargeback.
                </p>
              </SubSection>
            </Section>

            <Section id="s10" title="10. Intellectual Property">
              <SubSection title="10.1 Storelib&apos;s Intellectual Property">
                <p>
                  The Platform, including its design, code, functionality, branding, logos, trademarks, and all
                  proprietary content created by Storelib, is the exclusive property of Storelib Inc. and is
                  protected by copyright, trademark, and other intellectual property laws.
                </p>
              </SubSection>
              <SubSection title="10.2 User Content License">
                <p>
                  By uploading, posting, or making Content available through the Platform, you grant Storelib a
                  non-exclusive, worldwide, royalty-free, sublicensable license to use, display, reproduce,
                  distribute, and transmit such Content solely for the purposes of operating, providing, promoting,
                  and improving the Services. You retain all ownership rights to your Content.
                </p>
              </SubSection>
              <SubSection title="10.3 DMCA and Copyright Infringement">
                <p>
                  If you believe that your copyrighted work has been used in a way that constitutes copyright
                  infringement, you may submit a DMCA notification to:{" "}
                  <a href="mailto:legal@storelib.com" className="text-[#8b5cf6] hover:underline">legal@storelib.com</a>.
                  Your notice must include a description of the copyrighted work, the location of the infringing
                  material, your contact information, a good faith belief statement, and your signature under
                  penalty of perjury.
                </p>
              </SubSection>
              <SubSection title="10.4 Counter-Notification">
                <p>
                  If you believe that your Content was removed by mistake or misidentification, you may submit a
                  counter-notification to{" "}
                  <a href="mailto:legal@storelib.com" className="text-[#8b5cf6] hover:underline">legal@storelib.com</a>{" "}
                  containing the required information under the DMCA.
                </p>
              </SubSection>
            </Section>

            <Section id="s11" title="11. Prohibited Conduct">
              <p>You agree not to engage in any of the following activities while using the Platform:</p>
              <Ul items={[
                "Violating any applicable law, regulation, or third-party right",
                "Using the Services for any fraudulent, deceptive, or illegal purpose",
                "Impersonating any person or entity, or falsely stating your affiliation",
                "Interfering with, disrupting, or attempting to gain unauthorized access to the Platform, its servers, or networks",
                "Using automated tools, bots, scrapers, or crawlers without our express written permission",
                "Attempting to reverse engineer, decompile, or disassemble any part of the Platform",
                "Uploading, transmitting, or distributing any viruses, malware, spyware, or other harmful code",
                "Harassing, threatening, bullying, or intimidating other Users",
                "Collecting or harvesting personal information of other Users without their consent",
                "Using the Platform to send spam, unsolicited communications, or bulk messaging",
                "Circumventing any security features, access controls, or usage limits of the Platform",
                "Creating multiple accounts to evade bans, suspensions, fees, or other Platform restrictions",
                "Manipulating reviews, ratings, search results, or analytics data",
                "Using the Platform in any manner that infringes upon the rights of Storelib or any third party",
              ]} />
            </Section>

            <Section id="s12" title="12. Account Suspension and Termination">
              <SubSection title="12.1 Termination by You">
                <p>
                  You may delete your account at any time through your account settings or by contacting us at{" "}
                  <a href="mailto:team@storelib.com" className="text-[#8b5cf6] hover:underline">team@storelib.com</a>.
                  If you have an active paid subscription, cancellation does not entitle you to a refund of any
                  prepaid fees.
                </p>
              </SubSection>
              <SubSection title="12.2 Suspension or Termination by Storelib">
                <p>
                  Storelib reserves the right to suspend, restrict, or terminate your account at any time, with or
                  without notice, including for violation of these Terms, engaging in fraudulent or illegal
                  activity, repeated copyright infringement, failure to complete Stripe Connect verification, or
                  extended inactivity.
                </p>
              </SubSection>
              <SubSection title="12.3 Effect of Termination">
                <p>Upon termination of your account:</p>
                <Ul items={[
                  "Your access to the Platform and all associated features will be immediately revoked",
                  "Your store, product listings, and OnePage will be taken offline",
                  "Any pending payouts may be held for a reasonable period to account for potential chargebacks, refunds, or disputes",
                  "Buyers who previously purchased your products will retain access to their purchased downloads for a reasonable period",
                ]} />
              </SubSection>
              <SubSection title="12.4 Survival">
                <p>
                  The following sections survive termination of your account: Definitions, Intellectual Property,
                  Disclaimers, Limitation of Liability, Indemnification, Governing Law, and any other provisions
                  that by their nature should survive termination.
                </p>
              </SubSection>
            </Section>

            <Section id="s13" title="13. Disclaimers">
              <SubSection title='13.1 "As Is" Basis'>
                <p className="uppercase font-medium text-[#374151]">
                  The Services are provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis without warranties of any
                  kind, either express or implied. To the fullest extent permitted by applicable law, Storelib
                  disclaims all warranties, including but not limited to implied warranties of merchantability,
                  fitness for a particular purpose, and non-infringement.
                </p>
              </SubSection>
              <SubSection title="13.2 No Guarantee">
                <p>Storelib does not warrant or guarantee that:</p>
                <Ul items={[
                  "The Services will be uninterrupted, timely, secure, or error-free",
                  "The results obtained from the use of the Services will be accurate or reliable",
                  "Any defects in the Services will be corrected",
                  "Any specific level of sales, revenue, or traffic will be achieved by Sellers",
                ]} />
              </SubSection>
              <SubSection title="13.3 Third-Party Content">
                <p>
                  Storelib does not endorse, guarantee, or assume responsibility for any Digital Products, Content,
                  or services offered by Sellers on the Platform. Buyers acknowledge that they are purchasing
                  Digital Products from independent Sellers and that Storelib is not the seller of those products.
                </p>
              </SubSection>
            </Section>

            <Section id="s14" title="14. Limitation of Liability">
              <SubSection title="14.1 Exclusion of Damages">
                <p className="uppercase font-medium text-[#374151]">
                  To the maximum extent permitted by applicable law, in no event shall Storelib, its officers,
                  directors, employees, agents, or affiliates be liable for any indirect, incidental, special,
                  consequential, exemplary, or punitive damages, including but not limited to damages for loss of
                  profits, revenue, goodwill, data, or other intangible losses, arising out of or related to your
                  use of or inability to use the Services.
                </p>
              </SubSection>
              <SubSection title="14.2 Cap on Liability">
                <p className="uppercase font-medium text-[#374151]">
                  To the maximum extent permitted by applicable law, Storelib&apos;s total aggregate liability to you
                  for all claims arising out of or related to these Terms or the Services shall not exceed the
                  greater of (A) the amount you paid to Storelib in subscription fees during the twelve (12) months
                  preceding the claim, or (B) one hundred U.S. dollars ($100.00).
                </p>
              </SubSection>
            </Section>

            <Section id="s15" title="15. Indemnification">
              <p>
                You agree to indemnify, defend, and hold harmless Storelib, its officers, directors, employees,
                agents, and affiliates from and against any and all claims, liabilities, damages, losses, costs,
                and expenses (including reasonable attorneys&apos; fees) arising out of or related to:
              </p>
              <Ul items={[
                "Your use of or access to the Services",
                "Your violation of these Terms or any applicable law or regulation",
                "Your Content, including any Digital Products you list or sell on the Platform",
                "Your infringement of any intellectual property or other rights of any third party",
                "Any dispute between you and another User (including disputes between Sellers and Buyers)",
                "Any tax liability arising from your use of the Services",
              ]} />
            </Section>

            <Section id="s16" title="16. Dispute Resolution">
              <SubSection title="16.1 Disputes Between Buyers and Sellers">
                <p>
                  Disputes regarding Digital Products, including product quality, description accuracy, delivery,
                  and refunds, are primarily between the Buyer and the Seller. Storelib encourages parties to
                  resolve disputes directly. Storelib may, at its sole discretion, mediate disputes, but is under
                  no obligation to do so.
                </p>
              </SubSection>
              <SubSection title="16.2 Disputes with Storelib">
                <p>
                  If you have a dispute with Storelib, you agree to first attempt to resolve it informally by
                  contacting us at{" "}
                  <a href="mailto:team@storelib.com" className="text-[#8b5cf6] hover:underline">team@storelib.com</a>.
                  If the dispute is not resolved within thirty (30) days, either party may pursue formal resolution.
                </p>
              </SubSection>
              <SubSection title="16.3 Governing Law">
                <p>
                  These Terms and any disputes arising out of or related to these Terms or the Services shall be
                  governed by and construed in accordance with the laws of the State of Delaware, United States,
                  without regard to its conflict of laws principles.
                </p>
              </SubSection>
              <SubSection title="16.4 Arbitration Agreement">
                <p>
                  Any dispute that cannot be resolved informally shall be resolved by binding arbitration
                  administered under the rules of the American Arbitration Association (AAA). The arbitration
                  shall be conducted in the English language. The arbitrator&apos;s award shall be final and binding
                  and may be entered as a judgment in any court of competent jurisdiction.
                </p>
              </SubSection>
              <SubSection title="16.5 Class Action Waiver">
                <p className="uppercase font-medium text-[#374151]">
                  To the fullest extent permitted by applicable law, you agree that any dispute resolution
                  proceedings will be conducted only on an individual basis and not in a class, consolidated, or
                  representative action.
                </p>
              </SubSection>
            </Section>

            <Section id="s17" title="17. Affiliate Program">
              <SubSection title="17.1 Overview">
                <p>
                  Storelib offers an affiliate program that allows Users to earn commissions by referring new
                  Sellers to the Platform. Participation is subject to additional terms communicated at the time
                  of enrollment.
                </p>
              </SubSection>
              <SubSection title="17.2 Affiliate Conduct">
                <p>
                  Affiliates must not use deceptive, misleading, or fraudulent methods to generate referrals,
                  including misleading advertising, impersonation, spam, cookie stuffing, self-referrals, or any
                  form of artificial traffic generation. Storelib reserves the right to revoke affiliate status
                  and withhold commissions for violations.
                </p>
              </SubSection>
              <SubSection title="17.3 Commission Payments">
                <p>
                  Affiliate commissions are paid out according to the schedule and terms specified in the affiliate
                  program documentation. Storelib reserves the right to modify commission rates, payment schedules,
                  and program terms at any time with reasonable notice.
                </p>
              </SubSection>
            </Section>

            <Section id="s18" title="18. Discover Marketplace">
              <SubSection title="18.1 Public Listings">
                <p>
                  Products listed on the Storelib Discover marketplace are publicly visible to all visitors. By
                  listing a product on the Platform, Sellers consent to their product appearing in the Discover
                  section, in search results, and in any promotional materials for the Platform.
                </p>
              </SubSection>
              <SubSection title="18.2 Ranking and Display">
                <p>
                  Storelib determines the order and display of products in the Discover section at its sole
                  discretion. Factors may include product quality, ratings, sales history, recency, and relevance.
                  Storelib does not guarantee any specific placement or visibility for any product.
                </p>
              </SubSection>
              <SubSection title="18.3 Removal from Discover">
                <p>
                  Storelib reserves the right to remove any product from the Discover section at any time for any
                  reason, including violation of these Terms, quality concerns, or complaints from Users.
                </p>
              </SubSection>
            </Section>

            <Section id="s19" title="19. Mobile Applications">
              <SubSection title="19.1 App Store Terms">
                <p>
                  The Storelib iOS and Android applications are available through the Apple App Store and Google
                  Play Store, respectively. Your use of these applications is also subject to the terms and
                  conditions of the applicable app store. In the event of a conflict between these Terms and the
                  app store terms, these Terms shall control to the extent permitted by the app store.
                </p>
              </SubSection>
              <SubSection title="19.2 App Updates">
                <p>
                  We may release updates to our mobile applications from time to time. Some updates may be required
                  for continued use of the app. You agree to install updates as they become available to ensure the
                  best experience and security.
                </p>
              </SubSection>
              <SubSection title="19.3 Push Notifications">
                <p>
                  Our mobile applications may send push notifications related to your account activity, sales,
                  orders, and Platform updates. You can manage push notification preferences through your device
                  settings at any time.
                </p>
              </SubSection>
            </Section>

            <Section id="s20" title="20. Confidentiality">
              <SubSection title="20.1 Confidential Information">
                <p>
                  In the course of using the Platform, you may receive confidential information from Storelib or
                  from other Users. Confidential information includes business strategies, technical information,
                  financial data, and non-public product or feature information shared by Storelib.
                </p>
              </SubSection>
              <SubSection title="20.2 Obligations">
                <p>
                  You agree to keep all confidential information strictly confidential and not to disclose it to
                  any third party without prior written consent. You agree to use confidential information only for
                  the purposes for which it was disclosed.
                </p>
              </SubSection>
            </Section>

            <Section id="s21" title="21. Export Compliance">
              <p>
                You agree to comply with all applicable export and re-export control laws and regulations,
                including the Export Administration Regulations, trade and economic sanctions maintained by the
                U.S. Treasury Department&apos;s Office of Foreign Assets Control (OFAC), and the International Traffic
                in Arms Regulations. You represent and warrant that you are not located in, under the control of,
                or a national or resident of any country to which the United States has embargoed goods or services.
              </p>
            </Section>

            <Section id="s22" title="22. Force Majeure">
              <p>
                Storelib shall not be liable for any failure or delay in performing its obligations under these
                Terms if such failure or delay results from circumstances beyond Storelib&apos;s reasonable control,
                including but not limited to acts of God, natural disasters, war, terrorism, pandemics, government
                actions, power failures, internet disruptions, or failures of third-party service providers
                (including Stripe).
              </p>
            </Section>

            <Section id="s23" title="23. Severability">
              <p>
                If any provision of these Terms is found to be invalid, illegal, or unenforceable by a court of
                competent jurisdiction, such invalidity shall not affect any other provision, which shall remain
                in full force and effect. The invalid provision shall be modified to the minimum extent necessary
                to make it valid, legal, and enforceable while preserving its original intent.
              </p>
            </Section>

            <Section id="s24" title="24. Entire Agreement">
              <p>
                These Terms, together with the Privacy Policy and any other legal notices or agreements published
                by Storelib on the Platform, constitute the entire agreement between you and Storelib regarding
                your use of the Services. These Terms supersede all prior agreements, communications, and
                understandings, whether written or oral, regarding the subject matter hereof.
              </p>
            </Section>

            <Section id="s25" title="25. Assignment">
              <p>
                You may not assign, transfer, or delegate your rights or obligations under these Terms without
                Storelib&apos;s prior written consent. Storelib may freely assign, transfer, or delegate its rights
                and obligations under these Terms without restriction and without notice to you.
              </p>
            </Section>

            <Section id="s26" title="26. Waiver">
              <p>
                The failure of Storelib to enforce any provision of these Terms shall not constitute a waiver of
                such provision or any other provision. No waiver of any term shall be deemed a further or
                continuing waiver of such term or any other term.
              </p>
            </Section>

            <Section id="s27" title="27. Notices">
              <p>
                Storelib may provide you with notices, including those regarding changes to these Terms, by email
                to the address associated with your account, by posting on the Platform, or by push notification
                through our mobile applications. You are responsible for ensuring that your email address on file
                is accurate and current.
              </p>
            </Section>

            <Section id="s28" title="28. Contact Information">
              <p>
                If you have any questions, concerns, or feedback regarding these Terms of Service, please contact
                us:
              </p>
              <div className="bg-[#fafafa] border border-[#f3f4f6] rounded-xl p-4 mt-3 space-y-1 text-[14px]">
                <p>
                  <span className="font-medium text-[#374151]">General:</span>{" "}
                  <a href="mailto:team@storelib.com" className="text-[#8b5cf6] hover:underline">team@storelib.com</a>
                </p>
                <p>
                  <span className="font-medium text-[#374151]">Legal Inquiries:</span>{" "}
                  <a href="mailto:legal@storelib.com" className="text-[#8b5cf6] hover:underline">legal@storelib.com</a>
                </p>
                <p>
                  <span className="font-medium text-[#374151]">Website:</span>{" "}
                  <a href="https://storelib.com" className="text-[#8b5cf6] hover:underline">https://storelib.com</a>
                </p>
              </div>
              <p className="text-[13px] text-[#9ca3af] mt-4">
                &copy; 2026 Storelib Inc. All rights reserved. storelib.com
              </p>
            </Section>

          </main>
        </div>
      </div>
    </div>
  )
}
