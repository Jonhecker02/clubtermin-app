import type { Metadata } from "next";
import { AnleitungContent } from "../AnleitungContent";

export const metadata: Metadata = {
  title: "Admin-Anleitung — ClubTermine",
  description:
    "Anleitung für Admins von ClubTermine: Termine, faire Rotation, Gruppen, Accounts, Rollen — inklusive der Spieler-Anleitung.",
};

export default function AnleitungAdminPage() {
  return <AnleitungContent audience="admin" />;
}
