import { redirect } from "next/navigation";
import { getCurrentUser, isTelepro } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { DemoBanner } from "@/components/DemoBanner";
import { TeleproShell } from "@/components/TeleproShell";

export default async function TeleproLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isTelepro(user)) redirect("/manager");

  return (
    <TeleproShell demoBanner={<DemoBanner show={isDemoMode()} />}>
      {children}
    </TeleproShell>
  );
}
