"use client";

import { useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useAuthenticatedQuery } from "@/hooks/use-authenticated-query";
import { formatDate } from "@/lib/format";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  Loader2,
  Check,
  Database,
  LogOut,
  RefreshCcw,
  ShieldCheck,
  Upload,
  Trash2,
  User,
  UserX,
} from "lucide-react";

const CURRENCIES = [
  { value: "USD", label: "USD - US Dollar" },
  { value: "EUR", label: "EUR - Euro" },
  { value: "GBP", label: "GBP - British Pound" },
  { value: "CAD", label: "CAD - Canadian Dollar" },
  { value: "AUD", label: "AUD - Australian Dollar" },
  { value: "JPY", label: "JPY - Japanese Yen" },
];

export function SettingsForm() {
  const { user } = useUser();
  const { openUserProfile, signOut } = useClerk();
  const settings = useAuthenticatedQuery(api.settings.getAll, {});
  const setSetting = useMutation(api.settings.set);
  const seedDefaults = useMutation(api.seed.seedDefaults);
  const deleteImportSession = useMutation(api.importSessions.remove);
  const importSessions = useAuthenticatedQuery(api.importSessions.list, {});
  const accountOverview = useAuthenticatedQuery(api.account.getOverview, {});
  const claimLegacyData = useMutation(api.account.claimLegacyData);
  const deleteMyData = useMutation(api.account.deleteMyData);
  const disconnectAllPlaidItems = useAction(api.plaid.disconnectAllItems);
  const disconnectAllStripeConnections = useAction(
    api.stripe.disconnectAllConnections,
  );

  const [seeding, setSeeding] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState(false);
  const [claimingLegacy, setClaimingLegacy] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [deletingData, setDeletingData] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<Id<"importSessions"> | null>(null);

  const currentCurrency = settings?.defaultCurrency ?? "USD";
  const displayName =
    user?.fullName || user?.primaryEmailAddress?.emailAddress || "Account";
  const email = user?.primaryEmailAddress?.emailAddress;
  const initials =
    user?.firstName?.[0] ||
    user?.primaryEmailAddress?.emailAddress?.[0]?.toUpperCase() ||
    "A";

  const handleCurrencyChange = async (value: string | null) => {
    if (!value) {
      return;
    }
    await setSetting({ key: "defaultCurrency", value });
  };

  const handleSeed = async () => {
    setSeeding(true);
    setSeedSuccess(false);
    try {
      await seedDefaults();
      setSeedSuccess(true);
      setTimeout(() => setSeedSuccess(false), 3000);
    } catch {
      // error is unlikely but fail gracefully
    } finally {
      setSeeding(false);
    }
  };

  const handleClaimLegacyData = async () => {
    setClaimingLegacy(true);
    setClaimSuccess(false);
    setAccountError(null);
    try {
      let done = false;
      while (!done) {
        const result = await claimLegacyData();
        done = result.done;
      }
      setClaimSuccess(true);
      setTimeout(() => setClaimSuccess(false), 3000);
    } catch (error) {
      setAccountError(
        error instanceof Error ? error.message : "Could not claim legacy data",
      );
    } finally {
      setClaimingLegacy(false);
    }
  };

  const deleteAllAccountData = async () => {
    const plaidResult = await disconnectAllPlaidItems();
    if (plaidResult.failed > 0) {
      throw new Error(
        plaidResult.failures[0] ??
          "Could not disconnect every Plaid bank connection.",
      );
    }
    await disconnectAllStripeConnections();

    let done = false;
    while (!done) {
      const result = await deleteMyData();
      done = result.done;
    }
  };

  const handleDeleteAppData = async () => {
    const confirmed = window.confirm(
      "Delete all app data for this account? This disconnects bank and Stripe connections, then removes expenses, revenue, imports, categories, payment methods, and settings.",
    );
    if (!confirmed) {
      return;
    }

    setDeletingData(true);
    setAccountError(null);
    try {
      await deleteAllAccountData();
    } catch (error) {
      setAccountError(
        error instanceof Error ? error.message : "Could not delete app data",
      );
    } finally {
      setDeletingData(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || deleteConfirmation !== "DELETE") {
      return;
    }

    if (!user.deleteSelfEnabled) {
      setAccountError(
        "Account deletion is disabled in Clerk for this instance.",
      );
      return;
    }

    setDeletingAccount(true);
    setAccountError(null);
    try {
      await deleteAllAccountData();
      await user.delete();
      await signOut({ redirectUrl: "/sign-in" });
    } catch (error) {
      setAccountError(
        error instanceof Error ? error.message : "Could not delete account",
      );
      setDeletingAccount(false);
    }
  };

  const handleDeleteImport = async (
    sessionId: Id<"importSessions">,
    fileName: string,
    entityType?: "expense" | "revenue",
  ) => {
    const itemLabel =
      (entityType ?? "expense") === "revenue"
        ? "revenue entries"
        : "expenses";
    const confirmed = window.confirm(
      `Delete the import record for "${fileName}" and all ${itemLabel} imported from it?`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingSessionId(sessionId);
    try {
      let done = false;
      while (!done) {
        const result = await deleteImportSession({ id: sessionId });
        done = result.done;
      }
    } finally {
      setDeletingSessionId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Manage your profile and account-scoped app data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar size="lg">
                <AvatarImage src={user?.imageUrl} alt={displayName} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{displayName}</p>
                {email && (
                  <p className="truncate text-sm text-muted-foreground">
                    {email}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => openUserProfile()}>
                <User className="mr-1.5 size-3.5" />
                Profile
              </Button>
              <Button
                variant="outline"
                onClick={() => void signOut({ redirectUrl: "/sign-in" })}
              >
                <LogOut className="mr-1.5 size-3.5" />
                Log out
              </Button>
            </div>
          </div>

          {accountOverview === undefined ? (
            <Skeleton className="h-5 w-full max-w-xl" />
          ) : (
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <AccountCount
                label="expenses"
                count={accountOverview.expenses.count}
                hasMore={accountOverview.expenses.hasMore}
              />
              <AccountCount
                label="revenue rows"
                count={accountOverview.revenues.count}
                hasMore={accountOverview.revenues.hasMore}
              />
              <AccountCount
                label="imports"
                count={accountOverview.importSessions.count}
                hasMore={accountOverview.importSessions.hasMore}
              />
              <AccountCount
                label="categories"
                count={accountOverview.categories.count}
                hasMore={accountOverview.categories.hasMore}
              />
              <AccountCount
                label="payment methods"
                count={accountOverview.paymentMethods.count}
                hasMore={accountOverview.paymentMethods.hasMore}
              />
              <AccountCount
                label="bank connections"
                count={accountOverview.plaidItems.count}
                hasMore={accountOverview.plaidItems.hasMore}
              />
              <AccountCount
                label="linked bank accounts"
                count={accountOverview.plaidAccounts.count}
                hasMore={accountOverview.plaidAccounts.hasMore}
              />
              <AccountCount
                label="Stripe connections"
                count={accountOverview.stripeConnections.count}
                hasMore={accountOverview.stripeConnections.hasMore}
              />
            </div>
          )}

          {accountError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {accountError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 1: General */}
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>
            Configure your default preferences.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid max-w-sm gap-2">
            <Label>Default Currency</Label>
            {settings === undefined ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <Select
                value={currentCurrency}
                onValueChange={handleCurrencyChange}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Data Management */}
      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
          <CardDescription>
            Manage your categories, payment methods, and default data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {accountOverview?.hasLegacyData && (
              <div className="flex items-start gap-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="rounded-lg bg-amber-500/15 p-2.5">
                  <AlertTriangle className="size-5 text-amber-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    Unassigned data from before sign-in
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Attach old expenses, revenue, imports, categories, payment
                    methods, and settings to this account.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={handleClaimLegacyData}
                    disabled={claimingLegacy}
                  >
                    {claimingLegacy ? (
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    ) : claimSuccess ? (
                      <Check className="mr-1.5 size-3.5 text-emerald-500" />
                    ) : (
                      <RefreshCcw className="mr-1.5 size-3.5" />
                    )}
                    {claimSuccess ? "Data Attached" : "Attach to Account"}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-start gap-4">
              <div className="rounded-lg bg-muted p-2.5">
                <Database className="size-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Seed Default Data</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Create default categories and payment methods to get started
                  quickly.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={handleSeed}
                  disabled={seeding}
                >
                  {seeding ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : seedSuccess ? (
                    <Check className="mr-1.5 size-3.5 text-emerald-500" />
                  ) : (
                    <Database className="mr-1.5 size-3.5" />
                  )}
                  {seedSuccess ? "Defaults Created" : "Seed Defaults"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danger Zone</CardTitle>
          <CardDescription>
            Remove this account&apos;s app data or delete the Clerk account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Delete App Data</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Disconnects Plaid and Stripe first, then removes all Extracker
                records owned by this account.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={handleDeleteAppData}
              disabled={deletingData || deletingAccount}
            >
              {deletingData ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 size-3.5" />
              )}
              Delete App Data
            </Button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Delete Account</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Deletes app data first, then removes the Clerk user account.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => {
                setDeleteConfirmation("");
                setDeleteAccountOpen(true);
              }}
              disabled={!user || deletingData || deletingAccount}
            >
              <UserX className="mr-1.5 size-3.5" />
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Import History */}
      <Card>
        <CardHeader>
          <CardTitle>Import History</CardTitle>
          <CardDescription>
            View your past CSV import sessions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {importSessions === undefined ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : importSessions.length === 0 ? (
            <div className="flex flex-col items-center py-8">
              <div className="rounded-full bg-muted p-3">
                <Upload className="size-5 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                No imports yet
              </p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Rows</TableHead>
                    <TableHead className="w-[56px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importSessions.map((session) => (
                    <TableRow key={session._id}>
                      <TableCell className="font-medium">
                        {session.fileName}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {(session.entityType ?? "expense") === "revenue"
                            ? "Revenue"
                            : "Expense"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(
                          new Date(session._creationTime).toISOString(),
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={session.status} />
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {session.importedRows} of {session.totalRows}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Delete import ${session.fileName}`}
                          disabled={deletingSessionId === session._id}
                          onClick={() =>
                            handleDeleteImport(
                              session._id,
                              session.fileName,
                              session.entityType,
                            )
                          }
                        >
                          {deletingSessionId === session._id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4 text-destructive" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteAccountOpen} onOpenChange={setDeleteAccountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete account</DialogTitle>
            <DialogDescription>
              This permanently removes your app data and Clerk account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <p>
                Bank and Stripe connections are disconnected first. Expenses,
                revenue, imports, categories, payment methods, and settings are
                deleted before the Clerk account is removed.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="delete-confirmation">Type DELETE to confirm</Label>
              <Input
                id="delete-confirmation"
                value={deleteConfirmation}
                onChange={(event) =>
                  setDeleteConfirmation(event.currentTarget.value)
                }
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleteConfirmation !== "DELETE" || deletingAccount}
            >
              {deletingAccount ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <UserX className="mr-1.5 size-3.5" />
              )}
              Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AccountCount({
  label,
  count,
  hasMore,
}: {
  label: string;
  count: number;
  hasMore: boolean;
}) {
  return (
    <span className="rounded-md border bg-muted/40 px-2 py-1">
      {hasMore ? `${count}+` : count} {label}
    </span>
  );
}

function StatusBadge({
  status,
}: {
  status: "pending" | "processing" | "completed" | "failed";
}) {
  switch (status) {
    case "completed":
      return (
        <Badge
          variant="secondary"
          className="bg-emerald-500/10 text-emerald-500"
        >
          Completed
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive">Failed</Badge>
      );
    case "processing":
      return (
        <Badge
          variant="secondary"
          className="bg-amber-500/10 text-amber-500"
        >
          Processing
        </Badge>
      );
    case "pending":
      return (
        <Badge
          variant="secondary"
          className="bg-amber-500/10 text-amber-500"
        >
          Pending
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}
