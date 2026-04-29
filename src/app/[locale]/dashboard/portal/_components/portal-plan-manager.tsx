"use client";

import { Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { deletePortalPlan, setPortalPlanEnabled, upsertPortalPlan } from "@/actions/portal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { UpsertPortalPlanInput } from "@/types/portal";

export interface PortalPlanDisplay {
  id: number;
  planId: string;
  name: string;
  description: string | null;
  priceAmount: number;
  currency: string;
  validDays: number;
  providerGroup: string;
  weeklyLimitUsd: number;
  monthlyLimitUsd: number;
  totalLimitUsd: number;
  rpmLimit: number;
  enabled: boolean;
  sortOrder: number;
  features: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface PlanFormState {
  planId: string;
  name: string;
  description: string;
  priceAmount: string;
  currency: string;
  validDays: string;
  providerGroup: string;
  weeklyLimitUsd: string;
  monthlyLimitUsd: string;
  totalLimitUsd: string;
  rpmLimit: string;
  sortOrder: string;
  enabled: boolean;
  features: string;
}

const DEFAULT_FORM: PlanFormState = {
  planId: "",
  name: "",
  description: "",
  priceAmount: "99",
  currency: "rmb",
  validDays: "30",
  providerGroup: "portal",
  weeklyLimitUsd: "150",
  monthlyLimitUsd: "600",
  totalLimitUsd: "600",
  rpmLimit: "30",
  sortOrder: "0",
  enabled: true,
  features: "",
};

function createDefaultForm(providerGroup: string): PlanFormState {
  return {
    ...DEFAULT_FORM,
    providerGroup,
  };
}

function planToForm(plan: PortalPlanDisplay): PlanFormState {
  return {
    planId: plan.planId,
    name: plan.name,
    description: plan.description ?? "",
    priceAmount: String(plan.priceAmount),
    currency: plan.currency,
    validDays: String(plan.validDays),
    providerGroup: plan.providerGroup,
    weeklyLimitUsd: String(plan.weeklyLimitUsd),
    monthlyLimitUsd: String(plan.monthlyLimitUsd),
    totalLimitUsd: String(plan.totalLimitUsd),
    rpmLimit: String(plan.rpmLimit),
    sortOrder: String(plan.sortOrder),
    enabled: plan.enabled,
    features: plan.features.join("\n"),
  };
}

function numberOr(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function intOr(value: string, fallback: number): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sortPlans(plans: PortalPlanDisplay[]) {
  return [...plans].sort((a, b) => a.sortOrder - b.sortOrder || a.planId.localeCompare(b.planId));
}

function upsertLocalPlan(plans: PortalPlanDisplay[], plan: PortalPlanDisplay) {
  const index = plans.findIndex((item) => item.planId === plan.planId);
  if (index === -1) return sortPlans([...plans, plan]);
  const next = [...plans];
  next[index] = plan;
  return sortPlans(next);
}

function formatMoney(plan: PortalPlanDisplay) {
  return `${plan.currency.toUpperCase()} ${Number(plan.priceAmount).toFixed(2)}`;
}

function LimitLines({
  plan,
  t,
}: {
  plan: PortalPlanDisplay;
  t: ReturnType<typeof useTranslations<"dashboard.portal">>;
}) {
  return (
    <div className="space-y-0.5 text-sm">
      <div>{t("values.weekly", { value: plan.weeklyLimitUsd })}</div>
      <div>{t("values.monthly", { value: plan.monthlyLimitUsd })}</div>
      <div>{t("values.total", { value: plan.totalLimitUsd })}</div>
      <div className="text-muted-foreground">{t("values.rpm", { value: plan.rpmLimit })}</div>
    </div>
  );
}

function FormField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function PortalPlanManager({
  initialPlans,
  defaultProviderGroup,
}: {
  initialPlans: PortalPlanDisplay[];
  defaultProviderGroup: string;
}) {
  const t = useTranslations("dashboard.portal");
  const router = useRouter();
  const [plans, setPlans] = useState(() => sortPlans(initialPlans));
  const [form, setForm] = useState<PlanFormState>(() => createDefaultForm(defaultProviderGroup));
  const [editingPlan, setEditingPlan] = useState<PortalPlanDisplay | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PortalPlanDisplay | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isRefreshing, startRefreshing] = useTransition();

  useEffect(() => {
    setPlans(sortPlans(initialPlans));
  }, [initialPlans]);

  const hasPlans = plans.length > 0;
  const dialogTitle = editingPlan ? t("actions.editPlan") : t("actions.createPlan");

  const featuredPlans = useMemo(() => plans.filter((plan) => plan.enabled).length, [plans]);

  function openCreateDialog() {
    setEditingPlan(null);
    setForm(createDefaultForm(defaultProviderGroup));
    setDialogOpen(true);
  }

  function openEditDialog(plan: PortalPlanDisplay) {
    setEditingPlan(plan);
    setForm(planToForm(plan));
    setDialogOpen(true);
  }

  function updateForm<K extends keyof PlanFormState>(key: K, value: PlanFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function buildPayload(): UpsertPortalPlanInput | null {
    const planId = form.planId.trim();
    const name = form.name.trim();
    if (!planId) {
      toast.error(t("errors.planIdRequired"));
      return null;
    }
    if (!name) {
      toast.error(t("errors.nameRequired"));
      return null;
    }

    const validDays = intOr(form.validDays, 30);
    if (validDays < 1) {
      toast.error(t("errors.validDaysRequired"));
      return null;
    }

    const rpmLimit = intOr(form.rpmLimit, 30);
    if (rpmLimit < 1) {
      toast.error(t("errors.rpmRequired"));
      return null;
    }

    return {
      planId,
      name,
      description: form.description.trim() || null,
      priceAmount: Math.max(0, numberOr(form.priceAmount, 0)),
      currency: form.currency.trim() || "rmb",
      validDays,
      providerGroup: form.providerGroup.trim() || defaultProviderGroup,
      weeklyLimitUsd: Math.max(0, numberOr(form.weeklyLimitUsd, 0)),
      monthlyLimitUsd: Math.max(0, numberOr(form.monthlyLimitUsd, 0)),
      totalLimitUsd: Math.max(0, numberOr(form.totalLimitUsd, 0)),
      rpmLimit,
      enabled: form.enabled,
      sortOrder: intOr(form.sortOrder, 0),
      features: form.features
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
    };
  }

  function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = buildPayload();
    if (!payload) return;

    startSaving(async () => {
      const result = await upsertPortalPlan(payload);
      if (!result.ok) {
        toast.error(result.error || t("errors.saveFailed"));
        return;
      }

      setPlans((current) => upsertLocalPlan(current, result.data.plan));
      toast.success(t("messages.saved"));
      setDialogOpen(false);
      router.refresh();
    });
  }

  function handleRefresh() {
    startRefreshing(() => {
      router.refresh();
    });
  }

  function handleToggle(plan: PortalPlanDisplay, enabled: boolean) {
    setPendingPlanId(plan.planId);
    setPortalPlanEnabled({ planId: plan.planId, enabled })
      .then((result) => {
        if (!result.ok) {
          toast.error(result.error || t("errors.statusFailed"));
          return;
        }
        setPlans((current) => upsertLocalPlan(current, result.data.plan));
      })
      .catch(() => {
        toast.error(t("errors.statusFailed"));
      })
      .finally(() => {
        setPendingPlanId(null);
        router.refresh();
      });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setPendingPlanId(target.planId);
    deletePortalPlan({ planId: target.planId })
      .then((result) => {
        if (!result.ok) {
          toast.error(result.error || t("errors.deleteFailed"));
          return;
        }
        setPlans((current) => current.filter((plan) => plan.planId !== target.planId));
        toast.success(t("messages.deleted"));
      })
      .catch(() => {
        toast.error(t("errors.deleteFailed"));
      })
      .finally(() => {
        setPendingPlanId(null);
        setDeleteTarget(null);
        router.refresh();
      });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-muted-foreground text-sm">
          {t("values.planSummary", { total: plans.length, enabled: featuredPlans })}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className={isRefreshing ? "size-4 animate-spin" : "size-4"} />
            <span>{t("actions.refresh")}</span>
          </Button>
          <Button type="button" size="sm" onClick={openCreateDialog}>
            <Plus className="size-4" />
            <span>{t("actions.createPlan")}</span>
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.plan")}</TableHead>
              <TableHead>{t("columns.group")}</TableHead>
              <TableHead>{t("columns.price")}</TableHead>
              <TableHead>{t("columns.validity")}</TableHead>
              <TableHead>{t("columns.limits")}</TableHead>
              <TableHead>{t("columns.features")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead className="text-right">{t("columns.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!hasPlans && (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  {t("messages.noPlans")}
                </TableCell>
              </TableRow>
            )}
            {plans.map((plan) => {
              const isPending = pendingPlanId === plan.planId;
              return (
                <TableRow key={plan.id}>
                  <TableCell className="min-w-48">
                    <div className="font-medium">{plan.name}</div>
                    <div className="text-muted-foreground text-xs">{plan.planId}</div>
                    {plan.description && (
                      <div className="mt-1 max-w-72 text-xs text-muted-foreground">
                        {plan.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{plan.providerGroup}</Badge>
                  </TableCell>
                  <TableCell>{formatMoney(plan)}</TableCell>
                  <TableCell>{t("values.validDays", { value: plan.validDays })}</TableCell>
                  <TableCell>
                    <LimitLines plan={plan} t={t} />
                  </TableCell>
                  <TableCell className="min-w-44">
                    {plan.features.length > 0 ? (
                      <div className="flex max-w-64 flex-wrap gap-1">
                        {plan.features.slice(0, 4).map((feature) => (
                          <Badge key={feature} variant="secondary" className="font-normal">
                            {feature}
                          </Badge>
                        ))}
                        {plan.features.length > 4 && (
                          <Badge variant="secondary" className="font-normal">
                            {t("values.moreFeatures", { value: plan.features.length - 4 })}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={plan.enabled}
                        disabled={isPending}
                        onCheckedChange={(checked) => handleToggle(plan, checked)}
                        aria-label={t("actions.togglePlan", { name: plan.name })}
                      />
                      <Badge variant={plan.enabled ? "default" : "secondary"}>
                        {plan.enabled ? t("status.enabled") : t("status.disabled")}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => openEditDialog(plan)}
                        aria-label={t("actions.editPlanNamed", { name: plan.name })}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={isPending}
                        onClick={() => setDeleteTarget(plan)}
                        aria-label={t("actions.deletePlanNamed", { name: plan.name })}
                      >
                        {isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[var(--cch-viewport-height-80)] sm:max-w-3xl">
          <form onSubmit={handleSave} className="flex min-h-0 flex-col">
            <DialogHeader>
              <DialogTitle>{dialogTitle}</DialogTitle>
              <DialogDescription>{t("sections.planFormDesc")}</DialogDescription>
            </DialogHeader>

            <div className="grid flex-1 gap-4 overflow-y-auto py-4 pr-2 md:grid-cols-2">
              <FormField id="portal-plan-id" label={t("fields.planId")}>
                <Input
                  id="portal-plan-id"
                  value={form.planId}
                  onChange={(event) => updateForm("planId", event.target.value)}
                  disabled={Boolean(editingPlan)}
                  required
                />
              </FormField>
              <FormField id="portal-plan-name" label={t("fields.name")}>
                <Input
                  id="portal-plan-name"
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  required
                />
              </FormField>
              <FormField id="portal-plan-price" label={t("fields.price")}>
                <Input
                  id="portal-plan-price"
                  value={form.priceAmount}
                  onChange={(event) => updateForm("priceAmount", event.target.value)}
                  type="number"
                  step="0.01"
                  min="0"
                />
              </FormField>
              <FormField id="portal-plan-currency" label={t("fields.currency")}>
                <Input
                  id="portal-plan-currency"
                  value={form.currency}
                  onChange={(event) => updateForm("currency", event.target.value)}
                />
              </FormField>
              <FormField id="portal-plan-valid-days" label={t("fields.validDays")}>
                <Input
                  id="portal-plan-valid-days"
                  value={form.validDays}
                  onChange={(event) => updateForm("validDays", event.target.value)}
                  type="number"
                  min="1"
                  required
                />
              </FormField>
              <FormField id="portal-plan-group" label={t("fields.providerGroup")}>
                <Input
                  id="portal-plan-group"
                  value={form.providerGroup}
                  onChange={(event) => updateForm("providerGroup", event.target.value)}
                />
              </FormField>
              <FormField id="portal-plan-weekly" label={t("fields.weeklyLimit")}>
                <Input
                  id="portal-plan-weekly"
                  value={form.weeklyLimitUsd}
                  onChange={(event) => updateForm("weeklyLimitUsd", event.target.value)}
                  type="number"
                  step="0.01"
                  min="0"
                />
              </FormField>
              <FormField id="portal-plan-monthly" label={t("fields.monthlyLimit")}>
                <Input
                  id="portal-plan-monthly"
                  value={form.monthlyLimitUsd}
                  onChange={(event) => updateForm("monthlyLimitUsd", event.target.value)}
                  type="number"
                  step="0.01"
                  min="0"
                />
              </FormField>
              <FormField id="portal-plan-total" label={t("fields.totalLimit")}>
                <Input
                  id="portal-plan-total"
                  value={form.totalLimitUsd}
                  onChange={(event) => updateForm("totalLimitUsd", event.target.value)}
                  type="number"
                  step="0.01"
                  min="0"
                />
              </FormField>
              <FormField id="portal-plan-rpm" label={t("fields.rpm")}>
                <Input
                  id="portal-plan-rpm"
                  value={form.rpmLimit}
                  onChange={(event) => updateForm("rpmLimit", event.target.value)}
                  type="number"
                  min="1"
                />
              </FormField>
              <FormField id="portal-plan-sort" label={t("fields.sortOrder")}>
                <Input
                  id="portal-plan-sort"
                  value={form.sortOrder}
                  onChange={(event) => updateForm("sortOrder", event.target.value)}
                  type="number"
                />
              </FormField>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label htmlFor="portal-plan-enabled" className="text-sm">
                  {t("fields.enabled")}
                </Label>
                <Switch
                  id="portal-plan-enabled"
                  checked={form.enabled}
                  onCheckedChange={(checked) => updateForm("enabled", checked)}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="portal-plan-description" className="text-xs text-muted-foreground">
                  {t("fields.description")}
                </Label>
                <Textarea
                  id="portal-plan-description"
                  value={form.description}
                  onChange={(event) => updateForm("description", event.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="portal-plan-features" className="text-xs text-muted-foreground">
                  {t("fields.features")}
                </Label>
                <Textarea
                  id="portal-plan-features"
                  value={form.features}
                  onChange={(event) => updateForm("features", event.target.value)}
                  rows={4}
                  placeholder={t("values.featuresPlaceholder")}
                />
                <p className="text-xs text-muted-foreground">{t("values.featuresHint")}</p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t("actions.cancel")}
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="size-4 animate-spin" />}
                <span>{isSaving ? t("actions.saving") : t("actions.savePlan")}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("actions.deletePlan")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? t("messages.deleteConfirm", { name: deleteTarget.name }) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t("actions.deletePlan")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
