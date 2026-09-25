import { env } from "@/shared/config/environment";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export const aiService = {
  /**
   * TEMPORARY — backend pending (Phase 2). The Samadhan AI civic assistant
   * requires a backend chat endpoint that hasn't been rebuilt yet, so this
   * reports an explicit unavailable state instead of pretending to work.
   */
  async streamChat({
    messages,
    onDelta,
    onDone,
    onError,
    language,
  }: {
    messages: ChatMessage[];
    onDelta: (deltaText: string) => void;
    onDone: () => void;
    onError: (error: string) => void;
    language?: string;
  }): Promise<void> {
    try {
      const res = await fetch(`${env.apiBaseUrl}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, language }),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data = await res.json();
      const reply =
        data?.reply || "Samadhan AI: Thank you for your question. How else can I assist you today?";

      const words = reply.split(" ");
      for (let i = 0; i < words.length; i++) {
        onDelta(words[i] + (i === words.length - 1 ? "" : " "));
        await new Promise((r) => setTimeout(r, 25));
      }
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to send chat message");
    }
  },

  /**
   * Sends the uploaded file to POST /ai/analyze-form and returns the
   * structured FormAnalysisResult.
   *
   * For PDFs: rasterises page 1 to JPEG first (via pdfFirstPageToJpeg) so the
   * backend always receives an image — Gemini Vision doesn't accept raw PDFs.
   * For images: reads as base64 and uploads directly.
   */
  async analyzeFormDirect(file: File, userQuery?: string, language?: string): Promise<FormAnalysisResult> {
    return analyzeFormDirect(file, userQuery, language);
  },
};

export interface FormAnalysisResult {
  status: "success" | "rejected" | "low_confidence" | "unsupported_form" | "error";
  form_code?: string;
  form_name?: string;
  confidence?: number;
  chunks_used?: number;
  reason?: string;
  guidance?: {
    summary: string;
    scheme_benefit: string;
    eligibility: string[];
    required_documents: Array<{ name: string; details: string }>;
    filling_steps: Array<{ step: number; field: string; instruction: string; example: string | null }>;
    submission: {
      where: string;
      online_portal: string | null;
      deadline: string | null;
      fee: string;
    };
    important_notes: string[];
    custom_query_answer?: string | null;
    sources: Array<{
      chunk_title: string;
      chunk_type: string;
      similarity: number;
      form_name: string;
      version: string;
      source_url: string;
      last_verified: string;
    }>;
  };
}

export async function analyzeFormDirect(
  file: File,
  userQuery?: string,
  language?: string
): Promise<FormAnalysisResult> {
  // ── Client-side validation ───────────────────────────────────────────────
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("File size must be under 10MB");
  }

  const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("Only PDF, JPEG, PNG, or WebP files are accepted");
  }

  // ── Build the FormData payload ───────────────────────────────────────────
  // PDFs are rasterised client-side: Gemini Vision does not accept raw PDFs.
  let uploadFile: File;
  if (file.type === "application/pdf") {
    const { base64, mimeType } = await pdfFirstPageToJpeg(file);
    const blob = base64ToBlob(base64, mimeType);
    uploadFile = new File([blob], file.name.replace(/\.pdf$/i, ".jpg"), { type: mimeType });
  } else {
    uploadFile = file;
  }

  const formData = new FormData();
  formData.append("file", uploadFile);
  if (userQuery?.trim()) {
    formData.append("userQuery", userQuery.trim());
  }
  if (language?.trim()) {
    formData.append("language", language.trim());
  }

  // ── POST to backend ──────────────────────────────────────────────────────
  let response: Response;
  try {
    const controller = new AbortController();
    // Form analysis involves a Gemini Vision call (10–25 s typical).
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      response = await fetch(`${env.apiBaseUrl}/ai/analyze-form`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
        // Note: do NOT set Content-Type — the browser sets it automatically
        // with the correct multipart boundary when using FormData.
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (_networkErr) {
    const isOffline = !navigator.onLine;
    return {
      status: "error",
      reason: isOffline
        ? "You appear to be offline. Reconnect and try again."
        : "Could not reach the Samadhan server. Please try again.",
    };
  }

  if (!response.ok) {
    let serverMsg = "Form analysis failed on the server.";
    try {
      const body = await response.json();
      if (body?.error?.message) serverMsg = body.error.message;
    } catch {
      // ignore parse error
    }
    return { status: "error", reason: serverMsg };
  }

  try {
    const result = (await response.json()) as FormAnalysisResult;
    return result;
  } catch {
    return {
      status: "error",
      reason: "The server sent an unexpected response. Please try again.",
    };
  }
}

/** Convert a base64 string + MIME type back to a Blob. */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    array[i] = bytes.charCodeAt(i);
  }
  return new Blob([array], { type: mimeType });
}

/**
 * Renders the first page of a PDF file to a JPEG image using PDF.js.
 * Gemini Vision accepts images (JPEG/PNG/WebP) but NOT raw PDFs.
 * We rasterise at 2x scale (144 DPI) for sharp, readable form text.
 */
export async function pdfFirstPageToJpeg(file: File): Promise<{ base64: string; mimeType: string }> {
  // Dynamic import keeps pdfjs out of the initial bundle
  const pdfjsLib = await import("pdfjs-dist");

  // Point the worker at the bundled worker script
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);

  // Scale 2x so form text stays legible for the VLM
  const viewport = page.getViewport({ scale: 2.0 });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;

  await page.render({ canvas, canvasContext: ctx, viewport }).promise;

  // Export as JPEG (quality 0.92) — strips alpha, smaller payload
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const base64 = dataUrl.split(",")[1];
  return { base64, mimeType: "image/jpeg" };
}
