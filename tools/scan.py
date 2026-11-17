"""Scan one checkout with the three scanners (plan guide B.6, Wuth's part).

Every scanner runs in a pinned Docker image, so the batch host needs only Docker
(native Semgrep/Gitleaks binaries are also blocked by Windows Application Control
on the dev machine). Output, in <out>/ (see docs/DECISIONS.md, 2026-11-17):

  semgrep.json        Semgrep JSON, vendored rules in rules/, metrics off
  semgrep.code.json   matched source lines per Semgrep result, read from the checkout
  gitleaks.json       Gitleaks JSON ("dir" mode: plain folder, .env and compose files included)
  npm-audit/<folder>.json   npm audit --json per folder with a package.json
  scan.log            one line per step: tool, exit code, seconds, note

A scanner that crashes is logged and the others still run. Finding something
(non-zero exit from Semgrep or npm audit) is not a failure.

Usage:
  python tools/scan.py <checkout> <out>
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from keys import semgrep_code  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RULES = ROOT / "rules"

# Pinned in docs/RUNINFO.md. Change only together with RUNINFO and a DECISIONS entry.
SEMGREP_IMAGE = "semgrep/semgrep:1.184.0@sha256:cc1b68266f267878b39739373ea9985b9a78e5d64497dd875c8de100b22695ed"
GITLEAKS_IMAGE = "ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f"
NODE_IMAGE = "node:20.20.2-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293"

SKIP_DIRS = {"node_modules", ".git", "dist", "build", ".next"}
NPM_LOCKS = ("package-lock.json", "npm-shrinkwrap.json")


class Log:
    def __init__(self, path: Path):
        self.path = path
        path.write_text("", encoding="utf-8")

    def write(self, tool: str, code: int | str, secs: float, note: str = "") -> None:
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(f"{tool}\texit={code}\t{secs:.1f}s\t{note}\n")


def _vol(host: Path, target: str, ro: bool = True) -> list[str]:
    return ["-v", f"{host.resolve()}:{target}{':ro' if ro else ''}"]


def _run(cmd: list[str], timeout: int, stdout=None) -> int:
    proc = subprocess.run(cmd, stdout=stdout or subprocess.DEVNULL,
                          stderr=subprocess.PIPE, timeout=timeout)
    if proc.returncode not in (0, 1) and proc.stderr:
        sys.stderr.write(proc.stderr.decode("utf-8", "replace")[-2000:])
    return proc.returncode


def run_semgrep(checkout: Path, out: Path, log: Log) -> None:
    t = time.monotonic()
    report = out / "semgrep.json"
    try:
        with report.open("wb") as fh:
            code = _run(
                ["docker", "run", "--rm", "--network", "none",
                 *_vol(checkout, "/src"), *_vol(RULES, "/rules"), "-w", "/src",
                 SEMGREP_IMAGE, "semgrep", "scan", "--metrics=off",
                 "--disable-version-check", "--config", "/rules", "--json", "--quiet", "."],
                timeout=1800, stdout=fh,
            )
        data = json.loads(report.read_text(encoding="utf-8"))
        (out / "semgrep.code.json").write_text(
            json.dumps(semgrep_code(data, checkout), indent=1), encoding="utf-8"
        )
        log.write("semgrep", code, time.monotonic() - t,
                  f"results={len(data.get('results', []))} errors={len(data.get('errors', []))}")
    except Exception as e:  # noqa: BLE001 - a scanner crash must not stop the run
        log.write("semgrep", "crash", time.monotonic() - t, repr(e)[:300])


def run_gitleaks(checkout: Path, out: Path, log: Log) -> None:
    t = time.monotonic()
    try:
        code = _run(
            ["docker", "run", "--rm", "--network", "none",
             *_vol(checkout, "/src"), *_vol(out, "/out", ro=False),
             GITLEAKS_IMAGE, "dir", "/src", "--report-format", "json",
             "--report-path", "/out/gitleaks.json", "--no-banner", "--exit-code", "0"],
            timeout=900,
        )
        data = json.loads((out / "gitleaks.json").read_text(encoding="utf-8") or "null")
        log.write("gitleaks", code, time.monotonic() - t, f"findings={len(data or [])}")
    except Exception as e:  # noqa: BLE001
        log.write("gitleaks", "crash", time.monotonic() - t, repr(e)[:300])


def package_folders(checkout: Path) -> list[Path]:
    found = []
    for p in sorted(checkout.rglob("package.json")):
        rel = p.relative_to(checkout)
        if not any(part in SKIP_DIRS for part in rel.parts[:-1]):
            found.append(p.parent)
    return found


def run_npm_audit(checkout: Path, out: Path, log: Log) -> None:
    npm_out = out / "npm-audit"
    npm_out.mkdir(exist_ok=True)
    for folder in package_folders(checkout):
        rel = folder.relative_to(checkout).as_posix()
        name = "root" if rel == "." else rel.replace("/", "__")
        t = time.monotonic()
        # Work on a copy: generating a lockfile must never touch the checkout.
        with tempfile.TemporaryDirectory(prefix="npm-audit-") as tmp:
            tmp_dir = Path(tmp)
            shutil.copy2(folder / "package.json", tmp_dir / "package.json")
            had_lock = False
            for lock in NPM_LOCKS:
                if (folder / lock).exists():
                    shutil.copy2(folder / lock, tmp_dir / lock)
                    had_lock = True
            # If the plain lockfile build fails on a peer-dependency conflict
            # (ERESOLVE), retry once with --legacy-peer-deps and say so in the log.
            lock = "npm install --package-lock-only --ignore-scripts --no-audit --no-fund"
            script = (
                "if [ ! -f package-lock.json ] && [ ! -f npm-shrinkwrap.json ]; then "
                f"{lock} >/dev/null 2>&1 || {{ {lock} --legacy-peer-deps >/dev/null 2>&1 "
                "&& touch .legacy-peer-deps; }; fi; npm audit --json; rc=$?; "
                "[ -f .legacy-peer-deps ] && echo legacy >&2; exit $rc"
            )
            try:
                with (npm_out / f"{name}.json").open("wb") as fh:
                    code = _run(["docker", "run", "--rm", *_vol(tmp_dir, "/app", ro=False),
                                 "-w", "/app", NODE_IMAGE, "sh", "-c", script],
                                timeout=900, stdout=fh)
                data = json.loads((npm_out / f"{name}.json").read_text(encoding="utf-8"))
                if not had_lock and (tmp_dir / ".legacy-peer-deps").exists():
                    lock_kind = "generated-legacy-peer-deps"
                else:
                    lock_kind = "own" if had_lock else "generated"
                note = (f"folder={rel} lock={lock_kind} "
                        f"vulns={len(data.get('vulnerabilities') or {})}")
                if "error" in data:
                    note += f" error={json.dumps(data['error'])[:200]}"
                log.write("npm-audit", code, time.monotonic() - t, note)
            except Exception as e:  # noqa: BLE001
                log.write("npm-audit", "crash", time.monotonic() - t, f"folder={rel} {e!r}"[:300])


def scan(checkout: Path, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    log = Log(out / "scan.log")
    run_semgrep(checkout, out, log)
    run_gitleaks(checkout, out, log)
    run_npm_audit(checkout, out, log)


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: scan.py <checkout> <out>", file=sys.stderr)
        return 2
    checkout, out = Path(argv[1]), Path(argv[2])
    if not checkout.is_dir():
        print(f"checkout not found: {checkout}", file=sys.stderr)
        return 2
    scan(checkout, out)
    print((out / "scan.log").read_text(encoding="utf-8"), end="")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
