import "server-only";

import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/httpError";

/**
 * Client Prisma minimal pour résoudre le catalogue (PrismaClient ou transaction).
 * Ne sélectionne jamais de champs sensibles (prompts, secrets, utilisateurs).
 */
export type PlatformCatalogDb = {
  organization: {
    findMany: (args: {
      where: { isPlatformCatalog: boolean };
      select: { id: true };
      take: number;
    }) => Promise<Array<{ id: string }>>;
  };
};

/**
 * Résout l'identifiant de l'unique organisation propriétaire technique du
 * catalogue pédagogique global.
 *
 * - exactement une → retourne son id (usage serveur uniquement, jamais exposé HTTP)
 * - aucune → erreur métier contrôlée (pas de fallback vers l'org de l'utilisateur)
 * - plusieurs → état incohérent contrôlé (la contrainte DB devrait l'empêcher)
 *
 * Ne code aucun slug / UUID en dur. Ne choisit jamais une organisation arbitraire.
 */
export async function resolvePlatformCatalogOrganizationId(
  db: PlatformCatalogDb = prisma,
): Promise<string> {
  const rows = await db.organization.findMany({
    where: { isPlatformCatalog: true },
    select: { id: true },
    take: 2,
  });

  if (rows.length === 0) {
    throw new HttpError(
      503,
      "Catalogue pédagogique plateforme non configuré.",
    );
  }

  if (rows.length > 1) {
    throw new HttpError(
      503,
      "Configuration catalogue plateforme incohérente.",
    );
  }

  return rows[0]!.id;
}
