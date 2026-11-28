"""Build each study app as its own git repository with tag `baseline` (plan Jarred-1, Jarred-3).

    python tools/init_app_repos.py [g2 g3 g4 ...] [--dry-run]

For every id in meta/apps.json (or only the ids given), from the tracked source folder:

  1. Copy the source into apps/<id>/ (no node_modules, no .git) and commit it as `import`.
  2. baseline-fix: replace the app's .gitignore with `node_modules/` only. The plan forbids
     ignoring the app's own .env and config files: hard-coded secrets in them are what
     Gitleaks must find, in the baseline and in every round the agent commits.
  3. baseline-fix: if the app has no package-lock.json, generate one once
     (npm install --package-lock-only --ignore-scripts), so every Docker build of every
     round resolves the same dependency versions.
  4. Tag `baseline`.

apps/<id>/ is git-ignored by this repo. The seeded B bug is already in the tracked source
(commit 897ec49), so it is part of `import`; meta/<id>/BUG.md says what it is, and nothing
about it goes into the app repo. Commit messages are neutral, because the agent can read
git log.

An app that already has tag `baseline` is left alone, so the script is safe to re-run.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GIT_ID = ["-c", "user.name=vibe-audit", "-c", "user.email=chain@vibe-audit.invalid",
          "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", "-c", "core.autocrlf=false"]
IGNORE = shutil.ignore_patterns("node_modules", ".git")


def git(repo: Path, *args: str) -> str:
    r = subprocess.run(["git", "-C", str(repo), *GIT_ID, *args], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} in {repo.name} failed: {r.stderr.strip()}")
    return r.stdout.strip()


def has_tag(repo: Path, tag: str) -> bool:
    if not (repo / ".git").exists():
        return False
    r = subprocess.run(["git", "-C", str(repo), "rev-parse", "-q", "--verify", f"refs/tags/{tag}"],
                       capture_output=True, text=True)
    return r.returncode == 0


def commit(repo: Path, message: str) -> str:
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "--no-verify", "-m", message)
    return git(repo, "rev-parse", "--short", "HEAD")


def build(app: str, src: Path, apps_dir: Path, dry_run: bool) -> None:
    repo = apps_dir / app
    if has_tag(repo, "baseline"):
        print(f"{app}: already has tag baseline ({git(repo, 'rev-parse', '--short', 'baseline')}), left alone")
        return
    if repo.exists():
        raise SystemExit(f"{app}: {repo} exists but has no tag baseline; inspect it and remove it by hand")
    if not src.is_dir():
        raise SystemExit(f"{app}: source folder {src} not found")
    if dry_run:
        lock = "has" if (src / "package-lock.json").exists() else "needs"
        print(f"{app}: would build {repo} from {src} ({lock} a package-lock.json)")
        return

    shutil.copytree(src, repo, ignore=IGNORE)
    git(repo, "init", "-q", "-b", "main")
    steps = [f"import {commit(repo, 'import')}"]

    (repo / ".gitignore").write_text("node_modules/\n", encoding="utf-8")
    steps.append(f"gitignore {commit(repo, 'baseline-fix: gitignore')}")

    if not (repo / "package-lock.json").exists():
        npm = shutil.which("npm") or shutil.which("npm.cmd")
        if npm is None:
            raise SystemExit(f"{app}: npm not found; it is needed once to write package-lock.json")
        subprocess.run([npm, "install", "--package-lock-only", "--ignore-scripts", "--no-audit",
                        "--no-fund"], cwd=repo, check=True)
        steps.append(f"lockfile {commit(repo, 'baseline-fix: lockfile')}")

    git(repo, "tag", "baseline")
    print(f"{app}: {repo.relative_to(ROOT) if repo.is_relative_to(ROOT) else repo} "
          f"baseline = {git(repo, 'rev-parse', '--short', 'baseline')} ({', '.join(steps)})")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("apps", nargs="*", help="ids from meta/apps.json (default: all)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--apps-dir", type=Path, default=ROOT / "apps")
    a = ap.parse_args(argv)

    table = {k: v for k, v in json.loads((ROOT / "meta" / "apps.json").read_text(encoding="utf-8")).items()
             if not k.startswith("_")}
    wanted = a.apps or sorted(table)
    unknown = [x for x in wanted if x not in table]
    if unknown:
        raise SystemExit(f"not in meta/apps.json: {', '.join(unknown)}")
    for app in wanted:
        build(app, ROOT / table[app], a.apps_dir.resolve(), a.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
