import { requireTelepro } from "@/lib/auth";
import { getRealCallDetailForTelepro } from "@/lib/realCallService";
import { RealCallDetailClient } from "./RealCallDetailClient";
import { HttpError } from "@/lib/httpError";
import { notFound } from "next/navigation";

export default async function RealCallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const telepro = await requireTelepro();
  const { id } = await params;
  try {
    const detail = await getRealCallDetailForTelepro(
      { id: telepro.id, organizationId: telepro.organizationId, role: telepro.role },
      id,
    );
    return <RealCallDetailClient initial={detail} />;
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) notFound();
    throw err;
  }
}
