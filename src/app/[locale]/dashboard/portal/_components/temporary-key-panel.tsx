"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createPortalTemporaryKeyBatch,
  deletePortalTemporaryKeyBatch,
  downloadPortalTemporaryKeyBatch,
} from "@/fork/portal/actions";
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

interface TemporaryKeyPanelProps {
  batches: Array<{
    id: number;
    providerGroup: string;
    name: string;
    sourceUserId: number;
    sourceKeyId: number;
    createdCount: number;
    createdAt: string;
  }>;
  users: Array<{
    id: number;
    name: string;
    providerGroup: string | null;
    keys: Array<{
      id: number;
      name: string;
      providerGroup: string | null;
      limitTotalUsd?: number | null;
      createdAt: string;
    }>;
  }>;
}

export function TemporaryKeyPanel({ batches, users }: TemporaryKeyPanelProps) {
  const t = useTranslations("dashboard.temporaryKeys");
  const [pendingBatchId, setPendingBatchId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [sourceUserId, setSourceUserId] = useState("");
  const [sourceKeyId, setSourceKeyId] = useState("");
  const [count, setCount] = useState("10");
  const [name, setName] = useState("");
  const [customLimitTotalUsd, setCustomLimitTotalUsd] = useState("3");
  const router = useRouter();

  const handleCreate = () => {
    startTransition(async () => {
      try {
        const result = await createPortalTemporaryKeyBatch({
          sourceUserId: Number(sourceUserId),
          sourceKeyId: Number(sourceKeyId),
          count: Number(count),
          name: name.trim() || undefined,
          customLimitTotalUsd: customLimitTotalUsd.trim()
            ? Number(customLimitTotalUsd)
            : null,
        });
        if (!result.ok) {
          toast.error(result.error || t("errors.createFailed"));
          return;
        }
        if (!result.data) {
          toast.error(t("errors.createFailed"));
          return;
        }
        toast.success(t("messages.created", { count: result.data.keyCount }));
        router.refresh();
      } catch (error) {
        console.error("[TemporaryKeyPanel] create failed", error);
        toast.error(t("errors.createFailed"));
      }
    });
  };

  const handleDownload = (batchId: number) => {
    startTransition(async () => {
      setPendingBatchId(batchId);
      try {
        const result = await downloadPortalTemporaryKeyBatch({ batchId });
        if (!result.ok) {
          toast.error(result.error || t("errors.downloadFailed"));
          return;
        }
        if (!result.data) {
          toast.error(t("errors.downloadFailed"));
          return;
        }

        const content = result.data.keys
          .map((key) => `${key.name},${key.key},${key.limitTotalUsd ?? ""}`)
          .join("\n");
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `temporary-key-batch-${batchId}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(t("messages.downloaded"));
      } catch (error) {
        console.error("[TemporaryKeyPanel] download failed", error);
        toast.error(t("errors.downloadFailed"));
      } finally {
        setPendingBatchId(null);
      }
    });
  };

  const handleDelete = (batchId: number) => {
    startTransition(async () => {
      setPendingBatchId(batchId);
      try {
        const result = await deletePortalTemporaryKeyBatch({ batchId });
        if (!result.ok) {
          toast.error(result.error || t("errors.deleteFailed"));
          return;
        }
        toast.success(t("messages.deleted"));
        router.refresh();
      } catch (error) {
        console.error("[TemporaryKeyPanel] delete failed", error);
        toast.error(t("errors.deleteFailed"));
      } finally {
        setPendingBatchId(null);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-base font-semibold">{t("title")}</h3>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-5">
        <div className="space-y-2">
          <Label htmlFor="tmp-source-user">{t("fields.sourceUserId")}</Label>
          <Input
            id="tmp-source-user"
            value={sourceUserId}
            onChange={(event) => setSourceUserId(event.target.value)}
            placeholder="1001"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tmp-source-key">{t("fields.sourceKeyId")}</Label>
          <Input
            id="tmp-source-key"
            value={sourceKeyId}
            onChange={(event) => setSourceKeyId(event.target.value)}
            placeholder="2001"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tmp-count">{t("fields.count")}</Label>
          <Input
            id="tmp-count"
            value={count}
            onChange={(event) => setCount(event.target.value)}
            placeholder="10"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tmp-limit">{t("fields.customLimitTotalUsd")}</Label>
          <Input
            id="tmp-limit"
            value={customLimitTotalUsd}
            onChange={(event) => setCustomLimitTotalUsd(event.target.value)}
            placeholder="3"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tmp-name">{t("fields.name")}</Label>
          <Input
            id="tmp-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="tmp-test"
          />
        </div>
        <div className="md:col-span-5">
          <Button type="button" disabled={isPending} onClick={handleCreate}>
            {t("actions.createBatch")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("fields.sourceUserId")}</TableHead>
                <TableHead>{t("fields.providerGroup")}</TableHead>
                <TableHead>{t("fields.keys")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="font-medium">{user.name}</div>
                    <div className="text-xs text-muted-foreground">{user.id}</div>
                  </TableCell>
                  <TableCell>{user.providerGroup || "-"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {user.keys.map((key) => key.name).join(", ") || "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("fields.name")}</TableHead>
                <TableHead>{t("fields.count")}</TableHead>
                <TableHead>{t("fields.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-sm text-muted-foreground">
                    {t("messages.noBatches")}
                  </TableCell>
                </TableRow>
              ) : (
                batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell>
                      <div className="font-medium">{batch.name}</div>
                      <div className="text-xs text-muted-foreground">
                        user {batch.sourceUserId} / key {batch.sourceKeyId}
                      </div>
                    </TableCell>
                    <TableCell>{batch.createdCount}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isPending && pendingBatchId === batch.id}
                          onClick={() => handleDownload(batch.id)}
                        >
                          {t("actions.download")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={isPending && pendingBatchId === batch.id}
                          onClick={() => handleDelete(batch.id)}
                        >
                          {t("actions.delete")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
