import { useCallback, useEffect, useState } from "react";
import {
  coordinationApi,
  CoordWorkOrder,
  WorkOrderNote,
  WorkOrderTransfer,
} from "../services/coordinationApi";
import { adminService } from "../services/adminService";
import { CoordinationPlanCard } from "./CoordinationPlanCard";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { useAuth } from "@/features/auth";
import { useToast } from "@/shared/hooks/use-toast";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Textarea } from "@/shared/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { logger } from "@/shared/services/logger";
import {
  Link2,
  Lock,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Loader2,
  MessageSquare,
  ArrowRightLeft,
  ChevronRight,
} from "lucide-react";
import { getErrorMessage } from "@/shared/lib/errorMessage";

const WO_STATUS_STYLE: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  acknowledged: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  in_progress: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  done: "bg-green-500/10 text-green-600 border-green-500/20",
  rejected: "bg-red-500/10 text-red-600 border-red-500/20",
};

const NEXT_WO_STATUS: Record<string, string[]> = {
  pending: ["acknowledged", "rejected"],
  acknowledged: ["in_progress", "rejected"],
  in_progress: ["done", "rejected"],
  done: [],
  rejected: [],
};

function formatDue(due: string | null, language: "en" | "hi") {
  if (!due) return null;
  const ms = new Date(due).getTime() - Date.now();
  const hours = Math.round(Math.abs(ms) / 3_600_000);
  const label = hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`;
  return ms >= 0
    ? `${language === "en" ? "due in" : "शेष"} ${label}`
    : `${label} ${language === "en" ? "overdue" : "विलंबित"}`;
}

/**
 * Multi-department coordination for one issue: the work order chain, what
 * blocks what, the inter-departmental thread and referrals.
 */
export function CoordinationPanel({ issueId }: { issueId: string }) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();

  const [workOrders, setWorkOrders] = useState<CoordWorkOrder[]>([]);
  const [departments, setDepartments] = useState<{ id: string; code: string; nameEn: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const isStaff = user?.user_metadata?.role === "dept_admin" || user?.user_metadata?.role === "super_admin";

  const load = useCallback(async () => {
    try {
      const items = await coordinationApi.workOrdersForIssue(issueId);
      setWorkOrders(items);
      if (isStaff && departments.length === 0) {
        setDepartments(await adminService.listDepartments());
      }
    } catch (err) {
      logger.error("Failed to load coordination view:", err);
    } finally {
      setLoading(false);
    }
  }, [issueId, isStaff, departments.length]);

  useEffect(() => {
    void load();
  }, [load]);

  const transition = async (wo: CoordWorkOrder, status: string) => {
    setBusyId(wo.id);
    try {
      await coordinationApi.updateStatus(wo.id, status);
      toast({ title: language === "en" ? "Work order updated" : "कार्य आदेश अपडेट" });
      await load();
    } catch (err) {
      // A blocked start comes back as 422 naming the blocker — show it verbatim.
      toast({
        title: language === "en" ? "Cannot update" : "अपडेट नहीं हो सका",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {language === "en" ? "Loading coordination…" : "समन्वय लोड हो रहा है…"}
      </div>
    );
  }

  if (workOrders.length === 0) return null;

  return (
    <div className="mt-5 rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Link2 className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-bold text-foreground">
          {language === "en" ? "Departmental Coordination" : "विभागीय समन्वय"}
        </h4>
        <Badge variant="secondary" className="text-[10px] ml-auto">
          {workOrders.length} {language === "en" ? "work orders" : "कार्य आदेश"}
        </Badge>
      </div>

      {/* The recorded reasoning behind this routing, if a plan produced it. */}
      <CoordinationPlanCard issueId={issueId} isStaff={isStaff} />

      <div className="space-y-2">
        {workOrders.map((wo, idx) => (
          <div key={wo.id} className="rounded-lg border border-border bg-card">
            <div className="p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[10px] font-mono text-muted-foreground">#{idx + 1}</span>
                    <span className="text-sm font-semibold text-foreground">{wo.department.nameEn}</span>
                    <Badge variant="outline" className={`text-[10px] ${WO_STATUS_STYLE[wo.status] ?? ""}`}>
                      {wo.status.replace("_", " ")}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {wo.role}
                    </Badge>

                    {wo.isBlocked && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-orange-500/10 text-orange-600 border-orange-500/25"
                      >
                        <Lock className="w-2.5 h-2.5 mr-1" />
                        {language === "en" ? "Blocked" : "अवरुद्ध"}
                      </Badge>
                    )}
                    {wo.isOverdue && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-red-500/10 text-red-600 border-red-500/25"
                      >
                        <AlertTriangle className="w-2.5 h-2.5 mr-1" />
                        {language === "en" ? "SLA breached" : "एसएलए उल्लंघन"}
                      </Badge>
                    )}
                    {wo.escalationLevel > 0 && (
                      <Badge variant="destructive" className="text-[10px]">
                        {language === "en" ? "Escalated L" : "एस्केलेशन स्तर "}
                        {wo.escalationLevel}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                    {wo.dueAt && (
                      <span
                        className={`flex items-center gap-1 ${wo.isOverdue ? "text-red-500 font-semibold" : ""}`}
                      >
                        <Clock className="w-3 h-3" />
                        {formatDue(wo.dueAt, language)}
                      </span>
                    )}
                    {wo.assignee?.fullName && <span>{wo.assignee.fullName}</span>}
                  </div>

                  {/* Dependency chain */}
                  {wo.dependsOn.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {wo.dependsOn.map((dep) => (
                        <div
                          key={dep.id}
                          className={`flex items-center gap-1.5 text-[11px] rounded-md px-2 py-1 border ${
                            dep.satisfied
                              ? "text-green-600 border-green-500/20 bg-green-500/5"
                              : "text-orange-600 border-orange-500/20 bg-orange-500/5"
                          }`}
                        >
                          {dep.satisfied ? (
                            <CheckCircle2 className="w-3 h-3 shrink-0" />
                          ) : (
                            <Lock className="w-3 h-3 shrink-0" />
                          )}
                          <span className="font-medium">{dep.predecessor.department.nameEn}</span>
                          <ChevronRight className="w-3 h-3 shrink-0" />
                          <span>{wo.department.nameEn}</span>
                          <span className="text-muted-foreground ml-auto">
                            {dep.type === "finish_to_start"
                              ? language === "en"
                                ? "must finish first"
                                : "पहले पूरा करें"
                              : language === "en"
                                ? "must start first"
                                : "पहले शुरू करें"}
                            {" · "}
                            {dep.predecessor.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {isStaff && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {busyId === wo.id && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    )}
                    {(NEXT_WO_STATUS[wo.status] ?? []).map((next) => (
                      <Button
                        key={next}
                        size="xs"
                        variant={next === "rejected" ? "outline" : "default"}
                        disabled={busyId === wo.id}
                        onClick={() => transition(wo, next)}
                      >
                        {next.replace("_", " ")}
                      </Button>
                    ))}
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setExpanded(expanded === wo.id ? null : wo.id)}
                    >
                      <MessageSquare className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {isStaff && expanded === wo.id && (
              <WorkOrderThread workOrder={wo} departments={departments} onChanged={load} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Notes + referral controls for a single work order. */
function WorkOrderThread({
  workOrder,
  departments,
  onChanged,
}: {
  workOrder: CoordWorkOrder;
  departments: { id: string; code: string; nameEn: string }[];
  onChanged: () => void;
}) {
  const { language } = useLanguage();
  const { toast } = useToast();
  const [notes, setNotes] = useState<WorkOrderNote[]>([]);
  const [transfers, setTransfers] = useState<WorkOrderTransfer[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [visibility, setVisibility] = useState<WorkOrderNote["visibility"]>("inter_dept");
  const [transferTo, setTransferTo] = useState<string>("");
  const [transferReason, setTransferReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [n, t] = await Promise.all([
        coordinationApi.notes(workOrder.id),
        coordinationApi.transfers(workOrder.id),
      ]);
      setNotes(n);
      setTransfers(t);
    } catch (err) {
      logger.error("Failed to load work order thread:", err);
    }
  }, [workOrder.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, successTitle: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ title: successTitle });
      await load();
      onChanged();
    } catch (err) {
      toast({
        title: language === "en" ? "Failed" : "विफल",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-border p-3 space-y-3 bg-muted/20">
      {/* Thread */}
      <div className="space-y-1.5 max-h-44 overflow-y-auto">
        {notes.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">
            {language === "en" ? "No notes yet." : "अभी कोई टिप्पणी नहीं।"}
          </p>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="text-[11px] rounded-md bg-card border border-border/60 px-2 py-1.5">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-semibold text-foreground">{n.author.fullName}</span>
                <Badge variant="secondary" className="text-[9px] px-1 py-0">
                  {n.visibility}
                </Badge>
                <span className="text-muted-foreground ml-auto">
                  {new Date(n.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-muted-foreground">{n.body}</p>
            </div>
          ))
        )}
      </div>

      {/* Add note */}
      <div className="space-y-1.5">
        <Textarea
          rows={2}
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          placeholder={
            language === "en" ? "Add a note for the other department…" : "दूसरे विभाग के लिए टिप्पणी…"
          }
          className="text-xs"
        />
        <div className="flex items-center gap-2">
          <Select value={visibility} onValueChange={(v) => setVisibility(v as WorkOrderNote["visibility"])}>
            <SelectTrigger className="w-36 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="internal">{language === "en" ? "Internal" : "आंतरिक"}</SelectItem>
              <SelectItem value="inter_dept">{language === "en" ? "Inter-dept" : "अंतर-विभागीय"}</SelectItem>
              <SelectItem value="citizen">
                {language === "en" ? "Visible to citizen" : "नागरिक को दृश्य"}
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="xs"
            disabled={busy || noteBody.trim().length === 0}
            onClick={() =>
              run(
                () => coordinationApi.addNote(workOrder.id, noteBody.trim(), visibility),
                "Note added"
              ).then(() => setNoteBody(""))
            }
          >
            {language === "en" ? "Post" : "पोस्ट"}
          </Button>
        </div>
      </div>

      {/* Referrals */}
      <div className="border-t border-border/60 pt-2.5 space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
          <ArrowRightLeft className="w-3 h-3" />
          {language === "en" ? "Refer to another department" : "दूसरे विभाग को भेजें"}
        </div>

        {transfers.map((t) => (
          <div key={t.id} className="text-[11px] rounded-md bg-card border border-border/60 px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              <span>{t.fromDepartment.nameEn}</span>
              <ChevronRight className="w-3 h-3" />
              <span>{t.toDepartment.nameEn}</span>
              <Badge
                variant="outline"
                className={`text-[9px] ml-auto ${
                  t.status === "approved"
                    ? "text-green-600 border-green-500/25"
                    : t.status === "rejected"
                      ? "text-red-600 border-red-500/25"
                      : "text-yellow-600 border-yellow-500/25"
                }`}
              >
                {t.status}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-0.5">{t.reason}</p>
            {t.status === "requested" && (
              <div className="flex gap-1.5 mt-1.5">
                <Button
                  size="xs"
                  disabled={busy}
                  onClick={() =>
                    run(() => coordinationApi.decideTransfer(t.id, "approved"), "Referral approved")
                  }
                >
                  {language === "en" ? "Approve" : "स्वीकृत"}
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(() => coordinationApi.decideTransfer(t.id, "rejected"), "Referral rejected")
                  }
                >
                  {language === "en" ? "Reject" : "अस्वीकार"}
                </Button>
              </div>
            )}
          </div>
        ))}

        <div className="flex items-center gap-2">
          <Select value={transferTo} onValueChange={setTransferTo}>
            <SelectTrigger className="w-44 h-7 text-xs">
              <SelectValue placeholder={language === "en" ? "Department" : "विभाग"} />
            </SelectTrigger>
            <SelectContent>
              {departments
                .filter((d) => d.id !== workOrder.department.id)
                .map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.nameEn}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <input
            value={transferReason}
            onChange={(e) => setTransferReason(e.target.value)}
            placeholder={language === "en" ? "Reason" : "कारण"}
            className="flex-1 h-7 rounded-md border border-border bg-background px-2 text-xs"
          />
          <Button
            size="xs"
            disabled={busy || !transferTo || transferReason.trim().length === 0}
            onClick={() =>
              run(
                () => coordinationApi.requestTransfer(workOrder.id, transferTo, transferReason.trim()),
                "Referral requested"
              ).then(() => {
                setTransferTo("");
                setTransferReason("");
              })
            }
          >
            {language === "en" ? "Refer" : "भेजें"}
          </Button>
        </div>
      </div>
    </div>
  );
}
