import type { Metadata } from "next"
import Link from "next/link"
import { Shield, ArrowLeft } from "lucide-react"

export const metadata: Metadata = {
  title: "Privacy Policy | Storelib",
  description: "Privacy Policy for Storelib - Learn how we collect, use, and protect your data",
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#fafafa] to-white border-b border-[#e5e7eb]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <Link
            href="/help"
            className="inline-flex items-center gap-2 text-[14px] text-[#6b7280] hover:text-[#1a1a2e] transition-colors mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Help Center
          </Link>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#8b5cf6]/10 flex items-center justify-center">
              <Shield className="h-6 w-6 text-[#8b5cf6]" />
            </div>
            <div>
              <h1 className="text-[32px] sm:text-[40px] font-bold text-[#1a1a2e] tracking-tight">
                Privacy Policy
              </h1>
              <p className="text-[14px] text-[#6b7280] mt-1">
                Last updated: February 4, 2026
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="prose prose-gray max-w-none">
          {/* Introduction */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">1. Introduction</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              Welcome to Storelib ("Company", "we", "our", "us"). We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our services.
            </p>
            <p className="text-[15px] text-[#4b5563] leading-relaxed">
              Please read this privacy policy carefully. If you do not agree with the terms of this privacy policy, please do not access the site or use our services.
            </p>
          </section>

          {/* Information We Collect */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">2. Information We Collect</h2>

            <h3 className="text-[17px] font-medium text-[#1a1a2e] mb-3">2.1 Personal Information</h3>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              We collect personal information that you voluntarily provide to us when you register on the platform, express an interest in obtaining information about us or our products and services, when you participate in activities on the platform, or otherwise when you contact us.
            </p>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              The personal information we collect may include:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-[15px] text-[#4b5563]">
              <li>Name and contact data (email address, phone number)</li>
              <li>Credentials (passwords, password hints, security questions)</li>
              <li>Payment data (credit card numbers, billing address)</li>
              <li>Profile data (username, profile picture, preferences)</li>
              <li>Business information (store name, business address, tax information)</li>
            </ul>

            <h3 className="text-[17px] font-medium text-[#1a1a2e] mb-3">2.2 Information Automatically Collected</h3>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              We automatically collect certain information when you visit, use, or navigate the platform. This information does not reveal your specific identity but may include:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-[15px] text-[#4b5563]">
              <li>Device and usage information (IP address, browser type, operating system)</li>
              <li>Location information (country, city, region)</li>
              <li>Analytics data (pages visited, time spent, click patterns)</li>
              <li>Cookies and similar tracking technologies</li>
            </ul>
          </section>

          {/* How We Use Your Information */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">3. How We Use Your Information</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              We use the information we collect or receive for various purposes, including:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-[15px] text-[#4b5563]">
              <li><strong>To facilitate account creation and login process</strong> - We use your information to create and manage your account.</li>
              <li><strong>To process transactions</strong> - We may use your information to process payments and fulfill orders.</li>
              <li><strong>To send administrative information</strong> - We may use your information to send you product, service, and new feature information.</li>
              <li><strong>To protect our services</strong> - We may use your information to detect and prevent fraud, unauthorized access, and other illegal activities.</li>
              <li><strong>To respond to legal requests</strong> - We may disclose your information where required by law or in response to valid legal processes.</li>
              <li><strong>To improve our services</strong> - We analyze usage patterns to enhance user experience and develop new features.</li>
              <li><strong>For marketing and promotions</strong> - With your consent, we may use your information to send you marketing communications.</li>
            </ul>
          </section>

          {/* Information Sharing */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">4. Information Sharing and Disclosure</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              We may share or disclose your information in the following situations:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-[15px] text-[#4b5563]">
              <li><strong>Service Providers</strong> - We may share your information with third-party vendors, service providers, contractors, or agents who perform services for us (e.g., payment processing, data analytics, email delivery, hosting services).</li>
              <li><strong>Business Transfers</strong> - We may share or transfer your information in connection with, or during negotiations of, any merger, sale of company assets, financing, or acquisition of all or a portion of our business.</li>
              <li><strong>Legal Obligations</strong> - We may disclose your information where required by law, such as to comply with a subpoena or similar legal process.</li>
              <li><strong>With Your Consent</strong> - We may disclose your information for any other purpose with your consent.</li>
            </ul>
          </section>

          {/* Cookies */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">5. Cookies and Tracking Technologies</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              We use cookies and similar tracking technologies to track activity on our platform and store certain information. Cookies are files with a small amount of data that may include an anonymous unique identifier.
            </p>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              We use the following types of cookies:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-[15px] text-[#4b5563]">
              <li><strong>Essential Cookies</strong> - Required for the platform to function properly.</li>
              <li><strong>Analytics Cookies</strong> - Help us understand how visitors interact with the platform.</li>
              <li><strong>Functional Cookies</strong> - Remember your preferences and settings.</li>
              <li><strong>Marketing Cookies</strong> - Used to deliver relevant advertisements (with your consent).</li>
            </ul>
            <p className="text-[15px] text-[#4b5563] leading-relaxed">
              You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent. However, if you do not accept cookies, you may not be able to use some portions of our platform.
            </p>
          </section>

          {/* Data Retention */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">6. Data Retention</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              We will retain your personal information only for as long as is necessary for the purposes set out in this Privacy Policy. We will retain and use your information to the extent necessary to:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-[15px] text-[#4b5563]">
              <li>Comply with our legal obligations</li>
              <li>Resolve disputes</li>
              <li>Enforce our agreements</li>
              <li>Protect against fraudulent activity</li>
            </ul>
            <p className="text-[15px] text-[#4b5563] leading-relaxed">
              When your personal information is no longer required, we will securely delete or anonymize it.
            </p>
          </section>

          {/* Data Security */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">7. Data Security</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              We have implemented appropriate technical and organizational security measures designed to protect the security of any personal information we process. These measures include:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-[15px] text-[#4b5563]">
              <li>Encryption of data in transit and at rest</li>
              <li>Regular security assessments and audits</li>
              <li>Access controls and authentication measures</li>
              <li>Secure data centers with physical security measures</li>
              <li>Employee training on data protection</li>
            </ul>
            <p className="text-[15px] text-[#4b5563] leading-relaxed">
              However, please also remember that we cannot guarantee that the internet itself is 100% secure. Although we will do our best to protect your personal information, transmission of personal information to and from our platform is at your own risk.
            </p>
          </section>

          {/* Your Rights */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">8. Your Privacy Rights</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              Depending on your location, you may have certain rights regarding your personal information:
            </p>

            <h3 className="text-[17px] font-medium text-[#1a1a2e] mb-3">8.1 General Rights</h3>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-[15px] text-[#4b5563]">
              <li><strong>Access</strong> - You have the right to request access to your personal information.</li>
              <li><strong>Rectification</strong> - You have the right to request correction of inaccurate personal information.</li>
              <li><strong>Erasure</strong> - You have the right to request deletion of your personal information.</li>
              <li><strong>Data Portability</strong> - You have the right to receive a copy of your data in a structured, commonly used format.</li>
              <li><strong>Withdraw Consent</strong> - You have the right to withdraw consent at any time for consent-based processing.</li>
            </ul>

            <h3 className="text-[17px] font-medium text-[#1a1a2e] mb-3">8.2 GDPR Rights (European Users)</h3>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              If you are a resident of the European Economic Area (EEA), you have additional rights under the General Data Protection Regulation (GDPR), including the right to object to processing and the right to lodge a complaint with a supervisory authority.
            </p>

            <h3 className="text-[17px] font-medium text-[#1a1a2e] mb-3">8.3 CCPA Rights (California Residents)</h3>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              If you are a California resident, you have specific rights under the California Consumer Privacy Act (CCPA), including:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-[15px] text-[#4b5563]">
              <li>The right to know what personal information is being collected</li>
              <li>The right to know whether your personal information is sold or disclosed</li>
              <li>The right to opt-out of the sale of personal information</li>
              <li>The right to non-discrimination for exercising your privacy rights</li>
            </ul>
          </section>

          {/* Third-Party Services */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">9. Third-Party Services</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              Our platform may contain links to third-party websites and services. We are not responsible for the privacy practices of these third parties. We encourage you to review the privacy policies of any third-party sites you visit.
            </p>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              We use the following third-party services:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-[15px] text-[#4b5563]">
              <li><strong>Stripe</strong> - For payment processing</li>
              <li><strong>Google Analytics</strong> - For website analytics</li>
              <li><strong>Supabase</strong> - For database and authentication services</li>
              <li><strong>Vercel</strong> - For hosting and deployment</li>
            </ul>
          </section>

          {/* Children's Privacy */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">10. Children's Privacy</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed">
              Our platform is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us immediately. If we become aware that we have collected personal information from a child under 13 without verification of parental consent, we will take steps to remove that information from our servers.
            </p>
          </section>

          {/* International Transfers */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">11. International Data Transfers</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed">
              Your information may be transferred to and maintained on computers located outside of your state, province, country, or other governmental jurisdiction where the data protection laws may differ from those in your jurisdiction. If you are located outside of the United States and choose to provide information to us, please note that we transfer the data to the United States and process it there. Your consent to this Privacy Policy followed by your submission of such information represents your agreement to that transfer.
            </p>
          </section>

          {/* Changes to Policy */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">12. Changes to This Privacy Policy</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed">
              We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date. You are advised to review this Privacy Policy periodically for any changes. Changes to this Privacy Policy are effective when they are posted on this page.
            </p>
          </section>

          {/* Contact Information */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">13. Contact Us</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              If you have any questions about this Privacy Policy, please contact us:
            </p>
            <ul className="list-none space-y-2 text-[15px] text-[#4b5563]">
              <li><strong>Email:</strong> <a href="mailto:privacy@storelib.com" className="text-[#8b5cf6] hover:underline">privacy@storelib.com</a></li>
              <li><strong>Support:</strong> <a href="mailto:support@storelib.com" className="text-[#8b5cf6] hover:underline">support@storelib.com</a></li>
            </ul>
          </section>
        </div>

        {/* Footer Links */}
        <div className="mt-12 pt-8 border-t border-[#e5e7eb]">
          <div className="flex flex-wrap justify-center gap-6 text-[13px]">
            <Link href="/terms" className="text-[#6b7280] hover:text-[#1a1a2e] transition-colors">
              Terms of Service
            </Link>
            <Link href="/help" className="text-[#6b7280] hover:text-[#1a1a2e] transition-colors">
              Help Center
            </Link>
            <a href="mailto:support@storelib.com" className="text-[#6b7280] hover:text-[#1a1a2e] transition-colors">
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
