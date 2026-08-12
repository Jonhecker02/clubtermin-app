"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { createClient } from "@/lib/supabase/client";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// Registering is idempotent once permission is granted (no re-prompt), so
// this doubles as "get the current device token" for the native subscribed
// check below.
async function getNativeToken(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let registrationHandle: PluginListenerHandle | undefined;
    let errorHandle: PluginListenerHandle | undefined;
    const cleanup = () => {
      registrationHandle?.remove();
      errorHandle?.remove();
    };
    PushNotifications.addListener("registration", (token) => {
      cleanup();
      resolve(token.value);
    }).then((handle) => (registrationHandle = handle));
    PushNotifications.addListener("registrationError", (error) => {
      cleanup();
      reject(new Error(error.error));
    }).then((handle) => (errorHandle = handle));
    PushNotifications.register();
  });
}

interface PushState {
  supported: boolean;
  iosNeedsInstall: boolean;
  subscribed: boolean;
  loading: boolean;
}

export function usePush(userId: string | undefined) {
  const [state, setState] = useState<PushState>({
    supported: false,
    iosNeedsInstall: false,
    subscribed: false,
    loading: true,
  });
  const nativeTokenRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      const perm = await PushNotifications.checkPermissions();
      if (perm.receive !== "granted" || !userId) {
        setState({ supported: true, iosNeedsInstall: false, subscribed: false, loading: false });
        return;
      }
      try {
        const token = await getNativeToken();
        nativeTokenRef.current = token;
        const supabase = createClient();
        const { data } = await supabase
          .from("apns_tokens")
          .select("device_token")
          .eq("user_id", userId)
          .eq("device_token", token)
          .maybeSingle();
        setState({ supported: true, iosNeedsInstall: false, subscribed: !!data, loading: false });
      } catch {
        setState({ supported: true, iosNeedsInstall: false, subscribed: false, loading: false });
      }
      return;
    }

    const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
    if (!supported) {
      setState({ supported: false, iosNeedsInstall: isIos(), subscribed: false, loading: false });
      return;
    }
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    const existing = await registration?.pushManager.getSubscription();
    setState({ supported: true, iosNeedsInstall: isIos() && !isStandalone(), subscribed: !!existing, loading: false });
  }, [userId]);

  useEffect(() => {
    // Syncing React state from the browser's Push API (no change event to
    // subscribe to instead) — an async check on mount is the correct shape here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const subscribe = useCallback(async () => {
    if (!userId) return;

    if (Capacitor.isNativePlatform()) {
      const permStatus = await PushNotifications.requestPermissions();
      if (permStatus.receive !== "granted") {
        await refresh();
        return;
      }
      const token = await getNativeToken();
      nativeTokenRef.current = token;
      const supabase = createClient();
      await supabase.rpc("register_apns_token", { p_device_token: token });
      await refresh();
      return;
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) return;

    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      await refresh();
      return;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const json = subscription.toJSON();

    const supabase = createClient();
    await supabase.from("push_subscriptions").insert({
      user_id: userId,
      endpoint: json.endpoint!,
      p256dh: json.keys!.p256dh,
      auth: json.keys!.auth,
    });
    await refresh();
  }, [userId, refresh]);

  const unsubscribe = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      const supabase = createClient();
      const token = nativeTokenRef.current ?? (await getNativeToken().catch(() => null));
      if (token) {
        await supabase.from("apns_tokens").delete().eq("device_token", token);
      } else if (userId) {
        // Token unresolvable (e.g. permission revoked in Settings) — best-effort
        // cleanup by user rather than leaving a stale row nothing can target.
        await supabase.from("apns_tokens").delete().eq("user_id", userId);
      }
      nativeTokenRef.current = null;
      await refresh();
      return;
    }

    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      const supabase = createClient();
      await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    }
    await refresh();
  }, [refresh, userId]);

  return { ...state, subscribe, unsubscribe };
}
