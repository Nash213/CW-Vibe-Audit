"""Self-check cases for the key module (plan Section 7.3, Wuth-2)."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from keys import (  # noqa: E402
    count_keys,
    gitleaks_findings,
    npm_audit_findings,
    semgrep_findings,
    stable_hash,
)

RULE = "rules.javascript.express.security.audit.eval-injection"


def _semgrep_report(path, start, end):
    return {
        "results": [
            {
                "check_id": RULE,
                "path": path,
                "start": {"line": start},
                "end": {"line": end},
                "extra": {"severity": "ERROR", "lines": "requires login"},
            }
        ]
    }


def test_semgrep_key_survives_move_and_reformat(tmp_path):
    before = tmp_path / "before"
    after = tmp_path / "after"
    before.mkdir()
    (after / "routes").mkdir(parents=True)
    (before / "a.js").write_text("eval(req.query.code);\n", encoding="utf-8")
    (after / "routes" / "b.js").write_text(
        "// moved\n\n    eval(\n        req.query.code );\n", encoding="utf-8"
    )

    k1 = semgrep_findings(_semgrep_report("a.js", 1, 1), before)
    k2 = semgrep_findings(_semgrep_report("routes/b.js", 3, 4), after)

    assert k1[0].key == k2[0].key
    assert k2[0].path == "routes/b.js" and k2[0].line == 3


def test_semgrep_ignores_reported_lines_field(tmp_path):
    (tmp_path / "a.js").write_text("eval(x);\n", encoding="utf-8")
    report = _semgrep_report("a.js", 1, 1)
    f1 = semgrep_findings(report, tmp_path)
    report["results"][0]["extra"]["lines"] = "something else"
    f2 = semgrep_findings(report, tmp_path)
    assert f1 == f2


def test_same_snippet_twice_counts_two(tmp_path):
    (tmp_path / "a.js").write_text("eval(x);\neval(x);\n", encoding="utf-8")
    report = {
        "results": [
            _semgrep_report("a.js", 1, 1)["results"][0],
            _semgrep_report("a.js", 2, 2)["results"][0],
        ]
    }
    counts = count_keys(semgrep_findings(report, tmp_path))
    assert len(counts) == 1
    assert list(counts.values()) == [2]


def test_gitleaks_key_hides_secret():
    report = [
        {
            "RuleID": "jwt-secret",
            "Secret": "supersecretjwt",
            "File": ".env",
            "StartLine": 2,
        }
    ]
    (f,) = gitleaks_findings(report)
    assert "supersecretjwt" not in f.key
    assert f.key == f"gitleaks:jwt-secret:{stable_hash('supersecretjwt')}"


def test_gitleaks_null_report():
    assert gitleaks_findings(None) == []
    assert gitleaks_findings("null") == []
    assert gitleaks_findings("") == []


def test_gitleaks_null_report_file(tmp_path):
    p = tmp_path / "gitleaks.json"
    p.write_text("null", encoding="utf-8")
    assert gitleaks_findings(p) == []


def test_npm_audit_one_key_per_advisory_object():
    url = "https://github.com/advisories/GHSA-p6mc-m468-83gw"
    report = {
        "auditReportVersion": 2,
        "vulnerabilities": {
            "lodash": {
                "name": "lodash",
                "severity": "high",
                "via": [
                    {
                        "source": 1096305,
                        "name": "lodash",
                        "title": "Prototype Pollution",
                        "url": url,
                        "severity": "high",
                    }
                ],
            },
            "express": {"name": "express", "severity": "high", "via": ["lodash"]},
        },
    }
    findings = npm_audit_findings(report)
    assert [f.key for f in findings] == [f"npm-audit:lodash:{url}"]
    assert findings[0].severity == "high"


def test_keys_stable_across_runs():
    # built-in hash() is salted per process; ours must be a fixed value
    assert stable_hash("abc") == "ba7816bf8f01cfea"


def test_report_from_json_string(tmp_path):
    (tmp_path / "a.js").write_text("eval(x);\n", encoding="utf-8")
    text = json.dumps(_semgrep_report("a.js", 1, 1))
    assert len(semgrep_findings(text, tmp_path)) == 1
