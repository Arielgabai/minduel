import { redirect } from "next/navigation";
import { getCurrentUser, isTelepro } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { DemoBanner } from "@/components/DemoBanner";
import { TeleproNav } from "@/components/TeleproNav";

export default async function TeleproLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isTelepro(user)) redirect("/manager");

  return (
    <div className="min-h-screen pb-24">
      <DemoBanner show={isDemoMode()} />
      <div className="mx-auto max-w-md px-5 pt-6">{children}</div>
      <TeleproNav />
    </div>
  );
}
