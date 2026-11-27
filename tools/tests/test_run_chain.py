"""Self-checks for the chain driver with the stub agent (plan Jarred-5, step 5).

Each test builds a throw-away project root: prompts/toy/{A..D}.md with a manifest and
apps/toy as its own git repository tagged `baseline`. No API is called.
"""

import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))

import run_chain as rc  # noqa: E402
from ingest import request_for  # noqa: E402


def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True,
                          text=True).stdout.strip()


def write_manifest(root, names=None):
    lines = []
    for f in sorted((root / "prompts").rglob("*.md")):
        rel = f.relative_to(root).as_posix()
        if names is None or rel in names:
            lines.append(f"{hashlib.sha256(f.read_bytes()).hexdigest()}  {rel}")
    (root / "prompts" / "MANIFEST.sha256").write_text("\n".join(lines) + "\n", encoding="utf-8")


@pytest.fixture
def root(tmp_path, monkeypatch):
    monkeypatch.delenv("VIBE_STUB_MODE", raising=False)
    p = tmp_path / "prompts" / "toy"
    p.mkdir(parents=True)
    for letter in "ABCD":
        (p / f"{letter}.md").write_text(f"Request {letter} for the toy app.\n", encoding="utf-8")
    write_manifest(tmp_path)
    repo = tmp_path / "apps" / "toy"
    repo.mkdir(parents=True)
    (repo / "server.js").write_text("console.log('toy');\n", encoding="utf-8")
    (repo / "README.md").write_text("toy\n", encoding="utf-8")
    (repo / ".gitignore").write_text("node_modules/\n", encoding="utf-8")
    git(repo, "init", "-q")
    git(repo, "add", ".")
    git(repo, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-qm", "init")
    git(repo, "tag", "baseline")
    return tmp_path


def run(root, chain="DCBA", **kw):
    return rc.run_chain("toy", chain, "stub", root=root, **kw)


def tags(root):
    return git(root / "apps" / "toy", "tag", "--list").split()


def round_json(root, chain, k):
    return json.loads((root / "results" / "raw" / "toy" / chain / f"r{k}" / "round.json")
                      .read_text(encoding="utf-8"))


# --- happy path ------------------------------------------------------------------


def test_full_chain_with_stub(root):
    assert run(root) == 0
    repo = root / "apps" / "toy"
    assert sorted(tags(root)) == ["DCBA-r1", "DCBA-r2", "DCBA-r3", "DCBA-r4", "baseline"]
    assert git(repo, "branch", "--show-current") == "chain-DCBA"
    assert git(repo, "log", "--format=%s", "baseline..HEAD").split("\n") == \
        ["round-4", "round-3", "round-2", "round-1"]
    for k, letter in enumerate("DCBA", 1):
        r = round_json(root, "DCBA", k)
        assert (r["status"], r["request"], r["attempt"], r["model"]) == ("done", letter, 1, "stub")
        assert r["commit"] == git(repo, "rev-parse", f"DCBA-r{k}")
        assert r["files_changed"] == 1
        agent = json.loads((root / "results/raw/toy/DCBA" / f"r{k}" / "agent.json").read_text())
        # the fields tools/ingest.py reads
        assert agent["request"] == letter == request_for("DCBA", k)
        assert agent["model"] == "stub" and agent["steps"] == 1
        assert agent["tokens_in"] == 0 and agent["tokens_out"] == 0
        assert (root / "results/raw/toy/DCBA" / f"r{k}" / "transcript.jsonl").is_file()
    # the stub appended one comment per round to the first source file
    assert (repo / "server.js").read_text().count("stub edit for request") == 4
    assert not git(repo, "status", "--porcelain")


def test_rerun_after_finish_does_nothing(root):
    assert run(root) == 0
    head = git(root / "apps" / "toy", "rev-parse", "HEAD")
    assert run(root) == 0
    assert git(root / "apps" / "toy", "rev-parse", "HEAD") == head


def test_no_change_round_still_committed_and_tagged(root, monkeypatch):
    monkeypatch.setenv("VIBE_STUB_MODE", "noop")
    assert run(root, "AB") == 0
    repo = root / "apps" / "toy"
    assert git(repo, "rev-parse", "AB-r1^{tree}") == git(repo, "rev-parse", "baseline^{tree}")
    assert git(repo, "rev-parse", "AB-r1") != git(repo, "rev-parse", "baseline")
    assert round_json(root, "AB", 1)["files_changed"] == 0


def test_repeat_suffix(root):
    assert run(root, suffix="-rep") == 0
    assert "DCBA-rep-r4" in tags(root)
    assert git(root / "apps" / "toy", "branch", "--show-current") == "chain-DCBA-rep"
    assert round_json(root, "DCBA-rep", 2)["request"] == "C"


def test_pilot_app_defaults_to_pilot_raw(root):
    (root / "apps" / "toy").rename(root / "apps" / "g0")
    (root / "prompts" / "toy").rename(root / "prompts" / "g0")
    write_manifest(root)
    assert rc.run_chain("g0", "A", "stub", root=root) == 0
    assert (root / "results" / "pilot" / "raw" / "g0" / "A" / "r1" / "agent.json").is_file()
    assert not (root / "results" / "raw").exists()


# --- refusals --------------------------------------------------------------------


def test_refuses_dirty_tree(root):
    repo = root / "apps" / "toy"
    (repo / "server.js").write_text("changed by hand\n", encoding="utf-8")
    with pytest.raises(rc.Refuse, match="uncommitted changes"):
        run(root)
    assert tags(root) == ["baseline"]
    assert (repo / "server.js").read_text() == "changed by hand\n"  # nothing discarded


def test_refuses_untracked_file(root):
    (root / "apps" / "toy" / "notes.txt").write_text("x", encoding="utf-8")
    with pytest.raises(rc.Refuse, match="uncommitted changes"):
        run(root)


def test_refuses_corrupted_prompt(root):
    (root / "prompts" / "toy" / "B.md").write_text("Request B, edited.\n", encoding="utf-8")
    with pytest.raises(rc.Refuse, match="manifest mismatch: prompts/toy/B.md"):
        run(root)
    assert tags(root) == ["baseline"]


def test_refuses_prompt_corrupted_mid_chain(root, monkeypatch):
    """The manifest is checked before every request, not only at the start."""
    real = rc.verify_manifest
    calls = []

    def corrupt_after_two(manifest, needed, r):
        calls.append(1)
        if len(calls) == 3:  # start check + round 1 check, then corrupt before round 2
            (r / "prompts" / "toy" / "A.md").write_text("tampered\n", encoding="utf-8")
        return real(manifest, needed, r)

    monkeypatch.setattr(rc, "verify_manifest", corrupt_after_two)
    with pytest.raises(rc.Refuse, match="mismatch"):
        run(root)
    assert sorted(tags(root)) == ["DCBA-r1", "baseline"]


def test_refuses_prompt_missing_from_manifest(root):
    write_manifest(root, names={"prompts/toy/A.md", "prompts/toy/B.md"})
    with pytest.raises(rc.Refuse, match="not frozen.*prompts/toy/D.md"):
        run(root)


def test_refuses_empty_manifest(root):
    (root / "prompts" / "MANIFEST.sha256").write_text("# placeholder\n", encoding="utf-8")
    with pytest.raises(rc.Refuse, match="lists no prompts"):
        run(root)


def test_refuses_without_baseline_or_repo(root):
    git(root / "apps" / "toy", "tag", "-d", "baseline")
    with pytest.raises(rc.Refuse, match="no tag 'baseline'"):
        run(root)
    (root / "prompts" / "nope").mkdir()
    (root / "prompts" / "nope" / "A.md").write_text("x\n", encoding="utf-8")
    write_manifest(root)
    with pytest.raises(rc.Refuse, match="not a git repository"):
        rc.run_chain("nope", "A", "stub", root=root)


@pytest.mark.parametrize("chain", ["ABCE", "AAB", "", "ABCDA", "abcd"])
def test_refuses_bad_chain(root, chain):
    with pytest.raises(rc.Refuse, match="chain must be"):
        run(root, chain)


def test_refuses_gap_in_round_tags(root):
    git(root / "apps" / "toy", "tag", "DCBA-r2", "baseline")
    with pytest.raises(rc.Refuse, match="tags out of order"):
        run(root)


# --- failures and resuming -------------------------------------------------------


def test_failed_round_is_not_committed_then_retried(root, monkeypatch):
    monkeypatch.setenv("VIBE_STUB_MODE", "fail")
    assert run(root, "CD") == 1
    assert "CD-r1" not in tags(root)
    r1 = round_json(root, "CD", 1)
    assert (r1["status"], r1["attempt"], r1["agent_exit"]) == ("failed", 1, 1)
    assert git(root / "apps" / "toy", "status", "--porcelain")  # the crash left edits

    monkeypatch.setenv("VIBE_STUB_MODE", "edit")
    assert run(root, "CD") == 0  # discards the leftover, retries as attempt 2
    r1 = round_json(root, "CD", 1)
    assert (r1["status"], r1["attempt"]) == ("done", 2)
    old = root / "results/raw/toy/CD/r1/attempt-1"
    assert json.loads((old / "round.json").read_text())["status"] == "failed"
    assert (old / "agent.json").is_file()
    repo = root / "apps" / "toy"
    # exactly one stub edit in round 1: the failed attempt's edit was discarded
    assert git(repo, "show", "CD-r1:server.js").count("stub edit") == 1


def test_hand_edit_is_never_discarded(root):
    """Only the leftover of a crashed round is discarded. Here round 2's record says done
    (its tag was removed by hand), so a hand edit in the tree is refused, not wiped."""
    repo = root / "apps" / "toy"
    assert run(root, "AB") == 0
    git(repo, "tag", "-d", "AB-r2")
    git(repo, "reset", "-q", "--hard", "AB-r1")
    (repo / "server.js").write_text("hand edit\n", encoding="utf-8")
    with pytest.raises(rc.Refuse, match="uncommitted"):
        run(root, "AB")
    assert (repo / "server.js").read_text() == "hand edit\n"


KILL_SCRIPT = """
import sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import run_chain as rc
sys.exit(rc.run_chain("toy", "DCBA", "stub", root=Path(sys.argv[2])))
"""


def test_killed_half_way_resumes(root):
    env = dict(os.environ, VIBE_STUB_MODE="slow", VIBE_STUB_SLEEP="1.5")
    proc = subprocess.Popen([sys.executable, "-c", KILL_SCRIPT, str(TOOLS), str(root)], env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    r2 = root / "results/raw/toy/DCBA/r2/round.json"
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        if r2.is_file() and json.loads(r2.read_text() or "{}").get("status") == "running":
            break
        time.sleep(0.1)
    else:
        proc.kill()
        pytest.fail("round 2 never started")
    proc.kill()
    proc.wait()
    time.sleep(2.5)  # let the orphaned stub of round 2 finish its sleep (Windows keeps it)

    assert sorted(tags(root)) == ["DCBA-r1", "baseline"]
    assert json.loads(r2.read_text())["status"] == "running"
    assert git(root / "apps" / "toy", "status", "--porcelain")  # round 2's edit is pending

    assert run(root) == 0  # resume: r1 kept, r2 retried as attempt 2
    assert sorted(tags(root))[-1] == "baseline" and len(tags(root)) == 5
    assert round_json(root, "DCBA", 1)["attempt"] == 1
    assert round_json(root, "DCBA", 2)["attempt"] == 2
    repo = root / "apps" / "toy"
    assert git(repo, "rev-parse", "DCBA-r1") == git(repo, "rev-parse", "DCBA-r2~1")
    assert git(repo, "show", "DCBA-r4:server.js").count("stub edit") == 4


# --- stub agent on its own -------------------------------------------------------


def test_stub_agent_matches_runner_cli_and_fields(tmp_path):
    repo = tmp_path / "repo"
    (repo / "src").mkdir(parents=True)
    (repo / "src" / "b.ts").write_text("export {}", encoding="utf-8")
    (repo / "src" / "a.css").write_text("body{}\n", encoding="utf-8")
    (repo / "node_modules").mkdir()
    (repo / "node_modules" / "0.js").write_text("", encoding="utf-8")
    req = tmp_path / "A.md"
    req.write_text("Add a feature.\n", encoding="utf-8")
    stub = Path(rc.AGENTS["stub"])
    r = subprocess.run([sys.executable, str(stub), str(repo), str(req), str(tmp_path / "log"),
                        "--request", "A", "--backend", "azure"], capture_output=True, text=True,
                       env={k: v for k, v in os.environ.items() if k != "VIBE_STUB_MODE"})
    assert r.returncode == 0, r.stderr
    assert (repo / "src" / "a.css").read_text() == "body{}\n/* stub edit for request A */\n"
    assert (repo / "src" / "b.ts").read_text() == "export {}"
    meta = json.loads((tmp_path / "log" / "agent.json").read_text())
    runner_keys = {"request", "request_file", "request_sha256", "model", "model_served", "backend",
                   "settings", "sdk", "started_at", "steps", "tool_calls", "tool_errors", "retries",
                   "tokens_in", "tokens_out", "tokens_thoughts", "ended_by", "finish_reason", "error",
                   "final_text", "ended_at"}
    assert set(meta) == runner_keys
    assert meta["request_sha256"] == hashlib.sha256(b"Add a feature.\n").hexdigest()
