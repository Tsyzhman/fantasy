/** @spec spec://common/INFRA-006-continuous-deployment#runtime */
import { readFileSync } from "node:fs";

type ActivationOptions = {
  path?: string;
  commit?: string;
  read?: (path: string) => string;
  schedule?: (callback: () => void) => ReturnType<typeof setTimeout>;
  clear?: (timer: ReturnType<typeof setTimeout>) => void;
  onError?: (error: unknown) => void;
};

export function startWebSchedulersWhenActivated(start: () => Promise<void>, options: ActivationOptions = {}) {
  const path = options.path ?? process.env.WEB_SCHEDULER_ACTIVATION_PATH;
  const commit = options.commit ?? process.env.APP_RELEASE_COMMIT;
  const read = options.read ?? ((file: string) => readFileSync(file, "utf8"));
  const schedule = options.schedule ?? ((callback: () => void) => setTimeout(callback, 1000));
  const clear = options.clear ?? clearTimeout;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  let started = false;

  const check = () => {
    if (cancelled || started) return;
    let activated = !path;
    if (path) {
      try {
        activated = Boolean(commit) && read(path).trim() === commit;
      } catch {
        activated = false;
      }
    }
    if (!activated) {
      timer = schedule(check);
      timer.unref?.();
      return;
    }
    started = true;
    void start().catch((error) => options.onError?.(error));
  };

  check();
  return () => {
    cancelled = true;
    if (timer) clear(timer);
  };
}
