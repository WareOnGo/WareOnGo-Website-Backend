-- Legal CMS pages: additive schema and the existing website copy, unchanged.
-- Run in Supabase SQL Editor BEFORE deploying the backend, CMS and website.
-- Re-running never overwrites an editor's content.
BEGIN;
CREATE TABLE IF NOT EXISTS "public"."LegalPage" (
  "slug" TEXT PRIMARY KEY,
  "draftContent" JSONB NOT NULL,
  "publishedContent" JSONB NOT NULL,
  "deployedContent" JSONB,
  "deployedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LegalPage_slug_check" CHECK ("slug" IN ('privacy-policy', 'terms-of-service'))
);
ALTER TABLE "public"."LegalPage" ENABLE ROW LEVEL SECURITY;
-- Both revisions start with exactly the policy already on the website.
INSERT INTO "public"."LegalPage" ("slug", "draftContent", "publishedContent", "deployedContent", "updatedAt")
SELECT p->>'slug', p, p, p, CURRENT_TIMESTAMP
FROM jsonb_array_elements($legal_seed$
[
  {
    "slug": "privacy-policy",
    "title": "Privacy Policy for Google OAuth Integration",
    "seoTitle": "Privacy Policy | WareOnGo",
    "description": "WareOnGo privacy policy — how we collect, use, and protect your information.",
    "effectiveDate": "2025-11-01",
    "updated": "2025-11-22",
    "blocks": [
      {
        "kind": "p",
        "text": "This Privacy Policy describes how Neuroware Technologies Private Limited (\"we,\" \"our,\" \"us\") & its domain and brand \"WareOnGo\" (hereinafter collectively referred to as the \"Platform\") This policy covers the use of personal data across the Platform's website and services. While it outlines our general data handling practices, certain products or services may have additional data usage details, which will be shared with you through specific notices or supplementary policies at the time of data collection."
      },
      {
        "kind": "p",
        "text": "Additionally, it includes how we collect, use, and disclose personal information when you use the OAuth consent screen provided by Google to log in to our application using your email address. By logging in with your email address, you consent to the practices described in this policy."
      },
      {
        "kind": "h2",
        "text": "Information We Collect"
      },
      {
        "kind": "p",
        "text": "During the use of our website, we may collect the following types of personal information:"
      },
      {
        "kind": "ul",
        "items": [
          "**Personal Information:** We may collect your name, email address, and other contact details associated with your email account.",
          "**OAuth Permissions:** We may collect and store the permissions you grant to our application during the OAuth consent process. These permissions allow us to access certain information from your email account, as authorized by you.",
          "**Embedded Content from other websites:** Articles on this site may include embedded content (e.g. videos, images, articles, etc.). Embedded content from other websites behaves in the exact same way as if the visitor has visited the other website. These websites may collect data about you, use cookies, embed additional third-party tracking, and monitor your interaction with that embedded content, including tracking your interaction with the embedded content if you have an account and are logged in to that website."
        ]
      },
      {
        "kind": "h2",
        "text": "Use of Information"
      },
      {
        "kind": "p",
        "text": "We use the information collected on our website for the following purposes:"
      },
      {
        "kind": "ul",
        "items": [
          "**Authentication and Account Access:** We use your email address and associated permissions to authenticate your identity and provide you with access to our application.",
          "**Service Provision:** We may use the information to provide you with the requested services, including personalized features, support, and updates related to our application.",
          "**Communication:** We may use your email address to send you important notifications, updates, and information related to your use of our application.",
          "**Improvements and Analytics:** We may use aggregated and anonymized data for analytical purposes to improve our application, understand user preferences, and optimize our services.",
          "**Google API Services Usage:** Information received from Google APIs is not used to develop, improve, or train generalized artificial intelligence (AI) and/or machine learning (ML) models."
        ]
      },
      {
        "kind": "h2",
        "text": "Disclosure of Information"
      },
      {
        "kind": "p",
        "text": "We do not sell, trade, or otherwise transfer your personal information to third parties without your explicit consent, except in the following circumstances:"
      },
      {
        "kind": "ul",
        "items": [
          "**Service Providers:** We may share your personal information with trusted third-party service providers who assist us in operating our application and providing services to you. These service providers are contractually obligated to maintain the confidentiality and security of your personal information.",
          "**Legal Compliance:** We may disclose your personal information if required by law, governmental or regulatory authorities, or to protect our rights, property, or safety, or that of our users or the public."
        ]
      },
      {
        "kind": "h2",
        "text": "Data Security"
      },
      {
        "kind": "p",
        "text": "We take reasonable measures to protect the personal information collected through the OAuth consent screen from unauthorized access, use, or disclosure. However, please note that no method of transmission over the internet or method of electronic storage is 100% secure."
      },
      {
        "kind": "h2",
        "text": "Data Retention"
      },
      {
        "kind": "p",
        "text": "We retain your personal information for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required or permitted by law."
      },
      {
        "kind": "h2",
        "text": "Your Rights"
      },
      {
        "kind": "p",
        "text": "You may have certain rights regarding your personal information, including the right to access, correct, or delete your information. To exercise these rights or if you have any questions or concerns about the processing of your personal information, please contact us using the information provided below."
      },
      {
        "kind": "h2",
        "text": "Changes to this Privacy Policy"
      },
      {
        "kind": "p",
        "text": "We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements. We will notify you of any material changes by posting the updated Privacy Policy on our website or through other communication channels."
      },
      {
        "kind": "h2",
        "text": "Disclaimer"
      },
      {
        "kind": "p",
        "text": "All content, services, images, names, advertisements, and other materials available on this website are provided on an \"as is\" basis. Neuroware Technologies Pvt. Ltd. makes no guarantees or warranties—express or implied—including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement. Users are encouraged to independently evaluate whether the information provided meets their specific needs before relying on it."
      },
      {
        "kind": "p",
        "text": "We may collect information voluntarily shared by users to enhance and personalize their browsing experience or to improve future content. However, the information presented on this site should not be interpreted as legal, financial, or professional advice. WareOnGo is a trademark-applied brand. All other product names, logos, or trademarks mentioned on the site remain the property of their respective owners."
      },
      {
        "kind": "p",
        "text": "Neuroware Technologies Pvt. Ltd. shall not be liable for any form of loss or damage—whether direct, indirect, incidental, or consequential—that may result from the use of, or reliance on, content provided on this site. This includes, but is not limited to, data loss, system damage, or lost business opportunities."
      },
      {
        "kind": "h2",
        "text": "Contact Us"
      },
      {
        "kind": "p",
        "text": "If you have any questions or concerns about this Privacy Policy or our privacy practices, please contact us at [sales@wareongo.com](mailto:sales@wareongo.com)"
      }
    ],
    "notice": "By using this website (www.wareongo.com) or the OAuth consent screen provided by Google and logging in with your email address, you acknowledge that you have read and understood this Privacy Policy and agree to the collection, use, and disclosure of your personal information as described herein."
  },
  {
    "slug": "terms-of-service",
    "title": "WareOnGo Terms of Service",
    "seoTitle": "Terms of Service | WareOnGo",
    "description": "WareOnGo terms of service — rules and conditions for using our warehouse discovery platform.",
    "effectiveDate": "2025-11-01",
    "updated": "2025-11-22",
    "blocks": [
      {
        "kind": "h2",
        "text": "GENERAL"
      },
      {
        "kind": "p",
        "text": "We, M/s. Neuroware Technologies Private Limited (hereinafter referred to as the \"Company\") is a Private Limited company registered under the Companies Act 1956/2013, having its registered office at \"Ib-21, Ridgewood Estate, DLF Phase 4, Gurgaon\" represented by its directors and members, where such expression shall unless repugnant to the context thereof, be deemed to include its directors, respective legal heirs, representatives, administrators, permitted successors and assigns. The creator of these Terms of Service ensures steady commitment to Your privacy with regard to the protection of your invaluable information. This document contains information about the Application \"WareOnGo\" and Website www.wareongo.com (hereinafter collectively referred to as the \"Platform\")"
      },
      {
        "kind": "p",
        "text": "For the purpose of these Terms of Use (\"Terms\"), wherever the context so requires,"
      },
      {
        "kind": "p",
        "text": "\"We\", \"Our\", and \"Us\" shall mean and refer to the Platform and/or the Company, as the context so requires.",
        "compact": true
      },
      {
        "kind": "p",
        "text": "\"You\", \"Your\", \"Yourself\", \"Customer\" shall mean and refer to natural and legal individuals who use the Platform and who is competent to enter into binding contracts, as per Indian laws.",
        "compact": true
      },
      {
        "kind": "p",
        "text": "\"Services\" refer to providing a Platform for Customers to avail service including but not limited to real estate leasing/buying/selling & warehousing services through this platform.",
        "compact": true
      },
      {
        "kind": "p",
        "text": "\"Third Parties\" refer to any Application, company or individual apart from the Customer and the creator of this Platform.",
        "compact": true
      },
      {
        "kind": "p",
        "text": "The term \"Platform\" to the website only works as a bridge between the Company and the Customers to facilitate or list warehouse & commercial spaces."
      },
      {
        "kind": "p",
        "text": "The headings of each section in these Terms are only for the purpose of organizing the various provisions under these Terms in an orderly manner and shall not be used by either Party to interpret the provisions contained herein in any manner. Further, it is specifically agreed to by the Parties that the headings shall have no legal or contractual value."
      },
      {
        "kind": "p",
        "text": "The use of this Platform by the Customer is solely governed by these Terms as well as the Privacy Policy, and any modifications or amendments made thereto by the Company, from time to time, at its sole discretion. If You continue to access and use this Platform, you are agreeing to comply with and be bound by the following Terms and Conditions of Use and Our Privacy Policy. The Customer expressly agrees and acknowledges that these Terms and Policy are co-terminus in nature and that expiry/termination of either one will lead to the termination of the other."
      },
      {
        "kind": "p",
        "text": "The Customer unequivocally agrees that these Terms and the aforementioned Policy constitute a legally binding agreement between the Customer and the Company, and that the Customer shall be subject to the roles, guidelines, policies, terms, and conditions applicable to any service that is provided by the Platform, and that the same shall be deemed to be incorporated into these Terms, and shall be treated as part and parcel of the same. The Customer acknowledges and agrees that no signature or express act is required to make these Terms and the Policy binding on the Customer and that the Customer's act of visiting any part of the Platform constitutes the Customer 's full and final acceptance of these Terms and the aforementioned Policy."
      },
      {
        "kind": "p",
        "text": "The Company reserves the sole and exclusive right to amend or modify these Terms without any prior permission or intimation to the Customer, and the Customer expressly agrees that any such amendments or modifications shall come into effect immediately. The Customer has a duty to periodically check the terms and stay updated on its requirements. If the Customer continues to use the Platform following such a change, the Customer will be deemed to have consented to any and all amendments/modifications made to the Terms. In so far as the Customer complies with these Terms, it is granted a personal, non-exclusive, non-transferable, revocable, limited privilege to access and use the Platform and the Services. If the Customer does not adhere to the changes, you must stop using the Services at once. Your continued use of the Services will signify your acceptance of the changed terms."
      },
      {
        "kind": "p",
        "text": "The Company reserves the sole and exclusive right to amend or modify these Terms without any prior permission or intimation to the Customer, and the Customer expressly agrees that any such amendments or modifications shall come into effect immediately. The Customer has a duty to periodically check the terms and stay updated on its requirements. If the Customer continues to use the Platform following such a change, the Customer will be deemed to have consented to any and all amendments/modifications made to the Terms. In so far as the Customer complies with these Terms, it is granted a personal, non-exclusive, non-transferable, revocable, limited privilege to access and use the Platform and the Services. If the Customer does not adhere to the changes, you must stop using the Services at once. Your continued use of the Services will signify your acceptance of the changed terms."
      },
      {
        "kind": "p",
        "text": "Accepting these terms of service will automatically result in the acceptance of Privacy policy which can be found on www.wareongo.com"
      },
      {
        "kind": "h2",
        "text": "1. Introduction"
      },
      {
        "kind": "p",
        "text": "By accessing, browsing, or using the services on wareongo.com (the \"Website\"), you (the \"Customer\", \"User\", \"You\", \"Yourself\") agree to be bound by these Terms of Service and our Privacy Policy. All services and information provided or facilitated by the Company are subject to these terms, which can be updated or revised at our sole discretion; continued use after changes constitutes acceptance."
      },
      {
        "kind": "h2",
        "text": "2. Services Overview"
      },
      {
        "kind": "p",
        "text": "The Company provides a platform for browsing, researching, contacting, and leasing warehouses and related logistics properties. The company acts as an intermediary, connecting seekers and providers of warehouse spaces, but does not own, operate, guarantee, or validate any warehouse listings. All leasing agreements and commercial transactions are directly between the Customer and the third-party warehouse providers."
      },
      {
        "kind": "h2",
        "text": "3. Eligibility"
      },
      {
        "kind": "p",
        "text": "You must be at least 18 years old and legally competent under Indian law to enter binding contracts to use this platform. Minors may only use Services under adult supervision."
      },
      {
        "kind": "p",
        "text": "Registration is required, and you must provide true and accurate information at all times. Unauthorized use or fraudulent activity will result in account suspension/termination."
      },
      {
        "kind": "h2",
        "text": "4. Account & Registration"
      },
      {
        "kind": "p",
        "text": "You are exclusively responsible for maintaining the confidentiality and security of your account credentials. All activities conducted under your account are deemed to be by you."
      },
      {
        "kind": "p",
        "text": "Notify us immediately of any unauthorized account usage."
      },
      {
        "kind": "h2",
        "text": "5. Use of Platform"
      },
      {
        "kind": "p",
        "text": "You agree not to:"
      },
      {
        "kind": "ul",
        "items": [
          "Commit fraud, misrepresentation, or unlawful activities.",
          "Host, upload, or share content that is obscene, defamatory, offensive, or violates local laws.",
          "Infringe upon copyrights, trademarks, or proprietary rights.",
          "Interfere with the technical operation of the site, access it via non-permitted means, or reverse engineer any features."
        ]
      },
      {
        "kind": "p",
        "text": "Unauthorized commercial use or content reproduction is prohibited without written consent."
      },
      {
        "kind": "h2",
        "text": "6. Content & Intellectual Property"
      },
      {
        "kind": "p",
        "text": "The Website and all its content (design, trademarks, software, visuals) are protected under copyright/IP law."
      },
      {
        "kind": "p",
        "text": "All user-generated content remains the responsibility of the contributor; the Company claims no liability for authenticity, loss, or damage incurred by such content."
      },
      {
        "kind": "p",
        "text": "No right to use the Company's brand assets or IP without express written permission."
      },
      {
        "kind": "h2",
        "text": "7. Disclaimers and Limitation of Liability"
      },
      {
        "kind": "p",
        "text": "All services, facilities, and information are provided \"as is\"— the Company offers no warranty (express or implied) about accuracy, reliability, merchantability, or fitness for a particular purpose."
      },
      {
        "kind": "p",
        "text": "The Company is not liable for any losses, damages (direct/indirect/consequential), or inconvenience arising from the use or inability to use the Website or its content."
      },
      {
        "kind": "p",
        "text": "Transactions between customer and warehouse provider are at the customer's own risk; the Company bears no responsibility for unsatisfactory services, damages, or disputes."
      },
      {
        "kind": "h2",
        "text": "8. Indemnity"
      },
      {
        "kind": "p",
        "text": "You agree to indemnify, defend, and hold harmless the Company, its directors, officers, employees, agents against any and all claims, liabilities, damages, losses, costs or expenses (including legal fees) arising out of or related to your use of the Website, breach of these terms, or violation of any law or third party rights. No settlement involving the Company may be made without our written approval."
      },
      {
        "kind": "h2",
        "text": "9. Force Majeure"
      },
      {
        "kind": "p",
        "text": "The Company is not liable for any delays, failures, or damages caused by events beyond reasonable control (war, natural disasters, strikes, internet failures, etc.)."
      },
      {
        "kind": "h2",
        "text": "10. Termination/Suspension"
      },
      {
        "kind": "p",
        "text": "The Company reserves the right to terminate, suspend or restrict your access at any time without notice or cause if you breach these terms, submit false information, or pose risks to other users or to the Website."
      },
      {
        "kind": "h2",
        "text": "11. Governing Law & Jurisdiction"
      },
      {
        "kind": "p",
        "text": "These Terms shall be governed by the laws of India. The courts located at Hyderabad, Telangana will have exclusive jurisdiction over any disputes arising hereunder."
      },
      {
        "kind": "h2",
        "text": "12. Dispute Resolution"
      },
      {
        "kind": "p",
        "text": "Any disputes are subject to two-step Alternate Dispute Resolution: (1) Mediation, and failing resolution within 30 days, (2) Arbitration by a sole arbitrator appointed by the Company, with proceedings held in [City, State], India, in English."
      },
      {
        "kind": "h2",
        "text": "13. Severability"
      },
      {
        "kind": "p",
        "text": "If any clause of these Terms is found invalid, the rest will remain enforceable."
      },
      {
        "kind": "h2",
        "text": "14. Notices & Contact"
      },
      {
        "kind": "p",
        "text": "Any and all communication relating to any dispute or grievance experienced by the Customer may be communicated to the Company by the Customer by email to sales@wareongo.com. If you have any questions about this Agreement, the practices of the Platform, or your experience with the Service, you can contact us at sales@wareongo.com."
      }
    ],
    "notice": ""
  }
]
$legal_seed$::jsonb) AS p
ON CONFLICT ("slug") DO NOTHING;
COMMIT;
