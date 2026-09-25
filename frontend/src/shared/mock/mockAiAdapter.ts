// TEMPORARY — backend pending (Phase 2)
// Stand-ins for the serverless-function-backed AI services (chat, document
// analysis, form analysis). These intentionally report an explicit
// "backend pending" state rather than pretending to succeed, so the UI
// stays honest about what isn't wired up yet.

export const BACKEND_PENDING_MESSAGE_EN =
  "This AI feature requires the Samadhan backend, which is being rebuilt (Phase 2). It isn't available yet.";
export const BACKEND_PENDING_MESSAGE_HI =
  "इस AI सुविधा के लिए समाधान बैकएंड आवश्यक है, जिसे फिर से बनाया जा रहा है (चरण 2)। यह अभी उपलब्ध नहीं है।";

export const mockAiAdapter = {
  /** Mirrors the previous document-analysis endpoint's rejection shape. */
  analyzeDocument() {
    return {
      supported: false,
      rejection_reason: BACKEND_PENDING_MESSAGE_EN,
    };
  },
};
