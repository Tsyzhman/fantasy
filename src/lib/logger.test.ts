import assert from "node:assert/strict";
import test from "node:test";

import { createLogger } from "./logger";

test("logger writes readable text logs", () => {
  const lines: string[] = [];
  const logger = createLogger("test", {
    json: false,
    sink: {
      error: (line) => lines.push(String(line)),
      info: (line) => lines.push(String(line)),
      warn: (line) => lines.push(String(line))
    }
  });

  logger.info("hello", { jobId: "job-1" });

  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\[test\] hello /);
  assert.match(lines[0], /"jobId":"job-1"/);
});

test("logger writes structured JSON logs", () => {
  const lines: string[] = [];
  const logger = createLogger("api", {
    json: true,
    sink: {
      error: (line) => lines.push(String(line)),
      info: (line) => lines.push(String(line)),
      warn: (line) => lines.push(String(line))
    }
  });

  logger.error("failed", { error: new Error("boom") });

  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.level, "error");
  assert.equal(parsed.scope, "api");
  assert.equal(parsed.message, "failed");
  assert.equal(parsed.error.message, "boom");
});
