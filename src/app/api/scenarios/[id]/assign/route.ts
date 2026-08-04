import { z } from "zod";
import { handle, fail } from "@/lib/api";
import { requireManager } from "@/lib/auth";

const schema = z.object({
  teleproIds: z.array(z.string().uuid()),
});

/**
 * LOT O : affectation individuelle dépréciée.
 * Les exercices publiés sont disponibles pour toute l'équipe (catalogue global).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requireManager();
    await params;
    // Valide le corps pour ne pas casser les clients historiques, sans écrire.
    schema.parse(await req.json().catch(() => ({ teleproIds: [] })));
    return fail(
      410,
      "L'affectation individuelle n'est plus utilisée : les exercices publiés sont disponibles pour toute l'équipe.",
    );
  });
}
