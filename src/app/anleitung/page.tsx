import type { Metadata } from "next";
import { AnleitungContent } from "./AnleitungContent";

export const metadata: Metadata = {
  title: "Anleitung — ClubTermine",
  description:
    "Anleitung für Spieler und Admins: Home-Bildschirm hinzufügen, Termine, Chat und Admin-Funktionen von ClubTermine.",
};

export default function AnleitungPage() {
  return <AnleitungContent />;
}
