import "server-only";
import { serverConfig } from "../config";
import { log, safeErrorMessage } from "../log";
import type {
  RealtimeSessionProvider,
  RealtimeClientSecret,
} from "./types";

/**
 * Session Realtime OpenAI réelle (WebRTC).
 *
 * Le serveur crée un secret client ÉPHÉMÈRE via l'endpoint GA
 * `POST /v1/realtime/client_secrets`. La clé API longue durée ne quitte JAMAIS
 * le serveur et n'est jamais envoyée au navigateur ; seul le secret éphémère
 * (`value`, préfixe `ek_…`, durée de vie courte) est transmis au client, qui
 * l'utilise ensuite pour négocier le SDP avec `POST /v1/realtime/calls`.
 *
 * La persona du prospect (`instructions`) est injectée ICI, côté serveur, dans
 * la configuration de session : elle est liée au secret éphémère et n'a donc pas
 * besoin d'être exposée au navigateur.
 *
 * Réf : https://developers.openai.com/api/docs/guides/realtime-webrtc
 */
export class OpenAIRealtimeSessionProvider implements RealtimeSessionProvider {
  async createEphemeralSession(input: {
    instructions: string;
  }): Promise<RealtimeClientSecret> {
    const model = serverConfig.models.realtime;
    const voice = serverConfig.models.realtimeVoice;

    const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverConfig.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model,
          instructions: input.instructions,
          audio: {
            output: { voice },
          },
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // On journalise le statut + un détail tronqué (jamais la clé), et on
      // remonte une erreur générique : le message OpenAI peut contenir des infos
      // de configuration à ne pas exposer telles quelles au client.
      log.error("realtime.client_secret_failed", {
        status: res.status,
        detail: safeErrorMessage(detail),
      });
      throw new Error(`OpenAI Realtime client_secrets error ${res.status}`);
    }

    // Réponse GA : { value: "ek_…", expires_at: 1730000000, session: {...} }.
    // On reste tolérant à l'ancienne forme { client_secret: { value, expires_at } }.
    const data = (await res.json()) as {
      value?: string;
      expires_at?: number;
      client_secret?: { value?: string; expires_at?: number };
    };

    const value = data.value ?? data.client_secret?.value;
    const expiresAtUnix = data.expires_at ?? data.client_secret?.expires_at;

    if (!value) {
      log.error("realtime.client_secret_missing_value", { status: res.status });
      throw new Error("OpenAI Realtime : secret éphémère absent de la réponse.");
    }

    return {
      demo: false,
      model,
      voice,
      clientSecret: value,
      expiresAt: expiresAtUnix
        ? new Date(expiresAtUnix * 1000).toISOString()
        : undefined,
      instructions: input.instructions,
    };
  }
}
