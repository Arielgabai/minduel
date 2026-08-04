/**
 * Configuration contrôlée de l'organisation propriétaire technique du catalogue
 * pédagogique global (LOT P2).
 *
 * Usage :
 *   npm run db:configure-platform-catalog -- --org-slug=<catalog-org-slug>
 *   npm run db:configure-platform-catalog -- --org-slug=<catalog-org-slug> --apply
 *
 * Mode par défaut : DRY-RUN (aucune écriture).
 * En production, --apply exige ALLOW_PLATFORM_CATALOG_CONFIG=true.
 * Ne déplace, copie ni supprime aucun contenu. Idempotent.
 * Retirer ou remettre ALLOW_PLATFORM_CATALOG_CONFIG=false immédiatement après usage.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const AUDIT_ACTION = "CONFIGURE_PLATFORM_CATALOG";

export type ConfigureMode = "DRY-RUN" | "APPLY";

export type StatusCounts = Record<string, number>;

export type ConfigureReport = {
  mode: ConfigureMode;
  orgSlug: string;
  organizationFound: boolean;
  organizationActive: boolean | null;
  isPlatformCatalog: boolean | null;
  themeCount: number;
  stageCount: number;
  scenariosByStatus: StatusCounts;
  promptBundlesByStatus: StatusCounts;
  skillCategoriesByStatus: StatusCounts;
  skillSectionsByStatus: StatusCounts;
  skillArticlesByStatus: StatusCounts;
  otherCatalogOrgSlug: string | null;
  otherOrgsPublishedContent: Array<{
    slug: string;
    themes: number;
    stages: number;
    scenariosPublished: number;
    skillArticlesPublished: number;
  }>;
  applied: boolean;
  alreadyConfigured: boolean;
  errors: string[];
};

export type ConfigureOptions = {
  orgSlug: string;
  apply?: boolean;
};

/** Client Prisma minimal injectable (tests / ops). */
export type ConfigurePrisma = {
  organization: {
    findUnique: (args: {
      where: { slug: string };
      select?: Record<string, boolean>;
    }) => Promise<{
      id: string;
      slug: string;
      isActive: boolean;
      isPlatformCatalog: boolean;
    } | null>;
    findMany: (args: {
      where?: Record<string, unknown>;
      select?: Record<string, boolean>;
    }) => Promise<
      Array<{
        id: string;
        slug: string;
        isActive?: boolean;
        isPlatformCatalog?: boolean;
      }>
    >;
    update: (args: {
      where: { id: string };
      data: { isPlatformCatalog: boolean; updatedAt: string };
    }) => Promise<unknown>;
  };
  missionTheme: {
    count: (args: { where: Record<string, unknown> }) => Promise<number>;
    groupBy?: (args: unknown) => Promise<Array<{ status: string; _count: { _all: number } }>>;
  };
  missionStage: {
    count: (args: { where: Record<string, unknown> }) => Promise<number>;
  };
  scenario: {
    groupBy: (args: {
      by: ["status"];
      where: Record<string, unknown>;
      _count: { _all: true };
    }) => Promise<Array<{ status: string; _count: { _all: number } }>>;
    count: (args: { where: Record<string, unknown> }) => Promise<number>;
  };
  promptBundle: {
    groupBy: (args: {
      by: ["status"];
      where: Record<string, unknown>;
      _count: { _all: true };
    }) => Promise<Array<{ status: string; _count: { _all: number } }>>;
  };
  skillCategory: {
    groupBy: (args: {
      by: ["status"];
      where: Record<string, unknown>;
      _count: { _all: true };
    }) => Promise<Array<{ status: string; _count: { _all: number } }>>;
  };
  skillSection: {
    groupBy: (args: {
      by: ["status"];
      where: Record<string, unknown>;
      _count: { _all: true };
    }) => Promise<Array<{ status: string; _count: { _all: number } }>>;
  };
  skillArticle: {
    groupBy: (args: {
      by: ["status"];
      where: Record<string, unknown>;
      _count: { _all: true };
    }) => Promise<Array<{ status: string; _count: { _all: number } }>>;
    count: (args: { where: Record<string, unknown> }) => Promise<number>;
  };
  auditEvent: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
  $transaction: <T>(fn: (tx: ConfigurePrisma) => Promise<T>) => Promise<T>;
};

function isTruthyEnv(value: string | undefined): boolean {
  return ["true", "1", "yes"].includes((value ?? "").toLowerCase());
}

export function resolveOrgSlug(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const arg = argv.find((a) => a.startsWith("--org-slug="));
  const fromArg = arg ? arg.slice("--org-slug=".length).trim() : "";
  const fromEnv = (env.PLATFORM_CATALOG_ORG_SLUG ?? "").trim();
  const slug = fromArg || fromEnv;
  if (!slug) {
    throw new Error(
      "Slug requis : --org-slug=<catalog-org-slug> ou PLATFORM_CATALOG_ORG_SLUG.",
    );
  }
  return slug;
}

export function resolveApplyFlag(argv: string[] = process.argv): boolean {
  return argv.includes("--apply");
}

/**
 * En production, --apply exige ALLOW_PLATFORM_CATALOG_CONFIG=true.
 * Hors production, --apply est autorisé (dry-run reste le défaut).
 */
export function assertConfigureAllowed(
  apply: boolean,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!apply) return;
  const isProd = env.NODE_ENV === "production";
  if (isProd && !isTruthyEnv(env.ALLOW_PLATFORM_CATALOG_CONFIG)) {
    throw new Error(
      "Configuration catalogue refusée en production.\n" +
        "Définissez ALLOW_PLATFORM_CATALOG_CONFIG=true uniquement pour une opération ops contrôlée, puis retirez-le.",
    );
  }
}

function countsFromGroup(
  rows: Array<{ status: string; _count: { _all: number } }>,
): StatusCounts {
  const out: StatusCounts = {};
  for (const row of rows) {
    out[row.status] = row._count._all;
  }
  return out;
}

async function countByStatus(
  groupBy: ConfigurePrisma["scenario"]["groupBy"],
  organizationId: string,
): Promise<StatusCounts> {
  const rows = await groupBy({
    by: ["status"],
    where: { organizationId },
    _count: { _all: true },
  });
  return countsFromGroup(rows);
}

async function buildInventory(
  db: ConfigurePrisma,
  organizationId: string,
): Promise<{
  themeCount: number;
  stageCount: number;
  scenariosByStatus: StatusCounts;
  promptBundlesByStatus: StatusCounts;
  skillCategoriesByStatus: StatusCounts;
  skillSectionsByStatus: StatusCounts;
  skillArticlesByStatus: StatusCounts;
}> {
  const [
    themeCount,
    stageCount,
    scenariosByStatus,
    promptBundlesByStatus,
    skillCategoriesByStatus,
    skillSectionsByStatus,
    skillArticlesByStatus,
  ] = await Promise.all([
    db.missionTheme.count({ where: { organizationId } }),
    db.missionStage.count({ where: { organizationId } }),
    countByStatus(db.scenario.groupBy, organizationId),
    countByStatus(db.promptBundle.groupBy, organizationId),
    countByStatus(db.skillCategory.groupBy, organizationId),
    countByStatus(db.skillSection.groupBy, organizationId),
    countByStatus(db.skillArticle.groupBy, organizationId),
  ]);
  return {
    themeCount,
    stageCount,
    scenariosByStatus,
    promptBundlesByStatus,
    skillCategoriesByStatus,
    skillSectionsByStatus,
    skillArticlesByStatus,
  };
}

async function detectOtherPublishedContent(
  db: ConfigurePrisma,
  excludeOrganizationId: string | null,
): Promise<ConfigureReport["otherOrgsPublishedContent"]> {
  const orgs = await db.organization.findMany({
    where: excludeOrganizationId
      ? { id: { not: excludeOrganizationId } }
      : {},
    select: { id: true, slug: true },
  });
  const out: ConfigureReport["otherOrgsPublishedContent"] = [];
  for (const org of orgs) {
    if (excludeOrganizationId && org.id === excludeOrganizationId) continue;
    const [themes, stages, scenariosPublished, skillArticlesPublished] =
      await Promise.all([
        db.missionTheme.count({
          where: { organizationId: org.id, status: "PUBLISHED" },
        }),
        db.missionStage.count({
          where: { organizationId: org.id, status: "PUBLISHED" },
        }),
        db.scenario.count({
          where: { organizationId: org.id, status: "PUBLISHED" },
        }),
        db.skillArticle.count({
          where: { organizationId: org.id, status: "PUBLISHED" },
        }),
      ]);
    if (
      themes > 0 ||
      stages > 0 ||
      scenariosPublished > 0 ||
      skillArticlesPublished > 0
    ) {
      out.push({
        slug: org.slug,
        themes,
        stages,
        scenariosPublished,
        skillArticlesPublished,
      });
    }
  }
  return out;
}

function emptyReport(mode: ConfigureMode, orgSlug: string): ConfigureReport {
  return {
    mode,
    orgSlug,
    organizationFound: false,
    organizationActive: null,
    isPlatformCatalog: null,
    themeCount: 0,
    stageCount: 0,
    scenariosByStatus: {},
    promptBundlesByStatus: {},
    skillCategoriesByStatus: {},
    skillSectionsByStatus: {},
    skillArticlesByStatus: {},
    otherCatalogOrgSlug: null,
    otherOrgsPublishedContent: [],
    applied: false,
    alreadyConfigured: false,
    errors: [],
  };
}

/**
 * Dry-run ou apply transactionnel. N'affiche / ne retourne jamais prompts,
 * artifacts, hashes, secrets, URL de base, utilisateurs ni transcriptions.
 */
export async function configurePlatformCatalog(
  options: ConfigureOptions,
  db: ConfigurePrisma = prisma as unknown as ConfigurePrisma,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ConfigureReport> {
  const apply = options.apply === true;
  assertConfigureAllowed(apply, env);
  const mode: ConfigureMode = apply ? "APPLY" : "DRY-RUN";
  const report = emptyReport(mode, options.orgSlug);

  const org = await db.organization.findUnique({
    where: { slug: options.orgSlug },
    select: {
      id: true,
      slug: true,
      isActive: true,
      isPlatformCatalog: true,
    },
  });

  if (!org) {
    report.errors.push("Organisation introuvable pour le slug fourni.");
    report.otherOrgsPublishedContent = await detectOtherPublishedContent(
      db,
      null,
    );
    return report;
  }

  report.organizationFound = true;
  report.organizationActive = org.isActive;
  report.isPlatformCatalog = org.isPlatformCatalog;

  const inventory = await buildInventory(db, org.id);
  Object.assign(report, inventory);

  const otherCatalog = await db.organization.findMany({
    where: {
      isPlatformCatalog: true,
      id: { not: org.id },
    },
    select: { id: true, slug: true },
  });
  if (otherCatalog.length > 0) {
    report.otherCatalogOrgSlug = otherCatalog[0]!.slug;
  }

  report.otherOrgsPublishedContent = await detectOtherPublishedContent(
    db,
    org.id,
  );

  if (!org.isActive) {
    report.errors.push("Organisation inactive : configuration refusée.");
    return report;
  }

  if (otherCatalog.length > 0) {
    report.errors.push(
      "Une autre organisation est déjà marquée catalogue plateforme.",
    );
    return report;
  }

  if (org.isPlatformCatalog) {
    report.alreadyConfigured = true;
    return report;
  }

  if (!apply) {
    return report;
  }

  const now = new Date().toISOString();
  await db.$transaction(async (tx) => {
    const again = await tx.organization.findMany({
      where: { isPlatformCatalog: true },
      select: { id: true, slug: true },
    });
    if (again.some((r) => r.id !== org.id)) {
      throw new Error(
        "Une autre organisation est déjà marquée catalogue plateforme.",
      );
    }
    const target = await tx.organization.findUnique({
      where: { slug: options.orgSlug },
      select: {
        id: true,
        slug: true,
        isActive: true,
        isPlatformCatalog: true,
      },
    });
    if (!target || !target.isActive) {
      throw new Error("Organisation introuvable ou inactive.");
    }
    if (!target.isPlatformCatalog) {
      await tx.organization.update({
        where: { id: target.id },
        data: { isPlatformCatalog: true, updatedAt: now },
      });
    }
    await tx.auditEvent.create({
      data: {
        organizationId: target.id,
        actorId: null,
        action: AUDIT_ACTION,
        targetType: "Organization",
        targetId: target.id,
        metadata: JSON.stringify({
          slug: target.slug,
          alreadyConfigured: target.isPlatformCatalog,
        }),
        createdAt: now,
      },
    });
  });

  report.applied = true;
  report.isPlatformCatalog = true;
  report.alreadyConfigured = false;
  return report;
}

function printReport(report: ConfigureReport): void {
  console.log("--- Configure platform catalog ---");
  console.log(`mode: ${report.mode}`);
  console.log(`orgSlug: ${report.orgSlug}`);
  console.log(`organizationFound: ${report.organizationFound}`);
  console.log(`organizationActive: ${report.organizationActive}`);
  console.log(`isPlatformCatalog: ${report.isPlatformCatalog}`);
  console.log(`themeCount: ${report.themeCount}`);
  console.log(`stageCount: ${report.stageCount}`);
  console.log(
    `scenariosByStatus: ${JSON.stringify(report.scenariosByStatus)}`,
  );
  console.log(
    `promptBundlesByStatus: ${JSON.stringify(report.promptBundlesByStatus)}`,
  );
  console.log(
    `skillCategoriesByStatus: ${JSON.stringify(report.skillCategoriesByStatus)}`,
  );
  console.log(
    `skillSectionsByStatus: ${JSON.stringify(report.skillSectionsByStatus)}`,
  );
  console.log(
    `skillArticlesByStatus: ${JSON.stringify(report.skillArticlesByStatus)}`,
  );
  console.log(`otherCatalogOrgSlug: ${report.otherCatalogOrgSlug}`);
  console.log(
    `otherOrgsPublishedContent: ${JSON.stringify(report.otherOrgsPublishedContent)}`,
  );
  console.log(`alreadyConfigured: ${report.alreadyConfigured}`);
  console.log(`applied: ${report.applied}`);
  if (report.errors.length > 0) {
    console.log(`errors: ${report.errors.join(" | ")}`);
  }
}

async function main() {
  const orgSlug = resolveOrgSlug();
  const apply = resolveApplyFlag();
  const report = await configurePlatformCatalog({ orgSlug, apply });
  printReport(report);
  if (report.errors.length > 0) {
    process.exitCode = 1;
  }
}

const isDirectRun =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  /configurePlatformCatalog\.(ts|js|mjs|cjs)$/.test(
    process.argv[1].replace(/\\/g, "/"),
  );

if (isDirectRun) {
  main()
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
