import { redirect } from "next/navigation";
import { TELEPRO_HISTORY_REDIRECT } from "@/lib/teleproNav";

/**
 * Compatibilité : l'ancienne route /app/history redirige vers Progression.
 */
export default function HistoryPage() {
  redirect(TELEPRO_HISTORY_REDIRECT);
}
