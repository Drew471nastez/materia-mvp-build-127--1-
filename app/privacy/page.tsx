import { Shield } from "lucide-react"
import { BackButton } from "@/components/back-button"
import { CookieTable } from "@/components/legal/cookie-table"

const TOC = [
  { id: "s1", label: "1. Introduction" },
  { id: "s2", label: "2. Who We Are" },
  { id: "s3", label: "3. Information We Collect" },
  { id: "s4", label: "4. How We Use Your Information" },
  { id: "s5", label: "5. Legal Bases (GDPR)" },
  { id: "s6", label: "6. Payments & Stripe" },
  { id: "s7", label: "7. Analytics & Cookies" },
  { id: "s8", label: "8. Email System" },
  { id: "s9", label: "9. How We Share Information" },
  { id: "s10", label: "10. Data Retention" },
  { id: "s11", label: "11. Data Security" },
  { id: "s12", label: "12. Your Rights" },
  { id: "s13", label: "13. International Transfers" },
  { id: "s14", label: "14. Children's Privacy" },
  { id: "s15", label: "15. Mobile Applications" },
  { id: "s16", label: "16. Discover Marketplace" },
  { id: "s17", label: "17. Third-Party Links" },
  { id: "s18", label: '18. "Do Not Sell"' },
  { id: "s19", label: "19. Affiliate Program" },
  { id: "s20", label: "20. Policy Changes" },
  { id: "s21", label: "21. Contact Us" },
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

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#fafafa] to-white border-b border-[#e5e7eb]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <BackButton />
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#8b5cf6]/10 flex items-center justify-center shrink-0 mt-1">
              <Shield className="h-6 w-6 text-[#8b5cf6]" />
            </div>
            <div>
              <h1 className="text-[32px] sm:text-[42px] font-bold text-[#1a1a2e] tracking-tight leading-tight">
                Privacy Policy
              </h1>
              <p className="text-[14px] text-[#6b7280] mt-2">
                <span className="font-medium text-[#374151]">Storelib Inc.</span> — storelib.com
              </p>
              <div className="flex flex-wrap gap-4 mt-3 text-[13px] text-[#9ca3af]">
                <span><span className="font-medium text-[#6b7280]">Effective Date:</span> 3 March 2026</span>
                <span><span className="font-medium text-[#6b7280]">Last Updated:</span> 3 March 2026</span>
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

          {/* Policy content */}
          <main className="flex-1 min-w-0">

            <Section id="s1" title="1. Introduction">
              <p>
                Welcome to Storelib. This Privacy Policy explains how Storelib Inc. ("Storelib," "we," "us," or "our")
                collects, uses, discloses, and protects your personal information when you use our platform, services,
                and applications.
              </p>
              <p>This Privacy Policy applies to all users of the Storelib platform, including:</p>
              <Ul items={[
                "The Storelib website at storelib.com and all associated subdomains (e.g., yourstore.storelib.com)",
                "The Storelib iOS application available on the Apple App Store",
                "The Storelib Android application available on the Google Play Store",
                "All related tools, features, APIs, and services provided by Storelib (collectively, the \"Services\")",
              ]} />
              <p>
                Storelib is a digital product marketplace platform that enables creators and entrepreneurs
                ("Sellers") to sell digital products, manage links, capture emails, and grow an audience, while
                enabling customers ("Buyers") to discover and purchase digital products. By accessing or using our
                Services, you agree to the terms of this Privacy Policy. If you do not agree, please do not use our
                Services.
              </p>
              <p>
                We encourage you to read this Privacy Policy carefully. If you have any questions, contact us at{" "}
                <a href="mailto:privacy@storelib.com" className="text-[#8b5cf6] hover:underline">privacy@storelib.com</a>{" "}
                or{" "}
                <a href="mailto:team@storelib.com" className="text-[#8b5cf6] hover:underline">team@storelib.com</a>.
              </p>
            </Section>

            <Section id="s2" title="2. Who We Are (Data Controller)">
              <p>
                Storelib Inc. is the data controller responsible for your personal information. For the purposes of
                the EU General Data Protection Regulation (GDPR), the UK Data Protection Act 2018, and other
                applicable data protection laws:
              </p>
              <div className="bg-[#fafafa] border border-[#f3f4f6] rounded-xl p-4 mt-3 space-y-1 text-[14px]">
                <p><span className="font-medium text-[#374151]">Company Name:</span> Storelib Inc.</p>
                <p><span className="font-medium text-[#374151]">Website:</span>{" "}
                  <a href="https://storelib.com" className="text-[#8b5cf6] hover:underline">https://storelib.com</a>
                </p>
                <p><span className="font-medium text-[#374151]">Privacy Email:</span>{" "}
                  <a href="mailto:privacy@storelib.com" className="text-[#8b5cf6] hover:underline">privacy@storelib.com</a>
                </p>
                <p><span className="font-medium text-[#374151]">General Support:</span>{" "}
                  <a href="mailto:team@storelib.com" className="text-[#8b5cf6] hover:underline">team@storelib.com</a>
                </p>
              </div>
              <p>
                If you are a Seller on the platform, you may also act as an independent data controller with respect
                to the personal information of your own customers. You are responsible for your own compliance with
                applicable privacy laws regarding any data you collect through your Storelib store.
              </p>
            </Section>

            <Section id="s3" title="3. Information We Collect">
              <p>
                We collect different types of information depending on how you interact with our Services, whether
                you are a Seller, a Buyer, or a general visitor.
              </p>

              <SubSection title="3.1 Information You Provide Directly">
                <p><strong>For Sellers (Creators/Entrepreneurs):</strong></p>
                <Ul items={[
                  "Full name, email address, and profile photo",
                  "Username and password (encrypted)",
                  "Store name, OnePage URL, and custom domain settings",
                  "Address and business information (required for Stripe verification)",
                  "Identity documents, and in a web browser a selfie, collected and held by Stripe, never by Storelib (see section 6.3)",
                  "Financial and banking information provided to Stripe for payout purposes",
                  "Product listings, descriptions, pricing, images, and digital files uploaded for sale",
                  "Email content created through the Storelib email system (newsletters, broadcast emails)",
                  "Timezone, language preferences, and dashboard settings",
                  "Billing plan and subscription information",
                ]} />
                <p className="mt-3"><strong>For Buyers (Customers):</strong></p>
                <Ul items={[
                  "Full name and email address (provided at checkout)",
                  "Payment information — processed and stored securely by Stripe; Storelib does not store your full card details",
                  "Purchase history and transaction records",
                  "Product reviews and ratings submitted on seller product pages",
                  "Email address when subscribing to a Seller's newsletter or email list",
                  "Optional tip amounts added during checkout",
                ]} />
                <p className="mt-3"><strong>For All Users:</strong></p>
                <Ul items={[
                  "Any information you provide when contacting us for support, feedback, or inquiries",
                  "Information you voluntarily include in your public profile or store pages",
                ]} />
              </SubSection>

              <SubSection title="3.2 Information Collected Automatically">
                <p>When you access or use our Services, we automatically collect certain technical and usage information:</p>
                <Ul items={[
                  "IP address",
                  "Device type, operating system, and browser type/version",
                  "Mobile device identifiers (e.g., device ID, advertising ID) when using our iOS or Android apps",
                  "Pages visited, time spent on pages, click-through data, and navigation paths",
                  "Referring URL and exit pages",
                  "Approximate geographic location derived from IP address (country and region level)",
                  "Traffic source data including UTM parameters (utm_source, utm_medium, utm_campaign, utm_content, utm_term)",
                  "Product page views, tracked natively using IP-based deduplication",
                  "Crash logs and error reports from our mobile applications",
                ]} />
              </SubSection>

              <SubSection title="3.3 Information from Third Parties">
                <p>We may receive information from third-party services connected to your account:</p>
                <Ul items={[
                  "Stripe: Account verification status, payout information, transaction confirmations, and refund statuses.",
                  "Social login providers: If you sign up or log in using Google or Apple, we receive your name, email address, and profile picture as permitted by that provider.",
                  "App stores: Apple App Store and Google Play Store may provide us with aggregated download and usage analytics.",
                ]} />
              </SubSection>
            </Section>

            <Section id="s4" title="4. How We Use Your Information">
              <SubSection title="4.1 To Provide and Operate the Services">
                <Ul items={[
                  "Create and manage your Seller or Buyer account",
                  "Process transactions between Buyers and Sellers via Stripe Connect",
                  "Deliver purchased digital products to Buyers via email and download links",
                  "Facilitate payouts to Sellers through Stripe Connect",
                  "Enable Sellers to manage their stores, product listings, OnePage, email subscribers, and analytics dashboards",
                  "Process refunds when applicable",
                  "Connect custom domains to Seller stores",
                ]} />
              </SubSection>
              <SubSection title="4.2 To Provide Analytics to Sellers">
                <Ul items={[
                  "Track and display product views, sales, revenue, and conversion rates on Seller dashboards",
                  "Identify traffic sources (direct, organic search, social media, email, referral, paid search) and UTM campaign data",
                  "Provide geographic/country-level data on visitors and customers",
                  "Generate aggregated performance metrics and KPIs",
                ]} />
                <p className="text-[13px] text-[#6b7280] mt-2 italic">
                  Note: All analytics are built natively into the Storelib platform. We do not use Google Analytics or
                  any third-party analytics service for product view tracking.
                </p>
              </SubSection>
              <SubSection title="4.3 To Communicate with You">
                <Ul items={[
                  "Send transactional emails (purchase confirmations, download links, refund notifications, payout confirmations, first sale notifications)",
                  "Send account-related notifications (security alerts, verification requests, billing reminders)",
                  "Enable Sellers to send newsletters and marketing emails to their subscribers through Storelib's built-in email system",
                  "Respond to your support requests and inquiries",
                ]} />
              </SubSection>
              <SubSection title="4.4 To Improve and Protect Our Services">
                <Ul items={[
                  "Monitor and analyze usage trends to improve user experience",
                  "Detect, prevent, and address fraud, abuse, security incidents, and technical issues",
                  "Debug and fix errors in our website and mobile applications",
                  "Enforce our Terms of Service and prevent prohibited activities",
                ]} />
              </SubSection>
              <SubSection title="4.5 To Comply with Legal Obligations">
                <Ul items={[
                  "Comply with applicable tax, accounting, and financial reporting requirements",
                  "Respond to lawful requests from law enforcement or regulatory authorities",
                  "Establish, exercise, or defend legal claims",
                ]} />
              </SubSection>
            </Section>

            <Section id="s5" title="5. Legal Bases for Processing (GDPR)">
              <p>
                If you are located in the European Economic Area (EEA), the United Kingdom (UK), or another
                jurisdiction that requires a legal basis for processing personal data, we rely on the following grounds:
              </p>
              <div className="space-y-3 mt-3">
                {[
                  ["Contractual Necessity", "Processing is necessary to perform our contract with you (e.g., providing the Services, processing transactions, managing your account, delivering digital products, facilitating payouts)."],
                  ["Legitimate Interests", "Processing is necessary for our legitimate interests, including improving our Services, preventing fraud, ensuring platform security, and providing analytics to Sellers. We balance these interests against your rights and freedoms."],
                  ["Consent", "Where required, we process your data based on your freely given consent (e.g., subscribing to a Seller's email list, opting into marketing communications). You may withdraw consent at any time."],
                  ["Legal Obligation", "Processing is necessary to comply with a legal obligation to which we are subject (e.g., tax reporting, responding to lawful data requests)."],
                ].map(([title, desc]) => (
                  <div key={title} className="flex gap-3">
                    <div className="w-2 h-2 rounded-full bg-[#8b5cf6] shrink-0 mt-2" />
                    <div>
                      <span className="font-semibold text-[#374151]">{title}: </span>
                      <span>{desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section id="s6" title="6. Payments, Stripe Connect, and Financial Data">
              <SubSection title="6.1 How Payments Work">
                <p>When a Buyer purchases a digital product from a Seller on Storelib:</p>
                <Ul items={[
                  "The Buyer enters payment information on the Storelib checkout page powered by Stripe Elements.",
                  "Payment card information is transmitted directly to Stripe's servers. Storelib never receives, processes, or stores your full payment card details.",
                  "Stripe processes the charge and automatically splits the payment: the Seller's share is sent to their connected Stripe account, and Storelib's platform fee is collected as an application fee.",
                  "Stripe handles all PCI-DSS compliance requirements for payment data security.",
                ]} />
              </SubSection>
              <SubSection title="6.2 Seller Financial Information">
                <p>
                  To receive payouts, Sellers set up payments with Stripe through Storelib. Stripe collects
                  identity and banking information directly, including banking details, tax identification
                  information, and address. This information is provided to and controlled by Stripe, not
                  Storelib. Storelib receives only limited information such as the Seller&apos;s Stripe account ID,
                  verification status, country, payout currency, the last four digits of the payout bank account,
                  and payout history.
                </p>
              </SubSection>
              <SubSection title="6.3 Identity Verification and Biometric Data">
                <p>
                  Verification is required by law and by the card networks before a Seller can be paid.
                  Storelib&apos;s own payout form collects only what Stripe requires of an individual in their
                  country, typically a date of birth, a home address and a phone number, together with the bank
                  account payouts are sent to. Where Stripe additionally requires information Storelib&apos;s form
                  does not collect, such as a national identification number or a proof of address, that
                  information is collected by Stripe on Stripe&apos;s own form, which is embedded in the Storelib
                  page; Storelib does not receive it.
                </p>
                <p>
                  Where Stripe requires an identity document, the Seller presents a passport, national identity
                  card or driving licence. In a web browser the check is run by Stripe Identity on Stripe&apos;s
                  own screens: Stripe scans the document with the device camera and takes a photograph of the
                  Seller&apos;s face, and processes both with automated and biometric technology to confirm that
                  the document is genuine and belongs to the person presenting it. That document image, that
                  facial image and the biometric comparison between them are collected by Stripe directly and
                  never pass through Storelib. In the Storelib mobile application, and anywhere Stripe Identity
                  is unavailable, the Seller instead photographs the document with the camera in the Storelib
                  application; Storelib transmits that photograph to Stripe over an encrypted connection and
                  does not store it, and no facial image or biometric comparison is collected on that path.
                </p>
                <p>
                  Storelib passes the details a Seller types to Stripe over an encrypted connection as they are
                  submitted and does not store them: no identity document, facial image, identification number,
                  date of birth or full bank account number is written to Storelib&apos;s databases or logs. Afterwards Storelib holds only
                  the Seller&apos;s name, country, verification status and the last four digits of their payout
                  account. Stripe is an independent controller of that data, retains it for the period its own
                  policies and applicable law require, and a Seller may ask Stripe to delete their verification
                  data as described in Stripe&apos;s privacy policy. Verification cannot be skipped: without it,
                  Storelib cannot accept payments on a Seller&apos;s behalf.
                </p>
              </SubSection>
              <SubSection title="6.4 Dispute Information">
                <p>
                  When a Buyer disputes a payment, Storelib records the dispute, its reason, its amount and its
                  outcome, together with any evidence the Seller chooses to add, so the dispute can be answered and
                  so both parties have a record of it. Evidence a Seller supplies is shared with Stripe and, through
                  Stripe, with the card networks and the Buyer&apos;s bank for the purpose of deciding the dispute.
                </p>
              </SubSection>
              <SubSection title="6.5 Platform Fees">
                <p>
                  Storelib collects a platform transaction fee on each sale, which varies based on the Seller's
                  subscription plan (Free or Pro). These fees are collected automatically via
                  Stripe Connect's application fee mechanism.
                </p>
              </SubSection>
              <SubSection title="6.6 Stripe's Privacy Policy">
                <p>
                  Stripe is an independent data controller for the payment and financial data it processes. For
                  details, refer to Stripe's Privacy Policy at{" "}
                  <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-[#8b5cf6] hover:underline">
                    https://stripe.com/privacy
                  </a>.
                </p>
              </SubSection>
            </Section>

            <Section id="s7" title="7. Analytics, View Tracking, and Cookies">
              <SubSection title="7.1 Native Analytics">
                <p>
                  Storelib provides Sellers with a built-in analytics dashboard. All analytics tracking is performed
                  natively by Storelib — we do not use Google Analytics or any third-party analytics service for
                  tracking views on Seller product pages and stores.
                </p>
                <p>Our native analytics system tracks:</p>
                <Ul items={[
                  "Product page views. With your consent to analytics, a returning visitor is recognised by a cookie so a visit is counted once. Without it, nothing is stored on your device: the pages of one visit are grouped by a code made from your IP address and browser for that store, which changes every day and cannot be turned back into either. Your IP address itself is not stored",
                  "Traffic sources (direct, organic search, social media, email, referral, paid search)",
                  "UTM campaign parameters",
                  "Geographic/country-level data (derived from IP addresses)",
                  "Sales, revenue, and conversion rate metrics",
                ]} />
                <p>
                  Sellers see only aggregated analytics data and cannot identify individual visitors. Where you have
                  agreed to analytics, we also use Vercel Analytics, which measures traffic and page speed without
                  setting cookies.
                </p>
              </SubSection>
              <SubSection title="7.2 Cookies and Similar Technologies">
                <div id="cookies" className="scroll-mt-24" />
                <p>
                  Necessary cookies are always on. Everything else is off until you choose otherwise, and you can
                  change your choice at any time with the button below or Cookie preferences at the bottom of any
                  page. Your choice is kept for twelve months, then we ask again. We do not use advertising cookies
                  or sell data collected through cookies.
                </p>
                <CookieTable />
              </SubSection>
              <SubSection title="7.3 Managing Cookies">
                <p>
                  Besides the choices above, you can block or delete cookies in your browser settings. If you block
                  necessary cookies, signing in and checkout will not work. Our mobile apps set no analytics or
                  advertising identifiers.
                </p>
              </SubSection>
            </Section>

            <Section id="s8" title="8. Email System and Subscriber Data">
              <SubSection title="8.1 Storelib's Built-In Email System">
                <p>
                  Storelib provides Sellers with a built-in email system to communicate with their subscribers and
                  customers. This includes newsletters, product announcements, and automated emails. The email system
                  is hosted and operated by Storelib.
                </p>
              </SubSection>
              <SubSection title="8.2 Subscriber Email Collection">
                <p>
                  Buyers and visitors may voluntarily provide their email addresses to Sellers through Subscribe Bars
                  on Seller stores, OnePage link-in-bio pages, free product downloads (lead magnets), or at checkout.
                  When a visitor subscribes to a Seller's email list, that Seller can view the subscriber's email
                  address in their Storelib dashboard and send them emails through the platform.
                </p>
              </SubSection>
              <SubSection title="8.3 Unsubscribing">
                <p>
                  Every email sent through Storelib's email system includes a clearly visible unsubscribe link.
                  Subscribers can unsubscribe at any time. Once unsubscribed, the Seller will no longer be able to
                  send them marketing emails through Storelib.
                </p>
              </SubSection>
              <SubSection title="8.4 Email Limits by Plan">
                <p>
                  The number of emails a Seller can send per month depends on their subscription plan: Free plan:
                  500 emails/month; Pro plan: 2,000 emails/month. Sellers on a plan that is no longer offered keep
                  that plan&apos;s limit while the subscription remains active.
                </p>
              </SubSection>
            </Section>

            <Section id="s9" title="9. How We Share Your Information">
              <p>
                We do not sell your personal information. We do not share your personal information with third
                parties for their own marketing purposes. We may share your information in the following limited
                circumstances:
              </p>
              <SubSection title="9.1 With Sellers (for Buyer Data)">
                <p>
                  When you make a purchase from a Seller or subscribe to a Seller's email list, the Seller receives
                  your name, email address, purchase details, and any review you submit. Sellers are independent data
                  controllers for the Buyer data they receive and are responsible for their own compliance with
                  privacy laws.
                </p>
              </SubSection>
              <SubSection title="9.2 With Stripe">
                <p>
                  We share transaction information with Stripe to process payments, manage payouts, handle refunds,
                  and comply with financial regulations.
                </p>
              </SubSection>
              <SubSection title="9.3 With Service Providers">
                <p>
                  We may share information with trusted third-party service providers who assist us in operating our
                  Services, including hosting providers, email delivery services, customer support tools, and error
                  monitoring services. These providers are contractually obligated to use your data only for the
                  purposes we specify.
                </p>
              </SubSection>
              <SubSection title="9.4 For Legal Reasons">
                <p>
                  We may disclose your information if required by law, in response to a valid legal process (such as
                  a court order, subpoena, or government request), or to protect the rights, property, or safety of
                  Storelib, our users, or the public.
                </p>
              </SubSection>
              <SubSection title="9.5 Business Transfers">
                <p>
                  In the event of a merger, acquisition, reorganization, bankruptcy, or sale of all or substantially
                  all of our assets, your personal information may be transferred as part of the transaction. We will
                  notify you of any such change.
                </p>
              </SubSection>
              <SubSection title="9.6 Aggregated and Anonymized Data">
                <p>
                  We may share aggregated or anonymized information that cannot reasonably be used to identify you
                  with third parties for business, research, or statistical purposes.
                </p>
              </SubSection>
            </Section>

            <Section id="s10" title="10. Data Retention">
              <p>
                We retain your personal information for as long as necessary to provide our Services and fulfill the
                purposes described in this Privacy Policy. Specific retention periods include:
              </p>
              <div className="space-y-3 mt-3">
                {[
                  ["Account Data", "Retained for as long as your account is active. If you delete your account, we will delete or anonymize your personal data within 30 days, except where required for legal, tax, or regulatory purposes."],
                  ["Transaction Records", "Retained for a minimum of 7 years to comply with financial, tax, and accounting obligations."],
                  ["Analytics Data", "IP addresses used for view deduplication are retained for a limited period (typically 24 hours). Aggregated analytics data is retained indefinitely as part of Seller dashboard data."],
                  ["Email Subscriber Data", "Retained for as long as the Seller's account is active or until the subscriber unsubscribes. Unsubscribed records are retained in an anonymized form for compliance purposes."],
                  ["Support Communications", "Retained for up to 3 years after the last interaction."],
                ].map(([type, desc]) => (
                  <div key={type} className="grid grid-cols-[140px_1fr] gap-3 text-[14px]">
                    <span className="font-semibold text-[#374151] shrink-0">{type}</span>
                    <span className="text-[#4b5563]">{desc}</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section id="s11" title="11. Data Security">
              <p>
                We take the security of your personal information seriously and implement appropriate technical and
                organizational measures to protect it, including:
              </p>
              <Ul items={[
                "All data transmitted between your device and our servers is encrypted using TLS/SSL (HTTPS)",
                "Passwords are hashed and salted; we cannot view your plain-text password",
                "Payment card data is processed exclusively by Stripe and never touches our servers. Stripe maintains PCI-DSS Level 1 certification",
                "Access to personal data within our organization is restricted to authorized personnel on a need-to-know basis",
                "Regular security reviews and updates to our systems and infrastructure",
                "Secure hosting infrastructure with encryption at rest for stored data",
              ]} />
              <p>
                While we strive to protect your personal information, no method of transmission over the Internet or
                electronic storage is completely secure. We cannot guarantee absolute security, but we are committed
                to taking all reasonable steps to safeguard your data.
              </p>
            </Section>

            <Section id="s12" title="12. Your Rights">
              <SubSection title="12.1 Rights Under the GDPR (EEA and UK)">
                <p>If you are located in the European Economic Area or the United Kingdom, you have the following rights:</p>
                <Ul items={[
                  "Right of Access: You can request a copy of the personal data we hold about you.",
                  "Right to Rectification: You can request that we correct inaccurate or incomplete personal data.",
                  "Right to Erasure (\u201cRight to Be Forgotten\u201d): You can request that we delete your personal data, subject to certain legal exceptions.",
                  "Right to Restriction of Processing: You can request that we restrict the processing of your personal data in certain circumstances.",
                  "Right to Data Portability: You can request to receive your personal data in a structured, commonly used, and machine-readable format.",
                  "Right to Object: You can object to the processing of your personal data based on our legitimate interests.",
                  "Right to Withdraw Consent: Where processing is based on consent, you can withdraw your consent at any time.",
                  "Right to Lodge a Complaint: You have the right to lodge a complaint with a supervisory authority in your country of residence.",
                ]} />
              </SubSection>
              <SubSection title="12.2 Rights Under the CCPA/CPRA (California)">
                <Ul items={[
                  "Right to Know: You can request disclosure of the categories and specific pieces of personal information we have collected about you.",
                  "Right to Delete: You can request deletion of your personal information, subject to certain legal exceptions.",
                  "Right to Correct: You can request correction of inaccurate personal information.",
                  "Right to Opt-Out of Sale or Sharing: We do not sell your personal information.",
                  "Right to Non-Discrimination: We will not discriminate against you for exercising any of your privacy rights.",
                ]} />
              </SubSection>
              <SubSection title="12.3 Rights Under Other Privacy Laws">
                <p>
                  If you are located in a jurisdiction with specific privacy legislation (such as Brazil's LGPD,
                  Canada's PIPEDA, or various US state privacy laws), you may have similar rights. Please contact
                  us at{" "}
                  <a href="mailto:privacy@storelib.com" className="text-[#8b5cf6] hover:underline">privacy@storelib.com</a>{" "}
                  to exercise your rights.
                </p>
              </SubSection>
              <SubSection title="12.4 How to Exercise Your Rights">
                <p>
                  You can exercise your rights by emailing{" "}
                  <a href="mailto:privacy@storelib.com" className="text-[#8b5cf6] hover:underline">privacy@storelib.com</a>{" "}
                  with your request. Please include sufficient information to verify your identity and describe your
                  request clearly. We will respond within the time frame required by applicable law (generally 30 days
                  for GDPR and 45 days for CCPA requests). We will not charge a fee for processing your request
                  unless it is manifestly unfounded or excessive.
                </p>
              </SubSection>
            </Section>

            <Section id="s13" title="13. International Data Transfers">
              <p>
                Storelib operates globally. Your personal information may be transferred to and processed in
                countries other than the country in which you reside. These countries may have data protection laws
                that are different from the laws of your country.
              </p>
              <p>
                When we transfer personal data from the EEA, UK, or Switzerland to countries that have not been
                deemed to provide an adequate level of data protection, we rely on appropriate safeguards, such as
                Standard Contractual Clauses (SCCs) approved by the European Commission, or other legally recognized
                transfer mechanisms.
              </p>
              <p>
                By using our Services, you acknowledge and agree to the transfer of your information as described
                in this section.
              </p>
            </Section>

            <Section id="s14" title="14. Children's Privacy">
              <p>
                Our Services are not directed to children under the age of 16 (or the applicable age of digital
                consent in your jurisdiction). We do not knowingly collect personal information from children under
                this age. If we become aware that we have collected personal information from a child under the
                applicable age without parental consent, we will take steps to delete that information as promptly
                as possible.
              </p>
              <p>
                If you are a parent or guardian and believe that your child has provided us with personal
                information, please contact us at{" "}
                <a href="mailto:privacy@storelib.com" className="text-[#8b5cf6] hover:underline">privacy@storelib.com</a>.
              </p>
            </Section>

            <Section id="s15" title="15. Mobile Applications (iOS and Android)">
              <SubSection title="15.1 App Store and Google Play Requirements">
                <p>
                  Our mobile applications are available on the Apple App Store and the Google Play Store. When you
                  download and use our apps, the respective app store may collect information about you in accordance
                  with its own privacy policy. We encourage you to review Apple's and Google's privacy policies.
                </p>
              </SubSection>
              <SubSection title="15.2 Device Permissions">
                <p>Our mobile applications may request certain permissions on your device, such as:</p>
                <Ul items={[
                  "Camera and photo library access: To allow Sellers to upload product images and profile photos",
                  "Push notifications: To send you alerts about sales, orders, and account activity",
                  "Internet access: Required for all core functionality",
                  "Storage access: To enable downloading of purchased digital products",
                ]} />
                <p>You can manage these permissions at any time through your device's settings.</p>
              </SubSection>
              <SubSection title="15.3 App Tracking and Identifiers">
                <p>
                  On iOS, we comply with Apple's App Tracking Transparency (ATT) framework. We will request your
                  permission before tracking your activity across other companies' apps and websites. On Android, we
                  respect your advertising ID settings. We do not use your mobile device identifiers for advertising
                  purposes.
                </p>
              </SubSection>
              <SubSection title="15.4 Crash Reporting">
                <p>
                  Our mobile applications may collect crash reports and diagnostic data to help us identify and fix
                  bugs. This data may include device type, operating system version, app version, and technical logs.
                  This data does not include your personal content or financial information.
                </p>
              </SubSection>
            </Section>

            <Section id="s16" title="16. Discover Marketplace">
              <p>
                Storelib features a Discover section where Buyers can browse and discover digital products from
                various Sellers on the platform. Product listings in Discover are public and may include the Seller's
                store name, profile photo, product titles, descriptions, prices, cover images, and review ratings.
                Sellers should be aware that any information they include in their public product listings and store
                profiles is visible to all visitors of the platform.
              </p>
            </Section>

            <Section id="s17" title="17. Third-Party Links and Services">
              <p>
                Our Services may contain links to third-party websites, products, or services that are not owned or
                controlled by Storelib. This includes links in Seller OnePage profiles, product descriptions, and
                external websites. We are not responsible for the privacy practices of these third parties. We
                encourage you to review the privacy policies of any third-party services you interact with.
              </p>
            </Section>

            <Section id="s18" title='18. "Do Not Sell or Share My Personal Information"'>
              <p>
                Storelib does not sell your personal information as defined under the CCPA/CPRA or any other
                applicable privacy law. We do not share your personal information with third parties for
                cross-context behavioral advertising. Because we do not sell or share your personal information,
                there is no need to opt out. However, if you have any concerns, please contact us at{" "}
                <a href="mailto:privacy@storelib.com" className="text-[#8b5cf6] hover:underline">privacy@storelib.com</a>.
              </p>
              <SubSection title='18.1 "Do Not Track" Signals'>
                <p>
                  Some web browsers transmit "Do Not Track" (DNT) signals. Because there is no universally accepted
                  standard for how DNT signals should be interpreted, we do not currently alter our data collection
                  and use practices in response to DNT signals. We will update this Privacy Policy if a standard for
                  responding to DNT signals is established.
                </p>
              </SubSection>
            </Section>

            <Section id="s19" title="19. Affiliate Program">
              <p>
                Storelib offers an affiliate program that allows users to earn commissions by referring new Sellers
                to the platform. If you participate in our affiliate program, we collect your name, email address,
                payment information for commission payouts, and referral tracking data (such as referral links and
                conversion data). This information is used solely for managing the affiliate program and processing
                payouts.
              </p>
            </Section>

            <Section id="s20" title="20. Changes to This Privacy Policy">
              <p>
                We may update this Privacy Policy from time to time to reflect changes in our practices,
                technologies, legal requirements, or other factors. When we make material changes, we will:
              </p>
              <Ul items={[
                "Update the \"Effective Date\" and \"Last Updated\" dates at the top of this Privacy Policy",
                "Notify registered users via email about material changes",
                "Post a prominent notice on our website and/or within our mobile applications",
              ]} />
              <p>
                We encourage you to review this Privacy Policy periodically. Your continued use of our Services
                after any changes constitutes your acceptance of the updated Privacy Policy.
              </p>
            </Section>

            <Section id="s21" title="21. Contact Us">
              <p>
                If you have any questions, concerns, or requests regarding this Privacy Policy or our data
                practices, please contact us:
              </p>
              <div className="bg-[#fafafa] border border-[#f3f4f6] rounded-xl p-5 mt-3 space-y-2 text-[14px]">
                <p><span className="font-medium text-[#374151]">Privacy Email:</span>{" "}
                  <a href="mailto:privacy@storelib.com" className="text-[#8b5cf6] hover:underline">privacy@storelib.com</a>
                </p>
                <p><span className="font-medium text-[#374151]">General Support:</span>{" "}
                  <a href="mailto:team@storelib.com" className="text-[#8b5cf6] hover:underline">team@storelib.com</a>
                </p>
                <p><span className="font-medium text-[#374151]">Website:</span>{" "}
                  <a href="https://storelib.com" className="text-[#8b5cf6] hover:underline">https://storelib.com</a>
                </p>
              </div>
              <p>
                We aim to respond to all privacy-related inquiries within 30 days. For GDPR-related requests, we
                will respond within the time frame required by applicable law.
              </p>
              <p>
                If you are located in the EEA or UK and are not satisfied with our response, you have the right to
                lodge a complaint with your local data protection supervisory authority.
              </p>
            </Section>

            {/* Footer */}
            <div className="mt-12 pt-8 border-t border-[#e5e7eb] text-center text-[13px] text-[#9ca3af]">
              <p>© 2026 Storelib Inc. All rights reserved.</p>
              <p className="mt-1">
                <a href="https://storelib.com" className="hover:text-[#6b7280] transition-colors">storelib.com</a>
                {" · "}
                <a href="/terms" className="hover:text-[#6b7280] transition-colors">Terms of Service</a>
                {" · "}
                <a href="mailto:privacy@storelib.com" className="hover:text-[#6b7280] transition-colors">privacy@storelib.com</a>
              </p>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
