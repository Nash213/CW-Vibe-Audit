"""Write prompts/MANIFEST.sha256 for every prompt file (plan Jarred-4), and check the rules.

    python tools/freeze_prompts.py [--check]

The manifest lists prompts/<app>/<name>.md with its SHA-256, in `sha256sum` format and
sorted, so `sha256sum -c prompts/MANIFEST.sha256` from the repo root verifies it too.
tools/run_chain.py checks it before every request and refuses on any mismatch.

Before writing, it checks the rules the plan's Appendix A.6 can check by machine:
  - C.md and D.md are byte-identical across all apps that have them;
  - A.md, B.md and C.md contain no security words.
--check verifies the existing manifest instead of writing it.

After a freeze, a prompt changes only with all four members agreeing, a line in
docs/DECISIONS.md and a re-run of anything that used the old text.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROMPTS = ROOT / "prompts"
MANIFEST = PROMPTS / "MANIFEST.sha256"
SECURITY_WORDS = re.compile(r"secur|safe|valid|sanitiz|vulnerab|attack|hack|xss|inject|csrf|encrypt|"
                            r"password|auth", re.I)


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def prompt_files() -> list[Path]:
    return sorted(PROMPTS.glob("*/*.md"))


def check_rules(files: list[Path]) -> list[str]:
    problems = []
    for name in ("C.md", "D.md"):
        hashes = {f.parent.name: sha(f) for f in files if f.name == name}
        if len(set(hashes.values())) > 1:
            problems.append(f"{name} differs across apps: " +
                            ", ".join(f"{a}={h[:8]}" for a, h in sorted(hashes.items())))
    for f in files:
        if f.name in ("A.md", "B.md", "C.md"):
            m = SECURITY_WORDS.search(f.read_text(encoding="utf-8"))
            if m:
                problems.append(f"{f.relative_to(ROOT).as_posix()} contains security word {m.group(0)!r}")
    return problems


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args(argv)
    files = prompt_files()
    lines = [f"{sha(f)}  {f.relative_to(ROOT).as_posix()}" for f in files]

    if a.check:
        current = [l for l in MANIFEST.read_text(encoding="utf-8").splitlines()
                   if l.strip() and not l.startswith("#")]
        if current != lines:
            print("manifest out of date:\n  " + "\n  ".join(sorted(set(current) ^ set(lines))))
            return 1
        print(f"manifest OK ({len(lines)} prompts)")
        return 0

    problems = check_rules(files)
    if problems:
        print("refused:\n  " + "\n  ".join(problems), file=sys.stderr)
        return 1
    MANIFEST.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {MANIFEST.relative_to(ROOT).as_posix()} ({len(lines)} prompts)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
