import type { BetaAcceptanceEvidence, BetaServerWindowEvidence } from "./user-test";

type LoadBetaAcceptanceEvidenceOptions = { evaluatedAt?: Date; fetchImpl?: typeof fetch };

export async function loadBetaAcceptanceEvidence(options: LoadBetaAcceptanceEvidenceOptions = {}): Promise<BetaAcceptanceEvidence> {
  const evaluatedAt = options.evaluatedAt ?? new Date();
  const rum = {
    minimumObservationSpanHours: configuredNumber("BETA_TEST_RUM_MIN_SPAN_HOURS"),
    maximumLastObservationAgeHours: configuredNumber("BETA_TEST_RUM_MAX_AGE_HOURS")
  };
  const auditUrl = process.env.BETA_TEST_SERVER_AUDIT_URL?.trim() ?? "";
  if (!auditUrl) return { evaluatedAt, rum };

  const config = {
    expectedStart: process.env.BETA_TEST_FIXED_WINDOW_EXPECTED_START?.trim() ?? "",
    minimumObservedSpanMinutes: configuredNumber("BETA_TEST_FIXED_WINDOW_MIN_SPAN_MINUTES"),
    maximumAgeMinutes: configuredNumber("BETA_TEST_SERVER_AUDIT_MAX_AGE_MINUTES")
  };
  try {
    const response = await (options.fetchImpl ?? fetch)(auditUrl, {
      cache: "no-store",
      headers: { "user-agent": "fantasy-scout-beta-acceptance/1.0" },
      signal: AbortSignal.timeout(10_000)
    });
    const body = response.ok ? asRecord(await response.json()) : null;
    return {
      evaluatedAt,
      rum,
      serverWindow: serverWindowEvidence(body, {
        ...config,
        fallbackStatus: response.ok ? "invalid_payload" : `http_${response.status}`
      })
    };
  } catch {
    return { evaluatedAt, rum, serverWindow: serverWindowEvidence(null, { ...config, fallbackStatus: "unavailable" }) };
  }
}

function serverWindowEvidence(
  body: Record<string, unknown> | null,
  config: { expectedStart: string; minimumObservedSpanMinutes: number; maximumAgeMinutes: number; fallbackStatus: string }
): BetaServerWindowEvidence {
  return {
    status: textValue(body?.status) || config.fallbackStatus,
    generatedAt: textValue(body?.generatedAt),
    windowMode: textValue(body?.windowMode),
    windowStart: textValue(body?.windowStart),
    retentionCoversWindowStart: body?.retentionCoversWindowStart === true,
    requests: numberValue(body?.requests),
    serverErrors: numberValue(body?.serverErrors),
    serverErrorRatePercent: numberValue(body?.serverErrorRatePercent),
    observedSpanMinutes: numberValue(body?.observedSpanMinutes),
    expectedStart: config.expectedStart,
    minimumObservedSpanMinutes: config.minimumObservedSpanMinutes,
    maximumAgeMinutes: config.maximumAgeMinutes
  };
}

function configuredNumber(name: string) {
  const raw = process.env[name]?.trim() ?? "";
  return raw ? Number(raw) : Number.NaN;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
}
