"use client";

import { SettingsForm } from "@/components/settings/settings-form";

export default function SettingsPage() {
  return (
    <div className="space-y-6" data-animate>
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <SettingsForm />
    </div>
  );
}
