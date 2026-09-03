import type { Metadata } from "next";
import { AnleitungContent } from "./AnleitungContent";

export const metadata: Metadata = {
  title: "Anleitung — ClubTermine",
  description:
    "Anleitung für Spieler: Home-Bildschirm hinzufügen, Termine, Chat und Profil in ClubTermine.",
};

export default function AnleitungPage() {
  return <AnleitungContent audience="spieler" />;
}
