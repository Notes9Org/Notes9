"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ActiveCountdown = {
  eventId: string;
  title: string;
  start: string;
  end: string;
};

type DayPlannerContextValue = {
  activeCountdown: ActiveCountdown | null;
  setActiveCountdown: (countdown: ActiveCountdown) => void;
  clearActiveCountdown: () => void;
  reminderSoundEnabled: boolean;
  enableReminderSound: () => Promise<boolean>;
  disableReminderSound: () => void;
  playReminderSound: () => Promise<boolean>;
};

const ACTIVE_COUNTDOWN_STORAGE_KEY = "notes9.day-planner.active-countdown";
const REMINDER_SOUND_STORAGE_KEY = "notes9.day-planner.reminder-sound-enabled";

const DayPlannerContext = createContext<DayPlannerContextValue | null>(null);

export function DayPlannerProvider({ children }: { children: ReactNode }) {
  const [activeCountdown, setActiveCountdownState] =
    useState<ActiveCountdown | null>(null);
  const [reminderSoundEnabled, setReminderSoundEnabled] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const storedCountdown = window.localStorage.getItem(
        ACTIVE_COUNTDOWN_STORAGE_KEY,
      );
      if (storedCountdown) {
        setActiveCountdownState(JSON.parse(storedCountdown) as ActiveCountdown);
      }

      const storedSoundPreference = window.localStorage.getItem(
        REMINDER_SOUND_STORAGE_KEY,
      );
      setReminderSoundEnabled(storedSoundPreference === "true");
    } catch {
      // Ignore storage parsing issues and fall back to defaults.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      if (activeCountdown) {
        window.localStorage.setItem(
          ACTIVE_COUNTDOWN_STORAGE_KEY,
          JSON.stringify(activeCountdown),
        );
      } else {
        window.localStorage.removeItem(ACTIVE_COUNTDOWN_STORAGE_KEY);
      }
    } catch {
      // Ignore storage write issues.
    }
  }, [activeCountdown]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(
        REMINDER_SOUND_STORAGE_KEY,
        reminderSoundEnabled ? "true" : "false",
      );
    } catch {
      // Ignore storage write issues.
    }
  }, [reminderSoundEnabled]);

  const ensureAudioContext = useCallback(async () => {
    if (typeof window === "undefined") return null;

    if (!audioContextRef.current) {
      const AudioContextCtor =
        window.AudioContext ||
        // @ts-expect-error Safari still exposes webkit-prefixed audio context.
        window.webkitAudioContext;

      if (!AudioContextCtor) return null;
      audioContextRef.current = new AudioContextCtor();
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }, []);

  const playReminderSound = useCallback(async () => {
    try {
      const audioContext = await ensureAudioContext();
      if (!audioContext) return false;

      const startAt = audioContext.currentTime;
      const duration = 0.18;
      const notes = [880, 1174.66];

      notes.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        const noteStart = startAt + index * 0.16;

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, noteStart);

        gainNode.gain.setValueAtTime(0.0001, noteStart);
        gainNode.gain.exponentialRampToValueAtTime(0.12, noteStart + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(
          0.0001,
          noteStart + duration,
        );

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.start(noteStart);
        oscillator.stop(noteStart + duration);
      });

      return true;
    } catch {
      return false;
    }
  }, [ensureAudioContext]);

  const enableReminderSound = useCallback(async () => {
    const played = await playReminderSound();
    if (played) {
      setReminderSoundEnabled(true);
      return true;
    }
    return false;
  }, [playReminderSound]);

  const disableReminderSound = useCallback(() => {
    setReminderSoundEnabled(false);
  }, []);

  const setActiveCountdown = useCallback((countdown: ActiveCountdown) => {
    setActiveCountdownState(countdown);
  }, []);

  const clearActiveCountdown = useCallback(() => {
    setActiveCountdownState(null);
  }, []);

  return (
    <DayPlannerContext.Provider
      value={{
        activeCountdown,
        setActiveCountdown,
        clearActiveCountdown,
        reminderSoundEnabled,
        enableReminderSound,
        disableReminderSound,
        playReminderSound,
      }}
    >
      {children}
    </DayPlannerContext.Provider>
  );
}

export function useDayPlanner() {
  const context = useContext(DayPlannerContext);

  if (!context) {
    throw new Error("useDayPlanner must be used within a DayPlannerProvider");
  }

  return context;
}
