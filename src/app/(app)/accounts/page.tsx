"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useAuthenticatedQuery } from "@/hooks/use-authenticated-query";
import { formatCurrency } from "@/lib/format";
import { PlaidLinkButton } from "@/components/plaid/plaid-link-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  CheckCircle2,
  Landmark,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  Unplug,
  WalletCards,
} from "lucide-react";

type PlaidItemId = Id<"plaidItems">;
type DisconnectTarget = {
  plaidItemId: PlaidItemId;
  institutionName: string;
  accountCount: number;
};

function getNumberField(record: Record<string, unknown>, field: string) {
  return typeof record[field] === "number" ? record[field] : 0;
}

function describeSyncResult(result: unknown) {
  if (!result || typeof result !== "object") {
    return "Bank connected. Transactions are syncing now.";
  }

  const record = result as Record<string, unknown>;
  const imported = getNumberField(record, "imported");
  const updated = getNumberField(record, "updated");
  const removed = getNumberField(record, "removed");

  if (imported === 0 && updated === 0 && removed === 0) {
    return "Bank connected. No new expense transactions were found yet.";
  }

  return `Synced ${imported} new, ${updated} updated, and ${removed} removed transactions.`;
}

function formatTimestamp(value: number | null) {
  if (!value) {
    return "Never synced";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function StatusBadge({
  status,
}: {
  status: "active" | "disconnected" | "error";
}) {
  if (status === "active") {
    return (
      <Badge
        variant="secondary"
        className="bg-emerald-500/10 text-emerald-500"
      >
        Active
      </Badge>
    );
  }

  if (status === "error") {
    return <Badge variant="destructive">Needs attention</Badge>;
  }

  return <Badge variant="outline">Disconnected</Badge>;
}

export default function AccountsPage() {
  const connections = useAuthenticatedQuery(api.plaid.listConnections, {});
  const syncItem = useAction(api.plaid.syncItem);
  const disconnectItem = useAction(api.plaid.disconnectItem);
  const [syncingItemId, setSyncingItemId] = useState<PlaidItemId | null>(null);
  const [disconnectingItemId, setDisconnectingItemId] =
    useState<PlaidItemId | null>(null);
  const [disconnectTarget, setDisconnectTarget] =
    useState<DisconnectTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeConnections =
    connections?.filter((connection) => connection.status === "active")
      .length ?? 0;
  const accountCount =
    connections?.reduce((sum, connection) => sum + connection.accountCount, 0) ??
    0;
  const lastSyncedAt =
    connections
      ?.map((connection) => connection.lastSyncedAt)
      .filter((value): value is number => typeof value === "number")
      .sort((a, b) => b - a)[0] ?? null;

  const handleSync = async (plaidItemId: PlaidItemId) => {
    setNotice(null);
    setError(null);
    setSyncingItemId(plaidItemId);
    try {
      const result = await syncItem({ plaidItemId });
      setNotice(describeSyncResult(result));
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : "Could not sync this bank connection."
      );
    } finally {
      setSyncingItemId(null);
    }
  };

  const handleDisconnect = async (
    plaidItemId: PlaidItemId,
    institutionName: string,
    deleteTransactions: boolean
  ) => {
    setNotice(null);
    setError(null);
    setDisconnectingItemId(plaidItemId);
    try {
      const result = await disconnectItem({
        plaidItemId,
        deleteTransactions,
      });
      setNotice(
        deleteTransactions
          ? `${institutionName} was disconnected and ${result.deletedExpenses} synced expense${result.deletedExpenses === 1 ? "" : "s"} were deleted.`
          : `${institutionName} was disconnected. Existing expenses were kept.`
      );
      setDisconnectTarget(null);
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Could not disconnect this bank connection."
      );
    } finally {
      setDisconnectingItemId(null);
    }
  };

  return (
    <div data-animate className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bank Accounts</h1>
          <p className="mt-1 text-muted-foreground">
            Connect once with Plaid and keep expenses updated automatically.
          </p>
        </div>
        <PlaidLinkButton
          onConnected={(result) => {
            setError(null);
            setNotice(describeSyncResult(result));
          }}
          onError={(message) => {
            setNotice(null);
            setError(message || null);
          }}
        />
      </div>

      {notice && (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <p>{notice}</p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Live Transaction Sync</CardTitle>
          <CardDescription>
            Plaid transactions are imported as expenses and refreshed every six
            hours.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Landmark className="size-4" />
                Institutions
              </div>
              {connections === undefined ? (
                <Skeleton className="mt-3 h-8 w-16" />
              ) : (
                <p className="mt-2 text-2xl font-semibold">
                  {activeConnections}
                </p>
              )}
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <WalletCards className="size-4" />
                Accounts
              </div>
              {connections === undefined ? (
                <Skeleton className="mt-3 h-8 w-16" />
              ) : (
                <p className="mt-2 text-2xl font-semibold">{accountCount}</p>
              )}
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCcw className="size-4" />
                Last Sync
              </div>
              {connections === undefined ? (
                <Skeleton className="mt-3 h-8 w-32" />
              ) : (
                <p className="mt-2 text-base font-medium">
                  {formatTimestamp(lastSyncedAt)}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {connections === undefined ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                  <Skeleton className="h-8 w-28" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : connections.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <div className="rounded-full bg-muted p-4">
            <ShieldCheck className="size-8 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-lg font-medium">
            No bank accounts connected
          </h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Connect a checking, savings, or credit card account to import new
            expense transactions without uploading bank statements.
          </p>
          <div className="mt-6">
            <PlaidLinkButton
              onConnected={(result) => {
                setError(null);
                setNotice(describeSyncResult(result));
              }}
              onError={(message) => {
                setNotice(null);
                setError(message || null);
              }}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {connections.map((connection) => (
            <Card key={connection._id}>
              <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>{connection.institutionName}</CardTitle>
                    <StatusBadge status={connection.status} />
                  </div>
                  <CardDescription className="mt-1">
                    {connection.accountCount} linked account
                    {connection.accountCount === 1 ? "" : "s"} - Last sync{" "}
                    {formatTimestamp(connection.lastSyncedAt)}
                  </CardDescription>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      connection.status === "disconnected" ||
                      syncingItemId === connection._id ||
                      disconnectingItemId === connection._id
                    }
                    onClick={() => void handleSync(connection._id)}
                  >
                    {syncingItemId === connection._id ? (
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    ) : (
                      <RefreshCcw className="mr-1.5 size-3.5" />
                    )}
                    Sync Now
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={disconnectingItemId === connection._id}
                    onClick={() =>
                      setDisconnectTarget({
                        plaidItemId: connection._id,
                        institutionName: connection.institutionName,
                        accountCount: connection.accountCount,
                      })
                    }
                  >
                    {disconnectingItemId === connection._id ? (
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    ) : (
                      <Unplug className="mr-1.5 size-3.5" />
                    )}
                    Disconnect
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {connection.status === "error" && connection.errorMessage && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {connection.errorMessage}
                  </div>
                )}

                <div className="divide-y rounded-lg border">
                  {connection.accounts.length === 0 ? (
                    <div className="px-4 py-5 text-sm text-muted-foreground">
                      Account details will appear after the first sync.
                    </div>
                  ) : (
                    connection.accounts.map((account) => (
                      <div
                        key={account._id}
                        className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-medium">
                              {account.name}
                            </p>
                            {account.mask && (
                              <Badge variant="outline">**** {account.mask}</Badge>
                            )}
                            {!account.isActive && (
                              <Badge variant="outline">Inactive</Badge>
                            )}
                          </div>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            {[account.type, account.subtype]
                              .filter(Boolean)
                              .join(" - ")}
                          </p>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="font-mono text-sm font-medium">
                            {account.currentBalance === null
                              ? "Balance unavailable"
                              : formatCurrency(
                                  account.currentBalance,
                                  account.isoCurrencyCode ?? "USD"
                                )}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Current balance
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={disconnectTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDisconnectTarget(null);
          }
        }}
      >
        <DialogContent className="overflow-hidden sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Disconnect bank connection</DialogTitle>
            <DialogDescription>
              Choose what happens to expenses already synced from this Plaid
              connection.
            </DialogDescription>
          </DialogHeader>

          {disconnectTarget && (
            <div className="space-y-4">
              <div className="w-full min-w-0 rounded-lg border border-border/70 bg-muted/20 p-4">
                <p className="text-sm font-medium">
                  {disconnectTarget.institutionName}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {disconnectTarget.accountCount} linked account
                  {disconnectTarget.accountCount === 1 ? "" : "s"} will stop
                  syncing new transactions.
                </p>
              </div>

              <div className="grid gap-3">
                <Button
                  variant="outline"
                  className="h-auto w-full min-w-0 shrink items-start justify-start gap-3 whitespace-normal p-4 text-left"
                  disabled={disconnectingItemId === disconnectTarget.plaidItemId}
                  onClick={() =>
                    void handleDisconnect(
                      disconnectTarget.plaidItemId,
                      disconnectTarget.institutionName,
                      false
                    )
                  }
                >
                  {disconnectingItemId === disconnectTarget.plaidItemId ? (
                    <Loader2 className="size-4 shrink-0 animate-spin" />
                  ) : (
                    <Unplug className="size-4 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-snug">
                      Disconnect and keep expenses
                    </span>
                    <span className="mt-1 block text-sm font-normal leading-relaxed text-muted-foreground">
                      Stops future Plaid sync while keeping historical expense
                      records in Extracker.
                    </span>
                  </span>
                </Button>

                <Button
                  variant="destructive"
                  className="h-auto w-full min-w-0 shrink items-start justify-start gap-3 whitespace-normal p-4 text-left"
                  disabled={disconnectingItemId === disconnectTarget.plaidItemId}
                  onClick={() =>
                    void handleDisconnect(
                      disconnectTarget.plaidItemId,
                      disconnectTarget.institutionName,
                      true
                    )
                  }
                >
                  {disconnectingItemId === disconnectTarget.plaidItemId ? (
                    <Loader2 className="size-4 shrink-0 animate-spin" />
                  ) : (
                    <Trash2 className="size-4 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-snug">
                      Disconnect and delete synced expenses
                    </span>
                    <span className="mt-1 block text-sm font-normal leading-relaxed opacity-90">
                      Removes Plaid-imported expenses from these linked accounts
                      after disconnecting.
                    </span>
                  </span>
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
