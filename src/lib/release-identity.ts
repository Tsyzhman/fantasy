const fallbackVersion = "development";
const fallbackCommit = "unknown";

export type ReleaseIdentity = {
  version: string;
  commit: string;
};

export function releaseIdentity(): ReleaseIdentity {
  return {
    version: normalizedReleaseValue(process.env.APP_RELEASE_VERSION, fallbackVersion),
    commit: normalizedReleaseValue(process.env.APP_RELEASE_COMMIT, fallbackCommit)
  };
}

function normalizedReleaseValue(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 120) : fallback;
}
