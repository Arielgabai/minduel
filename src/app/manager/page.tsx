import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";

/** LOT O : le tableau de bord manager pointe vers le catalogue Exercices. */
export default async function ManagerDashboard() {
  await requireManager();
  redirect("/manager/exercises");
}
