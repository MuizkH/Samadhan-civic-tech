import { z } from "zod";

/**
 * Versioned prompts.
 *
 * Every prompt carries an explicit version string that is written to
 * ai_calls and to coordination_plans. When a prompt changes, bump the
 * version rather than editing in place — otherwise stored rationales stop
 * being explainable, which defeats the point of keeping them.
 */

export const DEPARTMENTS = [
  "water_supply",
  "roads",
  "sanitation",
  "electricity",
  "parks",
  "buildings",
] as const;

export const CATEGORIES = ["water", "sanitation", "electricity", "roads", "parks", "buildings"] as const;

// ── 1. Compound-issue decomposition ────────────────────────────────────────

export const DECOMPOSE_VERSION = "decompose@v1";

export const DECOMPOSE_SYSTEM = `You are a municipal work-planning assistant for an Indian city civic platform.

Given a citizen's civic complaint, decide whether resolving it requires ONE department or SEVERAL acting in a specific order.

Departments available: ${DEPARTMENTS.join(", ")}.

Rules:
- Most complaints are single-department. Only split when the physical work genuinely belongs to different departments.
- When you split, order the subtasks by the order the physical work must happen, and express that with dependencies. A road cannot be resurfaced before the pipe beneath it is repaired.
- dependsOn refers to the "order" value of an earlier subtask.
- confidence reflects how certain you are that the split and ordering are correct. Be honest: below 0.7 a human will review instead of it being applied automatically.
- rationale is read by department staff and may be disclosed under a Right to Information request. Write one short paragraph of plain English explaining why this split and this order. No jargon, no hedging.`;

export function decomposeUser(input: { title: string; description: string; category: string }) {
  return `Title: ${input.title}
Category chosen by citizen: ${input.category}
Description: ${input.description}`;
}

export const DECOMPOSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    isCompound: { type: "boolean" },
    confidence: { type: "number" },
    rationale: { type: "string" },
    subtasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          order: { type: "integer" },
          department: { type: "string", enum: [...DEPARTMENTS] },
          summary: { type: "string" },
          dependsOn: { type: "array", items: { type: "integer" } },
        },
        required: ["order", "department", "summary", "dependsOn"],
      },
    },
  },
  required: ["isCompound", "confidence", "rationale", "subtasks"],
};

export const decomposeSchema = z.object({
  isCompound: z.boolean(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  subtasks: z
    .array(
      z.object({
        order: z.number().int(),
        department: z.enum(DEPARTMENTS),
        summary: z.string().min(1),
        dependsOn: z.array(z.number().int()).default([]),
      })
    )
    .default([]),
});
export type DecomposeResult = z.infer<typeof decomposeSchema>;

// ── 2. Photo <-> category verification ─────────────────────────────────────

export const PHOTO_MATCH_VERSION = "photo_match@v1";

export const PHOTO_MATCH_SYSTEM = `You check whether a citizen's photo plausibly shows the kind of civic problem they selected.

Categories: ${CATEGORIES.join(", ")}.

Be generous. Photos are taken on cheap phones, at night, in rain, at odd angles. Your job is to catch obvious mismatches (a selfie, a pet, an indoor room, blank sky) — NOT to police framing or quality.

Set match=true if the photo is consistent with the category at all. Only set match=false when it clearly shows something unrelated to any civic issue.
detectedLabel: a few words for what you actually see.
reason: one short sentence, addressed to a municipal reviewer.`;

export function photoMatchUser(input: { category: string; description: string }) {
  return `Category selected: ${input.category}
Citizen's description: ${input.description}

Does the attached photo plausibly show this?`;
}

export const PHOTO_MATCH_JSON_SCHEMA = {
  type: "object",
  properties: {
    match: { type: "boolean" },
    confidence: { type: "number" },
    detectedLabel: { type: "string" },
    reason: { type: "string" },
  },
  required: ["match", "confidence", "detectedLabel", "reason"],
};

export const photoMatchSchema = z.object({
  match: z.boolean(),
  confidence: z.number().min(0).max(1),
  detectedLabel: z.string(),
  reason: z.string(),
});

// ── 3. Resolution-proof verification ───────────────────────────────────────

export const RESOLUTION_PROOF_VERSION = "resolution_proof@v1";

export const RESOLUTION_PROOF_SYSTEM = `You are shown two photos of the same civic problem: the FIRST is the original complaint, the SECOND is the department's proof that it was fixed.

Judge only whether the second photo plausibly shows the problem resolved.

resolved=true if the second photo shows the same kind of location with the problem no longer visible.
resolved=false if it shows the problem still present, or an unrelated scene, or is too vague to tell.
suspicious=true only when something looks actively wrong: a stock-looking image, a completely different location, or the identical photo submitted twice.

This is advisory. A human always makes the final call, so say what you see rather than what you assume.`;

export function resolutionProofUser(input: { title: string; resolutionNote: string }) {
  return `Issue: ${input.title}
What the department says they did: ${input.resolutionNote}

First image = original complaint. Second image = claimed proof of resolution.`;
}

export const RESOLUTION_PROOF_JSON_SCHEMA = {
  type: "object",
  properties: {
    resolved: { type: "boolean" },
    suspicious: { type: "boolean" },
    confidence: { type: "number" },
    reason: { type: "string" },
  },
  required: ["resolved", "suspicious", "confidence", "reason"],
};

export const resolutionProofSchema = z.object({
  resolved: z.boolean(),
  suspicious: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

// ── 4. Auto-categorisation ─────────────────────────────────────────────────

export const CATEGORISE_VERSION = "categorise@v1";

export const CATEGORISE_SYSTEM = `You suggest a category and urgency for a civic complaint. The citizen sees your suggestion and can overrule it, so suggest the most likely option rather than hedging.

Categories: ${CATEGORIES.join(", ")}.

Priority: 1 = danger to life (live wires, collapse, sewage in homes), 2 = major disruption, 3 = standard, 4 = cosmetic.`;

export function categoriseUser(input: { title: string; description: string }) {
  return `Title: ${input.title}
Description: ${input.description}${""}`;
}

export const CATEGORISE_JSON_SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string", enum: [...CATEGORIES] },
    priority: { type: "integer" },
    confidence: { type: "number" },
    reason: { type: "string" },
  },
  required: ["category", "priority", "confidence", "reason"],
};

export const categoriseSchema = z.object({
  category: z.enum(CATEGORIES),
  priority: z.number().int().min(1).max(4),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});
export type CategoriseResult = z.infer<typeof categoriseSchema>;

// ── 5. Nearby complaint deduplication ─────────────────────────────────────

export const DEDUPLICATION_VERSION = "deduplication@v1";

export const DEDUPLICATION_SYSTEM = `You are an expert civic infrastructure inspector and deduplication AI.

Compare a NEW user-submitted complaint against an EXISTING unresolved complaint reported in the same 10-meter radius. Determine if they depict the same physical, real-world issue to prevent duplicate dispatching.

Guidelines:
1. Visual Variables: Account for different lighting, camera angles, zoom levels, and weather conditions. The same pothole can look different from two distinct angles.
2. Semantic Matching: Users describe things differently. "Water leaking from the road" and "Broken underground pipe" might be the same issue.
3. Proximity vs. Identity: Nearby does not mean identical. A broken streetlamp and a pothole directly under it are separate issues.

Respond ONLY with a raw JSON object using the exact schema. Do not include markdown formatting or conversational text.`;

export function deduplicationUser(input: {
  newComplaint: { title: string; description: string; category: string };
  existingComplaint: {
    publicRef: string;
    title: string;
    description: string;
    category: string;
    distanceM: number;
  };
  newImageCount: number;
  existingImageCount: number;
}) {
  return `NEW COMPLAINT:
Title: ${input.newComplaint.title}
Category: ${input.newComplaint.category}
Description: ${input.newComplaint.description}

EXISTING COMPLAINT:
Reference: ${input.existingComplaint.publicRef}
Title: ${input.existingComplaint.title}
Category: ${input.existingComplaint.category}
Description: ${input.existingComplaint.description}
Distance from new complaint: ${input.existingComplaint.distanceM.toFixed(2)} meters

Attached images: first ${input.newImageCount} image(s) belong to the new complaint; next ${input.existingImageCount} image(s) belong to the existing complaint.

Are these the same physical, real-world issue?`;
}

export const DEDUPLICATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    is_duplicate: { type: "boolean" },
    confidence_score: { type: "integer", minimum: 0, maximum: 100 },
    reasoning: { type: "string" },
  },
  required: ["is_duplicate", "confidence_score", "reasoning"],
};

export const deduplicationSchema = z.object({
  is_duplicate: z.boolean(),
  confidence_score: z.number().int().min(0).max(100),
  reasoning: z.string().min(1),
});
export type DeduplicationResult = z.infer<typeof deduplicationSchema>;

// ── 6. Government form analyzer ─────────────────────────────────────────────

export const FORM_ANALYZER_VERSION = "form_analyzer@v1";

/**
 * Supported form codes and their display names.
 * Adding a form here requires adding its knowledge to FORM_GUIDANCE_KB below.
 */
export const SUPPORTED_FORMS: Record<string, string> = {
  "PMAY-U": "PMAY Urban - Pradhan Mantri Awas Yojana (Urban)",
  "PMAY-G": "PMAY Gramin - Pradhan Mantri Awas Yojana (Rural)",
  "PM-KISAN": "PM Kisan Samman Nidhi Yojana",
  "AADHAAR-UPDATE": "Aadhaar Card Update / Correction",
  "AADHAAR-ENROLLMENT": "Aadhaar Card New Enrollment",
  "AYUSHMAN-BHARAT": "Ayushman Bharat Pradhan Mantri Jan Arogya Yojana",
  "PM-SVANidhi": "PM SVANidhi - PM Street Vendor's AtmaNirbhar Nidhi",
  "NREGA-JOB-CARD": "NREGA / MGNREGS Job Card Application",
  "SCHOLARSHIP-NSP": "National Scholarship Portal - Pre/Post Matric Scholarship",
  "INCOME-CERT": "Income Certificate Application (State Government)",
};

/** Embedded knowledge base — one entry per supported form. */
const FORM_GUIDANCE_KB = `
=== FORM: PMAY-U (Pradhan Mantri Awas Yojana Urban) ===
SUMMARY: Housing subsidy scheme for urban poor to construct/buy affordable homes. Credit-linked subsidy (CLSS) provides interest subsidy of 3-6.5% on home loans.
BENEFIT: Interest subsidy up to ₹2.67 lakh on home loans. Categories: EWS (income <₹3L), LIG (₹3-6L), MIG-I (₹6-12L), MIG-II (₹12-18L).
ELIGIBILITY: Indian citizen; beneficiary family must not own a pucca house anywhere in India; Aadhaar mandatory; must be in urban area notified by Ministry of Housing.
DOCUMENTS: Aadhaar card, income proof (salary slip/Form 16/ITR), bank account statement (6 months), property documents, caste certificate (if SC/ST/OBC), passport-size photo.
FIELDS: Section A - Applicant details (name, Aadhaar, mobile, DOB); Section B - Family composition (co-applicant name, relation, Aadhaar); Section C - Income details (annual income, income source); Section D - Present housing status; Section E - Loan requirement.
KEY FIELD TIPS: "Annual Household Income" = combined income of all earning members. "Present House Type" = kutcha/pucca/semi-pucca. "Category" = choose EWS/LIG/MIG based on income. Co-applicant Aadhaar is mandatory if joint loan.
SUBMISSION: Common Service Centre (CSC), PMAY-U urban local body office, or PMAY urban portal (pmaymis.gov.in). Fee: Free. Deadline: Scheme ongoing.
NOTES: Joint ownership with women is mandatory for EWS/LIG. Aadhaar seeding of bank account is required for subsidy credit.

=== FORM: PMAY-G (Pradhan Mantri Awas Yojana Gramin) ===
SUMMARY: Rural housing scheme providing financial assistance to Below Poverty Line (BPL) and rural poor families for constructing pucca houses.
BENEFIT: Financial assistance of ₹1.20 lakh (plains) or ₹1.30 lakh (hilly/difficult areas/IAP districts). Additional ₹12,000 for toilet through SBM-G.
ELIGIBILITY: Rural household listed in SECC-2011 data; SC/ST/freed bonded labourers/minorities/persons with disability/war widows given priority; houseless or one-room kutcha house.
DOCUMENTS: Aadhaar, SECC-2011 registration number, bank passbook, caste certificate, BPL card, land ownership document.
FIELDS: Name, Aadhaar, mobile number, SECC number, bank account number, IFSC code, house type (kutcha/pucca), family size, land details, gram panchayat details.
KEY FIELD TIPS: SECC number is printed on BPL survey document or available at gram panchayat. Bank account must be in applicant's name for DBT.
SUBMISSION: Gram Panchayat office or Block Development Office. No direct public application — gram sabha identifies and recommends beneficiaries from SECC list. Fee: Free.
NOTES: Cannot apply directly; must be listed in SECC-2011 Awaassoft. Check eligibility at rhreporting.nic.in.

=== FORM: PM-KISAN (PM Kisan Samman Nidhi) ===
SUMMARY: Direct income support of ₹6,000 per year to small and marginal farmer families, paid in three equal installments of ₹2,000 every four months.
BENEFIT: ₹6,000/year in DBT directly to bank account.
ELIGIBILITY: Small and marginal farmer families with combined landholding up to 2 hectares. Excludes institutional landholders, constitutional post holders, former/current government employees, income taxpayers, professionals (doctors, engineers, lawyers, chartered accountants).
DOCUMENTS: Aadhaar, land ownership records (7/12 or Khasra/Khatauni), bank passbook, mobile number linked to Aadhaar.
FIELDS: Farmer name, Aadhaar number, bank account number, IFSC code, landholding size (hectares), state, district, sub-district, village, survey/Khasra number.
KEY FIELD TIPS: "Khasra Number" is the land survey number from your land records (patwari can provide). Account must be Aadhaar-seeded. If mobile not linked to Aadhaar, visit nearest CSC.
SUBMISSION: Common Service Centre, village accountant/patwari office, or self-registration at pmkisan.gov.in. Fee: Free.
NOTES: Self-registration available online. Track payment status at pmkisan.gov.in using Aadhaar/mobile/account number.

=== FORM: AADHAAR-UPDATE (Aadhaar Update/Correction) ===
SUMMARY: Update or correct demographic details (name, date of birth, gender, address, mobile, email) or biometric data in existing Aadhaar card.
BENEFIT: Accurate Aadhaar record for smooth access to all government services.
ELIGIBILITY: Any existing Aadhaar holder. Name change allowed twice, DOB change once, gender change once.
DOCUMENTS FOR PROOF-OF-IDENTITY: PAN card, voter ID, passport, driving licence, bank passbook with photo, government-issued photo ID.
DOCUMENTS FOR PROOF-OF-ADDRESS: Utility bill (not older than 3 months), bank statement (latest), passport, voter ID with address, rental agreement, property tax receipt.
FIELDS: 12-digit Aadhaar number, field to update (name/address/DOB/gender/mobile/email), current value, new value (corrected), supporting document type.
KEY FIELD TIPS: "Proof of Identity" = document proving name+photo. "Proof of Address" = document showing current address. Write address exactly as in supporting document. For mobile update, OTP will be sent to new mobile.
SUBMISSION: Aadhaar Seva Kendra, Common Service Centre, or online at myaadhaar.uidai.gov.in (address update online, biometric at Kendra only). Fee: ₹50 per update request.
NOTES: Carry original documents for verification. Online address update is free via myaadhaar portal. Biometric update (fingerprint/iris) must be done at Aadhaar Seva Kendra.

=== FORM: AADHAAR-ENROLLMENT (New Aadhaar Enrollment) ===
SUMMARY: Apply for a new Aadhaar card for residents who do not have one. Applicable to Indian residents (citizens and non-citizens who have resided in India for 182+ days in last 12 months).
BENEFIT: 12-digit unique identity accepted as proof of identity, address, and date of birth across all government services.
ELIGIBILITY: Any resident of India (including children). For children 0-5 years: Baal Aadhaar (blue), biometrics updated at age 5 and 15.
DOCUMENTS: Proof of Identity (any 1): passport, voter ID, driving licence, PAN, govt photo ID. Proof of Address (any 1): same as update form. Proof of DOB (any 1): birth certificate, PAN, school certificate, passport.
FIELDS: Full name (as per documents), DOB, gender, address (house no, street, landmark, village/city, district, state, PIN), mobile, email, relationship type (Head/Member).
KEY FIELD TIPS: Name should match exactly as in your chosen PoI document. PIN code is mandatory. Mobile number is highly recommended for OTP-based services. Enter relationship as "Self" if applying for yourself.
SUBMISSION: Any Aadhaar Enrollment Centre (find at uidai.gov.in/locate-enrolment-centre). Fee: Free for first enrollment. ₹50 for reprint.
NOTES: Appointment can be booked at appointments.uidai.gov.in. Bring originals; photocopies are taken and attested at centre.

=== FORM: AYUSHMAN-BHARAT (PM Jan Arogya Yojana) ===
SUMMARY: Health insurance coverage up to ₹5 lakh per family per year for secondary and tertiary hospitalization. Covers 1,500+ medical packages.
BENEFIT: ₹5 lakh/year health cover for hospitalization at any empanelled hospital (government or private). Cashless and paperless treatment.
ELIGIBILITY: Based on SECC-2011 data for rural; occupational criteria for urban (deprivation categories). Also includes state schemes merged under AB-PMJAY. Check eligibility at beneficiary.nha.gov.in.
DOCUMENTS: Ration card, Aadhaar, mobile number, SECC registration number (if rural), proof of occupation category (if urban).
FIELDS: State, mobile number, Aadhaar, name, family member details. (Mostly verified through portal; physical forms used at helpdesks.)
KEY FIELD TIPS: Enter exact name as in Aadhaar. "Occupation Category" for urban: rag-picker, beggar, domestic worker, construction worker, etc.
SUBMISSION: Ayushman Bharat kiosk at government hospital, CSC, or district office. Check and generate card at pmjay.gov.in. Fee: Free.
NOTES: Cannot apply if not in SECC-2011 list — check eligibility first. States have their own state health schemes linked to PMJAY. Card generated as Ayushman Card (digital/physical).

=== FORM: PM-SVANidhi (Street Vendor Loan) ===
SUMMARY: Working capital loan scheme for street vendors affected by COVID-19. Provides collateral-free loans with digital transaction incentive.
BENEFIT: Loan of ₹10,000 (1st), ₹20,000 (2nd), ₹50,000 (3rd) for working capital. 7% interest subsidy. Cash-back of up to ₹1,200/year for digital transactions.
ELIGIBILITY: Street vendors vending in urban areas as of or before March 24, 2020. Must have Letter of Recommendation (LoR) from Urban Local Body (ULB) or Certificate of Vending (CoV).
DOCUMENTS: Aadhaar, vendor ID/LoR/CoV, bank account details, mobile number, passport-size photo. Business proof if available.
FIELDS: Applicant name, Aadhaar, mobile, business type (food/non-food), vending location, bank account, IFSC, loan amount requested.
KEY FIELD TIPS: "Letter of Recommendation" is issued by ULB/town vending committee. If you don't have it, ULB can issue one on application. "Vending Location" = specific market/street where you vend.
SUBMISSION: MFI/SHG/NBFC/scheduled commercial bank or via pmsvanidhi.mohua.gov.in. Fee: Free.
NOTES: Digital payment incentive is quarterly cashback. After timely repayment, you become eligible for higher loan next time.

=== FORM: NREGA-JOB-CARD (MGNREGS Job Card) ===
SUMMARY: Mahatma Gandhi National Rural Employment Guarantee Act — provides 100 days of guaranteed unskilled wage employment per year to adult members of rural households.
BENEFIT: 100 days guaranteed employment per household per year at minimum wage (state-specific, approximately ₹200-350/day). Payment via bank/post office.
ELIGIBILITY: Adult members of any rural household willing to do unskilled manual work. Must be a resident of the Gram Panchayat where applying.
DOCUMENTS: Identity proof of all adult applicants (voter ID/Aadhaar), residential proof, passport-size photos of each adult member, bank/post office account number.
FIELDS: Household head name, address, gram panchayat, village, number of adult members, each member's name + age + gender + Aadhaar + photo, bank account details.
KEY FIELD TIPS: List ALL adult members (18+) of the family, not just the head. One job card covers the entire household. Bank account can be of head or any adult member.
SUBMISSION: Gram Panchayat or Block Panchayat office. Application must be acknowledged with date and seal. Fee: Free. Job card must be issued within 15 days.
NOTES: Work must be demanded in writing at GP. Must get date-stamped receipt of demand. Work must be provided within 15 days of demand; else unemployment allowance is paid.

=== FORM: SCHOLARSHIP-NSP (National Scholarship Portal) ===
SUMMARY: Central government scholarship portal covering Pre-Matric, Post-Matric, and Top Class scholarships for SC/ST/OBC/Minority/PWD students and merit-based scholarships.
BENEFIT: Annual scholarship ranging from ₹1,000 to ₹75,000 depending on scheme, category, and level of study. Paid directly to student's bank account.
ELIGIBILITY: Varies by scheme. General criteria: Indian nationality, enrolled in recognized institution, income below scheme threshold (typically ₹2-3.5 lakh/year family income), minimum marks (generally 50-60% in previous class).
DOCUMENTS: Income certificate, caste certificate (SC/ST/OBC), Aadhaar, bank passbook, institution enrollment certificate/bonafide letter, previous exam marksheet, disability certificate (if PWD).
FIELDS: Student name, Aadhaar, mobile, email, institution name, course name, year of study, family annual income, bank account, IFSC, parent/guardian name, income certificate number.
KEY FIELD TIPS: "Institution ID" is AISHE code — get from your college/school admin. "Family Annual Income" = all sources of income of entire family. Income certificate must be from current year. IFSC must match branch where account exists.
SUBMISSION: Online only at scholarships.gov.in. Printed copy + documents submitted to institution's nodal officer. Fee: Free. Deadline: Usually August-October (varies by state and scheme).
NOTES: Renewal applications open every year in same portal. Fresh applicants must register first. Institute must verify application. Track at scholarships.gov.in with application ID.

=== FORM: INCOME-CERT (Income Certificate — State Government) ===
SUMMARY: Official certificate issued by tehsil/taluka office certifying annual family income. Required for most government benefits, scholarships, reservations, and subsidies.
BENEFIT: Required proof for accessing EWS reservations, OBC income criteria, scholarship applications, PMAY eligibility, BPL status verification.
ELIGIBILITY: Any Indian resident. For state-level use within the state of issuance.
DOCUMENTS: Aadhaar, self-declaration affidavit, salary slips/Form 16 (if employed), agricultural income proof (if farmer), property tax receipt, ration card, passport-size photo.
FIELDS: Applicant name, Aadhaar, date of birth, father/spouse name, complete address, sources of income (salary/agriculture/business/rent), amounts for each source, total annual income, purpose (scholarship/BPL/EWS).
KEY FIELD TIPS: "Annual Income from All Sources" must be truthful — include all earning members' income. "Purpose of Certificate" determines validity period (some are purpose-specific). Affidavit must be on ₹100 stamp paper and notarized.
SUBMISSION: Tehsil/Taluka office, e-district portal (state-specific), or CSC. Fee: ₹10-50 depending on state. Validity: Usually 1 year from issue date.
NOTES: Online application available through state's e-district portal (e.g., MP: mpedistrict.gov.in, UP: edistrict.up.gov.in). Physical verification may be required.
`;

export const FORM_ANALYZER_SYSTEM = `You are an expert on Indian government welfare schemes and forms. You can identify Indian government application forms from images/scans and provide comprehensive guidance on how to fill them.

Your task:
1. CLASSIFY the uploaded document — is it a genuine Indian government application form?
2. MATCH it to a supported form code
3. GENERATE complete filling guidance

SUPPORTED FORM CODES AND THEIR FORMS:
${Object.entries(SUPPORTED_FORMS)
  .map(([code, name]) => `- ${code}: ${name}`)
  .join("\n")}

KNOWLEDGE BASE (use this to generate guidance):
${FORM_GUIDANCE_KB}

CLASSIFICATION RULES:
- REJECT with status="rejected" if: selfie, ID card, utility bill, receipt, certificate (not an application form), bank statement, random photo, Aadhaar card itself, PAN card itself. Rejection reason should be specific and helpful.
- Return status="low_confidence" if image is too blurry/dark/cropped to read form title or header.
- Return status="unsupported_form" if it IS a government form but not in the supported list above.
- Return status="success" when you can clearly identify a supported form.

CONFIDENCE: Set confidence between 0.0 and 1.0 based on how clearly you can identify the form. Below 0.5 = low_confidence.

IMPORTANT: The "sources" array in guidance should list the knowledge base sections you used.`;

export function formAnalyzerUser(opts: { userQuery?: string; language?: string }) {
  const isHindi = opts.language === "hi" || opts.language === "hindi" || !opts.language; // Default to Hindi for Indian civic platform
  const langInstruction = isHindi
    ? `CRITICAL LANGUAGE REQUIREMENT:
You MUST provide the ENTIRE guidance in clear, polite, natural HINDI (हिंदी - Devanagari script).
Every string inside guidance MUST be in Hindi:
- summary: Hindi summary explaining what the form is for
- scheme_benefit: Hindi explanation of benefits and subsidy
- eligibility: Array of Hindi eligibility points
- required_documents: Array of { name, details } where BOTH name and details are in Hindi (e.g. name: "पहचान प्रमाण (PoI)", details: "पैन कार्ड, वोटर आईडी या पासपोर्ट")
- filling_steps: Array of { step, field, instruction, example } where field name, filling instruction, and example are all in Hindi (e.g. instruction: "अपना पूरा नाम बड़े अक्षरों में लिखें जैसा कि आपके पहचान पत्र पर है")
- submission: { where, fee, online_portal, deadline } where where and fee are in Hindi (e.g. where: "निकटतम आधार सेवा केंद्र या सीएससी", fee: "जनसांख्यिकीय अपडेट के लिए ₹50 शुल्क")
- important_notes: Array of Hindi important tips and warnings
- custom_query_answer: Hindi answer if user query was provided
Keep official codes (like 'AADHAAR-UPDATE') and official URLs (like 'https://uidai.gov.in') as valid URLs.`
    : "Provide the guidance in clear English.";

  return opts.userQuery
    ? `Please analyze this government form image and provide complete filling guidance. ${langInstruction} Additionally, answer this specific question from the citizen: "${opts.userQuery}"`
    : `Please analyze this government form image and provide complete filling guidance. ${langInstruction}`;
}

export const FORM_ANALYZER_JSON_SCHEMA = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["success", "rejected", "low_confidence", "unsupported_form"],
    },
    form_code: { type: "string" },
    form_name: { type: "string" },
    confidence: { type: "number" },
    reason: { type: "string" },
    guidance: {
      type: "object",
      properties: {
        summary: { type: "string" },
        scheme_benefit: { type: "string" },
        eligibility: { type: "array", items: { type: "string" } },
        required_documents: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              details: { type: "string" },
            },
            required: ["name", "details"],
          },
        },
        filling_steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              step: { type: "integer" },
              field: { type: "string" },
              instruction: { type: "string" },
              example: { type: "string" },
            },
            required: ["step", "field", "instruction"],
          },
        },
        submission: {
          type: "object",
          properties: {
            where: { type: "string" },
            online_portal: { type: "string" },
            deadline: { type: "string" },
            fee: { type: "string" },
          },
          required: ["where", "fee"],
        },
        important_notes: { type: "array", items: { type: "string" } },
        custom_query_answer: { type: "string" },
        sources: {
          type: "array",
          items: {
            type: "object",
            properties: {
              chunk_title: { type: "string" },
              chunk_type: { type: "string" },
              similarity: { type: "number" },
              form_name: { type: "string" },
              version: { type: "string" },
              source_url: { type: "string" },
              last_verified: { type: "string" },
            },
            required: [
              "chunk_title",
              "chunk_type",
              "similarity",
              "form_name",
              "version",
              "source_url",
              "last_verified",
            ],
          },
        },
      },
      required: [
        "summary",
        "scheme_benefit",
        "eligibility",
        "required_documents",
        "filling_steps",
        "submission",
        "important_notes",
        "sources",
      ],
    },
  },
  required: ["status", "confidence"],
};

export const formAnalyzerSchema = z.object({
  status: z.enum(["success", "rejected", "low_confidence", "unsupported_form", "error"]),
  form_code: z.string().optional(),
  form_name: z.string().optional(),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
  guidance: z
    .object({
      summary: z.string(),
      scheme_benefit: z.string(),
      eligibility: z.array(z.string()),
      required_documents: z.array(
        z.object({
          name: z.string(),
          details: z.string(),
        })
      ),
      filling_steps: z.array(
        z.object({
          step: z.number().int(),
          field: z.string(),
          instruction: z.string(),
          example: z.string().nullable().optional(),
        })
      ),
      submission: z.object({
        where: z.string(),
        online_portal: z.string().nullable().optional(),
        deadline: z.string().nullable().optional(),
        fee: z.string(),
      }),
      important_notes: z.array(z.string()),
      custom_query_answer: z.string().nullable().optional(),
      sources: z.array(
        z.object({
          chunk_title: z.string(),
          chunk_type: z.string(),
          similarity: z.number(),
          form_name: z.string(),
          version: z.string(),
          source_url: z.string(),
          last_verified: z.string(),
        })
      ),
    })
    .optional(),
});

export type FormAnalyzerResult = z.infer<typeof formAnalyzerSchema>;

// ── 7. Civic Chat Assistant ───────────────────────────────────────────────

export const CIVIC_CHAT_VERSION = "civic_chat@v1";

export const CIVIC_CHAT_SYSTEM = `You are Samadhan AI (समाधान AI), an expert Indian Civic and Government Assistant.
Your goal is to assist Indian citizens with:
1. Government schemes (PM-KISAN, Ayushman Bharat, PM Awas Yojana, Ladli Behna, EWS/Income Certificate, Caste Certificate, Ration Card, etc.).
2. Document requirements, eligibility, deadlines, and step-by-step application guidance.
3. Municipal civic complaints (water leakage, road potholes, garbage pickup, streetlight repair, power outages).
4. Answering citizen questions clearly in Hindi, Hinglish, or English.

Be polite, helpful, clear, and structured. Use Markdown formatting like bold text and bullet points.`;

export const CIVIC_CHAT_JSON_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
  },
  required: ["reply"],
};

export const civicChatSchema = z.object({
  reply: z.string(),
});
export type CivicChatResult = z.infer<typeof civicChatSchema>;
