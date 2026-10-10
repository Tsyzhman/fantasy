---
status: active
---

<a name="root"></a>

# FEAT-009: Session authentication {#root}

## In simple words

Users sign in with their existing email/password and keep their current sessions. Parallel attempts cannot bypass the failure limit. Public first-run setup is available once per installation.

## Control and scope

Governing: `spec://common/main#root`. Release constraint: `spec://common/INFRA-006-continuous-deployment#root`. This contract owns shared login, setup, session retention and trusted internal returns; it preserves admin/user roles and browser-extension sessions.

<a name="attempts"></a>

## Attempts {#attempts}

Email and client-IP buckets retain the existing five-failure limit and 15-minute sliding failure/lock windows. An attempt checks its buckets, verifies credentials and records success/failure while holding transaction-scoped locks in deterministic bucket order. A sixth concurrent incorrect attempt cannot start password verification until the prior attempts commit, and is rejected while locked. Direct failure recording atomically increments the current database value. Expired windows reset on the next failure. Successful login clears its buckets.

<a name="redirects"></a>

## Internal returns {#redirects}

Login accepts only root-relative paths that resolve to the trusted origin. Reject authority paths, backslashes, controls, malformed escapes and encoded ambiguous leading separators, including nested encodings. Query strings and fragments of valid internal paths are preserved.

<a name="bootstrap"></a>

## First run and recovery {#bootstrap}

A durable singleton records bootstrap completion. Setup locks that singleton and creates/upgrades the first imported account in one transaction. Existing password-bearing administrators, including inactive ones, close bootstrap during the online migration. Disabling/deleting the final administrator never reopens public setup. Recovery uses the privileged operator CLI, updates an explicitly selected account, records its action and never clears the singleton.

<a name="sessions"></a>

## Session retention {#sessions}

Sessions retain their 30-day expiry and hashed tokens. Periodic housekeeping deletes only expired sessions in bounded indexed batches; active sessions survive. Multiple housekeeping callers use a transaction-scoped exclusion lock. No secrets or raw tokens appear in diagnostics.

## Errors, trace and readiness

Rejected login/setup attempts retain the existing error UI. Login/setup handlers, atomic limiter, bootstrap helper, retention worker, operator recovery and direct behavioral tests carry this contract's markers. Readiness requires concurrent PostgreSQL tests for counting/enforcement/bootstrap, redirect regressions and preservation of active sessions.

## Relationships

Shared by Machete, Baltika, MiXerr, KHL, Franchises, APIs and extension auth. Database roles and deployment remain governed by their infrastructure contracts.

<a name="changelog"></a>

## Change history {#changelog}

- 2026-10-10: WI-067 — define atomic attempts, trusted redirects and durable bootstrap; session retention is applied with WI-072.
