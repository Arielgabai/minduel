import "server-only";
import { serverConfig } from "../config";
import type {
  RealtimeSessionProvider,
  RealtimeClientSecret,
} from "./types";

/**
 * Session Realtime OpenAI réelle.
 * Le serveur crée un secret client ÉPHÉMÈRE ; la clé API longue durée ne quitte
 * jamais le serveur et n'est jamais envoyée au navigateur.
 * Réf : https://developers.openai.com/api/docs/guides/realtime-webrtc
 */
export class OpenAIRealtimeSessionProvider implements RealtimeSessionProvider {
  async createEphemeralSession(input: {
    instructions: string;
  }): Promise<RealtimeClientSecret> {
    const res = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverConfig.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: serverConfig.models.realtime,
        voice: serverConfig.models.realtimeVoice,
        instructions: input.instructions,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenAI Realtime session error ${res.status}: ${detail}`);
    }

    const data = (await res.json()) as {
      client_secret?: { value: string; expires_at: number };
    };

    return {
      demo: false,
      model: serverConfig.models.realtime,
      voice: serverConfig.models.realtimeVoice,
      clientSecret: data.client_secret?.value,
      expiresAt: data.client_secret?.expires_at
        ? new Date(data.client_secret.expires_at * 1000).toISOString()
        : undefined,
      instructions: input.instructions,
    };
  }
}
