import { useEffect, useState } from "react";
import { Sparkles, Check, X, Loader2 } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/shared/services/logger";
import { coordinationApi, CoordinationPlan } from "../services/coordinationApi";
import { getErrorMessage } from "@/shared/lib/errorMessage";

/**
 * Why this issue was split across departments.
 *
 * This is the accountability artifact: it shows which model produced the
 * routing, how confident it was, and the reasoning in plain language, so a
 * citizen asking "why did two departments get involved" — or an RTI request
 * asking the same — has an answer that was recorded at the time rather than
 * reconstructed afterwards.
 */
export function CoordinationPlanCard({ issueId, isStaff }: { issueId: string; isStaff: boolean }) {
  const { language } = useLanguage();
  const { toast } = useToast();
  const [plans, setPlans] = useState<CoordinationPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = () => {
    coordinationApi
      .coordinationPlans(issueId)
      .then(setPlans)
      .catch((err) => logger.info("No coordination plan available:", err))
      .finally(() => setLoading(false));
  };

  useEffect(load, [issueId]);

  const act = async (planId: string, action: "apply" | "reject") => {
    setActing(planId);
    try {
      await coordinationApi.overridePlan(planId, action);
      toast({
        title:
          action === "apply"
            ? language === "en"
              ? "Plan applied"
              : "योजना लागू"
            : language === "en"
              ? "Plan rejected"
              : "योजना अस्वीकृत",
      });
      load();
    } catch (err) {
      toast({ title: getErrorMessage(err, "Could not update the plan"), variant: "destructive" });
    } finally {
      setActing(null);
    }
  };

  if (loading || plans.length === 0) return null;
  const plan = plans[0];
  const subtasks = plan.plan?.subtasks ?? [];

  return (
    <div className="mt-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Sparkles className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-bold text-foreground">
          {language === "en" ? "Why this was split" : "इसे क्यों विभाजित किया गया"}
        </h4>
        <Badge
          variant="outline"
          className={`text-[10px] ${
            plan.status === "applied"
              ? "text-green-600 border-green-500/30 bg-green-500/5"
              : plan.status === "rejected"
                ? "text-muted-foreground"
                : "text-amber-600 border-amber-500/30 bg-amber-500/5"
          }`}
        >
          {plan.status === "applied"
            ? language === "en"
              ? "Applied"
              : "लागू"
            : plan.status === "rejected"
              ? language === "en"
                ? "Rejected"
                : "अस्वीकृत"
              : language === "en"
                ? "Suggested — needs review"
                : "सुझाव — समीक्षा आवश्यक"}
        </Badge>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {Math.round(plan.confidence * 100)}% {language === "en" ? "confidence" : "विश्वास"}
        </span>
      </div>

      <p className="text-xs text-foreground/90 leading-relaxed">{plan.rationale}</p>

      {subtasks.length > 0 && (
        <ol className="mt-3 space-y-1.5">
          {[...subtasks]
            .sort((a, b) => a.order - b.order)
            .map((t) => (
              <li key={t.order} className="flex items-start gap-2 text-[11px]">
                <span className="w-4 h-4 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center shrink-0 text-[9px] mt-0.5">
                  {t.order}
                </span>
                <span className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{t.department.replace(/_/g, " ")}</span>
                  {" — "}
                  {t.summary}
                  {t.dependsOn.length > 0 && (
                    <span className="text-[10px] text-amber-600">
                      {" "}
                      ({language === "en" ? "after step" : "चरण के बाद"} {t.dependsOn.join(", ")})
                    </span>
                  )}
                </span>
              </li>
            ))}
        </ol>
      )}

      {/* A human can always overrule the model, and the override is recorded. */}
      {isStaff && plan.status === "suggested" && (
        <div className="flex items-center gap-2 mt-3">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1"
            disabled={acting === plan.id}
            onClick={() => act(plan.id, "apply")}
          >
            {acting === plan.id ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            {language === "en" ? "Apply this plan" : "योजना लागू करें"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] gap-1 text-muted-foreground"
            disabled={acting === plan.id}
            onClick={() => act(plan.id, "reject")}
          >
            <X className="w-3 h-3" />
            {language === "en" ? "Reject" : "अस्वीकार"}
          </Button>
        </div>
      )}

      {plan.overriddenBy && (
        <p className="text-[10px] text-muted-foreground mt-2 italic">
          {language === "en" ? "Overridden by" : "द्वारा ओवरराइड"} {plan.overriddenBy.fullName}
          {plan.overrideNote ? ` — ${plan.overrideNote}` : ""}
        </p>
      )}

      <p className="text-[9px] text-muted-foreground/70 mt-2">
        {plan.provider} · {plan.model} · {plan.promptVersion}
      </p>
    </div>
  );
}
