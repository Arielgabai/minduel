import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";

/** LOT O : Scénarios manager → catalogue Exercices (lecture seule). */
export default async function ManagerScenariosPage() {
  await requireManager();
  redirect("/manager/exercises");
}
