import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { Label } from "@/shared/components/ui/label";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { issueRepository } from "@/features/issues/repositories/issueRepository";
import { logger } from "@/shared/services/logger";
import { Loader2, Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import { QueueItem } from "../services/adminService";
import { getErrorMessage } from "@/shared/lib/errorMessage";

interface Props {
  item: QueueItem;
  onClose: () => void;
  onSubmit: (note: string, proofUrl: string) => Promise<boolean>;
}

/**
 * Resolving an issue requires both a written note and a proof-of-resolution
 * photo (PS #5). Both are validated here for fast feedback and again by the
 * backend, which returns 422 if either is missing.
 */
export function ResolveIssueDialog({ item, onClose, onSubmit }: Props) {
  const { language } = useLanguage();
  const [note, setNote] = useState("");
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const url = await issueRepository.uploadIssueImage(item.issue.reportedBy, file);
      setProofUrl(url);
    } catch (err) {
      logger.error("Proof upload failed:", err);
      setUploadError(
        getErrorMessage(err) ||
          (language === "en"
            ? "Upload failed. Check your connection and try again."
            : "अपलोड विफल। कनेक्शन जांचें और पुनः प्रयास करें।")
      );
    } finally {
      setUploading(false);
    }
  };

  const canSubmit = note.trim().length > 0 && !!proofUrl && !submitting && !uploading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit(note.trim(), proofUrl!);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{language === "en" ? "Mark as Resolved" : "हल के रूप में चिह्नित करें"}</DialogTitle>
          <DialogDescription>
            {language === "en"
              ? "A resolution note and a proof photo are required before this issue can be closed out."
              : "इस समस्या को बंद करने से पहले समाधान टिप्पणी और प्रमाण फोटो आवश्यक है।"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted/40 rounded-lg p-3">
            <p className="text-xs text-muted-foreground font-mono">{item.issue.publicRef}</p>
            <p className="text-sm font-semibold text-foreground">{item.issue.title}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="resolution-note">
              {language === "en" ? "Resolution note" : "समाधान टिप्पणी"}{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="resolution-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                language === "en"
                  ? "Describe what was done to fix this issue…"
                  : "बताएं कि इस समस्या को ठीक करने के लिए क्या किया गया…"
              }
              rows={4}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="proof-photo">
              {language === "en" ? "Proof-of-resolution photo" : "समाधान प्रमाण फोटो"}{" "}
              <span className="text-destructive">*</span>
            </Label>

            {proofUrl ? (
              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-green-500/25 bg-green-500/5">
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                <span className="text-xs text-muted-foreground truncate flex-1">
                  {language === "en" ? "Photo uploaded" : "फोटो अपलोड हुआ"}
                </span>
                <Button variant="ghost" size="xs" onClick={() => setProofUrl(null)}>
                  {language === "en" ? "Replace" : "बदलें"}
                </Button>
              </div>
            ) : (
              <label
                htmlFor="proof-photo"
                className="flex items-center justify-center gap-2 p-4 rounded-lg border border-dashed border-border hover:border-primary/40 cursor-pointer transition-colors"
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                ) : (
                  <Upload className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="text-xs text-muted-foreground">
                  {uploading
                    ? language === "en"
                      ? "Uploading…"
                      : "अपलोड हो रहा है…"
                    : language === "en"
                      ? "Choose a photo"
                      : "फोटो चुनें"}
                </span>
                <input
                  id="proof-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFile}
                  disabled={uploading}
                />
              </label>
            )}

            {uploadError && (
              <p className="text-xs text-destructive flex items-start gap-1.5 mt-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {uploadError}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {language === "en" ? "Cancel" : "रद्द करें"}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {language === "en" ? "Mark Resolved" : "हल चिह्नित करें"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
