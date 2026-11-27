"""Stub agent: the real runner's command line and output files, with no model and no API.

Usage (same as agent/agent_runner.py):
    python agent/stub_agent.py <repo> <request_file> <log_dir> [--request A|B|C|D|BUILD]
                               [--settings FILE] [--backend NAME]

It makes one harmless, deterministic edit: it appends a comment naming the request to
the first source file in sorted order (.js/.ts/.css/.html/...), or creates STUB_NOTES.md
when the repo has no source file. Then it writes the same transcript.jsonl and agent.json
as the real runner, with model "stub" and zero tokens, so the chain driver, assessment and
ingest can be tested without spending quota (plan Jarred-5). Standard library only.

For testing the driver, VIBE_STUB_MODE changes what it does:
    edit (default)  the edit above
    noop            change nothing (a request that leaves no diff)
    fail            exit 1 like an API failure, after touching a file (a crashed round)
    slow            the edit, then sleep VIBE_STUB_SLEEP seconds (default 30), to be killed

Exit code: 0 done, 1 error (same meaning as the real runner).
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import sys
import time
from pathlib import Path

COMMENT = {
    ".js": "// {}", ".jsx": "// {}", ".mjs": "// {}", ".cjs": "// {}",
    ".ts": "// {}", ".tsx": "// {}",
    ".css": "/* {} */", ".scss": "/* {} */",
    ".html": "<!-- {} -->",
    ".py": "# {}",
}
SKIP_DIRS = {".git", "node_modules", "dist", "build", ".next", "coverage"}


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def pick_file(repo: Path) -> Path | None:
    found = []
    for dirpath, dirnames, filenames in os.walk(repo):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for name in filenames:
            p = Path(dirpath) / name
            if p.suffix in COMMENT:
                found.append(p)
    return min(found, key=lambda p: p.relative_to(repo).as_posix()) if found else None


def make_edit(repo: Path, request: str) -> str:
    target = pick_file(repo)
    text = f"stub edit for request {request}"
    if target is None:
        target = repo / "STUB_NOTES.md"
        with open(target, "a", encoding="utf-8", newline="\n") as f:
            f.write(text + "\n")
    else:
        old = target.read_bytes()
        sep = b"" if old.endswith(b"\n") or not old else b"\n"
        line = COMMENT[target.suffix].format(text)
        target.write_bytes(old + sep + line.encode("utf-8") + b"\n")
    return target.relative_to(repo).as_posix()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("repo", type=Path)
    p.add_argument("request_file", type=Path)
    p.add_argument("log_dir", type=Path)
    p.add_argument("--request")
    p.add_argument("--settings", type=Path)  # accepted for CLI compatibility, unused
    p.add_argument("--backend")  # accepted for CLI compatibility, unused
    a = p.parse_args(argv)
    if not a.repo.is_dir():
        p.error(f"repo is not a folder: {a.repo}")

    mode = os.environ.get("VIBE_STUB_MODE", "edit")
    request_text = a.request_file.read_text(encoding="utf-8")
    request = a.request or a.request_file.stem
    a.log_dir.mkdir(parents=True, exist_ok=True)
    started = now()
    events = [{"t": started, "event": "start", "model": "stub", "backend": "stub",
               "repo": a.repo.name, "request": request}]

    edited = None
    error = None
    if mode == "fail":
        make_edit(a.repo, request)  # leaves the tree dirty, like a crash mid-round
        error = "stub failure (VIBE_STUB_MODE=fail)"
    elif mode != "noop":
        edited = make_edit(a.repo, request)
        events.append({"t": now(), "event": "tool_call", "step": 1, "name": "write_file",
                       "args": {"path": edited}, "ok": True})
        if mode == "slow":
            time.sleep(float(os.environ.get("VIBE_STUB_SLEEP", "30")))

    ended_by = "error" if error else "done"
    events.append({"t": now(), "event": "end", "ended_by": ended_by, "error": error})
    with open(a.log_dir / "transcript.jsonl", "w", encoding="utf-8") as f:
        for e in events:
            f.write(json.dumps(e) + "\n")

    meta = {
        "request": request,
        "request_file": a.request_file.as_posix(),
        "request_sha256": hashlib.sha256(request_text.encode("utf-8")).hexdigest(),
        "model": "stub",
        "model_served": "stub",
        "backend": "stub",
        "settings": {},
        "sdk": {},
        "started_at": started,
        "steps": 0 if error else 1,
        "tool_calls": 1 if edited else 0,
        "tool_errors": 0,
        "retries": 0,
        "tokens_in": 0,
        "tokens_out": 0,
        "tokens_thoughts": 0,
        "ended_by": ended_by,
        "finish_reason": None if error else "stop",
        "error": error,
        "final_text": None if error else (f"Stub: edited {edited}." if edited else "Stub: no change."),
        "ended_at": now(),
    }
    with open(a.log_dir / "agent.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
        f.write("\n")
    print(f"{ended_by}: steps={meta['steps']} tool_calls={meta['tool_calls']} tokens_in=0 tokens_out=0"
          + (f" error={error}" if error else ""))
    return 1 if error else 0


if __name__ == "__main__":
    sys.exit(main())
