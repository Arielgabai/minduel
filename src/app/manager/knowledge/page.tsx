import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";

/** LOT O : Connaissances retirées de la navigation manager. */
export default async function KnowledgePage() {
  await requireManager();
  redirect("/manager/exercises");
}
