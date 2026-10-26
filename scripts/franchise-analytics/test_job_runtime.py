"""@spec spec://common/INFRA-006-continuous-deployment#heavy-jobs"""
import importlib.util
import os
import pathlib
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('franchises_job', pathlib.Path(__file__).resolve().parents[2] / 'ops/franchises-job.py')
job = importlib.util.module_from_spec(spec)
spec.loader.exec_module(job)


def worker():
    return {'Image': 'sha256:immutable', 'Config': {'Env': ['DATABASE_URL=private', 'NODE_OPTIONS=--max-old-space-size=2048', 'FRANCHISE_RESUME_AFTER=old']},
            'Mounts': [{'Destination': job.SOURCE_ROOT, 'Type': 'volume', 'Name': 'sources', 'RW': True}],
            'NetworkSettings': {'Networks': {'database': {}}}}


class JobRuntimeTests(unittest.TestCase):
    def test_one_off_uses_the_same_immutable_image_volume_and_calculation_lock(self):
        with patch.dict(os.environ, {}, clear=True):
            config = job.configuration(worker(), worker())
        command = job.job_command(config, '/private/env')
        self.assertIn('sha256:immutable', command)
        self.assertIn('type=volume,src=sources,dst=/app/storage/franchises', command)
        self.assertIn('/app/storage/franchises/.heavy-job.lock', command)
        self.assertEqual(command[command.index('--memory') + 1], '5g')
        self.assertIn('--rm', command)
        self.assertNotIn('--publish', command)
        self.assertEqual(command[-3:], ['node', 'scripts/franchises.cjs', '--sync'])
        self.assertEqual(config['environment']['NODE_OPTIONS'], '--max-old-space-size=768')
        self.assertNotIn('FRANCHISE_RESUME_AFTER', config['environment'])
        self.assertNotIn('DATABASE_URL=private', command)

    def test_resume_is_explicit_and_unshared_resources_fail(self):
        with patch.dict(os.environ, {'FRANCHISE_RESUME_AFTER': 'checkpoint'}, clear=True):
            self.assertEqual(job.configuration(worker(), worker())['environment']['FRANCHISE_RESUME_AFTER'], 'checkpoint')
        broken = worker();broken['Mounts'][0]['RW'] = False
        with self.assertRaises(ValueError):job.configuration(broken, worker())
        broken = worker();broken['NetworkSettings']['Networks'] = {'other': {}}
        with self.assertRaises(ValueError):job.configuration(broken, worker())
        broken = worker();broken['Config']['Env'].append('FANTASY_HEAVY_JOB_LOCK_PATH=/tmp/unshared.lock')
        with self.assertRaises(ValueError):job.configuration(broken, worker())


if __name__ == '__main__':unittest.main()
