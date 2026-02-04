import type { Metadata } from "next"
import Link from "next/link"
import { FileText, ArrowLeft } from "lucide-react"

export const metadata: Metadata = {
  title: "Terms of Service | Storelib",
  description: "Terms of Service for Storelib - Read our terms and conditions for using the platform",
}

export default function TermsOfServicePage() {
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
              <FileText className="h-6 w-6 text-[#8b5cf6]" />
            </div>
            <div>
              <h1 className="text-[32px] sm:text-[40px] font-bold text-[#1a1a2e] tracking-tight">
                Terms of Service
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
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">1. Agreement to Terms</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              These Terms of Service ("Terms") constitute a legally binding agreement made between you, whether personally or on behalf of an entity ("you") and Storelib ("Company", "we", "us", or "our"), concerning your access to and use of the storelib.com website as well as any other media form, media channel, mobile website, or mobile application related, linked, or otherwise connected thereto (collectively, the "Platform").
            </p>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              You agree that by accessing the Platform, you have read, understood, and agree to be bound by all of these Terms. IF YOU DO NOT AGREE WITH ALL OF THESE TERMS, THEN YOU ARE EXPRESSLY PROHIBITED FROM USING THE PLATFORM AND YOU MUST DISCONTINUE USE IMMEDIATELY.
            </p>
            <p className="text-[15px] text-[#4b5563] leading-relaxed">
              Supplemental terms and conditions or documents that may be posted on the Platform from time to time are hereby expressly incorporated herein by reference. We reserve the right, in our sole discretion, to make changes or modifications to these Terms at any time and for any reason.
            </p>
          </section>

          {/* Account Registration */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">2. Account Registration</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              You may be required to register with the Platform to access certain features. You agree to:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-[15px] text-[#4b5563]">
              <li>Provide accurate, current, and complete information during registration</li>
              <li>Maintain and promptly update your registration information</li>
              <li>Keep your password confidential and secure</li>
              <li>Accept responsibility for all activities under your account</li>
              <li>Notify us immediately of any unauthorized use of your account</li>
            </ul>
            <p className="text-[15px] text-[#4b5563] leading-relaxed">
              We reserve the right to suspend or terminate your account, refuse any and all current or future use of the Platform, or any portion thereof, if we suspect you have violated these Terms or any applicable law.
            </p>
          </section>

          {/* Creator Terms */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">3. Creator Terms</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              If you use the Platform as a creator to sell digital products, you agree to the following additional terms:
            </p>

            <h3 className="text-[17px] font-medium text-[#1a1a2e] mb-3">3.1 Product Listings</h3>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-[15px] text-[#4b5563]">
              <li>You must have all necessary rights to sell the products you list</li>
              <li>Product descriptions must be accurate and not misleading</li>
              <li>You are responsible for setting appropriate prices</li>
              <li>You must deliver products as described to customers</li>
            </ul>

            <h3 className="text-[17px] font-medium text-[#1a1a2e] mb-3">3.2 Prohibited Products</h3>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              You may not sell products that:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-[15px] text-[#4b5563]">
              <li>Infringe on any intellectual property rights</li>
              <li>Contain malware, viruses, or harmful code</li>
              <li>Are illegal in any applicable jurisdiction</li>
              <li>Promote hate, violence, or discrimination</li>
              <li>Contain adult content without proper age verification measures</li>
              <li>Violate any third-party privacy rights</li>
              <li>Are fraudulent, deceptive, or misleading</li>
            </ul>

            <h3 className="text-[17px] font-medium text-[#1a1a2e] mb-3">3.3 Fees and Payments</h3>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-[15px] text-[#4b5563]">
              <li>Platform fees will be deducted from each transaction as per our current fee schedule</li>
              <li>Payouts are processed according to our payout schedule</li>
              <li>You are responsible for all applicable taxes on your earnings</li>
              <li>We reserve the right to withhold payouts pending investigation of potential violations</li>
            </ul>
          </section>

          {/* Buyer Terms */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">4. Buyer Terms</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              If you purchase products through the Platform, you agree to the following:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-[15px] text-[#4b5563]">
              <li>You will provide accurate payment information</li>
              <li>You authorize us to charge your payment method for purchases</li>
              <li>Digital products are typically non-refundable unless otherwise stated by the creator</li>
              <li>You will not share, redistribute, or resell purchased products unless explicitly permitted</li>
              <li>You will use purchased products in accordance with any license terms provided</li>
            </ul>
          </section>

          {/* Intellectual Property */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">5. Intellectual Property Rights</h2>

            <h3 className="text-[17px] font-medium text-[#1a1a2e] mb-3">5.1 Platform Content</h3>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              Unless otherwise indicated, the Platform and all source code, databases, functionality, software, website designs, audio, video, text, photographs, and graphics on the Platform (collectively, the "Content") and the trademarks, service marks, and logos contained therein (the "Marks") are owned or controlled by us or licensed to us.
            </p>

            <h3 className="text-[17px] font-medium text-[#1a1a2e] mb-3">5.2 Your Content</h3>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              By posting content on the Platform, you grant us a non-exclusive, worldwide, royalty-free license to use, reproduce, modify, and display your content solely for the purpose of operating and promoting the Platform. You retain all ownership rights to your content.
            </p>

            <h3 className="text-[17px] font-medium text-[#1a1a2e] mb-3">5.3 Copyright Infringement</h3>
            <p className="text-[15px] text-[#4b5563] leading-relaxed">
              We respect intellectual property rights and expect our users to do the same. If you believe that any content on the Platform infringes your copyright, please contact us with a detailed DMCA notice. We will respond to valid copyright infringement notices by removing or disabling access to the allegedly infringing material.
            </p>
          </section>

          {/* User Conduct */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">6. Prohibited Activities</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              You may not access or use the Platform for any purpose other than that for which we make it available. The Platform may not be used in connection with any commercial endeavors except those that are specifically endorsed or approved by us. As a user, you agree NOT to:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-[15px] text-[#4b5563]">
              <li>Systematically retrieve data or content to create a collection, compilation, database, or directory</li>
              <li>Trick, defraud, or mislead us or other users</li>
              <li>Circumvent, disable, or otherwise interfere with security-related features</li>
              <li>Disparage, tarnish, or otherwise harm us or the Platform</li>
              <li>Use any information obtained from the Platform to harass, abuse, or harm another person</li>
              <li>Make improper use of our support services or submit false reports</li>
              <li>Use the Platform in a manner inconsistent with any applicable laws or regulations</li>
              <li>Engage in unauthorized framing or linking to the Platform</li>
              <li>Upload or transmit viruses, Trojan horses, or other harmful material</li>
              <li>Engage in any automated use of the system, such as using scripts</li>
              <li>Delete the copyright or other proprietary rights notice from any Content</li>
              <li>Attempt to impersonate another user or person</li>
              <li>Sell or otherwise transfer your profile</li>
              <li>Use the Platform as part of any effort to compete with us</li>
            </ul>
          </section>

          {/* User Contributions */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">7. User Generated Contributions</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              The Platform may invite you to chat, contribute to, or participate in blogs, message boards, online forums, and other functionality, and may provide you with the opportunity to create, submit, post, display, transmit, perform, publish, distribute, or broadcast content and materials to us or on the Platform (collectively, "Contributions").
            </p>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              You represent and warrant that:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-[15px] text-[#4b5563]">
              <li>Your Contributions do not infringe any third-party rights</li>
              <li>You have all necessary licenses, rights, consents, and permissions</li>
              <li>Your Contributions are not false, inaccurate, or misleading</li>
              <li>Your Contributions do not violate any applicable law, regulation, or rule</li>
            </ul>
          </section>

          {/* Disclaimer */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">8. Disclaimer</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              THE PLATFORM IS PROVIDED ON AN "AS-IS" AND "AS AVAILABLE" BASIS. YOU AGREE THAT YOUR USE OF THE PLATFORM AND OUR SERVICES WILL BE AT YOUR SOLE RISK. TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, IN CONNECTION WITH THE PLATFORM AND YOUR USE THEREOF.
            </p>
            <p className="text-[15px] text-[#4b5563] leading-relaxed">
              WE MAKE NO WARRANTIES OR REPRESENTATIONS ABOUT THE ACCURACY OR COMPLETENESS OF THE PLATFORM'S CONTENT OR THE CONTENT OF ANY WEBSITES LINKED TO THE PLATFORM. WE ASSUME NO LIABILITY OR RESPONSIBILITY FOR ANY ERRORS, MISTAKES, OR INACCURACIES OF CONTENT, PERSONAL INJURY OR PROPERTY DAMAGE, UNAUTHORIZED ACCESS TO OUR SERVERS, INTERRUPTION OF TRANSMISSION, BUGS, VIRUSES, OR ANY THIRD-PARTY MATERIALS POSTED ON THE PLATFORM.
            </p>
          </section>

          {/* Limitation of Liability */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">9. Limitation of Liability</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              IN NO EVENT WILL WE OR OUR DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE TO YOU OR ANY THIRD PARTY FOR ANY DIRECT, INDIRECT, CONSEQUENTIAL, EXEMPLARY, INCIDENTAL, SPECIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFIT, LOST REVENUE, LOSS OF DATA, OR OTHER DAMAGES ARISING FROM YOUR USE OF THE PLATFORM, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
            <p className="text-[15px] text-[#4b5563] leading-relaxed">
              NOTWITHSTANDING ANYTHING TO THE CONTRARY CONTAINED HEREIN, OUR LIABILITY TO YOU FOR ANY CAUSE WHATSOEVER AND REGARDLESS OF THE FORM OF THE ACTION, WILL AT ALL TIMES BE LIMITED TO THE AMOUNT PAID, IF ANY, BY YOU TO US DURING THE SIX (6) MONTH PERIOD PRIOR TO ANY CAUSE OF ACTION ARISING.
            </p>
          </section>

          {/* Indemnification */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">10. Indemnification</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed">
              You agree to defend, indemnify, and hold us harmless, including our subsidiaries, affiliates, and all of our respective officers, agents, partners, and employees, from and against any loss, damage, liability, claim, or demand, including reasonable attorneys' fees and expenses, made by any third party due to or arising out of: (1) your Contributions; (2) use of the Platform; (3) breach of these Terms; (4) any breach of your representations and warranties; (5) your violation of the rights of a third party; or (6) any overt harmful act toward any other user of the Platform.
            </p>
          </section>

          {/* Termination */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">11. Term and Termination</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              These Terms shall remain in full force and effect while you use the Platform. WITHOUT LIMITING ANY OTHER PROVISION OF THESE TERMS, WE RESERVE THE RIGHT TO, IN OUR SOLE DISCRETION AND WITHOUT NOTICE OR LIABILITY, DENY ACCESS TO AND USE OF THE PLATFORM TO ANY PERSON FOR ANY REASON OR FOR NO REASON, INCLUDING WITHOUT LIMITATION FOR BREACH OF ANY REPRESENTATION, WARRANTY, OR COVENANT CONTAINED IN THESE TERMS.
            </p>
            <p className="text-[15px] text-[#4b5563] leading-relaxed">
              If we terminate or suspend your account for any reason, you are prohibited from registering and creating a new account under your name, a fake or borrowed name, or the name of any third party. In addition to terminating or suspending your account, we reserve the right to take appropriate legal action.
            </p>
          </section>

          {/* Dispute Resolution */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">12. Dispute Resolution</h2>

            <h3 className="text-[17px] font-medium text-[#1a1a2e] mb-3">12.1 Informal Negotiations</h3>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              To expedite resolution and control the cost of any dispute, controversy, or claim related to these Terms, you and we agree to first attempt to negotiate any dispute informally for at least thirty (30) days before initiating arbitration.
            </p>

            <h3 className="text-[17px] font-medium text-[#1a1a2e] mb-3">12.2 Binding Arbitration</h3>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              If the parties are unable to resolve a dispute through informal negotiations, all claims arising out of or relating to these Terms shall be resolved by binding arbitration in accordance with the Commercial Arbitration Rules of the American Arbitration Association.
            </p>

            <h3 className="text-[17px] font-medium text-[#1a1a2e] mb-3">12.3 Class Action Waiver</h3>
            <p className="text-[15px] text-[#4b5563] leading-relaxed">
              YOU AND WE AGREE THAT EACH MAY BRING CLAIMS AGAINST THE OTHER ONLY IN YOUR OR OUR INDIVIDUAL CAPACITY, AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS OR REPRESENTATIVE PROCEEDING.
            </p>
          </section>

          {/* Governing Law */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">13. Governing Law</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed">
              These Terms shall be governed by and defined following the laws of the State of Delaware, United States. Storelib and yourself irrevocably consent that the courts of Delaware shall have exclusive jurisdiction to resolve any dispute which may arise in connection with these Terms.
            </p>
          </section>

          {/* Modifications */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">14. Modifications and Interruptions</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              We reserve the right to change, modify, or remove the contents of the Platform at any time or for any reason at our sole discretion without notice. We also reserve the right to modify or discontinue all or part of the Platform without notice at any time.
            </p>
            <p className="text-[15px] text-[#4b5563] leading-relaxed">
              We will not be liable to you or any third party for any modification, price change, suspension, or discontinuance of the Platform. We cannot guarantee the Platform will be available at all times. We may experience hardware, software, or other problems or need to perform maintenance related to the Platform.
            </p>
          </section>

          {/* Corrections */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">15. Corrections</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed">
              There may be information on the Platform that contains typographical errors, inaccuracies, or omissions, including descriptions, pricing, availability, and various other information. We reserve the right to correct any errors, inaccuracies, or omissions and to change or update the information on the Platform at any time, without prior notice.
            </p>
          </section>

          {/* Entire Agreement */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">16. Entire Agreement</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed">
              These Terms, together with our Privacy Policy and any other legal notices published by us on the Platform, constitute the entire agreement between you and us concerning your use of the Platform. If any provision of these Terms is deemed invalid by a court of competent jurisdiction, the invalidity of such provision shall not affect the validity of the remaining provisions, which shall remain in full force and effect.
            </p>
          </section>

          {/* Contact */}
          <section className="mb-10">
            <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-4">17. Contact Us</h2>
            <p className="text-[15px] text-[#4b5563] leading-relaxed mb-4">
              If you have any questions about these Terms, please contact us:
            </p>
            <ul className="list-none space-y-2 text-[15px] text-[#4b5563]">
              <li><strong>Email:</strong> <a href="mailto:legal@storelib.com" className="text-[#8b5cf6] hover:underline">legal@storelib.com</a></li>
              <li><strong>Support:</strong> <a href="mailto:support@storelib.com" className="text-[#8b5cf6] hover:underline">support@storelib.com</a></li>
            </ul>
          </section>
        </div>

        {/* Footer Links */}
        <div className="mt-12 pt-8 border-t border-[#e5e7eb]">
          <div className="flex flex-wrap justify-center gap-6 text-[13px]">
            <Link href="/privacy" className="text-[#6b7280] hover:text-[#1a1a2e] transition-colors">
              Privacy Policy
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
