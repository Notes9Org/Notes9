"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import {
  decodeEventStreamMessage,
  encodeAudioEvent,
} from "@/lib/aws-event-stream";

export interface UseAwsTranscribeOptions {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (error: string) => void;
  /**
   * Auto-stop the mic after this many milliseconds with no speech (no transcript
   * results). Defaults to 5000ms. Pass 0 to disable the idle auto-stop.
   */
  silenceTimeoutMs?: number;
}

const SEND_INTERVAL_MS = 100; // Send audio every ~100ms for low latency
const DEFAULT_SILENCE_TIMEOUT_MS = 5000; // Auto-deactivate after 5s of silence

function float32ToInt16(float32Array: Float32Array): ArrayBuffer {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16Array.buffer;
}

export function useAwsTranscribe(options: UseAwsTranscribeOptions = {}) {
  const { onInterim, onFinal, onError, silenceTimeoutMs } = options;
  const [isListening, setIsListening] = useState(false);

  const supabase = useMemo(() => createClient(), []);
  const supabaseTokenRef = useRef<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Uint8Array[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const stoppedRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      supabaseTokenRef.current = session?.access_token ?? null;
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      supabaseTokenRef.current = session?.access_token ?? null;
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  const cleanupAudio = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (processorRef.current && sourceRef.current && audioContextRef.current) {
      try {
        sourceRef.current.disconnect();
        processorRef.current.disconnect();
        audioContextRef.current.close();
      } catch (err) {
        console.warn("[aws-transcribe] audio cleanup failed:", err);
      }
      processorRef.current = null;
      sourceRef.current = null;
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    chunksRef.current = [];
  }, []);

  const cleanupConnection = useCallback(() => {
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close();
        }
      } catch (err) {
        console.warn("[aws-transcribe] websocket close failed:", err);
      }
      wsRef.current = null;
    }
  }, []);

  const sendAudioChunks = useCallback(() => {
    const ws = wsRef.current;
    const chunks = chunksRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || chunks.length === 0) return;

    chunksRef.current = [];

    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const buffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }

    try {
      const frame = encodeAudioEvent(buffer);
      ws.send(frame);
    } catch (err) {
      // onerror/onclose will handle cleanup; log for visibility.
      console.warn("[aws-transcribe] audio frame send failed:", err);
    }
  }, []);

  const stop = useCallback(() => {
    stoppedRef.current = true;

    // Send any remaining audio, then a final empty AudioEvent
    sendAudioChunks();
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        const emptyFrame = encodeAudioEvent(new Uint8Array(0));
        wsRef.current.send(emptyFrame);
      } catch (err) {
        console.warn("[aws-transcribe] final frame send failed:", err);
      }
      try {
        wsRef.current.close();
      } catch (err) {
        console.warn("[aws-transcribe] websocket close on stop failed:", err);
      }
    }

    cleanupAudio();
    cleanupConnection();
    setIsListening(false);
  }, [cleanupAudio, cleanupConnection, sendAudioChunks]);

  // Restart the idle countdown. Called when recording opens and on every speech
  // result; if no result arrives for `silenceTimeoutMs` the mic auto-stops.
  const bumpSilenceTimer = useCallback(() => {
    const timeout = silenceTimeoutMs ?? DEFAULT_SILENCE_TIMEOUT_MS;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (timeout <= 0) return; // 0 disables the idle auto-stop
    silenceTimerRef.current = setTimeout(() => {
      stop();
    }, timeout);
  }, [silenceTimeoutMs, stop]);

  const start = useCallback(async () => {
    try {
      stoppedRef.current = false;

      const token = supabaseTokenRef.current;
      if (!token) {
        onError?.("You must be signed in to use transcription.");
        return;
      }

      const clientSessionId = crypto.randomUUID();

      const res = await fetch("/api/aws-transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_id: clientSessionId,
          language_code: "en-US",
          sample_rate_hz: 16000,
          media_encoding: "pcm",
        }),
      });

      if (!res.ok) {
        let message = "Failed to start transcription session";
        try {
          const data = await res.json();
          if (data && typeof data.error === "string") {
            message = data.error;
          }
        } catch {
          // ignore
        }

        if (res.status === 400) {
          onError?.(
            message ||
              "Transcription is misconfigured. Please contact your administrator."
          );
        } else if (res.status === 502) {
          onError?.(
            message || "Transcription service is temporarily unavailable."
          );
        } else {
          onError?.(message);
        }
        return;
      }

      const { stream_url: streamUrl } = (await res.json()) as {
        stream_url?: string;
      };

      if (!streamUrl) {
        onError?.("Transcription service did not return a stream URL.");
        return;
      }

      const ws = new WebSocket(streamUrl);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = async () => {
        try {
          const mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1,
            },
          });
          streamRef.current = mediaStream;

          const audioContext = new AudioContext({ sampleRate: 16000 });
          audioContextRef.current = audioContext;

          const source = audioContext.createMediaStreamSource(mediaStream);
          sourceRef.current = source;

          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.75;
          analyserRef.current = analyser;

          const processor = audioContext.createScriptProcessor(1024, 1, 1);
          processorRef.current = processor;

          chunksRef.current = [];

          processor.onaudioprocess = (e: AudioProcessingEvent) => {
            if (stoppedRef.current) return;
            const float32 = e.inputBuffer.getChannelData(0);
            const pcm = float32ToInt16(float32);
            chunksRef.current.push(new Uint8Array(pcm));
          };

          source.connect(analyser);
          source.connect(processor);
          processor.connect(audioContext.destination);

          if (audioContext.state === "suspended") {
            await audioContext.resume();
          }

          intervalRef.current = setInterval(
            sendAudioChunks,
            SEND_INTERVAL_MS
          );

          setIsListening(true);
          // Arm the idle timeout so the mic also auto-stops if the user never
          // speaks at all after opening it.
          bumpSilenceTimer();
        } catch (err) {
          if (stoppedRef.current) return;
          const message =
            err instanceof Error
              ? err.message
              : "Failed to access microphone for transcription.";
          onError?.(message);
          stop();
        }
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const data = event.data;
          if (!(data instanceof ArrayBuffer)) {
            return;
          }

          const message = decodeEventStreamMessage(data);
          const messageType = message.headers[":message-type"];
          const eventType = message.headers[":event-type"];

          if (messageType === "event" && eventType === "TranscriptEvent") {
            const json = JSON.parse(
              new TextDecoder("utf-8").decode(message.payload)
            ) as {
              Transcript?: {
                Results?: Array<{
                  Alternatives?: Array<{ Transcript?: string }>;
                  IsPartial?: boolean;
                }>;
              };
            };

            const results = json.Transcript?.Results ?? [];
            for (const result of results) {
              const text = result.Alternatives?.[0]?.Transcript ?? "";
              if (!text) continue;
              // Speech detected — restart the idle countdown.
              bumpSilenceTimer();
              if (result.IsPartial) {
                onInterim?.(text);
              } else {
                onFinal?.(text);
              }
            }
          } else if (messageType === "exception") {
            const errorText = new TextDecoder("utf-8").decode(
              message.payload
            );
            onError?.(errorText || "Transcription failed.");
          }
        } catch (err) {
          // Ignore individual parse errors; the stream will continue. Log for
          // visibility so a persistently corrupted stream is diagnosable.
          console.warn("[aws-transcribe] message parse failed:", err);
        }
      };

      ws.onerror = () => {
        if (!stoppedRef.current) {
          onError?.("Transcription connection error.");
          stop();
        }
      };

      ws.onclose = () => {
        cleanupConnection();
        if (!stoppedRef.current) {
          cleanupAudio();
          setIsListening(false);
        }
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start transcription";
      onError?.(message);
      stop();
    }
  }, [
    bumpSilenceTimer,
    cleanupAudio,
    cleanupConnection,
    onInterim,
    onFinal,
    onError,
    sendAudioChunks,
    stop,
  ]);

  const getWaveformData = useCallback((): Uint8Array | null => {
    const analyser = analyserRef.current;
    if (!analyser) return null;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    return data;
  }, []);

  return { start, stop, isListening, getWaveformData };
}

