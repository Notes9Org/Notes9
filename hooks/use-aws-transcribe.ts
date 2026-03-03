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

export function useAwsTranscribe(options: UseAwsTranscribeOptions = {}) {
  const { onInterim, onFinal, onError } = options;
  const [isListening, setIsListening] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const bodyControllerRef =
    useRef<ReadableStreamDefaultController<Uint8Array> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);

  const cleanupAudio = useCallback(() => {
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
  }, []);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    cleanupAudio();

    if (bodyControllerRef.current) {
      try {
        bodyControllerRef.current.close();
      } catch {
        // Ignore
      }
      bodyControllerRef.current = null;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setIsListening(false);
  }, [cleanupAudio]);

  const start = useCallback(async () => {
    try {
      stoppedRef.current = false;

      // Start mic and stream audio in one request/response lifecycle
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

      const audioBody = new ReadableStream<Uint8Array>({
        start(controller) {
          bodyControllerRef.current = controller;
        },
        cancel() {
          bodyControllerRef.current = null;
        },
      });

      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        if (stoppedRef.current) return;
        const float32 = e.inputBuffer.getChannelData(0);
        const pcm = float32ToInt16(float32);
        try {
          bodyControllerRef.current?.enqueue(new Uint8Array(pcm));
        } catch {
          // Ignore enqueue errors when stream is already closed
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      setIsListening(true);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const requestInit: RequestInit & { duplex: "half" } = {
        method: "POST",
        body: audioBody,
        headers: {
          "Content-Type": "application/octet-stream",
        },
        signal: abortController.signal,
        duplex: "half",
      };

      const response = await fetch("/api/transcribe/stream", requestInit);

      if (!response.ok) {
        let message = "Failed to start transcription stream";
        try {
          const err = (await response.json()) as { error?: string };
          message = err.error || message;
        } catch {
          // Ignore JSON parse errors
        }
        onError?.(message);
        stop();
        return;
      }

      if (!response.body) {
        onError?.("Transcription stream is unavailable");
        stop();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);

          if (line) {
            try {
              const parsed = JSON.parse(line) as {
                text?: string;
                isFinal?: boolean;
                error?: string;
              };

              if (parsed.error) {
                onError?.(parsed.error);
                stop();
                return;
              }

              const text = parsed.text ?? "";
              if (parsed.isFinal) {
                onFinal?.(text);
              } else {
                onInterim?.(text);
              }
            } catch {
              // Ignore malformed ndjson lines
            }
          }

          newlineIndex = buffer.indexOf("\n");
        }
      }

      if (!stoppedRef.current) {
        stop();
      }
    } catch (err) {
      if (stoppedRef.current) return;
      const message =
        err instanceof Error ? err.message : "Failed to start transcription";
      onError?.(message);
      stop();
    }
  }, [onInterim, onFinal, onError, stop]);

  return { start, stop, isListening };
}
