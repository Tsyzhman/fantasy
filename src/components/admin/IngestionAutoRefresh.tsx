"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef } from "react";

import { useAdaptivePoll } from "@/lib/use-adaptive-poll";

type IngestionStatusPayload = {
  active_job: { status: string } | null;
};

type IngestionPollState = {
  active: boolean;
};

export function IngestionAutoRefresh({
  enabled,
  activeIntervalMs = 10_000,
  idleIntervalMs = 60_000,
  initialIntervalMs = 5_000
}: {
  enabled: boolean;
  activeIntervalMs?: number;
  idleIntervalMs?: number;
  initialIntervalMs?: number;
}) {
  const router = useRouter();
  const previousActiveRef = useRef(enabled);

  const fetchStatus = useCallback(async (): Promise<IngestionPollState> => {
    let active = enabled;

    try {
      const response = await fetch("/api/admin/ingestion/status", { cache: "no-store" });
      if (response.ok) {
        const payload = (await response.json()) as IngestionStatusPayload;
        active = payload.active_job ? ["pending", "running"].includes(payload.active_job.status) : false;
      }
    } catch {
      active = enabled;
    }

    if (active || previousActiveRef.current !== active) {
      router.refresh();
    }
    previousActiveRef.current = active;

    return { active };
  }, [enabled, router]);

  useAdaptivePoll(fetchStatus, {
    activeIntervalMs,
    idleIntervalMs,
    initialIntervalMs,
    isActive: isIngestionActive
  });

  return null;
}

function isIngestionActive(state: IngestionPollState) {
  return state.active;
}
