import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { SectionStatic } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listPortalPlans,
  listPortalManagedUsers,
  listPortalSubscriptions,
  listPortalTemporaryKeyBatches,
  listPortalUserLinks,
  provisionPortalSubscription,
} from "@/fork/portal/actions";
import { getPortalConfig } from "@/fork/portal/config";
import { redirect } from "@/i18n/routing";
import { getSession } from "@/lib/auth";
import { PortalPlanManager } from "./_components/portal-plan-manager";
import { TemporaryKeyPanel } from "./_components/temporary-key-panel";

export const dynamic = "force-dynamic";

type ActionSuccessData<T extends (...args: never[]) => unknown> =
  Extract<Awaited<ReturnType<T>>, { ok: true }> extends { data: infer Data } ? Data : never;

type PortalPlanRow = ActionSuccessData<typeof listPortalPlans>["plans"][number];
type PortalSubscriptionRow = NonNullable<
  ActionSuccessData<typeof listPortalSubscriptions>
>["subscriptions"][number];
type PortalUserRow = NonNullable<ActionSuccessData<typeof listPortalUserLinks>>["users"][number];
type PortalManagedUserRow = NonNullable<
  ActionSuccessData<typeof listPortalManagedUsers>
>["users"][number];
type PortalTemporaryBatchRow = NonNullable<
  ActionSuccessData<typeof listPortalTemporaryKeyBatches>
>["batches"][number];

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function provisionAction(formData: FormData) {
  "use server";

  await provisionPortalSubscription({
    sourceOrderId: textValue(formData, "sourceOrderId"),
    portalUserId: textValue(formData, "portalUserId"),
    email: textValue(formData, "email"),
    planId: textValue(formData, "planId"),
    assignedSource: textValue(formData, "assignedSource") || "manual",
    notes: textValue(formData, "notes") || null,
  });
  revalidatePath("/dashboard/portal");
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue} required={required} />
    </div>
  );
}

function ProvisionForm({
  plans,
  t,
}: {
  plans: PortalPlanRow[];
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  return (
    <form action={provisionAction} className="grid gap-4 md:grid-cols-3">
      <Field label={t("fields.sourceOrderId")} name="sourceOrderId" required />
      <Field label={t("fields.portalUserId")} name="portalUserId" required />
      <Field label={t("fields.email")} name="email" type="email" required />
      <div className="space-y-2">
        <Label htmlFor="planId">{t("fields.plan")}</Label>
        <select
          id="planId"
          name="planId"
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          required
        >
          {plans.map((plan) => (
            <option key={plan.planId} value={plan.planId}>
              {plan.name}
            </option>
          ))}
        </select>
      </div>
      <Field label={t("fields.assignedSource")} name="assignedSource" defaultValue="manual" />
      <Field label={t("fields.notes")} name="notes" />
      <div className="md:col-span-3">
        <Button type="submit">{t("actions.provision")}</Button>
      </div>
    </form>
  );
}

function SubscriptionsTable({
  subscriptions,
  t,
}: {
  subscriptions: PortalSubscriptionRow[];
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columns.order")}</TableHead>
          <TableHead>{t("columns.user")}</TableHead>
          <TableHead>{t("columns.plan")}</TableHead>
          <TableHead>{t("columns.expiresAt")}</TableHead>
          <TableHead>{t("columns.status")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {subscriptions.map((subscription) => (
          <TableRow key={subscription.id}>
            <TableCell>{subscription.sourceOrderId}</TableCell>
            <TableCell>
              <div className="font-medium">{subscription.email}</div>
              <div className="text-muted-foreground text-xs">{subscription.portalUserId}</div>
            </TableCell>
            <TableCell>{subscription.planId}</TableCell>
            <TableCell>{new Date(subscription.expiresAt).toLocaleString()}</TableCell>
            <TableCell>
              <Badge variant={subscription.status === "active" ? "default" : "secondary"}>
                {t(`status.${subscription.status}`)}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function UsersTable({
  users,
  t,
}: {
  users: PortalUserRow[];
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columns.user")}</TableHead>
          <TableHead>{t("columns.cchUser")}</TableHead>
          <TableHead>{t("columns.defaultKey")}</TableHead>
          <TableHead>{t("columns.lastProvisionedAt")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell>
              <div className="font-medium">{user.email}</div>
              <div className="text-muted-foreground text-xs">{user.portalUserId}</div>
            </TableCell>
            <TableCell>{user.cchUserId}</TableCell>
            <TableCell>{user.defaultKeyId}</TableCell>
            <TableCell>
              {user.lastProvisionedAt ? new Date(user.lastProvisionedAt).toLocaleString() : "-"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default async function PortalDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getSession();
  if (!session) return redirect({ href: "/login", locale });
  if (session.user.role !== "admin") return redirect({ href: "/dashboard", locale });

  const t = await getTranslations({ locale, namespace: "dashboard.portal" });
  const [plansResult, subscriptionsResult, usersResult, managedUsersResult, temporaryBatchesResult] =
    await Promise.all([
    listPortalPlans({ includeDisabled: true }),
    listPortalSubscriptions({ limit: 100 }),
    listPortalUserLinks({ limit: 100 }),
    listPortalManagedUsers({ limit: 200 }),
    listPortalTemporaryKeyBatches({ limit: 100 }),
  ]);

  const plans = plansResult.ok ? plansResult.data.plans : [];
  const subscriptions = subscriptionsResult.ok ? subscriptionsResult.data.subscriptions : [];
  const users = usersResult.ok ? usersResult.data.users : [];
  const managedUsers: PortalManagedUserRow[] = managedUsersResult.ok ? managedUsersResult.data.users : [];
  const temporaryBatches: PortalTemporaryBatchRow[] = temporaryBatchesResult.ok
    ? temporaryBatchesResult.data.batches
    : [];
  const defaultProviderGroup = getPortalConfig().PORTAL_PROVIDER_GROUP;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{t("description")}</p>
      </div>

      <SectionStatic title={t("sections.plans")} description={t("sections.plansDesc")}>
        <PortalPlanManager initialPlans={plans} defaultProviderGroup={defaultProviderGroup} />
      </SectionStatic>

      <SectionStatic title={t("sections.provision")} description={t("sections.provisionDesc")}>
        <ProvisionForm plans={plans.filter((plan) => plan.enabled)} t={t} />
      </SectionStatic>

      <SectionStatic title={t("sections.users")} description={t("sections.usersDesc")}>
        <UsersTable users={users} t={t} />
      </SectionStatic>

      <SectionStatic
        title={t("sections.temporaryKeys")}
        description={t("sections.temporaryKeysDesc")}
      >
        <TemporaryKeyPanel
          users={managedUsers
            .filter((user) => (user.providerGroup || "").includes(getPortalConfig().PORTAL_TEST_KEY_GROUP))
            .map((user) => ({
              id: user.id,
              name: user.name,
              providerGroup: user.providerGroup,
              keys: user.keys.map((key) => ({
                id: key.id,
                name: key.name,
                providerGroup: key.providerGroup,
                limitTotalUsd: key.limitTotalUsd ?? null,
                createdAt: key.createdAt,
              })),
            }))}
          batches={temporaryBatches.map((batch) => ({
            id: batch.id,
            providerGroup: batch.providerGroup,
            name: batch.name,
            sourceUserId: batch.sourceUserId,
            sourceKeyId: batch.sourceKeyId,
            createdCount: batch.createdCount,
            createdAt: batch.createdAt,
          }))}
        />
      </SectionStatic>

      <SectionStatic
        title={t("sections.subscriptions")}
        description={t("sections.subscriptionsDesc")}
      >
        <SubscriptionsTable subscriptions={subscriptions} t={t} />
      </SectionStatic>
    </div>
  );
}
