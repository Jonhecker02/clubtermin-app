"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@/lib/useGuardedRouter";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Input } from "@/components/ui/Input";
import { clearAllCaches } from "@/lib/queryPersist";
import styles from "./AccountSafetyCards.module.css";

// Permanent self-service deletion (required by the App Store). Asks for the
// password again so a stolen unlocked phone cannot wipe the account.
export function DeleteAccountButton({ isOwner }: { isOwner: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(
        data.error === "wrong_password"
          ? "Das Passwort stimmt nicht."
          : data.error === "owner_cannot_delete"
            ? "Der Clubmanager-Account kann nicht gelöscht werden. Übergib zuerst die Rolle."
            : "Löschen hat nicht geklappt. Bitte versuche es später noch einmal.",
      );
      return;
    }
    setOpen(false);
    clearAllCaches(queryClient);
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <button type="button" className={styles.danger} onClick={() => setOpen(true)}>
        Konto löschen
      </button>
      <BottomSheet
        open={open}
        onClose={() => {
          setOpen(false);
          setPassword("");
          setError("");
        }}
        title="Konto löschen"
        subtitle="Das kann nicht rückgängig gemacht werden."
      >
        {isOwner ? (
          <div className={styles.sheetText}>
            Du bist Clubmanager. Damit der Club nicht ohne Verwaltung bleibt, kann dieser Account nicht gelöscht werden.
            Schreib uns über die Kontaktseite, wenn du die Rolle übergeben möchtest.
          </div>
        ) : (
          <div className={styles.sheet}>
            <div className={styles.sheetText}>
              Dein Name, deine Anmeldungen, Notizen zu dir, Nachrichten und alle Geräte-Einstellungen werden dauerhaft
              gelöscht. Zur Sicherheit gib bitte dein Passwort ein.
            </div>
            <Input
              label="Passwort"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              enterKeyHint="go"
            />
            {error && <div className={styles.error}>{error}</div>}
            <Button variant="primary" full onClick={confirmDelete} disabled={!password || busy}>
              {busy ? "Wird gelöscht…" : "Konto endgültig löschen"}
            </Button>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
