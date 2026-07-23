import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { LinkButton, Card } from "@/components/ui";
import { Waveform } from "@/components/Waveform";
import { DemoBanner } from "@/components/DemoBanner";
import { getCurrentUser, isManager } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) {
    redirect(isManager(user) ? "/manager" : "/app");
  }

  const features = [
    {
      icon: "🎙️",
      title: "Simulations réalistes",
      desc: "Entraîne-toi sur des scénarios construits à partir des vrais appels de ton entreprise.",
    },
    {
      icon: "⚡",
      title: "Feedback instantané",
      desc: "Reçois des retours clairs et actionnables, notés sur une grille transparente.",
    },
    {
      icon: "📈",
      title: "Progression visible",
      desc: "Suis tes performances par compétence et deviens meilleur chaque jour.",
    },
  ];

  return (
    <div className="min-h-screen">
      <DemoBanner show={isDemoMode()} />
      <main className="mx-auto flex max-w-md flex-col items-center px-5 pb-12 pt-10 sm:max-w-lg">
        <Logo size={52} />

        <div className="relative mt-8 w-full">
          <Waveform bars={48} className="absolute inset-x-0 -top-2 h-16 opacity-40" />
        </div>

        <h1 className="mt-6 text-center text-4xl font-extrabold leading-tight">
          Deviens redoutable
          <br />
          <span className="text-gradient">dans chaque conversation.</span>
        </h1>
        <p className="mt-4 max-w-md text-center text-sm leading-relaxed text-white/60">
          Le simulateur d&apos;appels où chaque conversation est une partie de{" "}
          <span className="text-violet-300">stratégie</span>, chaque décision a
          des <span className="text-flame-400">conséquences</span>, et où l&apos;on
          devient meilleur non pas en regardant des vidéos… mais{" "}
          <span className="text-electric-400">en jouant</span>.
        </p>

        <div className="mt-8 flex w-full flex-col gap-3">
          {features.map((f) => (
            <Card key={f.title} hover className="flex items-start gap-4 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-xl">
                {f.icon}
              </div>
              <div>
                <p className="font-semibold text-white">{f.title}</p>
                <p className="mt-0.5 text-sm text-white/55">{f.desc}</p>
              </div>
            </Card>
          ))}
        </div>

        <div className="mt-8 flex w-full flex-col gap-3">
          <LinkButton href="/login" variant="primary" className="w-full py-4 text-base">
            Commencer →
          </LinkButton>
          <LinkButton href="/register" variant="ghost" className="w-full">
            Créer une organisation
          </LinkButton>
        </div>

        <p className="mt-6 text-center text-xs text-white/40">
          Outil d&apos;entraînement et d&apos;aide au coaching — pas de
          surveillance cachée, pas de décision RH automatique.
        </p>
      </main>
    </div>
  );
}
