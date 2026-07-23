import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { DemoBanner } from "@/components/DemoBanner";
import { getCurrentUser, isManager } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { RegisterForm } from "./RegisterForm";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect(isManager(user) ? "/manager" : "/app");

  return (
    <div className="min-h-screen">
      <DemoBanner show={isDemoMode()} />
      <main className="mx-auto flex max-w-md flex-col items-center px-5 pb-12 pt-12">
        <Logo size={48} />
        <h1 className="mt-8 text-center text-2xl font-bold">
          Crée ton organisation
        </h1>
        <p className="mt-1 text-center text-sm text-white/50">
          Tu deviens manager et tu pourras inviter ton équipe.
        </p>

        <RegisterForm />

        <p className="mt-6 text-sm text-white/50">
          Déjà un compte ?{" "}
          <Link href="/login" className="text-violet-300 hover:underline">
            Se connecter
          </Link>
        </p>
      </main>
    </div>
  );
}
