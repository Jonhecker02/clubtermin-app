// Asks the server to bring a termin's court groups in line with who is
// confirmed (puts Nachrücker into a fitting court, frees the seats of people
// who left) and to tell the Clubmanager. Fire-and-forget: a failure here must
// never get in the way of the registration itself — the Clubmanager can still
// place people by hand.
export function triggerPlacement(terminId: string): void {
  fetch("/api/notify/place-newcomers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ termin_id: terminId }),
  }).catch(() => {});
}
