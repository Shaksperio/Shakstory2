#!/usr/bin/env python3
"""Controlled real-engine QA. EICAR is a harmless antivirus test string."""
import base64
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EICAR = b'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'


def scan(data, name, expected):
    result = subprocess.run(
        [sys.executable, str(ROOT / 'scripts/kicomav_worker.py')],
        input=json.dumps({'filename': name, 'base64': base64.b64encode(data).decode()}),
        text=True, capture_output=True, timeout=20, cwd=ROOT,
    )
    assert result.returncode == 0, result.stderr[-2000:]
    payload = json.loads(result.stdout)
    assert payload['status'] == expected, payload
    if expected != 'error':
        assert payload['sha256'] == hashlib.sha256(data).hexdigest(), payload
        assert payload['signatureCount'] > 0, payload
        assert payload['engineVersion'], payload
    if expected == 'infected':
        assert payload.get('malwareName'), payload
    print(f'{name}: {expected}; signatures={payload.get("signatureCount", 0)}')


scan('Um manuscrito de teste sem ameaças.'.encode(), 'qa-clean.txt', 'clean')
scan(EICAR, 'qa-eicar.com', 'infected')
archive = io.BytesIO()
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as zipped:
    zipped.writestr('eicar.com', EICAR)
scan(archive.getvalue(), 'qa-eicar.zip', 'infected')
large = io.BytesIO()
with zipfile.ZipFile(large, 'w', zipfile.ZIP_DEFLATED) as zipped:
    zipped.writestr('expanded.txt', b'x' * (1024 * 1024))
scan(large.getvalue(), 'qa-expansion-limit.zip', 'error')
many = io.BytesIO()
with zipfile.ZipFile(many, 'w') as zipped:
    for index in range(129):
        zipped.writestr(f'{index}.txt', b'qa')
scan(many.getvalue(), 'qa-entry-limit.zip', 'error')
scan(b'PK\x03\x04invalid', 'qa-broken.zip', 'error')
scan(b'', 'qa-empty.txt', 'error')
scan(b'x' * (8 * 1024 * 1024 + 1), 'qa-too-large.txt', 'error')
