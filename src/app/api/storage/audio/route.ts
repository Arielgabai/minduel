import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAudioStorage, verifyStorageSignature } from "@/lib/providers";

/**
 * Sert un fichier audio privé UNIQUEMENT via une URL signée valide et à un
 * utilisateur authentifié. Les fichiers ne sont jamais exposés publiquement.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  const expires = url.searchParams.get("expires") ?? "";
  const sig = url.searchParams.get("sig") ?? "";

  if (!verifyStorageSignature(key, expires, sig)) {
    return NextResponse.json({ error: "Lien invalide ou expiré." }, { status: 403 });
  }

  // Isolation : la clé commence par l'organizationId de l'utilisateur.
  if (!user.organizationId || !key.startsWith(`${user.organizationId}/`)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const data = await getAudioStorage().get(key);
  if (!data) {
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "private, no-store",
    },
  });
}
