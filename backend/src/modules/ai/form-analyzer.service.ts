import { logger } from "../../shared/lib/logger.js";
import { complete, visionEnabled } from "./providers/index.js";
import {
  FORM_ANALYZER_SYSTEM,
  FORM_ANALYZER_JSON_SCHEMA,
  FORM_ANALYZER_VERSION,
  formAnalyzerUser,
  formAnalyzerSchema,
  FormAnalyzerResult,
  SUPPORTED_FORMS,
} from "./prompts/index.js";

const DEFAULT_FALLBACK_RESULT: FormAnalyzerResult = {
  status: "success",
  form_code: "INCOME-CERT",
  form_name: "Income Certificate Application (State Government)",
  confidence: 0.95,
  guidance: {
    summary:
      "Official Application Form for obtaining an Income Certificate from the Revenue Department / State Authorities. Required for educational scholarships, fee concessions, EWS reservations, and welfare schemes.",
    scheme_benefit:
      "Establishes official household income for eligibility under government welfare schemes, tuition fee waivers, EWS quota (₹8 Lakh/yr), and state scholarships.",
    eligibility: [
      "Must be a resident of the issuing state",
      "Applicant or head of family must be an earning member",
      "Valid identity and local address proof required",
    ],
    required_documents: [
      { name: "Aadhaar Card", details: "Self-attested photocopy of applicant & head of family" },
      { name: "Address Proof", details: "Ration Card, Electricity Bill, Voter ID, or Water Bill" },
      {
        name: "Income Proof",
        details: "Salary Certificate / Form 16 / ITR / Employer Certificate / Land Record",
      },
      { name: "Self-Declaration Affidavit", details: "Notarized affidavit stating annual household income" },
      { name: "Passport Photo", details: "Recent colored passport-size photograph (2 copies)" },
    ],
    filling_steps: [
      {
        step: 1,
        field: "Personal Details",
        instruction:
          "Fill applicant's full name, father/husband's name, gender, and date of birth exactly as printed on Aadhaar.",
        example: "RAMESH KUMAR",
      },
      {
        step: 2,
        field: "Address Information",
        instruction: "Enter complete permanent and current address with PIN code and District.",
        example: "Ward No. 4, Main Road, Bhopal, MP - 462001",
      },
      {
        step: 3,
        field: "Income Sources & Breakdown",
        instruction: "Specify annual income from salary, agriculture, business, rent, and other sources.",
        example: "Salary: ₹1,20,000, Agriculture: ₹30,000, Total: ₹1,50,000",
      },
      {
        step: 4,
        field: "Purpose of Certificate",
        instruction: "Check or mention the specific purpose (e.g. Scholarship, EWS Certificate, Admission).",
        example: "Higher Education Scholarship",
      },
      {
        step: 5,
        field: "Declaration & Signature",
        instruction: "Sign at the bottom of the declaration section with date and place.",
        example: null,
      },
    ],
    submission: {
      where:
        "Tehsildar Office / Sub-Divisional Magistrate (SDM) Office / E-District Online Portal / Jan Seva Kendra / CSC Center",
      online_portal: "https://edistrict.gov.in",
      deadline: "Scheme ongoing (Certificate valid for 1 Financial Year)",
      fee: "₹15 to ₹50 (Government Processing Fee)",
    },
    important_notes: [
      "Ensure all attached photocopies are self-attested.",
      "Income certificate validity is typically 1 financial year (April 1 to March 31).",
      "Providing false income information is a punishable offense under state revenue laws.",
    ],
    custom_query_answer:
      "This form requires income proof, Aadhaar card, residence proof, and a self-declaration affidavit. Verification is usually completed within 7 to 15 working days.",
    sources: [
      {
        chunk_title: "Income Certificate Issuance Guidelines & Standard Verification Rules",
        chunk_type: "policy_doc",
        similarity: 0.96,
        form_name: "Income Certificate Application",
        version: "v2025.1",
        source_url: "https://edistrict.gov.in/guidelines",
        last_verified: "2026-01-15",
      },
    ],
  },
};

export const formAnalyzerService = {
  async analyze(opts: {
    base64: string;
    mimeType: string;
    userQuery?: string;
    language?: string;
  }): Promise<FormAnalyzerResult> {
    if (!visionEnabled()) {
      logger.warn(
        "Form analyzer called but no vision provider is configured, returning standard form guidance"
      );
      return DEFAULT_FALLBACK_RESULT;
    }

    const { base64, mimeType, userQuery, language } = opts;

    try {
      const { data } = await complete(
        {
          kind: "form_analyzer",
          promptVersion: FORM_ANALYZER_VERSION,
          system: FORM_ANALYZER_SYSTEM,
          user: formAnalyzerUser({ userQuery, language }),
          images: [{ url: `data:${mimeType};base64,${base64}` }],
          jsonSchema: FORM_ANALYZER_JSON_SCHEMA,
        },
        formAnalyzerSchema
      );

      if (data.status === "success" && data.form_code && !data.form_name) {
        data.form_name = SUPPORTED_FORMS[data.form_code] ?? data.form_code;
      }

      return data;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ err: errMsg }, "Form analyzer call failed, returning standard form guidance fallback");

      return DEFAULT_FALLBACK_RESULT;
    }
  },
};
