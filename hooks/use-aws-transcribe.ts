"use client";

import { useCallback, useRef, useState } from "react";

export interface UseAwsTranscribeOptions {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (error: string) => void;
}

function float32ToInt16(float32Array: Float32Array): ArrayBuffer {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16Array.buffer;
}

const SEND_INTERVAL_MS = 100; // Send audio every 100ms for low latency

export function useAwsTranscribe(options: UseAwsTranscribeOptions = {}) {
  const { onInterim, onFinal, onError } = options;
  const [isListening, setIsListening] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Uint8Array[]>([]);
  const stoppedRef = useRef(false);

  const cleanupAudio = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (processorRef.current && sourceRef.current && audioContextRef.current) {
      try {
        sourceRef.current.disconnect();
        processorRef.current.disconnect();
        audioContextRef.current.close();
      } catch {
        // Ignore
      }
      processorRef.current = null;
      sourceRef.current = null;
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    chunksRef.current = [];
  }, []);

  const sendAudioChunks = useCallback(() => {
    const chunks = chunksRef.current;
    if (chunks.length === 0 || !sessionIdRef.current) return;
    chunksRef.current = [];

    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const buffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }

    fetch("/api/transcribe/audio", {
      method: "POST",
      body: buffer,
      headers: {
        "Content-Type": "application/octet-stream",
        "x-session-id": sessionIdRef.current,
      },
    }).catch(() => {});
  }, []);

  const stop = useCallback(() => {
    stoppedRef.current = true;

    // Send any remaining audio
    sendAudioChunks();

    cleanupAudio();

    // Signal the server to close the Transcribe stream
    if (sessionIdRef.current) {
      fetch("/api/transcribe/stop", {
        method: "POST",
        headers: { "x-session-id": sessionIdRef.current },
      }).catch(() => {});
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    sessionIdRef.current = null;
    setIsListening(false);
  }, [cleanupAudio, sendAudioChunks]);

  const start = useCallback(async () => {
    try {
      stoppedRef.current = false;

      // 1. Start server session
      const startRes = await fetch("/api/transcribe/start", {
        method: "POST",
      });
      if (!startRes.ok) {
        const err = await startRes.json();
        onError?.(err.error || "Failed to start transcription session");
        return;
      }
      const { sessionId } = await startRes.json();
      sessionIdRef.current = sessionId;

      // 2. Open SSE for results
      const eventSource = new EventSource(
        `/api/transcribe/events?id=${sessionId}`
      );
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as {
            text?: string;
            isFinal?: boolean;
            error?: string;
            done?: boolean;
          };
          if (parsed.error) {
            onError?.(parsed.error);
            return;
          }
          if (parsed.done) {
            eventSource.close();
            return;
          }
          const text = parsed.text ?? "";
          if (parsed.isFinal) {
            onFinal?.(text);
          } else {
            onInterim?.(text);
          }
        } catch {
          // Ignore
        }
      };

      eventSource.onerror = () => {
        if (!stoppedRef.current) {
          onError?.("Lost connection to transcription service");
          stop();
        }
      };

      // 3. Start mic and stream audio
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      streamRef.current = mediaStream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(mediaStream);
      sourceRef.current = source;

      const processor = audioContext.createScriptProcessor(1024, 1, 1);
      processorRef.current = processor;

      chunksRef.current = [];

      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        if (stoppedRef.current) return;
        const float32 = e.inputBuffer.getChannelData(0);
        const pcm = float32ToInt16(float32);
        chunksRef.current.push(new Uint8Array(pcm));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      // Send audio every 100ms for real-time streaming
      intervalRef.current = setInterval(sendAudioChunks, SEND_INTERVAL_MS);

      setIsListening(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start transcription";
      onError?.(message);
      stop();
    }
  }, [onInterim, onFinal, onError, stop, sendAudioChunks]);

  return { start, stop, isListening };
}
