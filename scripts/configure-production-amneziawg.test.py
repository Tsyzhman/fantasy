#!/usr/bin/env python3
"""@spec spec://common/INFRA-006-continuous-deployment#runtime"""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name('configure-production-amneziawg.sh').read_text(encoding='utf-8')
VALIDATOR = 'validate_config() {' + SCRIPT.split('validate_config() {', 1)[1].split('\nprobe_vpn_namespace()', 1)[0]
PLAIN = '''[Interface]
PrivateKey = fixture-private-key
Address = 10.66.0.2/32
DNS = 1.1.1.1
[Peer]
PublicKey = fixture-public-key
PresharedKey = fixture-preshared-key
Endpoint = 192.0.2.1:51820
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
'''
OBFUSCATION = '\n'.join(f'{key} = {value}' for key, value in {
    'Jc': 3, 'Jmin': 50, 'Jmax': 1000, 'S1': 0, 'S2': 0, 'S3': 0, 'S4': 0,
    'H1': 1, 'H2': 2, 'H3': 3, 'H4': 4,
}.items()) + '\n'


class ConfigurationValidation(unittest.TestCase):
    def validate(self, content):
        bash = shutil.which('bash')
        if os.name == 'nt' and Path('C:/Program Files/Git/bin/bash.exe').is_file():
            bash = 'C:/Program Files/Git/bin/bash.exe'
        self.assertIsNotNone(bash, 'Bash is required to exercise the actual production validator')
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'profile.conf'
            path.write_text(content, encoding='utf-8')
            argument = path.as_posix()
            if os.name == 'nt':
                argument = '/' + argument[0].lower() + argument[2:]
            return subprocess.run([bash, '-c', VALIDATOR + '\nvalidate_config "$1"', 'bash', argument],
                                  capture_output=True, text=True).returncode

    def test_plain_wireguard_profile(self):
        self.assertEqual(self.validate(PLAIN), 0)

    def test_complete_amnezia_profile(self):
        self.assertEqual(self.validate(PLAIN.replace('[Interface]\n', '[Interface]\n' + OBFUSCATION)), 0)

    def test_partial_amnezia_profile_is_rejected(self):
        self.assertNotEqual(self.validate(PLAIN.replace('[Interface]\n', '[Interface]\nJc = 3\n')), 0)

    def test_command_hooks_are_rejected(self):
        self.assertNotEqual(self.validate(PLAIN.replace('[Interface]\n', '[Interface]\nPostUp = echo unsafe\n')), 0)

    def test_required_identity_and_default_route_are_preserved(self):
        for content in [PLAIN.replace('PrivateKey = fixture-private-key\n', ''),
                        PLAIN.replace('0.0.0.0/0, ::/0', '10.0.0.0/8')]:
            with self.subTest(content=content):
                self.assertNotEqual(self.validate(content), 0)


if __name__ == '__main__':
    unittest.main()
