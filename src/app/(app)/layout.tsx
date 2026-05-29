"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@/convex";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Loader2 } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const convexAuth = useConvexAuth();
  const upsertCurrentUser = useMutation(api.users.upsertCurrent);
  const isLoadingAuth = !clerkLoaded || convexAuth.isLoading;

  useEffect(() => {
    if (!isSignedIn || !convexAuth.isAuthenticated) {
      return;
    }

    void upsertCurrentUser();
  }, [convexAuth.isAuthenticated, isSignedIn, upsertCurrentUser]);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4 md:hidden">
          <SidebarTrigger />
        </header>
        <div className="flex-1 overflow-auto">
          <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
            {isLoadingAuth ? (
              <div className="flex min-h-[50vh] items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : isSignedIn && convexAuth.isAuthenticated ? (
              children
            ) : (
              <div className="flex min-h-[50vh] items-center justify-center">
                <div className="max-w-md rounded-lg border p-6 text-center">
                  <h1 className="text-lg font-semibold">
                    Data authentication is not ready
                  </h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Clerk is signed in, but Convex did not receive a valid
                    Clerk token. Refresh the page after the Clerk Convex JWT
                    template is configured.
                  </p>
                  <Button
                    className="mt-4"
                    variant="outline"
                    onClick={() => window.location.reload()}
                  >
                    Refresh
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
