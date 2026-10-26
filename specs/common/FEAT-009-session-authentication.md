---
status: active
---

<a name="root"></a>

# FEAT-009: Session authentication {#root}

<a name="plain-language"></a>

## In simple words {#plain-language}

Users sign in with their existing email/password and keep their current sessions. Parallel attempts cannot bypass the failure limit. Public first-run setup is available once per installation.

<a name="goal"></a>

## Goal {#goal}

Keep shared authentication usable while concurrent incorrect requests are counted/enforced consistently and public setup cannot reopen after its first completion.

<a name="governing-specs"></a>

## Control specifications {#governing-specs}

Governing: `spec://common/main#root`. Release constraint: `spec://common/INFRA-006-continuous-deployment#root`. This contract owns shared login, setup, session retention and trusted internal returns; it preserves admin/user roles and browser-extension sessions.

<a name="scope"></a>

## Scope {#scope}

In: current password login, imported-account first setup, internal returns, permanent bootstrap completion, operator recovery and expired-session cleanup. Out: new identity providers, password-reset email, authorization changes and session revocation during releases.

<a name="actors"></a>

## Actors {#actors}

Visitors may sign in or complete a genuinely fresh installation. Existing authenticated users retain their roles. Only the protected operator can run administrative recovery; workers perform bounded housekeeping.

<a name="scenarios"></a>

## Scenarios {#scenarios}

Concurrent wrong passwords increment/enforce email/IP buckets. Successful login clears its buckets and creates the existing cookie/token session. Fresh setup creates one administrator atomically; losing that account afterward requires operator recovery. An expired session is rejected on access and later removed by bounded cleanup. Valid internal return destinations survive login.

<a name="data"></a>

## Data {#data}

AuthRateLimit retains action/hashed subject, failure count and lock/failure timestamps with its existing unique key. AuthBootstrapState has one durable first-admin row and completion timestamp. UserSession contains only the hashed random token and indexed expiry plus user relation; raw tokens stay in the existing secure cookie/extension channel.

<a name="contracts"></a>

## Contracts {#contracts}

Existing login/setup pages and error wording remain compatible. The attempt transaction admits credential checks only under the current bucket policy; it returns an allowed/value result to the action handler. Session creation remains outside that transaction after success. Setup completion cannot be undone by disabling or deleting administrators. Details below govern the owned boundaries.

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

<a name="errors"></a>

## Errors {#errors}

Invalid credentials, active locks and closed bootstrap retain existing error states. Unsafe redirects use the trusted default. Database/lock failures do not grant access. Cleanup failures are logged and retried at the next bounded interval without revoking active sessions.

<a name="traceability"></a>

## Traceability {#traceability}

Rejected login/setup attempts retain the existing error UI. Login/setup handlers, atomic limiter, bootstrap helper, retention worker, operator recovery and direct behavioral tests carry this contract's markers. Readiness requires concurrent PostgreSQL tests for counting/enforcement/bootstrap, redirect regressions and preservation of active sessions.

<a name="acceptance"></a>

## Acceptance {#acceptance}

100 concurrent failure records retain 100 failures; 100 concurrent attempts allow five credential checks and reject 95. Expiry resets the window; success clears it. Parallel fresh setups create one administrator; disabling/deleting it keeps setup closed. Redirect tests reject raw/encoded/nested authority and backslash/control paths while preserving valid path/query/fragment. Bounded cleanup removes expired rows and leaves active sessions.

<a name="relationships"></a>

## Relationships {#relationships}

Shared by Machete, Baltika, MiXerr, KHL, Franchises, APIs and extension auth. Database roles and deployment remain governed by their infrastructure contracts.

<a name="changelog"></a>

## Change history {#changelog}

- 2026-10-10: WI-067 — define atomic attempts, trusted redirects and durable bootstrap; session retention is applied with WI-072.
