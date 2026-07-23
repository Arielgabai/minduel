import { redirect } from "next/navigation";
import { getCurrentUser, isManager } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { DemoBanner } from "@/components/DemoBanner";
import { ManagerNav, ManagerMobileNav } from "@/components/ManagerNav";

export default async function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isManager(user)) redirect("/app");

  return (
    <div className="min-h-screen">
      <ManagerNav
        orgName={user.organizationName ?? "—"}
        userName={user.fullName}
      />
      <div className="lg:pl-64">
        <DemoBanner show={isDemoMode()} />
        <main className="mx-auto max-w-6xl px-5 py-8 pb-24 lg:pb-8">{children}</main>
      </div>
      <ManagerMobileNav />
    </div>
  );
}
