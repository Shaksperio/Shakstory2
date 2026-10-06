#!/usr/bin/env python3
import json
import sys

request = json.loads(sys.stdin.read())
filename = request.get("filename", "")
if filename == "qa-infected.bin":
    print(json.dumps({"status": "infected", "malwareName": "QA-Controlled-Detection", "sha256": "qa-infected"}))
elif filename == "qa-invalid.json":
    print("not-json")
elif filename == "qa-error.bin":
    print(json.dumps({"status": "error", "detail": "worker QA failure"}))
else:
    print(json.dumps({"status": "clean", "sha256": "qa-clean"}))
