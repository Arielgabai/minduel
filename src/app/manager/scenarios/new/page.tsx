import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";

/** LOT O : création manager d'exercice désactivée. */
export default async function NewScenarioPage() {
  await requireManager();
  redirect("/manager/exercises");
}
