/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('deployment and daily collector share a lock before any worker interruption', () => {
  const deploy = readFileSync('scripts/deploy-production-docker.sh', 'utf8');
  const collector = readFileSync('ops/khl-daily-sync.sh', 'utf8');
  const lock = 'exec 9>/home/deploy/.cache/fantasy-khl-daily.lock';
  assert.ok(deploy.includes(lock) && collector.includes(lock));
  assert.ok(deploy.indexOf('flock -w 1800 9') < deploy.indexOf('docker container stop -t 30 "$worker" "$web"'));
  assert.ok(collector.indexOf('flock -w 300 9') < collector.indexOf('docker exec'));
  assert.ok(!deploy.includes('\r') && !collector.includes('\r'));
});
