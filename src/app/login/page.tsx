import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { DemoBanner } from "@/components/DemoBanner";
import { getCurrentUser, isManager } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(isManager(user) ? "/manager" : "/app");
  const demo = isDemoMode();

  return (
    <div className="min-h-screen">
      <DemoBanner show={demo} />
      <main className="mx-auto flex max-w-md flex-col items-center px-5 pb-12 pt-12">
        <Logo size={48} />
        <h1 className="mt-8 text-2xl font-bold">Connexion</h1>
        <p className="mt-1 text-sm text-white/50">Ravi de te revoir.</p>

        <LoginForm />

        <p className="mt-6 text-sm text-white/50">
          Pas encore d&apos;organisation ?{" "}
          <Link href="/register" className="text-violet-300 hover:underline">
            Créer un compte manager
          </Link>
        </p>

        {demo && (
          <div className="card mt-8 w-full p-4 text-sm">
            <p className="mb-2 font-semibold text-violet-300">Comptes de démonstration</p>
            <ul className="space-y-1 text-white/60">
              <li>👔 Manager — <code className="text-white">manager@demo.minduel.app</code></li>
              <li>🎧 Téléprospecteur — <code className="text-white">ruben@demo.minduel.app</code></li>
              <li>🎧 Téléprospectrice — <code className="text-white">lina@demo.minduel.app</code></li>
              <li className="pt-1 text-white/40">Mot de passe pour tous : <code className="text-white">demo1234</code></li>
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
