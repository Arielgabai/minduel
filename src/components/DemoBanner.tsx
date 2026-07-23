/**
 * Bandeau discret indiquant que l'IA réelle n'est pas configurée (mode démo).
 * La voix entendue en simulation est générée / simulée : mention obligatoire.
 */
export function DemoBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="demo-banner px-4 py-2 text-center text-xs text-white/70">
      <span className="font-semibold text-violet-300">Mode démo</span> — aucune
      clé OpenAI configurée. Les voix et analyses sont générées localement de
      façon déterministe. Ajoutez <code className="text-flame-400">OPENAI_API_KEY</code>{" "}
      pour activer la voix IA réelle (WebRTC).
    </div>
  );
}
