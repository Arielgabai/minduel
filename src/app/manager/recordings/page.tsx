import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";

/**
 * LOT O : création / gestion d'appels modèles retirée de la nav manager.
 * Les fiches historiques /manager/recordings/[id] restent accessibles.
 */
export default async function RecordingsPage() {
  await requireManager();
  redirect("/manager/exercises");
}
