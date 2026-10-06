#!/usr/bin/env python3
"""Single-request KicomAV worker for Shakstory.

The Node gateway starts one short-lived process per scan. The worker never
accepts a filesystem path from the caller; it receives bounded bytes over stdin.
"""
import base64
import hashlib
import json
import os
import sys

MAX_BYTES = 8 * 1024 * 1024


def emit(payload):
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def main():
    try:
        request = json.loads(sys.stdin.read())
        raw = base64.b64decode(request.get("base64", ""), validate=True)
        if not raw or len(raw) > MAX_BYTES:
            emit({"status": "error", "detail": "Arquivo vazio ou acima do limite.", "sha256": hashlib.sha256(raw).hexdigest()})
            return 0

        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "vendor"))
        from kicomav.daemon.scanner import get_scanner

        scanner = get_scanner()
        if not scanner.initialize():
            emit({"status": "error", "detail": "KicomAV não pôde inicializar.", "sha256": hashlib.sha256(raw).hexdigest()})
            return 0

        result = scanner.scan_stream(raw, request.get("filename") or "upload")
        status = getattr(result.status, "value", str(result.status)).lower()
        emit({
            "status": status if status in {"clean", "infected", "error"} else "error",
            "malwareName": result.malware_name,
            "sha256": result.sha256 or hashlib.sha256(raw).hexdigest(),
            "detail": getattr(result, "error_message", None),
        })
        scanner.shutdown()
        return 0
    except Exception as exc:
        emit({"status": "error", "detail": f"Falha no worker KicomAV: {exc}"})
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
