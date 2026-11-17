"""Assess one checkpoint: clone, scan, boot and test (plan guide B.6).

  1. Throw-away clone of apps/<app> at the round's tag (r0 = `baseline`,
     r<k> = `<chain>-r<k>`) under work/; record the commit.
  2. Scanners (tools/scan.py) into results/raw/<app>/<chain>/r<k>/.
  3. Compose lint, boot, Playwright and teardown: tools/boot_and_test.sh (Faris),
     with LINT_CMD pointing at Nazrul's compose check.
  4. Delete the clone.

Resumable: a checkpoint whose `stage` file says done is skipped.
`--src DIR` copies a plain folder instead of cloning a tag (development runs only),
and `--scan-only` skips step 3.

Usage:
  python tools/assess.py <app> <chain> <round> [--raw results/raw] [--src DIR] [--scan-only]
"""

from __future__ import annotations

import argparse
import os
import shutil
import stat
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from scan import scan  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
IGNORE = shutil.ignore_patterns("node_modules", ".git")


def tag_for(chain: str, rnd: int) -> str:
    return "baseline" if rnd == 0 else f"{chain}-r{rnd}"


def _rm_tree(path: Path) -> None:
    def onerror(func, p, _exc):  # read-only files in .git on Windows
        os.chmod(p, stat.S_IWRITE)
        func(p)

    if path.exists():
        shutil.rmtree(path, onerror=onerror)


def prepare(app: str, chain: str, rnd: int, work: Path, src: Path | None) -> str:
    _rm_tree(work)
    work.parent.mkdir(parents=True, exist_ok=True)
    if src is not None:
        shutil.copytree(src, work, ignore=IGNORE)
        return ""
    repo = ROOT / "apps" / app
    if not (repo / ".git").exists():
        raise SystemExit(f"apps/{app} is not a git repository (needs tag {tag_for(chain, rnd)})")
    subprocess.run(["git", "clone", "-q", "--branch", tag_for(chain, rnd), str(repo), str(work)],
                   check=True)
    return subprocess.run(["git", "-C", str(work), "rev-parse", "HEAD"], check=True,
                          capture_output=True, text=True).stdout.strip()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("app")
    ap.add_argument("chain")
    ap.add_argument("round", type=int)
    ap.add_argument("--raw", type=Path, default=ROOT / "results" / "raw")
    ap.add_argument("--src", type=Path, help="copy this folder instead of cloning a tag (dev only)")
    ap.add_argument("--scan-only", action="store_true")
    args = ap.parse_args(argv)

    out = args.raw / args.app / args.chain / f"r{args.round}"
    if (out / "stage").exists() and (out / "stage").read_text(encoding="utf-8").strip() == "done":
        print(f"{args.app}/{args.chain}/r{args.round}: already done, skipping")
        return 0

    work = ROOT / "work" / f"{args.app}-{args.chain}-r{args.round}"
    t0 = time.monotonic()
    try:
        commit = prepare(args.app, args.chain, args.round, work, args.src)
        out.mkdir(parents=True, exist_ok=True)
        if commit:
            (out / "commit").write_text(commit + "\n", encoding="utf-8")
        scan(work, out)
        t_scan = time.monotonic() - t0
        if not args.scan_only:
            env = dict(os.environ, RAW_ROOT=str(args.raw.resolve()))
            env.setdefault("LINT_CMD", str(ROOT / "tools" / "compose_check.py"))
            subprocess.run(["bash", str(ROOT / "tools" / "boot_and_test.sh"), args.app,
                            args.chain, str(args.round), str(work)], env=env, check=False)
        print(f"{args.app}/{args.chain}/r{args.round}: scan {t_scan:.0f}s, "
              f"total {time.monotonic() - t0:.0f}s")
    finally:
        _rm_tree(work)
    return 0


if __name__ == "__main__":
    sys.exit(main())
