"use client";

import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { CACHE_KEY, shouldPersistQuery } from "@/lib/queryPersist";
import { ThemeWatcher } from "@/components/ThemeWatcher";
import { UnsavedChangesGuard } from "@/components/UnsavedChangesGuard";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Must be at least as long as the persisted maxAge, or restored
            // data is garbage-collected before it can be shown.
            gcTime: WEEK_MS,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window === "undefined" ? undefined : window.localStorage,
      key: CACHE_KEY,
      throttleTime: 1000,
    }),
  );
  const router = useRouter();

  // Deep-links a tapped native push notification to its termin/chat — the
  // mirror of the web push service worker's notificationclick handler.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handle = PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const url = (action.notification.data as { url?: string } | undefined)?.url;
      if (url) router.push(url);
    });
    return () => {
      handle.then((h) => h.remove());
    };
  }, [router]);

  // Offline support + faster reopening: the service worker caches the app's
  // static files and page shells (see public/sw.js). Skipped in dev, where
  // caching Next's hot-reload chunks only gets in the way.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: WEEK_MS,
        // A new deploy may change what the queries return — start fresh then.
        buster: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev",
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
      }}
    >
      <ThemeWatcher />
      <UnsavedChangesGuard />
      {children}
    </PersistQueryClientProvider>
  );
}
