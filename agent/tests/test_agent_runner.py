"""Tests for agent/agent_runner.py. The model is a scripted fake; no API calls.

Docker tests (timeout, no credentials in the sandbox) run only when a Docker daemon
answers; otherwise they are skipped.

    uv run --no-project --with-requirements agent/requirements.txt --with pytest \
        python -m pytest -q agent/tests
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from google.genai import errors, types

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import agent_runner as ar  # noqa: E402

SETTINGS = ar.load_settings()
GEMINI = SETTINGS["gemini"]


# --------------------------------------------------------------------------- fakes


def call(name, **args):
    return types.Part(function_call=types.FunctionCall(name=name, args=args, id=f"id-{name}"))


def reply(*parts, finish="STOP", t_in=100, t_out=10, t_think=5):
    return types.GenerateContentResponse(
        candidates=[types.Candidate(content=types.Content(role="model", parts=list(parts)),
                                    finish_reason=finish)],
        usage_metadata=types.GenerateContentResponseUsageMetadata(
            prompt_token_count=t_in, candidates_token_count=t_out, thoughts_token_count=t_think,
            total_token_count=t_in + t_out + t_think),
    )


def text(s):
    return types.Part(text=s)


class FakeModels:
    def __init__(self, script):
        self.script = list(script)
        self.requests = []

    def generate_content(self, *, model, contents, config):
        self.requests.append({"model": model, "contents": list(contents), "config": config})
        item = self.script.pop(0) if self.script else reply(text("done"))
        if isinstance(item, BaseException):
            raise item
        return item


class FakeClient:
    def __init__(self, script):
        self.models = FakeModels(script)


class FakeSandbox(ar.Sandbox):
    def __init__(self):
        super().__init__(image="fake")
        self.commands = []

    def run(self, repo, command):
        self.commands.append(command)
        return "[exit code 0]\nok"


@pytest.fixture
def toy(tmp_path):
    repo = tmp_path / "toy"
    repo.mkdir()
    (repo / "hello.js").write_text("console.log('hello');\n", encoding="utf-8")
    (repo / "node_modules" / "x").mkdir(parents=True)
    (repo / "node_modules" / "x" / "index.js").write_text("", encoding="utf-8")
    return repo


def go(repo, tmp_path, script, **kw):
    client = FakeClient(script)
    settings = dict(SETTINGS, **kw.pop("settings", {}))
    meta = ar.run_agent(repo, "Create a file notes.txt that lists the files in this project.",
                        tmp_path / "log", settings, client, request_id="T",
                        sandbox=kw.pop("sandbox", FakeSandbox()), sleep=lambda s: None, **kw)
    events = [json.loads(l) for l in (tmp_path / "log" / "transcript.jsonl").read_text(encoding="utf-8").splitlines()]
    return meta, events, client


# --------------------------------------------------------------------------- loop


def test_toy_request_writes_file_and_logs_tokens(toy, tmp_path):
    meta, events, client = go(toy, tmp_path, [
        reply(call("list_files")),
        reply(call("write_file", path="notes.txt", content="hello.js\n")),
        reply(text("Created notes.txt listing hello.js.")),
    ])
    assert (toy / "notes.txt").read_text(encoding="utf-8") == "hello.js\n"
    assert meta["ended_by"] == "done"
    assert meta["steps"] == 3 and meta["tool_calls"] == 2 and meta["tool_errors"] == 0
    assert meta["tokens_in"] == 300 and meta["tokens_out"] == 45 and meta["tokens_thoughts"] == 15
    assert meta["model"] == GEMINI["model"] and meta["request"] == "T"
    assert meta["final_text"].startswith("Created notes.txt")
    on_disk = json.loads((tmp_path / "log" / "agent.json").read_text(encoding="utf-8"))
    assert on_disk == meta
    kinds = [e["event"] for e in events]
    assert kinds == ["start", "model", "tool", "model", "tool", "model", "end"]
    listing = events[2]["result"]
    assert "hello.js" in listing and "node_modules" not in listing


def test_manual_function_calling_and_history(toy, tmp_path):
    _, _, client = go(toy, tmp_path, [reply(call("list_files")), reply(text("ok"))])
    first = client.models.requests[0]["config"]
    assert first.automatic_function_calling.disable is True
    assert first.temperature == GEMINI["temperature"] and first.seed == GEMINI["seed"]
    second = client.models.requests[1]["contents"]
    # user request, model turn (sent back unchanged), function responses
    assert [c.role for c in second] == ["user", "model", "user"]
    fr = second[2].parts[0].function_response
    assert fr.name == "list_files" and fr.id == "id-list_files" and "hello.js" in fr.response["output"]


def test_path_outside_repo_is_refused(toy, tmp_path):
    meta, events, _ = go(toy, tmp_path, [
        reply(call("write_file", path="../outside.txt", content="x")),
        reply(call("read_file", path="../../etc/passwd")),
        reply(call("write_file", path=".git/config", content="x")),
        reply(text("could not")),
    ])
    assert not (tmp_path / "outside.txt").exists()
    assert not (toy / ".git").exists()
    tools = [e for e in events if e["event"] == "tool"]
    assert all(not e["ok"] and "refused" in e["result"] for e in tools)
    assert meta["tool_errors"] == 3 and meta["ended_by"] == "done"


@pytest.mark.parametrize("bad", ["/etc/passwd", "C:/Windows/win.ini", "sub/../../x", ""])
def test_resolve_in_repo_rejects(tmp_path, bad):
    with pytest.raises(ar.ToolError):
        ar.resolve_in_repo(tmp_path.resolve(), bad)


def test_read_file_is_capped(toy, tmp_path):
    (toy / "big.txt").write_text("a" * 500, encoding="utf-8")
    meta, events, _ = go(toy, tmp_path, [reply(call("read_file", path="big.txt")), reply(text("ok"))],
                         settings={"read_file_cap_bytes": 100})
    result = [e for e in events if e["event"] == "tool"][0]["result"]
    assert "[truncated: file is 500 bytes, showed the first 100]" in result


def test_delete_and_shell_dispatch(toy, tmp_path):
    sb = FakeSandbox()
    meta, _, _ = go(toy, tmp_path, [
        reply(call("delete_file", path="hello.js"), call("run_shell", command="ls")),
        reply(text("ok")),
    ], sandbox=sb)
    assert not (toy / "hello.js").exists()
    assert sb.commands == ["ls"] and meta["tool_calls"] == 2


def test_step_cap(toy, tmp_path):
    meta, _, client = go(toy, tmp_path, [reply(call("list_files")) for _ in range(10)],
                         settings={"max_steps": 4})
    assert meta["ended_by"] == "step_cap" and meta["steps"] == 4
    assert len(client.models.requests) == 4


def test_retry_on_429_and_5xx(toy, tmp_path):
    meta, events, _ = go(toy, tmp_path, [
        errors.APIError(429, {"error": {"message": "quota"}}),
        errors.APIError(503, {"error": {"message": "busy"}}),
        reply(text("ok")),
    ])
    assert meta["ended_by"] == "done" and meta["retries"] == 2
    assert [e["event"] for e in events].count("retry") == 2


def test_non_retryable_error_is_recorded(toy, tmp_path):
    meta, _, client = go(toy, tmp_path, [errors.APIError(403, {"error": {"message": "denied"}})])
    assert meta["ended_by"] == "error" and "403" in meta["error"]
    assert len(client.models.requests) == 1
    assert json.loads((tmp_path / "log" / "agent.json").read_text(encoding="utf-8"))["ended_by"] == "error"


def test_retries_give_up(toy, tmp_path):
    meta, _, client = go(toy, tmp_path, [errors.APIError(500, {}) for _ in range(5)],
                         settings={"retry_attempts": 3})
    assert meta["ended_by"] == "error" and len(client.models.requests) == 3


def test_blocked_response_is_reported(toy, tmp_path):
    meta, _, _ = go(toy, tmp_path, [reply(text(""), finish="SAFETY")])
    assert meta["ended_by"] == "blocked" and "SAFETY" in meta["error"]


def test_ingest_reads_agent_json(toy, tmp_path):
    meta, _, _ = go(toy, tmp_path, [reply(text("ok"))])
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
    import ingest

    a = json.loads((tmp_path / "log" / "agent.json").read_text(encoding="utf-8"))
    assert ingest._first(a, "model", "model_id") == GEMINI["model"]
    assert ingest._first(a, "tokens_in") == 100 and ingest._first(a, "steps") == 1


# --------------------------------------------------------------------------- azure backend

import openai  # noqa: E402
from openai.types.chat import ChatCompletion  # noqa: E402


def az_reply(content=None, calls=(), finish=None, t_in=100, t_out=20, reasoning=8):
    tool_calls = [
        {"id": f"call_{i}", "type": "function", "function": {"name": n, "arguments": a}}
        for i, (n, a) in enumerate(calls)
    ]
    return ChatCompletion.model_validate({
        "id": "c1", "object": "chat.completion", "created": 0, "model": "gpt-test-2026",
        "choices": [{"index": 0, "finish_reason": finish or ("tool_calls" if calls else "stop"),
                     "message": {"role": "assistant", "content": content,
                                 **({"tool_calls": tool_calls} if tool_calls else {})}}],
        "usage": {"prompt_tokens": t_in, "completion_tokens": t_out, "total_tokens": t_in + t_out,
                  "completion_tokens_details": {"reasoning_tokens": reasoning}},
    })


class FakeCompletions:
    def __init__(self, script):
        self.script = list(script)
        self.requests = []

    def create(self, **kw):
        self.requests.append({**kw, "messages": [dict(m) for m in kw["messages"]]})
        item = self.script.pop(0) if self.script else az_reply("done")
        if isinstance(item, BaseException):
            raise item
        return item


class FakeAzure:
    def __init__(self, script):
        self.chat = type("Chat", (), {})()
        self.chat.completions = FakeCompletions(script)


def go_azure(repo, tmp_path, script, **kw):
    client = FakeAzure(script)
    settings = dict(SETTINGS, **kw.pop("settings", {}))
    meta = ar.run_agent(repo, "Create a file notes.txt that lists the files in this project.",
                        tmp_path / "log", settings, client, backend="azure", request_id="T",
                        sandbox=FakeSandbox(), sleep=lambda s: None)
    return meta, client


def _status_error(cls, code, body=None):
    try:
        import httpx2 as httpx  # what openai 3.x uses
    except ImportError:  # pragma: no cover
        import httpx

    req = httpx.Request("POST", "https://example.invalid/openai/v1/chat/completions")
    return cls("err", response=httpx.Response(code, request=req), body=body)


def test_azure_toy_request(toy, tmp_path, monkeypatch):
    monkeypatch.delenv("AZURE_FOUNDRY_DEPLOYMENT", raising=False)
    meta, client = go_azure(toy, tmp_path, [
        az_reply(calls=[("list_files", "{}")]),
        az_reply(calls=[("write_file", json.dumps({"path": "notes.txt", "content": "hello.js\n"}))]),
        az_reply("Created notes.txt."),
    ])
    assert (toy / "notes.txt").read_text(encoding="utf-8") == "hello.js\n"
    assert meta["ended_by"] == "done" and meta["steps"] == 3 and meta["tool_calls"] == 2
    assert meta["tokens_in"] == 300 and meta["tokens_out"] == 60 and meta["tokens_thoughts"] == 24
    assert meta["model"] == SETTINGS["azure"]["deployment"] and meta["model_served"] == "gpt-test-2026"
    req = client.chat.completions.requests
    assert req[0]["tool_choice"] == "auto" and {t["function"]["name"] for t in req[0]["tools"]} >= {"write_file", "run_shell"}
    assert "temperature" not in req[0]  # null in settings: model default
    roles = [m["role"] for m in req[1]["messages"]]
    assert roles == ["system", "user", "assistant", "tool"]
    assert req[1]["messages"][3]["tool_call_id"] == "call_0" and "hello.js" in req[1]["messages"][3]["content"]


def test_azure_bad_json_arguments_go_back_as_error(toy, tmp_path):
    meta, client = go_azure(toy, tmp_path, [
        az_reply(calls=[("write_file", "{not json")]),
        az_reply("gave up"),
    ])
    assert meta["tool_errors"] == 1 and meta["ended_by"] == "done"
    tool_msg = client.chat.completions.requests[1]["messages"][-1]
    assert tool_msg["role"] == "tool" and "not valid JSON" in tool_msg["content"]


def test_azure_retry_and_filter(toy, tmp_path):
    meta, _ = go_azure(toy, tmp_path, [
        _status_error(openai.RateLimitError, 429),
        _status_error(openai.InternalServerError, 500),
        az_reply(content=None, finish="content_filter"),
    ])
    assert meta["retries"] == 2 and meta["ended_by"] == "blocked"


def test_azure_prompt_filter_400_is_blocked(toy, tmp_path):
    meta, _ = go_azure(toy, tmp_path, [
        _status_error(openai.BadRequestError, 400, body={"code": "content_filter", "message": "filtered"}),
    ])
    assert meta["ended_by"] == "blocked"


def test_azure_auth_error_is_not_retried(toy, tmp_path):
    meta, client = go_azure(toy, tmp_path, [_status_error(openai.AuthenticationError, 401)])
    assert meta["ended_by"] == "error" and len(client.chat.completions.requests) == 1


def test_azure_endpoint_normalised(monkeypatch):
    monkeypatch.setenv("AZURE_FOUNDRY_ENDPOINT", "https://x.cognitiveservices.azure.com/")
    monkeypatch.setenv("AZURE_FOUNDRY_API_KEY", "k")
    c = ar.make_client(SETTINGS, "azure")
    assert str(c.base_url) == "https://x.cognitiveservices.azure.com/openai/v1/"
    assert c.max_retries == 0


# --------------------------------------------------------------------------- sandbox


def test_docker_args_have_limits_and_no_env(tmp_path):
    sb = ar.Sandbox(image="node:20.20.2-alpine", memory="1g", cpus="1", pids=256)
    args = sb.docker_args(tmp_path, "env", "n1")
    joined = " ".join(args)
    for want in ("--rm", "--memory 1g", "--cpus 1", "--pids-limit 256", "no-new-privileges",
                 f"source={tmp_path},target=/work"):
        assert want in joined
    assert "-e" not in args and "--env" not in args and "--env-file" not in args
    assert "docker.sock" not in joined and "--privileged" not in args


def test_host_env_drops_credentials(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "secret")
    monkeypatch.setenv("GOOGLE_APPLICATION_CREDENTIALS", "x")
    env = ar.Sandbox.host_env()
    assert "GEMINI_API_KEY" not in env and "GOOGLE_APPLICATION_CREDENTIALS" not in env


def _docker_ok() -> bool:
    if not shutil.which("docker"):
        return False
    try:
        return subprocess.run(["docker", "info"], capture_output=True, timeout=20).returncode == 0
    except Exception:
        return False


docker = pytest.mark.skipif(not _docker_ok(), reason="no Docker daemon")


@docker
def test_sandbox_runs_in_repo_without_credentials(tmp_path, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "should-not-leak")
    (tmp_path / "hello.js").write_text("x", encoding="utf-8")
    sb = ar.Sandbox(image=SETTINGS["sandbox_image"], timeout_s=60)
    out = sb.run(tmp_path.resolve(), "ls; env")
    assert out.startswith("[exit code 0]")
    assert "hello.js" in out and "should-not-leak" not in out and "GEMINI" not in out


@docker
def test_sandbox_timeout_removes_container(tmp_path):
    sb = ar.Sandbox(image=SETTINGS["sandbox_image"], timeout_s=5)
    names = []
    real_args = sb.docker_args

    def spy(repo, command, name):
        names.append(name)
        return real_args(repo, command, name)

    sb.docker_args = spy
    out = sb.run(tmp_path.resolve(), "sleep 30")
    assert out.startswith("[timeout")
    ps = subprocess.run(["docker", "ps", "-a", "--filter", f"name={names[0]}", "--format", "{{.Names}}"],
                        capture_output=True, text=True)
    assert ps.stdout.strip() == ""
