export type DataQualityAuditRunStatus = {
  status: string;
  gatePassed: boolean;
  completedAt: Date | null;
};

export function evaluateDataQualityAuditRunHealth(
  run: DataQualityAuditRunStatus | null,
  now: number,
  maximumRunAgeHours: number
) {
  const ageHours = run?.completedAt ? round((now - run.completedAt.getTime()) / 3_600_000) : null;
  return {
    ageHours,
    healthy: Boolean(
      run && run.status === "COMPLETED" && run.gatePassed && ageHours !== null && ageHours >= 0 && ageHours <= maximumRunAgeHours
    )
  };
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
