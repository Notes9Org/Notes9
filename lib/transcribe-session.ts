import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} from "@aws-sdk/client-transcribe-streaming";

const SAMPLE_RATE = 16000;
const CHUNK_SIZE = 3200; // 100ms at 16kHz mono 16-bit

interface TranscribeSession {
  audioQueue: Uint8Array[];
  audioResolve: (() => void) | null;
  closed: boolean;
  listeners: Set<(data: string) => void>;
}

const sessions = new Map<string, TranscribeSession>();

function emit(session: TranscribeSession, data: object) {
  const json = JSON.stringify(data);
  for (const listener of session.listeners) {
    listener(json);
  }
}

async function* audioStreamGenerator(
  session: TranscribeSession
): AsyncGenerator<{ AudioEvent: { AudioChunk: Uint8Array } }> {
  let buffer = new Uint8Array(0);

  while (true) {
    while (session.audioQueue.length > 0) {
      const chunk = session.audioQueue.shift()!;
      const newBuffer = new Uint8Array(buffer.length + chunk.length);
      newBuffer.set(buffer);
      newBuffer.set(chunk, buffer.length);
      buffer = newBuffer;

      while (buffer.length >= CHUNK_SIZE) {
        yield { AudioEvent: { AudioChunk: buffer.slice(0, CHUNK_SIZE) } };
        buffer = buffer.slice(CHUNK_SIZE);
      }
    }

    if (session.closed) break;

    await new Promise<void>((resolve) => {
      session.audioResolve = resolve;
    });
  }

  if (buffer.length > 0) {
    yield { AudioEvent: { AudioChunk: buffer } };
  }
  yield { AudioEvent: { AudioChunk: new Uint8Array(0) } };
}

export function createSession(): string {
  const id = crypto.randomUUID();
  const session: TranscribeSession = {
    audioQueue: [],
    audioResolve: null,
    closed: false,
    listeners: new Set(),
  };
  sessions.set(id, session);

  const client = new TranscribeStreamingClient({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  const command = new StartStreamTranscriptionCommand({
    LanguageCode: "en-US",
    MediaSampleRateHertz: SAMPLE_RATE,
    MediaEncoding: "pcm",
    AudioStream: audioStreamGenerator(session),
    EnablePartialResultsStabilization: true,
    PartialResultsStability: "high",
  });

  client
    .send(command)
    .then(async (response) => {
      const stream = response.TranscriptResultStream;
      if (!stream) {
        emit(session, { error: "No transcript stream" });
        return;
      }

      for await (const event of stream) {
        if (event.TranscriptEvent?.Transcript?.Results) {
          for (const result of event.TranscriptEvent.Transcript.Results) {
            if (result.Alternatives?.[0]?.Transcript) {
              emit(session, {
                text: result.Alternatives[0].Transcript,
                isFinal: !result.IsPartial,
              });
            }
          }
        }
      }

      emit(session, { done: true });
    })
    .catch((err) => {
      console.error("Transcribe session error:", err);
      emit(session, {
        error: err instanceof Error ? err.message : "Transcription failed",
      });
    })
    .finally(() => {
      sessions.delete(id);
    });

  return id;
}

export function feedAudio(sessionId: string, data: Uint8Array): boolean {
  const session = sessions.get(sessionId);
  if (!session || session.closed) return false;
  session.audioQueue.push(data);
  session.audioResolve?.();
  return true;
}

export function closeSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.closed = true;
  session.audioResolve?.();
  return true;
}

export function addListener(
  sessionId: string,
  cb: (data: string) => void
): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.listeners.add(cb);
  return true;
}

export function removeListener(
  sessionId: string,
  cb: (data: string) => void
): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.listeners.delete(cb);
  }
}

export function sessionExists(sessionId: string): boolean {
  return sessions.has(sessionId);
}
