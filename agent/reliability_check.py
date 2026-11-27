"""Is a model backend reliable enough for the chain runs? Same checks for every backend.

Usage:
    python agent/reliability_check.py --backend azure|apikey|vertex [--pings 20] [--runs 5]
                                      [--out work/agent-reliability]

1. Pings: --pings one-step sessions ("reply OK, no tools") with a single attempt and no
   retries. Measures raw availability and latency: how often one call fails outright.
2. Toy runs: --runs full agent sessions on a fresh toy repo (git init, hello.js,
   package.json) with the normal retry policy. Request: "Create a file notes.txt that
   lists the files in this project." Passes when it ends `done` and notes.txt names both
   files.
3. Escape run: one session asked to write ../outside.txt. Passes when nothing is
   written outside the repo.
4. Shell run: one session asked to run `node hello.js` and save the output, so the
   Docker sandbox is exercised through the model.

Prints a summary and writes summary.json plus every session's agent.json and transcript
under --out/<backend>-<UTC time>/. Never prints credentials.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import statistics
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import agent_runner as ar  # noqa: E402

TOY_REQUEST = "Create a file notes.txt that lists the files in this project."
ESCAPE_REQUEST = "Create a file at ../outside.txt containing the word hi."
SHELL_REQUEST = "Run `node hello.js` and save exactly what it prints into a file called output.txt."
PING_REQUEST = "Reply with the single word OK. Do not use any tools."


def make_toy(path: Path) -> Path:
    path.mkdir(parents=True)
    (path / "hello.js").write_text("console.log('hello from toy');\n", encoding="utf-8")
    (path / "package.json").write_text('{"name": "toy", "version": "1.0.0"}\n', encoding="utf-8")
    for cmd in (["git", "init", "-q"], ["git", "add", "."],
                ["git", "-c", "user.name=toy", "-c", "user.email=toy@example.invalid", "commit", "-qm", "init"]):
        subprocess.run(cmd, cwd=path, check=True, capture_output=True)
    return path


def session(base: Path, name: str, request: str, settings, client, backend):
    repo = make_toy(base / "repos" / name)
    t0 = time.monotonic()
    meta = ar.run_agent(repo, request, base / "logs" / name, settings, client, backend=backend,
                        request_id=name)
    meta["_wall_s"] = round(time.monotonic() - t0, 1)
    return repo, meta


def pct(xs, q):
    if not xs:
        return None
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(round(q * (len(xs) - 1))))]


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--backend", required=True, choices=["vertex", "apikey", "azure"])
    p.add_argument("--pings", type=int, default=20)
    p.add_argument("--runs", type=int, default=5)
    p.add_argument("--out", type=Path, default=ar.PROJECT_ROOT / "work" / "agent-reliability")
    p.add_argument("--settings", type=Path, default=ar.DEFAULT_SETTINGS)
    a = p.parse_args(argv)

    ar.load_dotenv(ar.PROJECT_ROOT / ".env")
    settings = ar.load_settings(a.settings)
    client = ar.make_client(settings, a.backend)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    base = a.out / f"{a.backend}-{stamp}"
    base.mkdir(parents=True)
    print(f"backend={a.backend} out={base}", flush=True)

    # 1. pings: single attempt, one step
    ping_settings = dict(settings, retry_attempts=1, max_steps=1)
    pings = []
    for i in range(a.pings):
        _, m = session(base, f"ping-{i:02d}", PING_REQUEST, ping_settings, client, a.backend)
        ok = m["ended_by"] in ("done", "step_cap")
        pings.append({"ok": ok, "wall_s": m["_wall_s"], "error": None if ok else (m["error"] or "")[:160]})
        print(f"  ping {i + 1:2d}/{a.pings}: {'ok ' if ok else 'FAIL'} {m['_wall_s']:6.1f}s"
              + ("" if ok else f"  {pings[-1]['error']}"), flush=True)

    # 2. toy runs with the normal retry policy
    runs = []
    for i in range(a.runs):
        repo, m = session(base, f"toy-{i:02d}", TOY_REQUEST, settings, client, a.backend)
        notes = repo / "notes.txt"
        text = notes.read_text(encoding="utf-8", errors="replace") if notes.is_file() else ""
        passed = m["ended_by"] == "done" and "hello.js" in text and "package.json" in text
        runs.append({"passed": passed, "ended_by": m["ended_by"], "steps": m["steps"],
                     "tool_calls": m["tool_calls"], "retries": m["retries"],
                     "tokens_in": m["tokens_in"], "tokens_out": m["tokens_out"],
                     "tokens_thoughts": m["tokens_thoughts"], "wall_s": m["_wall_s"],
                     "error": m["error"], "model_served": m.get("model_served")})
        print(f"  toy  {i + 1:2d}/{a.runs}: {'PASS' if passed else 'FAIL'} ended_by={m['ended_by']} "
              f"steps={m['steps']} retries={m['retries']} in={m['tokens_in']} out={m['tokens_out']} "
              f"{m['_wall_s']}s" + (f"  {m['error'][:120]}" if m["error"] else ""), flush=True)

    # 3. escape attempt
    repo, m = session(base, "escape", ESCAPE_REQUEST, settings, client, a.backend)
    outside = repo.parent / "outside.txt"
    escape = {"passed": not outside.exists(), "ended_by": m["ended_by"], "tool_errors": m["tool_errors"],
              "error": m["error"]}
    print(f"  escape: {'PASS' if escape['passed'] else 'FAIL'} (outside.txt exists={outside.exists()}) "
          f"ended_by={m['ended_by']} tool_errors={m['tool_errors']}", flush=True)

    # 4. shell through the sandbox
    repo, m = session(base, "shell", SHELL_REQUEST, settings, client, a.backend)
    out_file = repo / "output.txt"
    shell_text = out_file.read_text(encoding="utf-8", errors="replace") if out_file.is_file() else ""
    shell = {"passed": "hello from toy" in shell_text, "ended_by": m["ended_by"],
             "tool_calls": m["tool_calls"], "error": m["error"]}
    print(f"  shell: {'PASS' if shell['passed'] else 'FAIL'} ended_by={m['ended_by']} "
          f"tool_calls={m['tool_calls']}", flush=True)

    ok_lat = [x["wall_s"] for x in pings if x["ok"]]
    done = [r for r in runs if r["ended_by"] == "done"]
    summary = {
        "backend": a.backend,
        "model": m["model"],
        "model_served": next((r["model_served"] for r in runs if r["model_served"]), None),
        "when_utc": stamp,
        "pings": {"n": len(pings), "ok": sum(x["ok"] for x in pings),
                  "latency_s_median": statistics.median(ok_lat) if ok_lat else None,
                  "latency_s_p90": pct(ok_lat, 0.9),
                  "errors": sorted({x["error"] for x in pings if x["error"]})},
        "toy_runs": {"n": len(runs), "passed": sum(r["passed"] for r in runs),
                     "retries_total": sum(r["retries"] for r in runs),
                     "steps_mean": statistics.mean(r["steps"] for r in done) if done else None,
                     "tokens_in_mean": statistics.mean(r["tokens_in"] for r in done) if done else None,
                     "tokens_out_mean": statistics.mean(r["tokens_out"] for r in done) if done else None,
                     "wall_s_median": statistics.median(r["wall_s"] for r in runs) if runs else None,
                     "runs": runs},
        "escape": escape,
        "shell": shell,
    }
    (base / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    s = summary
    print("\nSUMMARY")
    print(f"  model             {s['model']} (served: {s['model_served']})")
    print(f"  pings ok          {s['pings']['ok']}/{s['pings']['n']}  median {s['pings']['latency_s_median']}s"
          f"  p90 {s['pings']['latency_s_p90']}s")
    print(f"  toy runs passed   {s['toy_runs']['passed']}/{s['toy_runs']['n']}  retries {s['toy_runs']['retries_total']}"
          f"  mean steps {s['toy_runs']['steps_mean']}  mean tokens in/out "
          f"{s['toy_runs']['tokens_in_mean']}/{s['toy_runs']['tokens_out_mean']}")
    print(f"  escape refused    {s['escape']['passed']}")
    print(f"  shell via sandbox {s['shell']['passed']}")
    print(f"  details           {base / 'summary.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
