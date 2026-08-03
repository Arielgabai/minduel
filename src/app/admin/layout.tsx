import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { LogoMark } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requirePlatformAdmin().catch(() => null);
  if (!admin) redirect("/login");

  return (
    <div className="min-h-screen bg-[#05060a] text-[#F5F6FA]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-[#1e222c] bg-[#0d1017] p-5 lg:flex">
        <Link href="/admin/exercises" className="mb-8 flex items-center gap-2">
          <LogoMark size={32} />
          <span className="text-sm font-bold tracking-[0.12em]">
            ADMIN <span className="text-[#3E6BFF]">MINDUEL</span>
          </span>
        </Link>
        <nav className="flex-1 space-y-1">
          <Link
            href="/admin/exercises"
            className="block rounded-xl border border-[#3E6BFF]/30 bg-[#3E6BFF]/10 px-3 py-2.5 text-sm text-white"
          >
            Exercices
          </Link>
          <Link
            href="/admin/missions"
            className="block rounded-xl px-3 py-2.5 text-sm text-[#9AA1B2] hover:bg-white/5 hover:text-white"
          >
            Parcours
          </Link>
          <Link
            href="/admin/skills"
            className="block rounded-xl px-3 py-2.5 text-sm text-[#9AA1B2] hover:bg-white/5 hover:text-white"
          >
            Skills
          </Link>
          <Link
            href="/manager"
            className="block rounded-xl px-3 py-2.5 text-sm text-[#9AA1B2] hover:bg-white/5 hover:text-white"
          >
            Espace manager
          </Link>
        </nav>
        <div className="border-t border-[#1e222c] pt-4">
          <p className="truncate text-sm font-semibold">{admin.fullName}</p>
          <p className="mb-3 truncate text-xs text-[#9AA1B2]">
            {admin.organizationName ?? "—"}
          </p>
          <LogoutButton className="w-full rounded-lg border border-[#1e222c] bg-[#12151d] px-3 py-2 text-xs text-[#9AA1B2] hover:bg-white/5" />
        </div>
      </aside>
      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#1e222c] bg-[#05060a]/95 px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/admin/exercises" className="flex items-center gap-2">
            <LogoMark size={26} />
            <span className="text-sm font-bold">Admin</span>
          </Link>
          <Link href="/manager" className="text-xs text-[#3E6BFF]">
            Manager
          </Link>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}