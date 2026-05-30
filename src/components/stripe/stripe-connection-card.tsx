"use client";

import { FormEvent, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useAuthenticatedQuery } from "@/hooks/use-authenticated-query";
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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  Unplug,
} from "lucide-react";

type StripeConnectionId = Id<"stripeConnections">;
type DisconnectTarget = {
  stripeConnectionId: StripeConnectionId;
  label: string;
};

const STRIPE_RESTRICTED_KEY_URL = (() => {
  const params = new URLSearchParams();
  params.set("name", "Expensr");
  for (const permission of [
    "rak_balance_read",
    "rak_balance_transaction_source_read",
    "rak_charge_read",
    "rak_payment_intent_read",
  ]) {
    params.append("permissions[]", permission);
  }

  return `https://dashboard.stripe.com/apikeys/create?${params.toString()}`;
})();

function getNumberField(record: Record<string, unknown>, field: string) {
  return typeof record[field] === "number" ? record[field] : 0;
}

function describeSyncResult(result: unknown) {
  if (!result || typeof result !== "object") {
    return "Stripe connected. Revenue is syncing now.";
  }

  const record = result as Record<string, unknown>;
  const imported = getNumberField(record, "imported");
  const updated = getNumberField(record, "updated");

  if (imported === 0 && updated === 0) {
    return "Stripe connected. No new revenue charges were found yet.";
  }

  return `Synced ${imported} new and ${updated} updated revenue payment${
    imported + updated === 1 ? "" : "s"
  }.`;
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

export function StripeConnectionCard() {
  const connections = useAuthenticatedQuery(api.stripe.listConnections, {});
  const connectStripe = useAction(api.stripe.connect);
  const syncConnection = useAction(api.stripe.syncConnection);
  const disconnectConnection = useAction(api.stripe.disconnectConnection);
  const [apiKey, setApiKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncingConnectionId, setSyncingConnectionId] =
    useState<StripeConnectionId | null>(null);
  const [backfillingConnectionId, setBackfillingConnectionId] =
    useState<StripeConnectionId | null>(null);
  const [disconnectingConnectionId, setDisconnectingConnectionId] =
    useState<StripeConnectionId | null>(null);
  const [disconnectTarget, setDisconnectTarget] =
    useState<DisconnectTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visibleConnections =
    connections?.filter((connection) => connection.status !== "disconnected") ??
    [];
  const savedConnection =
    visibleConnections.find((connection) => connection.status === "active") ??
    visibleConnections[0] ??
    null;
  const lastSyncedAt =
    visibleConnections
      ?.map((connection) => connection.lastSyncedAt)
      .filter((value): value is number => typeof value === "number")
      .sort((a, b) => b - a)[0] ?? null;

  const handleConnect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      setError("Paste a restricted Stripe API key first.");
      return;
    }

    setConnecting(true);
    setNotice(null);
    setError(null);
    try {
      const result = await connectStripe({ apiKey: trimmedKey });
      setApiKey("");
      setNotice(describeSyncResult(result));
    } catch (connectError) {
      setError(
        connectError instanceof Error
          ? connectError.message
          : "Could not connect Stripe.",
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleSync = async (stripeConnectionId: StripeConnectionId) => {
    setSyncingConnectionId(stripeConnectionId);
    setNotice(null);
    setError(null);
    try {
      const result = await syncConnection({ stripeConnectionId });
      setNotice(describeSyncResult(result));
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : "Could not sync this Stripe connection.",
      );
    } finally {
      setSyncingConnectionId(null);
    }
  };

  const handleBackfill = async (stripeConnectionId: StripeConnectionId) => {
    setBackfillingConnectionId(stripeConnectionId);
    setNotice(null);
    setError(null);
    try {
      const result = await syncConnection({
        stripeConnectionId,
        backfillAllTime: true,
      });
      setNotice(describeSyncResult(result));
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : "Could not backfill this Stripe connection.",
      );
    } finally {
      setBackfillingConnectionId(null);
    }
  };

  const handleDisconnect = async (
    stripeConnectionId: StripeConnectionId,
    deleteRevenue: boolean,
  ) => {
    setDisconnectingConnectionId(stripeConnectionId);
    setNotice(null);
    setError(null);
    try {
      const result = await disconnectConnection({
        stripeConnectionId,
        deleteRevenue,
      });
      setNotice(
        deleteRevenue
          ? `Stripe was disconnected and ${result.deletedRevenue} synced revenue row${result.deletedRevenue === 1 ? "" : "s"} were deleted.`
          : "Stripe was disconnected. Existing revenue rows were kept.",
      );
      setDisconnectTarget(null);
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Could not disconnect this Stripe connection.",
      );
    } finally {
      setDisconnectingConnectionId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stripe Revenue Sync</CardTitle>
        <CardDescription>
          Connect once with a restricted key and refresh Stripe revenue every
          six hours.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
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

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="size-4" />
              Status
            </div>
            {connections === undefined ? (
              <Skeleton className="mt-3 h-7 w-24" />
            ) : (
              <p className="mt-2 text-base font-medium">
                {savedConnection
                  ? savedConnection.status === "active"
                    ? "Connected"
                    : "Needs attention"
                  : "Not connected"}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <KeyRound className="size-4" />
              Key
            </div>
            {connections === undefined ? (
              <Skeleton className="mt-3 h-7 w-28" />
            ) : savedConnection ? (
              <p className="mt-2 font-mono text-base font-medium">
                rk_{savedConnection.keyMode}_...{savedConnection.keyLast4}
              </p>
            ) : (
              <p className="mt-2 text-base font-medium">No key stored</p>
            )}
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCcw className="size-4" />
              Last Sync
            </div>
            {connections === undefined ? (
              <Skeleton className="mt-3 h-7 w-32" />
            ) : (
              <p className="mt-2 text-base font-medium">
                {formatTimestamp(lastSyncedAt)}
              </p>
            )}
          </div>
        </div>

        <form
          className="grid gap-3 rounded-lg border border-border/70 bg-muted/20 p-4"
          onSubmit={handleConnect}
        >
          <div className="grid gap-2">
            <Label htmlFor="stripe-api-key">Stripe restricted API key</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="stripe-api-key"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.currentTarget.value)}
                placeholder="rk_live_..."
                autoComplete="off"
                className="font-mono"
              />
              <Button
                type="submit"
                className="shrink-0"
                disabled={connecting}
              >
                {connecting ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <KeyRound className="mr-1.5 size-3.5" />
                )}
                {savedConnection ? "Update Key" : "Connect Stripe"}
              </Button>
            </div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <a
                  href={STRIPE_RESTRICTED_KEY_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4 hover:text-primary"
                >
                  Click here to create a read-only API key.
                  <ExternalLink className="size-3.5" />
                </a>
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>Scroll down and click &quot;Create key&quot;</li>
                  <li>Don&apos;t change the pre-filled permissions</li>
                  <li>
                    Don&apos;t delete the key or Expensr can&apos;t refresh
                    revenue
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </form>

        {connections === undefined ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-4 rounded-lg border p-4"
              >
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-56" />
                </div>
                <Skeleton className="h-8 w-28" />
              </div>
            ))}
          </div>
        ) : visibleConnections.length > 0 ? (
          <div className="divide-y rounded-lg border">
            {visibleConnections.map((connection) => {
              const label = `Stripe ${connection.keyMode} key ending ${connection.keyLast4}`;
              return (
                <div
                  key={connection._id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{label}</p>
                      <StatusBadge status={connection.status} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Last sync {formatTimestamp(connection.lastSyncedAt)}
                    </p>
                    {connection.status === "error" &&
                      connection.errorMessage && (
                        <p className="mt-2 text-sm text-destructive">
                          {connection.errorMessage}
                        </p>
                      )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        connection.status === "disconnected" ||
                        syncingConnectionId === connection._id ||
                        backfillingConnectionId === connection._id ||
                        disconnectingConnectionId === connection._id
                      }
                      onClick={() => void handleSync(connection._id)}
                    >
                      {syncingConnectionId === connection._id ? (
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      ) : (
                        <RefreshCcw className="mr-1.5 size-3.5" />
                      )}
                      Sync Now
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        connection.status === "disconnected" ||
                        syncingConnectionId === connection._id ||
                        backfillingConnectionId === connection._id ||
                        disconnectingConnectionId === connection._id
                      }
                      onClick={() => void handleBackfill(connection._id)}
                    >
                      {backfillingConnectionId === connection._id ? (
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      ) : (
                        <RefreshCcw className="mr-1.5 size-3.5" />
                      )}
                      Backfill All-Time
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={disconnectingConnectionId === connection._id}
                      onClick={() =>
                        setDisconnectTarget({
                          stripeConnectionId: connection._id,
                          label,
                        })
                      }
                    >
                      {disconnectingConnectionId === connection._id ? (
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      ) : (
                        <Unplug className="mr-1.5 size-3.5" />
                      )}
                      Disconnect
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </CardContent>

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
            <DialogTitle>Disconnect Stripe</DialogTitle>
            <DialogDescription>
              Choose what happens to revenue already synced from this Stripe
              key.
            </DialogDescription>
          </DialogHeader>

          {disconnectTarget && (
            <div className="space-y-4">
              <div className="w-full min-w-0 rounded-lg border border-border/70 bg-muted/20 p-4">
                <p className="text-sm font-medium">{disconnectTarget.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The stored API key will be deleted from Extracker and future
                  Stripe refreshes will stop.
                </p>
              </div>

              <div className="grid gap-3">
                <Button
                  variant="outline"
                  className="h-auto w-full min-w-0 shrink items-start justify-start gap-3 whitespace-normal p-4 text-left"
                  disabled={
                    disconnectingConnectionId ===
                    disconnectTarget.stripeConnectionId
                  }
                  onClick={() =>
                    void handleDisconnect(
                      disconnectTarget.stripeConnectionId,
                      false,
                    )
                  }
                >
                  {disconnectingConnectionId ===
                  disconnectTarget.stripeConnectionId ? (
                    <Loader2 className="size-4 shrink-0 animate-spin" />
                  ) : (
                    <Unplug className="size-4 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-snug">
                      Disconnect and keep revenue
                    </span>
                    <span className="mt-1 block text-sm font-normal leading-relaxed text-muted-foreground">
                      Stops future Stripe sync while keeping historical revenue
                      records in Extracker.
                    </span>
                  </span>
                </Button>

                <Button
                  variant="destructive"
                  className="h-auto w-full min-w-0 shrink items-start justify-start gap-3 whitespace-normal p-4 text-left"
                  disabled={
                    disconnectingConnectionId ===
                    disconnectTarget.stripeConnectionId
                  }
                  onClick={() =>
                    void handleDisconnect(
                      disconnectTarget.stripeConnectionId,
                      true,
                    )
                  }
                >
                  {disconnectingConnectionId ===
                  disconnectTarget.stripeConnectionId ? (
                    <Loader2 className="size-4 shrink-0 animate-spin" />
                  ) : (
                    <Trash2 className="size-4 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-snug">
                      Disconnect and delete synced revenue
                    </span>
                    <span className="mt-1 block text-sm font-normal leading-relaxed opacity-90">
                      Removes Stripe-imported revenue rows after deleting the
                      stored key.
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
    </Card>
  );
}
