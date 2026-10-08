#!/usr/bin/env python3
"""Single-request KicomAV worker for Shakstory.

The Node gateway starts one short-lived process per scan. The worker never
accepts a filesystem path from the caller; it receives bounded bytes over stdin.
"""
import base64
import contextlib
import hashlib
import io
import json
import os
import sys
import zipfile

MAX_BYTES = 8 * 1024 * 1024


def scan_bounded(scanner, raw, filename, budget, depth=0):
    """Inspect ZIP members in memory without accepting or extracting paths."""
    if raw.startswith((b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")):
        if depth >= 3:
            raise ValueError("Arquivo compactado excede o limite de recursão.")
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            entries = archive.infolist()
            budget[1] += len(entries)
            if budget[1] > 128:
                raise ValueError("Arquivo compactado contém entradas demais.")
            for entry in entries:
                if entry.is_dir():
                    continue
                if entry.flag_bits & 1:
                    raise ValueError("Arquivo compactado protegido por senha não pode ser verificado.")
                if entry.file_size > MAX_BYTES or entry.file_size > 200 * max(1, entry.compress_size):
                    raise ValueError("Arquivo compactado excede os limites de expansão.")
                budget[0] += entry.file_size
                if budget[0] > MAX_BYTES:
                    raise ValueError("Arquivo compactado excede o limite de conteúdo expandido.")
                with archive.open(entry) as source:
                    data = source.read(MAX_BYTES + 1)
                if len(data) != entry.file_size or len(data) > MAX_BYTES:
                    raise ValueError("Tamanho expandido inválido.")
                result = scan_bounded(scanner, data, entry.filename, budget, depth + 1)
                if getattr(result.status, "value", result.status) != "clean":
                    return result
    return scanner.scan_stream(raw, filename)


def emit(payload):
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def main():
    try:
        payload = sys.stdin.read(12 * 1024 * 1024 + 1)
        if len(payload) > 12 * 1024 * 1024:
            emit({"status": "error", "detail": "Pedido acima do limite."})
            return 0
        request = json.loads(payload)
        raw = base64.b64decode(request.get("base64", ""), validate=True)
        if not raw or len(raw) > MAX_BYTES:
            emit({"status": "error", "detail": "Arquivo vazio ou acima do limite.", "sha256": hashlib.sha256(raw).hexdigest()})
            return 0

        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "vendor"))
        from kicomav.daemon.scanner import get_scanner

        scanner = get_scanner()
        with contextlib.redirect_stdout(sys.stderr):
            initialized = scanner.initialize()
        if not initialized:
            emit({"status": "error", "detail": "KicomAV não pôde inicializar.", "sha256": hashlib.sha256(raw).hexdigest()})
            return 0

        try:
            with contextlib.redirect_stdout(sys.stderr):
                result = scan_bounded(scanner, raw, request.get("filename") or "upload", [0, 0])
                version = scanner.get_version()
        finally:
            with contextlib.redirect_stdout(sys.stderr):
                scanner.shutdown()
        status = getattr(result.status, "value", str(result.status)).lower()
        emit({
            "status": status if status in {"clean", "infected", "error"} else "error",
            "malwareName": result.malware_name,
            "sha256": hashlib.sha256(raw).hexdigest(),
            "detail": getattr(result, "error_message", None),
            "signatureCount": version.signatures,
            "engineVersion": version.version,
        })
        return 0
    except Exception as exc:
        emit({"status": "error", "detail": f"Falha no worker KicomAV: {exc}"})
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
