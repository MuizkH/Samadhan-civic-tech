import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { useToast } from "@/shared/hooks/use-toast";
import { issueLifecycleService } from "../services/issueLifecycleService";
import { logger } from "@/shared/services/logger";
import { CheckCircle2, RotateCcw, Loader2 } from "lucide-react";
import { getErrorMessage } from "@/shared/lib/errorMessage";

interface Props {
  issueId: string;
  onReviewed: () => void;
}

/**
 * Shown to the reporting citizen once a department marks their issue
 * resolved (PS #5). They either confirm the fix (-> verified) or reopen it
 * with a reason (-> reopened); the department cannot close the loop alone.
 */
export function ResolutionReviewPanel({ issueId, onReviewed }: Props) {
  const { language } = useLanguage();
  const { toast } = useToast();
  const [mode, setMode] = useState<"idle" | "reopening">("idle");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const run = async (action: () => Promise<unknown>, successTitle: string) => {
    setSubmitting(true);
    try {
      await action();
      toast({ title: successTitle });
      onReviewed();
    } catch (err) {
      logger.error("Resolution review failed:", err);
      toast({
        title: language === "en" ? "Could not submit" : "सबमिट नहीं हो सका",
        description: getErrorMessage(err) || (language === "en" ? "Please try again." : "पुनः प्रयास करें।"),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-5 rounded-xl border border-green-500/25 bg-green-500/5 p-4">
      <p className="text-sm font-semibold text-foreground mb-1">
        {language === "en" ? "Is this actually fixed?" : "क्या यह वास्तव में ठीक हो गया?"}
      </p>
      <p className="text-xs text-muted-foreground mb-3">
        {language === "en"
          ? "The department marked this resolved. Confirm it, or reopen it if the problem is still there."
          : "विभाग ने इसे हल चिह्नित किया है। पुष्टि करें, या समस्या बनी रहने पर पुनः खोलें।"}
      </p>

      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={submitting}
            onClick={() =>
              run(
                () => issueLifecycleService.confirmResolution(issueId),
                language === "en" ? "Thanks for confirming!" : "पुष्टि के लिए धन्यवाद!"
              )
            }
          >
            {submitting ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            )}
            {language === "en" ? "Yes, it's fixed" : "हाँ, ठीक हो गया"}
          </Button>
          <Button size="sm" variant="outline" disabled={submitting} onClick={() => setMode("reopening")}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            {language === "en" ? "No, reopen it" : "नहीं, पुनः खोलें"}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={
              language === "en"
                ? "What is still wrong? This goes back to the department."
                : "अभी भी क्या गलत है? यह विभाग को भेजा जाएगा।"
            }
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={submitting || reason.trim().length === 0}
              onClick={() =>
                run(
                  () => issueLifecycleService.reopen(issueId, reason.trim()),
                  language === "en" ? "Issue reopened" : "समस्या पुनः खोली गई"
                )
              }
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              {language === "en" ? "Reopen issue" : "पुनः खोलें"}
            </Button>
            <Button size="sm" variant="ghost" disabled={submitting} onClick={() => setMode("idle")}>
              {language === "en" ? "Cancel" : "रद्द करें"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
