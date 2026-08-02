import type { SkillBlock } from "@/lib/skillsContent";

/**
 * Rendu React des blocs de contenu Skills (validés par SkillBlockSchema).
 * Texte pur uniquement — jamais de HTML arbitraire ni d'injection.
 */
export function SkillBlocks({ blocks }: { blocks: SkillBlock[] }) {
  if (blocks.length === 0) {
    return (
      <p className="text-sm text-white/50">
        Contenu indisponible pour cet article.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      {blocks.map((block, i) => (
        <SkillBlockView key={i} block={block} />
      ))}
    </div>
  );
}

function SkillBlockView({ block }: { block: SkillBlock }) {
  switch (block.type) {
    case "heading":
      return block.level === 2 ? (
        <h2 className="text-lg font-bold text-white">{block.text}</h2>
      ) : (
        <h3 className="text-base font-semibold text-white/90">{block.text}</h3>
      );
    case "paragraph":
      return (
        <p className="text-sm leading-relaxed text-white/75">{block.text}</p>
      );
    case "list":
      return block.ordered ? (
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-white/75">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      ) : (
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-white/75">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case "callout": {
      const tones: Record<string, string> = {
        info: "border-electric-500/40 bg-electric-500/10",
        warning: "border-flame-500/40 bg-flame-500/10",
        success: "border-emerald-500/40 bg-emerald-500/10",
      };
      return (
        <div
          className={`rounded-2xl border p-4 ${tones[block.tone] ?? tones.info}`}
        >
          {block.title && (
            <p className="mb-1 text-sm font-semibold text-white">
              {block.title}
            </p>
          )}
          <p className="text-sm leading-relaxed text-white/80">{block.text}</p>
        </div>
      );
    }
    case "example":
      return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
            {block.label ?? "Exemple"}
          </p>
          <div className="space-y-2">
            {block.lines.map((line, i) => (
              <p key={i} className="text-sm leading-relaxed text-white/80">
                {line.speaker !== "NONE" && (
                  <span
                    className={
                      line.speaker === "TELEPRO"
                        ? "mr-2 font-semibold text-electric-400"
                        : "mr-2 font-semibold text-flame-400"
                    }
                  >
                    {line.speaker === "TELEPRO" ? "Toi :" : "Prospect :"}
                  </span>
                )}
                <span className="italic">{line.text}</span>
              </p>
            ))}
          </div>
        </div>
      );
    case "keyIdea":
      return (
        <div className="rounded-2xl border border-violet-500/40 bg-violet-500/10 p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">
            À retenir
          </p>
          <p className="text-sm font-medium leading-relaxed text-white">
            {block.text}
          </p>
        </div>
      );
  }
}
