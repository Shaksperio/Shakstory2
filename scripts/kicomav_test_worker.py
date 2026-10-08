#!/usr/bin/env python3
import json
import sys
import time
import os

request = json.loads(sys.stdin.read())
filename = request.get("filename", "")
if filename == "qa-timeout.bin":
    time.sleep(5)
elif filename == "qa-environment.bin":
    print(json.dumps({"status": "error" if os.environ.get("JWT_SECRET") or os.environ.get("GITHUB_TOKEN") else "clean"}))
elif filename == "qa-infected.bin":
    print(json.dumps({"status": "infected", "malwareName": "QA-Controlled-Detection", "sha256": "qa-infected"}))
elif filename == "qa-invalid.json":
    print("not-json")
elif filename == "qa-error.bin":
    print(json.dumps({"status": "error", "detail": "worker QA failure"}))
else:
    print(json.dumps({"status": "clean", "sha256": "qa-clean"}))
