import assert from "node:assert/strict";
import test from "node:test";

import { authRateLimitBuckets, getClientIpFromHeaders } from "./auth-rate-limit";

test("auth rate-limit buckets include normalized email and client IP", () => {
  const buckets = authRateLimitBuckets({ action: "login", email: " Admin@Example.COM ", clientIp: "203.0.113.10" });

  assert.deepEqual(buckets, [
    { action: "login:email", subject: "admin@example.com" },
    { action: "login:ip", subject: "203.0.113.10" }
  ]);
});

test("client IP parser prefers the first x-forwarded-for address", () => {
  const headers = new Headers({
    "x-forwarded-for": "203.0.113.10, 198.51.100.2",
    "x-real-ip": "198.51.100.3"
  });

  assert.equal(getClientIpFromHeaders(headers), "203.0.113.10");
});
