"use client";

import { useState } from "react";
import Script from "next/script";
import { useAction } from "convex/react";
import { api } from "@/convex";
import { Button } from "@/components/ui/button";
import { Landmark, Loader2 } from "lucide-react";

type PlaidInstitution = {
  name?: string;
  institution_id?: string;
};

type PlaidAccount = {
  id?: string;
  account_id?: string;
  name?: string;
  mask?: string;
  type?: string;
  subtype?: string;
};

type PlaidLinkMetadata = {
  institution?: PlaidInstitution | null;
  accounts?: PlaidAccount[];
};

type PlaidLinkError = {
  error_message?: string;
  display_message?: string;
  error_code?: string;
};

type PlaidHandler = {
  open: () => void;
  destroy: () => void;
};

type PlaidCreateConfig = {
  token: string;
  onSuccess: (publicToken: string, metadata: PlaidLinkMetadata) => void;
  onExit: (error: PlaidLinkError | null, metadata: PlaidLinkMetadata) => void;
};

declare global {
  interface Window {
    Plaid?: {
      create: (config: PlaidCreateConfig) => PlaidHandler;
    };
  }
}

interface PlaidLinkButtonProps {
  disabled?: boolean;
  onConnected?: (result: unknown) => void;
  onError?: (message: string) => void;
}

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

function cleanAccount(account: PlaidAccount) {
  const cleaned: PlaidAccount = {};
  const id = cleanString(account.id);
  const accountId = cleanString(account.account_id);
  const name = cleanString(account.name);
  const mask = cleanString(account.mask);
  const type = cleanString(account.type);
  const subtype = cleanString(account.subtype);

  if (id) cleaned.id = id;
  if (accountId) cleaned.account_id = accountId;
  if (name) cleaned.name = name;
  if (mask) cleaned.mask = mask;
  if (type) cleaned.type = type;
  if (subtype) cleaned.subtype = subtype;

  return cleaned;
}

function cleanMetadata(metadata: PlaidLinkMetadata) {
  const cleaned: PlaidLinkMetadata = {};
  const institution = metadata.institution;

  if (institution) {
    const name = cleanString(institution.name);
    const institutionId = cleanString(institution.institution_id);
    if (name || institutionId) {
      cleaned.institution = {};
      if (name) cleaned.institution.name = name;
      if (institutionId) cleaned.institution.institution_id = institutionId;
    }
  }

  const accounts = Array.isArray(metadata.accounts)
    ? metadata.accounts.map(cleanAccount).filter((account) => {
        return Object.keys(account).length > 0;
      })
    : [];
  if (accounts.length > 0) {
    cleaned.accounts = accounts;
  }

  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function getPlaidErrorMessage(error: PlaidLinkError | null) {
  return (
    error?.display_message ||
    error?.error_message ||
    "Plaid Link was closed before the account was connected."
  );
}

export function PlaidLinkButton({
  disabled,
  onConnected,
  onError,
}: PlaidLinkButtonProps) {
  const createLinkToken = useAction(api.plaid.createLinkToken);
  const exchangePublicToken = useAction(api.plaid.exchangePublicToken);
  const [scriptReady, setScriptReady] = useState(
    () => typeof window !== "undefined" && Boolean(window.Plaid)
  );
  const [busy, setBusy] = useState(false);

  const handleConnect = async () => {
    onError?.("");
    setBusy(true);

    try {
      const { linkToken } = await createLinkToken({});
      if (!window.Plaid) {
        throw new Error("Plaid Link did not finish loading.");
      }

      const handler = window.Plaid.create({
        token: linkToken,
        onSuccess: (publicToken, metadata) => {
          void (async () => {
            setBusy(true);
            try {
              const cleanedMetadata = cleanMetadata(metadata);
              const result = cleanedMetadata
                ? await exchangePublicToken({
                    publicToken,
                    metadata: cleanedMetadata,
                  })
                : await exchangePublicToken({ publicToken });
              onConnected?.(result);
            } catch (error) {
              onError?.(
                error instanceof Error
                  ? error.message
                  : "Could not connect this bank account."
              );
            } finally {
              setBusy(false);
              handler.destroy();
            }
          })();
        },
        onExit: (error) => {
          setBusy(false);
          handler.destroy();
          if (error) {
            onError?.(getPlaidErrorMessage(error));
          }
        },
      });

      handler.open();
    } catch (error) {
      setBusy(false);
      onError?.(
        error instanceof Error
          ? error.message
          : "Could not start Plaid Link."
      );
    }
  };

  const isDisabled = disabled || busy || !scriptReady;

  return (
    <>
      <Script
        src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onReady={() => setScriptReady(true)}
        onError={() => onError?.("Could not load Plaid Link.")}
      />
      <Button onClick={handleConnect} disabled={isDisabled}>
        {busy ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
        ) : (
          <Landmark className="mr-1.5 size-3.5" />
        )}
        {scriptReady ? "Connect Bank" : "Loading Plaid"}
      </Button>
    </>
  );
}
