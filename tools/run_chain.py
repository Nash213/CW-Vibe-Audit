"""Chain driver: send one chain's requests to the agent, one round at a time (plan Jarred-5).

Usage:
    python tools/run_chain.py <app> <chain> --agent real|stub [--suffix -rep]
                              [--raw DIR] [--backend NAME] [--settings FILE]

    <app>    folder under apps/, its own git repository with tag `baseline`
    <chain>  the order of requests, e.g. DCBA; each letter uses prompts/<app>/<letter>.md
    --suffix appended to the chain id for the repeat run (DCBA + -rep = DCBA-rep)

In this order:
  1. Verify prompts/MANIFEST.sha256 and refuse to run on any mismatch, or if a prompt the
     chain needs is not in it. Checked again before every request.
  2. Refuse to start if apps/<app> has uncommitted changes. The one exception is the
     leftover of this driver's own crashed round (round.json says running/failed and HEAD
     is still the round's start); it is discarded and the round runs again as attempt n+1.
  3. Check out branch chain-<id> with -B from the last finished round's tag, or from
     `baseline` if none: a fresh run starts clean, a re-run resumes.
  4. For each request not yet tagged: run the agent on apps/<app> with the app's prompt,
     commit everything with a neutral message (round-<k>, --allow-empty, since "no change"
     is a real outcome), tag <id>-r<k>, and write round.json beside the agent's
     agent.json and transcript.jsonl in <raw>/<app>/<id>/r<k>/.
  5. Print one summary line per round.

A round whose agent exits 0 (done or step cap) or 2 (blocked by the content filter) is an
outcome and is committed. Any other exit is a technical failure: the driver stops without
committing, and the next run retries that round from the same tag. Earlier attempts'
logs are kept in r<k>/attempt-<n>/.

The real agent is agent/agent_runner.py and needs its requirements, so run real chains as
    uv run --no-project --with-requirements agent/requirements.txt python tools/run_chain.py ...
The stub (agent/stub_agent.py) needs only the standard library.

g0 is the pilot app: its raw output defaults to results/pilot/raw (meta/g0/README.md).
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENTS = {"real": ROOT / "agent" / "agent_runner.py", "stub": ROOT / "agent" / "stub_agent.py"}
GIT_ID = ["-c", "user.name=vibe-audit", "-c", "user.email=chain@vibe-audit.invalid",
          "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false"]
OUTCOME_EXITS = (0, 2)


class Refuse(Exception):
    """A precondition failed; nothing was changed."""


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


# --- prompts manifest ---------------------------------------------------------


def read_manifest(path: Path) -> dict[str, str]:
    """`sha256sum` lines: '<hash>  <path>' or '<hash> *<path>'; '#' lines are comments."""
    entries: dict[str, str] = {}
    if not path.is_file():
        raise Refuse(f"no prompt manifest at {path}")
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.fullmatch(r"([0-9a-fA-F]{64}) [ *](.+)", line)
        if not m:
            raise Refuse(f"{path.name} line {n} is not '<sha256>  <path>': {line[:60]!r}")
        entries[m.group(2).strip().lstrip("./")] = m.group(1).lower()
    return entries


def verify_manifest(manifest: Path, needed: list[str], root: Path = ROOT) -> None:
    """Every listed file must hash to its entry, and every needed prompt must be listed.
    Paths in the manifest are relative to the project root."""
    entries = read_manifest(manifest)
    if not entries:
        raise Refuse(f"{manifest.name} lists no prompts: freeze them first (plan Jarred-4)")
    for rel, want in sorted(entries.items()):
        f = root / rel
        if not f.is_file():
            raise Refuse(f"prompt manifest mismatch: {rel} is listed but missing")
        got = hashlib.sha256(f.read_bytes()).hexdigest()
        if got != want:
            raise Refuse(f"prompt manifest mismatch: {rel} has sha256 {got[:12]}..., "
                         f"manifest says {want[:12]}...")
    missing = [n for n in needed if n not in entries]
    if missing:
        raise Refuse(f"not in {manifest.name} (not frozen): {', '.join(missing)}")


# --- git helpers ----------------------------------------------------------------


def git(repo: Path, *args: str, check: bool = True) -> str:
    r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {r.stderr.strip()}")
    return r.stdout.strip()


def tag_commit(repo: Path, tag: str) -> str | None:
    r = subprocess.run(["git", "-C", str(repo), "rev-parse", "-q", "--verify", f"refs/tags/{tag}^{{commit}}"],
                       capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else None


def dirty(repo: Path) -> list[str]:
    out = git(repo, "status", "--porcelain", "--untracked-files=all")
    return [line for line in out.splitlines() if line.strip()]


# --- round state ----------------------------------------------------------------


def round_tag(chain_id: str, k: int) -> str:
    return f"{chain_id}-r{k}"


def finished_rounds(repo: Path, chain_id: str, n: int) -> int:
    """Number of leading rounds whose tag exists. A gap (r3 without r2) is refused."""
    present = [tag_commit(repo, round_tag(chain_id, k)) is not None for k in range(1, n + 1)]
    done = 0
    while done < n and present[done]:
        done += 1
    if any(present[done:]):
        later = [round_tag(chain_id, k + 1) for k in range(done, n) if present[k]]
        raise Refuse(f"tags out of order: {', '.join(later)} exist but {round_tag(chain_id, done + 1)} "
                     "does not; fix the tags by hand")
    return done


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def archive_attempt(out: Path, attempt: int) -> None:
    """Move a previous attempt's logs into r<k>/attempt-<n>/ so nothing is lost."""
    names = ["agent.json", "transcript.jsonl", "round.json", "agent.stdout.log"]
    present = [n for n in names if (out / n).exists()]
    if not present:
        return
    dest = out / f"attempt-{attempt}"
    dest.mkdir(parents=True, exist_ok=True)
    for n in present:
        (out / n).replace(dest / n)


# --- the driver -----------------------------------------------------------------


def run_chain(app: str, chain: str, agent: str, *, suffix: str = "", raw: Path | None = None,
              apps_dir: Path | None = None, manifest: Path | None = None,
              agent_args: list[str] | None = None, python: str = sys.executable,
              root: Path = ROOT) -> int:
    if not re.fullmatch(r"[ABCD]{1,4}", chain) or len(set(chain)) != len(chain):
        raise Refuse(f"chain must be distinct letters from ABCD, e.g. DCBA (got {chain!r})")
    if suffix and not re.fullmatch(r"-[A-Za-z0-9]+", suffix):
        raise Refuse(f"suffix must look like -rep (got {suffix!r})")
    if agent not in AGENTS:
        raise Refuse(f"--agent must be real or stub (got {agent!r})")
    chain_id = chain + suffix
    apps_dir = apps_dir or root / "apps"
    manifest = manifest or root / "prompts" / "MANIFEST.sha256"
    if raw is None:
        raw = root / "results" / ("pilot/raw" if app == "g0" else "raw")
    repo = apps_dir / app
    prompts = [f"prompts/{app}/{letter}.md" for letter in chain]
    n = len(chain)

    # 1. prompts
    verify_manifest(manifest, prompts, root)

    # 2. app repo state
    if not (repo / ".git").exists():
        raise Refuse(f"{repo} is not a git repository")
    base = tag_commit(repo, "baseline")
    if base is None:
        raise Refuse(f"{app} has no tag 'baseline'")
    done = finished_rounds(repo, chain_id, n)
    if done == n:
        print(f"{app}/{chain_id}: all {n} rounds already tagged, nothing to do")
        return 0
    start_ref = round_tag(chain_id, done) if done else "baseline"
    start_commit = tag_commit(repo, start_ref)
    branch = f"chain-{chain_id}"

    changes = dirty(repo)
    if changes:
        nxt = raw / app / chain_id / f"r{done + 1}" / "round.json"
        state = read_json(nxt)
        head = git(repo, "rev-parse", "HEAD")
        on_branch = git(repo, "branch", "--show-current", check=False) == branch
        if state.get("status") in ("running", "failed") and on_branch and head == start_commit:
            print(f"{app}/{chain_id}: discarding {len(changes)} uncommitted change(s) left by "
                  f"crashed attempt {state.get('attempt')} of round {done + 1}")
            git(repo, "reset", "-q", "--hard", "HEAD")
            git(repo, "clean", "-q", "-fd")
        else:
            raise Refuse(f"{app} has uncommitted changes ({len(changes)}); commit or remove "
                         f"them first:\n  " + "\n  ".join(changes[:10]))

    # 3. branch
    git(repo, "checkout", "-q", "-B", branch, start_ref)
    print(f"{app}/{chain_id}: on {branch} from {start_ref}"
          + (f" (resuming at round {done + 1})" if done else ""))

    # 4. rounds
    for k in range(done + 1, n + 1):
        letter = chain[k - 1]
        verify_manifest(manifest, prompts, root)
        out = raw / app / chain_id / f"r{k}"
        prev = read_json(out / "round.json")
        attempt = int(prev.get("attempt", 0)) + 1 if prev else 1
        if prev:
            archive_attempt(out, attempt - 1)
        out.mkdir(parents=True, exist_ok=True)
        state = {"app": app, "chain": chain_id, "round": k, "request": letter,
                 "prompt": prompts[k - 1], "agent": agent, "attempt": attempt,
                 "status": "running", "start_ref": start_ref, "started_at": now()}
        write_json(out / "round.json", state)

        cmd = [python, str(AGENTS[agent]), str(repo), prompts[k - 1], str(out),
               "--request", letter, *(agent_args or [])]
        t0 = time.monotonic()
        with open(out / "agent.stdout.log", "w", encoding="utf-8") as log:
            rc = subprocess.run(cmd, cwd=root, stdout=log, stderr=subprocess.STDOUT).returncode
        wall = round(time.monotonic() - t0, 1)
        meta = read_json(out / "agent.json")
        state.update({"agent_exit": rc, "wall_s": wall, "ended_at": now(),
                      "model": meta.get("model"), "model_served": meta.get("model_served"),
                      "ended_by": meta.get("ended_by"), "steps": meta.get("steps"),
                      "tokens_in": meta.get("tokens_in"), "tokens_out": meta.get("tokens_out")})

        if rc not in OUTCOME_EXITS:
            state.update(status="failed", error=meta.get("error") or f"agent exited {rc}")
            write_json(out / "round.json", state)
            print(f"{app}/{chain_id} r{k} {letter}: FAILED (exit {rc}, attempt {attempt}): "
                  f"{state['error']}. Nothing committed; re-run the same command to retry "
                  f"from {start_ref}. See {out / 'agent.stdout.log'}")
            return 1

        git(repo, "add", "-A")
        changed = len(dirty(repo))
        git(repo, *GIT_ID, "commit", "-q", "--allow-empty", "--no-verify", "-m", f"round-{k}")
        tag = round_tag(chain_id, k)
        git(repo, *GIT_ID, "tag", tag)
        commit = git(repo, "rev-parse", "HEAD")
        state.update(status="done", commit=commit, tag=tag, files_changed=changed)
        write_json(out / "round.json", state)
        print(f"{app}/{chain_id} r{k} {letter}: {meta.get('ended_by')} steps={meta.get('steps')} "
              f"in={meta.get('tokens_in')} out={meta.get('tokens_out')} files={changed} "
              f"{wall}s attempt={attempt} -> {tag} {commit[:7]}")
        start_ref = tag

    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("app")
    p.add_argument("chain")
    p.add_argument("--agent", required=True, choices=sorted(AGENTS))
    p.add_argument("--suffix", default="")
    p.add_argument("--raw", type=Path, help="raw results root (default results/raw; g0: results/pilot/raw)")
    p.add_argument("--backend", help="passed to the real agent")
    p.add_argument("--settings", type=Path, help="passed to the real agent")
    a = p.parse_args(argv)

    extra: list[str] = []
    if a.backend:
        extra += ["--backend", a.backend]
    if a.settings:
        extra += ["--settings", str(a.settings)]
    try:
        return run_chain(a.app, a.chain, a.agent, suffix=a.suffix,
                         raw=a.raw.resolve() if a.raw else None, agent_args=extra)
    except Refuse as e:
        print(f"refused: {e}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
