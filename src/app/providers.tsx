"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
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

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
