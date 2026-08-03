import {
  SKILL_BLOCK_TYPES,
  type SkillBlock,
  type SkillBlockType,
} from "@/lib/skillsContent";

/**
 * Rendu React des blocs de contenu Skills (validés par SkillBlockSchema).
 * Texte pur uniquement — jamais de HTML arbitraire ni d'injection.
 * Blocs invalides ignorés défensivement sans casser la page.
 */

const KNOWN_TYPES = new Set<string>(SKILL_BLOCK_TYPES);

function isKnownType(type: unknown): type is SkillBlockType {
  return typeof type === "string" && KNOWN_TYPES.has(type);
}

function Multiline({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <p className={`whitespace-pre-line ${className ?? ""}`.trim()}>{text}</p>
  );
}

export function SkillBlocks({ blocks }: { blocks: SkillBlock[] }) {
  const safe = Array.isArray(blocks) ? blocks : [];
  const renderable = safe.filter(
    (b) => b && typeof b === "object" && isKnownType((b as SkillBlock).type),
  );

  if (renderable.length === 0) {
    return (
      <p className="text-sm text-white/50">
        Contenu indisponible pour cet article.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {renderable.map((block, i) => (
        <SkillBlockView
          key={`${block.type}-${i}`}
          block={block}
          index={i}
        />
      ))}
    </div>
  );
}

function SkillBlockView({
  block,
  index,
}: {
  block: SkillBlock;
  index: number;
}) {
  try {
    switch (block.type) {
      case "heading": {
        const text = typeof block.text === "string" ? block.text : "";
        if (!text.trim()) return null;
        return block.level === 2 ? (
          <h2 className="text-lg font-bold text-white">{text}</h2>
        ) : (
          <h3 className="text-base font-semibold text-white/90">{text}</h3>
        );
      }
      case "paragraph": {
        const text = typeof block.text === "string" ? block.text : "";
        if (!text.trim()) return null;
        return (
          <Multiline
            text={text}
            className="text-sm leading-relaxed text-white/75"
          />
        );
      }
      case "list": {
        const items = Array.isArray(block.items)
          ? block.items.filter((i) => typeof i === "string" && i.trim())
          : [];
        if (items.length === 0) return null;
        const ListTag = block.ordered ? "ol" : "ul";
        return (
          <ListTag
            className={`${
              block.ordered ? "list-decimal" : "list-disc"
            } space-y-1.5 pl-5 text-sm text-white/75`}
          >
            {items.map((item, i) => (
              <li key={`${index}-li-${i}`} className="whitespace-pre-line">
                {item}
              </li>
            ))}
          </ListTag>
        );
      }
      case "callout": {
        const text = typeof block.text === "string" ? block.text : "";
        if (!text.trim() && !block.title?.trim()) return null;
        const tones: Record<string, string> = {
          info: "border-electric-500/40 bg-electric-500/10",
          warning: "border-flame-500/40 bg-flame-500/10",
          success: "border-emerald-500/40 bg-emerald-500/10",
        };
        return (
          <div
            className={`rounded-2xl border p-4 ${
              tones[block.tone] ?? tones.info
            }`}
          >
            {block.title && (
              <p className="mb-1 text-sm font-semibold text-white">
                {block.title}
              </p>
            )}
            <Multiline
              text={text}
              className="text-sm leading-relaxed text-white/80"
            />
          </div>
        );
      }
      case "example": {
        const lines = Array.isArray(block.lines)
          ? block.lines.filter(
              (l) => l && typeof l.text === "string" && l.text.trim(),
            )
          : [];
        if (lines.length === 0) return null;
        return (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
              {block.label ?? "Exemple"}
            </p>
            <div className="space-y-2">
              {lines.map((line, i) => (
                <p
                  key={`${index}-ex-${i}`}
                  className="text-sm leading-relaxed text-white/80"
                >
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
                  <span className="whitespace-pre-line italic">
                    {line.text}
                  </span>
                </p>
              ))}
            </div>
          </div>
        );
      }
      case "keyIdea": {
        const text = typeof block.text === "string" ? block.text : "";
        if (!text.trim()) return null;
        return (
          <div className="rounded-2xl border border-violet-500/40 bg-violet-500/10 p-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">
              À retenir
            </p>
            <Multiline
              text={text}
              className="text-sm font-medium leading-relaxed text-white"
            />
          </div>
        );
      }
      default:
        return null;
    }
  } catch {
    return (
      <p className="text-xs text-white/40" role="note">
        Bloc indisponible.
      </p>
    );
  }
}
