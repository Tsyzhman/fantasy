"use client";

import { useEffect } from "react";

import type { BetaTestMilestone } from "@/beta/user-test";
import { recordBetaMilestone } from "@/lib/beta-telemetry-client";

export function BetaJourneyMarker({ milestone, active = true }: { milestone: Exclude<BetaTestMilestone, "JOURNEY_STARTED">; active?: boolean }) {
  useEffect(() => {
    if (active) void recordBetaMilestone(milestone);
  }, [active, milestone]);
  return null;
}
