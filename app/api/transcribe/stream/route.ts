import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} from "@aws-sdk/client-transcribe-streaming";

export const maxDuration = 120;

// AWS best practice: 50-200ms chunks. For 16kHz PCM: 100ms = 16000 * 0.1 * 2 = 3200 bytes
const CHUNK_SIZE = 3200;
const SAMPLE_RATE = 16000;

function hasAwsCredentials(): boolean {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  );
}

async function* createAudioStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<{ AudioEvent: { AudioChunk: Uint8Array } }> {
  const reader = body.getReader();
  let buffer = new Uint8Array(0);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const newBuffer = new Uint8Array(buffer.length + value.length);
      newBuffer.set(buffer);
      newBuffer.set(value, buffer.length);
      buffer = newBuffer;

      while (buffer.length >= CHUNK_SIZE) {
        const chunk = buffer.slice(0, CHUNK_SIZE);
        buffer = buffer.slice(CHUNK_SIZE);
        yield { AudioEvent: { AudioChunk: chunk } };
      }
    }

    if (buffer.length > 0) {
      yield { AudioEvent: { AudioChunk: buffer } };
    }
    // AWS spec: send empty event at end to signal stream completion
    yield { AudioEvent: { AudioChunk: new Uint8Array(0) } };
  } finally {
    reader.releaseLock();
  }
}

export async function POST(req: Request) {
  if (!hasAwsCredentials()) {
    return new Response(
      JSON.stringify({
        error: "Transcription unavailable. AWS credentials not configured.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const body = req.body;
  if (!body) {
    return new Response(
      JSON.stringify({ error: "Request body is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();
  const region = process.env.AWS_REGION || "us-east-1";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const client = new TranscribeStreamingClient({
          region,
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          },
        });

        const audioStream = createAudioStream(body);

        const command = new StartStreamTranscriptionCommand({
          LanguageCode: "en-US",
          MediaSampleRateHertz: SAMPLE_RATE,
          MediaEncoding: "pcm",
          AudioStream: audioStream,
          EnablePartialResultsStabilization: true,
          PartialResultsStability: "high",
        });

        const response = await client.send(command);
        const transcriptStream = response.TranscriptResultStream;

        if (!transcriptStream) {
          controller.close();
          return;
        }

        for await (const event of transcriptStream) {
          if (event.TranscriptEvent?.Transcript?.Results) {
            for (const result of event.TranscriptEvent.Transcript.Results) {
              if (result.Alternatives?.[0]?.Transcript) {
                const text = result.Alternatives[0].Transcript;
                const isFinal = !result.IsPartial;
                const line =
                  JSON.stringify({ text, isFinal }) + "\n";
                controller.enqueue(encoder.encode(line));
              }
            }
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Transcription failed";
        console.error("Transcribe stream error:", error);
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ error: message, isFinal: true }) + "\n"
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
    },
  });
}
