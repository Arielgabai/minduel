# OpenAI Realtime (speech-to-speech via WebRTC)

Ce document décrit le flux réel de la simulation d'appel lorsque
`AI_PROVIDER=openai`. En mode `demo`, aucun de ces appels n'est effectué : la
conversation est déterministe et la voix passe par le navigateur.

## Principe

La conversation est **speech-to-speech** : le microphone de l'agent est envoyé à
OpenAI via une piste **WebRTC**, et la voix du prospect (modèle) revient sur une
piste audio distante. Le navigateur ne parle jamais à OpenAI avec la clé longue
durée : il utilise un **secret éphémère** (`ek_…`) émis par notre serveur.

La Web Speech API du navigateur (`SpeechRecognition`) n'est **pas** utilisée
comme transport : elle ne sert plus à envoyer la voix à OpenAI.

## Côté serveur

Route : `POST /api/simulations/[id]/realtime` → `OpenAIRealtimeSessionProvider`
(`src/lib/providers/openai.ts`).

1. Le serveur appelle `POST https://api.openai.com/v1/realtime/client_secrets`
   avec `Authorization: Bearer OPENAI_API_KEY` et un corps :

   ```json
   {
     "session": {
       "type": "realtime",
       "model": "gpt-realtime",
       "instructions": "<persona du prospect>",
       "audio": { "output": { "voice": "marin" } }
     }
   }
   ```

2. La `persona` (`instructions`) est injectée **ici, côté serveur** : elle est
   liée au secret éphémère et n'est donc jamais exposée au navigateur.
3. Le serveur renvoie **uniquement** le champ `value` du secret (`clientSecret`),
   le modèle, la voix et l'expiration. La clé `OPENAI_API_KEY` ne quitte jamais
   le serveur.

Variables d'environnement : `OPENAI_API_KEY` (requise), `OPENAI_REALTIME_MODEL`
(défaut `gpt-realtime`), `OPENAI_REALTIME_VOICE` (défaut `marin`),
`OPENAI_REALTIME_VAD_THRESHOLD` (défaut `0.65`, plage `0`–`1` ; validé côté
serveur et renvoyé au client comme nombre `vadThreshold` pour le
`session.update`).

## Côté navigateur

Hook : `src/app/app/call/[id]/useRealtimeSession.ts`.

1. Récupère le secret éphémère via la route serveur ci-dessus.
2. `navigator.mediaDevices.getUserMedia({ audio: true })` et vérifie la piste.
3. Crée un `RTCPeerConnection`, ajoute la piste micro (`pc.addTrack`).
4. Crée le data channel `oai-events` (événements Realtime en JSON).
5. Crée l'offre SDP, `setLocalDescription`, puis
   `POST https://api.openai.com/v1/realtime/calls` avec
   `Authorization: Bearer <secret éphémère>` et `Content-Type: application/sdp`.
6. Applique la réponse SDP via `setRemoteDescription` (`type: "answer"`).
7. `pc.ontrack` attache `event.streams[0]` à un `<audio autoplay>` persistant.

## Configuration de session (VAD)

À la réception de `session.created`, le client envoie un `session.update` avec un
VAD côté serveur (détection automatique des tours + réponse automatique) :

```json
{
  "type": "session.update",
  "session": {
    "type": "realtime",
    "audio": {
      "input": {
        "transcription": { "model": "whisper-1" },
        "turn_detection": {
          "type": "server_vad",
          "threshold": 0.65,
          "prefix_padding_ms": 300,
          "silence_duration_ms": 700,
          "create_response": true,
          "interrupt_response": true
        }
      }
    }
  }
}
```

La transcription d'entrée est activée pour **archiver** les tours de l'agent.

## Archivage des transcripts

Les transcripts (agent via transcription du micro, prospect via
`response.output_audio_transcript`) sont envoyés à
`POST /api/simulations/[id]/realtime-turn` qui appelle `appendRealtimeTurn`
(`src/lib/simulationService.ts`). Cette route **n'appelle aucun provider** et ne
génère aucune réplique : elle ne fait qu'archiver l'historique.

## Événements Realtime écoutés

- `session.created`, `session.updated`
- `input_audio_buffer.speech_started`, `input_audio_buffer.speech_stopped`
- `conversation.item.input_audio_transcription.completed`
- `response.created`, `response.output_audio_transcript.delta`,
  `response.output_audio_transcript.done`, `response.done`
- `error`

## Diagnostic (déterministe)

- Aucun `speech_started` quand on parle → micro / piste audio / peer connection.
- `speech_started` + `speech_stopped` mais pas de `response.created` →
  configuration VAD / `create_response`.
- `response.created` / `response.done` sans son → `pc.ontrack`, élément audio,
  autoplay ou volume.
- Échec de la route secret ou de l'appel SDP → statut HTTP affiché dans une
  erreur serveur nettoyée (jamais la clé, le secret ou le SDP complet).

Les diagnostics client (permissions micro, états `RTCPeerConnection`, data
channel, derniers événements) sont visibles dans un panneau **dev uniquement**.

## Nettoyage

À la fin ou en quittant l'appel : arrêt des pistes locales, fermeture du data
channel et du `RTCPeerConnection`, détachement de l'audio distant. Les objets
sont conservés dans des refs React pour éviter les connexions multiples après un
rerender.
