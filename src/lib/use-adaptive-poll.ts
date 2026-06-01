"use client";

import { useEffect, useRef, useState } from "react";

export function useAdaptivePoll<T>(
  fetcher: () => Promise<T>,
  options: {
    activeIntervalMs: number;
    idleIntervalMs: number;
    initialIntervalMs: number;
    isActive: (data: T) => boolean;
  }
): T | null {
  const { activeIntervalMs, idleIntervalMs, initialIntervalMs, isActive } = options;
  const [data, setData] = useState<T | null>(null);
  const lastKeyRef = useRef<string | null>(null);
  const unchangedFetchesRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;

    function schedule(delayMs: number) {
      timeoutId = window.setTimeout(() => {
        void poll();
      }, delayMs);
    }

    async function poll() {
      try {
        const nextData = await fetcher();
        if (cancelled) return;

        setData(nextData);
        const nextKey = stablePollKey(nextData);
        if (lastKeyRef.current === nextKey) {
          unchangedFetchesRef.current += 1;
        } else {
          unchangedFetchesRef.current = 0;
          lastKeyRef.current = nextKey;
        }

        const nextDelay = isActive(nextData)
          ? activeIntervalMs
          : unchangedFetchesRef.current >= 3
            ? idleIntervalMs
            : initialIntervalMs;
        schedule(nextDelay);
      } catch {
        if (!cancelled) schedule(idleIntervalMs);
      }
    }

    void poll();

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [activeIntervalMs, fetcher, idleIntervalMs, initialIntervalMs, isActive]);

  return data;
}

function stablePollKey(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
