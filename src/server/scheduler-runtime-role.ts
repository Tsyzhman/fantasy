export type SchedulerRuntimeEnvironment = Readonly<{
  FPL_ENABLED?: string;
  FPL_PRICE_SYNC_ENABLED?: string;
  INGESTION_WORKER_IN_PROCESS?: string;
  PROBABLE_LINEUP_SYNC_ENABLED?: string;
}>;

export type SchedulerRuntimePlan = Readonly<{
  worker: boolean;
  fpl: boolean;
  probableLineups: boolean;
}>;

export function schedulerRuntimePlan(environment: SchedulerRuntimeEnvironment = processSchedulerEnvironment()): SchedulerRuntimePlan {
  return {
    worker: environment.INGESTION_WORKER_IN_PROCESS !== "false",
    fpl: environment.FPL_ENABLED !== "false" && environment.FPL_PRICE_SYNC_ENABLED !== "false",
    probableLineups: environment.PROBABLE_LINEUP_SYNC_ENABLED !== "false"
  };
}

function processSchedulerEnvironment(): SchedulerRuntimeEnvironment {
  return {
    FPL_ENABLED: process.env.FPL_ENABLED,
    FPL_PRICE_SYNC_ENABLED: process.env.FPL_PRICE_SYNC_ENABLED,
    INGESTION_WORKER_IN_PROCESS: process.env.INGESTION_WORKER_IN_PROCESS,
    PROBABLE_LINEUP_SYNC_ENABLED: process.env.PROBABLE_LINEUP_SYNC_ENABLED
  };
}
