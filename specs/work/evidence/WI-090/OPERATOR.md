# WI-090 current-run operator transport

Select `artifact_transport=operator-prestage` when dispatching **the new canonical Deploy Production run**. Keep `dry_run=false` only for the root-authorized rollout. The run still resolves/freshly validates/builds/uploads its own artifact. Never reuse IDs, digests or source values from the cancelled probe runs.

The transport step immediately logs this nonsecret diagnostic (before waiting):

```text
WAITING_CI_ARTIFACT repository=OWNER/REPO repository_id=ID workflow_sha=SHA release=RELEASE run=RUN attempt=N artifact=ID commit=SOURCE_SHA zip_sha256=DIGEST path=/tmp/fantasy-scout-ci-artifacts/run-RUN-attempt-N-artifact-ID-sha256-DIGEST.zip
```

The exact private inbox is created by the workflow's pinned-SSH receiver, mode 0700 and owned by the SSH user. It waits at most 20 minutes for the complete exact filename. The receiver ignores `.partial` and other run/attempt/artifact names. The current ZIP is consumed into private temporary storage, fully verified, and removed after extraction. Only the two fully verified archives are atomically published to the unchanged `/tmp/fantasy-scout-{release,images}-RELEASE.tar.gz` paths. The workflow alone continues to the canonical promoter.

## Local download, PowerShell

Use the exact fields from that new run's diagnostic. `GITHUB_SHA` is `workflow_sha` (the dispatch workflow source); `commit` is the separately frozen release source and may differ. The local CLI verifies authenticated metadata for the current run/attempt/canonical workflow/repository/artifact name/ID/digest. It uses eight disjoint HTTPS ranges and the whole ZIP hash, then atomically creates OUTPUT.zip; it never calls SSH or a promoter.

Fill only these nonsecret values:

```powershell
$taskRoot = 'C:/Users/Nik/.codex/worktrees/audit-20261104/fantasy_export'
$operatorValues = @{
    GITHUB_REPOSITORY    = 'OWNER/REPO' # repository
    GITHUB_REPOSITORY_ID = 'ID'         # repository_id
    GITHUB_SHA           = 'FULL_SHA'   # workflow_sha
    GITHUB_RUN_ID        = 'RUN'        # run
    GITHUB_RUN_ATTEMPT   = 'N'          # attempt
    ARTIFACT_ID          = 'ID'         # artifact
    ARTIFACT_DIGEST      = '64_HEX'     # zip_sha256, without sha256: prefix
    RELEASE              = 'RELEASE'    # release
}
$localZip = Join-Path $env:TEMP ('fantasy-current-artifact-' + [guid]::NewGuid().ToString('N') + '.zip')
$savedEnvironment = @{}
foreach ($name in @($operatorValues.Keys) + @('GITHUB_TOKEN')) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
try {
    foreach ($entry in $operatorValues.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
    }
    $env:GITHUB_TOKEN = (& gh auth token).Trim() # assignment only; never print it
    python -B "$taskRoot/scripts/transfer-ci-artifact.py" --download-zip "$localZip"
    if ($LASTEXITCODE -ne 0) { throw 'Verified current artifact download failed' }
} finally {
    foreach ($entry in $savedEnvironment.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
    }
}
```

The CLI prints `VERIFIED_LOCAL_CI_ZIP` only after the full digest matches. It has no resume/cross-run lookup. It refuses an existing output target. Token and signed URL stay in local memory; restore the environment before SSH/SCP. No URL or token appears in process arguments or files.

## Atomic upload through existing trusted local SSH

Use root's already verified SSH alias/user/port/config. The following example explicitly enables strict host verification and assumes the existing local identity/known_hosts configuration. `$remoteZip` must equal the exact CI diagnostic path. Do not upload directly to its final name.

```powershell
$target = 'deploy@VERIFIED_HOST'
$port = 22
$remoteZip = '/tmp/fantasy-scout-ci-artifacts/run-RUN-attempt-N-artifact-ID-sha256-DIGEST.zip'
if ($remoteZip -notmatch '^/tmp/fantasy-scout-ci-artifacts/run-[1-9][0-9]*-attempt-[1-9][0-9]*-artifact-[1-9][0-9]*-sha256-[0-9a-f]{64}\.zip$') {
    throw 'Unexpected current-run inbox path'
}
$remotePartial = "$remoteZip.partial-$PID"
scp -o StrictHostKeyChecking=yes -P $port "$localZip" "${target}:$remotePartial"
if ($LASTEXITCODE -ne 0) { throw 'Current artifact upload failed' }
ssh -o StrictHostKeyChecking=yes -p $port $target "chmod 600 -- '$remotePartial' && mv -T -n -- '$remotePartial' '$remoteZip' && test ! -e '$remotePartial'"
if ($LASTEXITCODE -ne 0) { throw 'Atomic current artifact publication failed' }
```

Root should confirm that the same workflow is still waiting before upload, then watch its verification and canonical promotion. Do not invoke any promoter manually. The `mv -n` path refuses replacement and the final test detects a skipped move. Root owns cleanup of an interrupted `.partial` or local verified ZIP after release evidence is retained. Other run paths are never consumed or deleted by this receiver.

## Time and resource limits

Direct HTTPS: eight simultaneous fixed contiguous ranges, strict 206/Content-Range/Content-Length/identity encoding, one preallocated ZIP, 1 MiB maximum buffers, 30-second socket timeout, 45-minute download deadline. At most one full network retry gets a new signed URL, within one 50-minute overall controller budget; no hash/provenance retry, cross-run reuse or partial resume. The remote process also has TERM/kill-after and 256 MiB address-space limits. The workflow transport step is bounded at 52 minutes inside the unchanged 60-minute packaging job.

Prestage: at most 20 minutes waiting, 22-minute receiver budget including verification. Local CLI download is bounded at 20 minutes. Small root probes measured local eight-range throughput 2.924 MiB/s and local SSH 2.98 MiB/s; these are not a full-artifact completion proof. Root verifies actual delivery time on the fresh run.
