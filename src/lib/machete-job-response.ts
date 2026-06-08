import { NextResponse } from "next/server";

type MacheteJobResponse = {
  job: {
    status: string;
    errorMessage?: string | null;
  };
  error?: string | null;
};

export function macheteJobResponse<T extends MacheteJobResponse>(result: T, errorCode = "MACHETE_JOB_FAILED") {
  if (result.job.status === "ERROR" || result.error) {
    const message = result.error ?? result.job.errorMessage ?? "Machete job failed.";
    return NextResponse.json({ error: { code: errorCode, message }, job: result.job }, { status: 500 });
  }

  return NextResponse.json(result);
}
