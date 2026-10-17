"use client";

import { useMemo } from "react";
import { useRouter as useNextRouter } from "next/navigation";
import { requestLeave } from "./unsavedGuard";

// Drop-in replacement for next/navigation's useRouter: push and replace first
// check for unsaved changes and show the "discard changes?" dialog if needed.
export function useRouter() {
  const router = useNextRouter();
  return useMemo(
    () => ({
      ...router,
      push: (href: string, options?: Parameters<typeof router.push>[1]) => {
        if (requestLeave(() => router.push(href, options))) router.push(href, options);
      },
      replace: (href: string, options?: Parameters<typeof router.replace>[1]) => {
        if (requestLeave(() => router.replace(href, options))) router.replace(href, options);
      },
    }),
    [router],
  );
}
