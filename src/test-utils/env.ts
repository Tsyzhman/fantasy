let envMutationQueue: Promise<void> = Promise.resolve();

export async function withEnv<T>(values: Record<string, string | undefined>, run: () => T | Promise<T>): Promise<T> {
  let releaseEnvMutation: () => void = () => undefined;
  const previousMutation = envMutationQueue;
  envMutationQueue = new Promise<void>((resolve) => {
    releaseEnvMutation = resolve;
  });

  await previousMutation;

  try {
    return await withEnvUnlocked(values, run);
  } finally {
    releaseEnvMutation();
  }
}

async function withEnvUnlocked<T>(values: Record<string, string | undefined>, run: () => T | Promise<T>): Promise<T> {
  const previousValues = new Map<string, string | undefined>();

  for (const key of Object.keys(values)) {
    previousValues.set(key, process.env[key]);
    const value = values[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of previousValues) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
