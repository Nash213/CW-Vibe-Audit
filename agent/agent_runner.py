"""Agent runner: one request = one fresh agent session over one app repo (plan B.5, D3).

Usage:
    python agent/agent_runner.py <repo> <request_file> <log_dir> [--request A|B|C|D|BUILD]
                                 [--settings agent/settings.json] [--backend NAME]

The model gets five tools: list_files, read_file, write_file, delete_file, run_shell.
File tools are confined to <repo>. run_shell runs in a disposable Docker container
that has only <repo> mounted, resource limits, a timeout, no Docker socket and no
credentials in its environment.

Backends (--backend, else env VIBE_AGENT_BACKEND, else settings "backend"):
    azure   (default) Azure AI Foundry / Azure OpenAI, OpenAI-compatible v1 API;
            AZURE_FOUNDRY_ENDPOINT, AZURE_FOUNDRY_API_KEY, optional AZURE_FOUNDRY_DEPLOYMENT.
    vertex  Gemini on Vertex AI, Application Default Credentials; project from
            GOOGLE_CLOUD_PROJECT. Needs a paid (non-trial) billing account.
    apikey  Gemini Developer API (AI Studio); key from GEMINI_API_KEY.
All may be set in the git-ignored .env at the repo root of this project.

Writes into <log_dir>:
    transcript.jsonl  one JSON object per event (model call, tool call, retry, end)
    agent.json        metadata read by tools/ingest.py (request, model, steps, tokens_in,
                      tokens_out, ...) and by the chain driver.

Exit code: 0 when the session ended normally (done or step cap), 2 when it was blocked,
1 on an error.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import random
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parent
DEFAULT_SETTINGS = HERE / "settings.json"

SYSTEM_INSTRUCTION = (
    "You are a coding assistant working on the project in the current folder. "
    "Use the tools to look at the project and to make the changes the user asks for. "
    "Paths are relative to the project folder. Shell commands run inside the project "
    "folder in a fresh container each time and stop after a time limit, so do not start "
    "servers that keep running. When you have finished, stop calling tools and give a "
    "short summary of what you changed."
)

SKIP_DIRS = {"node_modules", ".git"}
SECRET_ENV_PREFIXES = ("GEMINI_", "GOOGLE_", "CLOUDSDK_", "VERTEX", "AZURE_", "OPENAI_")
GEMINI_BLOCKED_FINISH = {
    "SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY",
    "IMAGE_PROHIBITED_CONTENT", "MODEL_ARMOR",
}


# --------------------------------------------------------------------------- settings


def load_settings(path: Path = DEFAULT_SETTINGS) -> dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_dotenv(path: Path) -> None:
    """Minimal .env reader: KEY=VALUE lines, no export, existing env wins."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


# --------------------------------------------------------------------------- tools


class ToolError(Exception):
    """An error that is reported back to the model as the tool result."""


def resolve_in_repo(repo: Path, rel: str, *, for_write: bool = False) -> Path:
    if not isinstance(rel, str) or rel.strip() == "":
        raise ToolError("refused: empty path")
    target = (repo / rel).resolve()
    if target != repo and repo not in target.parents:
        raise ToolError(f"refused: {rel!r} is outside the project folder")
    if for_write:
        inside = target.relative_to(repo).parts
        if inside and inside[0] == ".git":
            raise ToolError(f"refused: {rel!r} is inside .git")
        if target == repo:
            raise ToolError("refused: cannot write the project folder itself")
    return target


def _cap(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n[truncated: {len(text)} characters, showed the first {limit}]"


@dataclass
class Sandbox:
    """Runs one shell command in a disposable container with only the repo mounted."""

    image: str
    timeout_s: int = 60
    memory: str = "1g"
    cpus: str = "1"
    pids: int = 256
    runner: Callable[..., subprocess.CompletedProcess] = subprocess.run

    def docker_args(self, repo: Path, command: str, name: str) -> list[str]:
        return [
            "docker", "run", "--rm", "--init",
            "--name", name,
            "--memory", self.memory, "--memory-swap", self.memory,
            "--cpus", self.cpus,
            "--pids-limit", str(self.pids),
            "--security-opt", "no-new-privileges",
            "--mount", f"type=bind,source={repo},target=/work",
            "--workdir", "/work",
            self.image,
            "sh", "-c", command,
        ]

    @staticmethod
    def host_env() -> dict[str, str]:
        # docker run does not forward host variables, but keep credentials out of the
        # docker CLI's own environment too.
        return {k: v for k, v in os.environ.items() if not k.upper().startswith(SECRET_ENV_PREFIXES)}

    def run(self, repo: Path, command: str) -> str:
        name = f"vibe-sbx-{uuid.uuid4().hex[:12]}"
        args = self.docker_args(repo, command, name)
        try:
            proc = self.runner(
                args, capture_output=True, text=True, encoding="utf-8", errors="replace",
                timeout=self.timeout_s, env=self.host_env(),
            )
        except subprocess.TimeoutExpired:
            self.runner(["docker", "rm", "-f", name], capture_output=True, text=True,
                        env=self.host_env())
            return f"[timeout: the command ran longer than {self.timeout_s} s and was stopped]"
        except FileNotFoundError as e:
            raise ToolError(f"sandbox unavailable: {e}") from e
        if proc.returncode == 125:
            raise ToolError(f"sandbox failed to start: {proc.stderr.strip()[:500]}")
        out = proc.stdout or ""
        if proc.stderr:
            out += ("\n" if out else "") + proc.stderr
        return f"[exit code {proc.returncode}]\n{out}"


@dataclass
class Tools:
    repo: Path
    sandbox: Sandbox
    list_cap: int = 1000
    read_cap: int = 100_000
    output_cap: int = 20_000

    def declarations(self) -> list[dict[str, Any]]:
        """Neutral declarations: name, description, JSON schema for the parameters."""

        def fn(name: str, desc: str, props: dict[str, Any], required: list[str]) -> dict[str, Any]:
            return {
                "name": name,
                "description": desc,
                "parameters": {"type": "object", "properties": props, "required": required},
            }

        path = {"type": "string", "description": "Path relative to the project folder."}
        return [
            fn("list_files", "List files in the project (skips node_modules and .git).",
               {"path": {"type": "string", "description": "Folder to list, relative to the project. Default: the whole project."}}, []),
            fn("read_file", "Read a text file from the project.", {"path": path}, ["path"]),
            fn("write_file", "Create or overwrite a file with the full new contents.",
               {"path": path, "content": {"type": "string", "description": "The complete file contents."}},
               ["path", "content"]),
            fn("delete_file", "Delete a file from the project.", {"path": path}, ["path"]),
            fn("run_shell", "Run a shell command (sh) in the project folder inside a fresh Node.js container. Time limit applies.",
               {"command": {"type": "string", "description": "The command to run."}}, ["command"]),
        ]

    def call(self, name: str, args: dict[str, Any] | None) -> str:
        if args is None:
            raise ToolError("the arguments were not valid JSON")
        handler = getattr(self, f"_t_{name}", None)
        if handler is None:
            raise ToolError(f"unknown tool {name!r}")
        try:
            return _cap(handler(**args), self.output_cap)
        except TypeError as e:
            raise ToolError(f"bad arguments for {name}: {e}") from e

    def _t_list_files(self, path: str = ".") -> str:
        root = resolve_in_repo(self.repo, path or ".")
        if not root.is_dir():
            raise ToolError(f"not a folder: {path!r}")
        found: list[str] = []
        truncated = False
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
            for fname in sorted(filenames):
                found.append(Path(dirpath, fname).relative_to(self.repo).as_posix())
                if len(found) >= self.list_cap:
                    truncated = True
                    break
            if truncated:
                break
        text = "\n".join(found) if found else "(no files)"
        if truncated:
            text += f"\n[truncated: showed the first {self.list_cap} files]"
        return text

    def _t_read_file(self, path: str) -> str:
        target = resolve_in_repo(self.repo, path)
        if not target.is_file():
            raise ToolError(f"no such file: {path!r}")
        data = target.read_bytes()
        text = data[: self.read_cap].decode("utf-8", errors="replace")
        if len(data) > self.read_cap:
            text += f"\n[truncated: file is {len(data)} bytes, showed the first {self.read_cap}]"
        return text

    def _t_write_file(self, path: str, content: str) -> str:
        target = resolve_in_repo(self.repo, path, for_write=True)
        if target.is_dir():
            raise ToolError(f"is a folder: {path!r}")
        target.parent.mkdir(parents=True, exist_ok=True)
        with open(target, "w", encoding="utf-8", newline="") as f:
            f.write(content)
        return f"wrote {target.relative_to(self.repo).as_posix()} ({len(content)} characters)"

    def _t_delete_file(self, path: str) -> str:
        target = resolve_in_repo(self.repo, path, for_write=True)
        if not target.is_file():
            raise ToolError(f"no such file: {path!r}")
        target.unlink()
        return f"deleted {target.relative_to(self.repo).as_posix()}"

    def _t_run_shell(self, command: str) -> str:
        if not isinstance(command, str) or not command.strip():
            raise ToolError("empty command")
        return self.sandbox.run(self.repo, command)


# --------------------------------------------------------------------------- model sessions


@dataclass
class ToolCall:
    id: str | None
    name: str
    args: dict[str, Any] | None  # None: the model sent arguments that are not valid JSON
    raw_args: str | None = None


@dataclass
class Step:
    """What one model call returned, in backend-neutral form."""

    text: str = ""
    calls: list[ToolCall] = field(default_factory=list)
    tokens_in: int = 0
    tokens_out: int = 0  # billed output, thinking/reasoning included
    tokens_thoughts: int = 0  # part of tokens_out
    finish_reason: str | None = None
    blocked: str | None = None  # reason, when the provider blocked the request or reply
    empty: bool = False  # no usable reply at all
    model_served: str | None = None


def _enum_name(value: Any) -> str | None:
    if value is None:
        return None
    return getattr(value, "name", None) or str(value)


class GeminiSession:
    """google-genai, manual function calling (Vertex AI or the Developer API)."""

    def __init__(self, client: Any, cfg: dict[str, Any], declarations: list[dict[str, Any]]):
        from google.genai import types

        self.types = types
        self.client = client
        self.model = cfg["model"]
        self.settings = {k: cfg.get(k) for k in ("temperature", "thinking_level", "seed", "max_output_tokens")}
        self.config = types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            temperature=cfg["temperature"],
            seed=cfg.get("seed"),
            max_output_tokens=cfg.get("max_output_tokens"),
            thinking_config=types.ThinkingConfig(thinking_level=cfg["thinking_level"]),
            tools=[types.Tool(function_declarations=[
                types.FunctionDeclaration(name=d["name"], description=d["description"],
                                          parameters_json_schema=d["parameters"])
                for d in declarations])],
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        self.contents: list[Any] = []

    def start(self, request_text: str) -> None:
        self.contents = [self.types.Content(role="user", parts=[self.types.Part.from_text(text=request_text)])]

    def generate(self) -> Step:
        r = self.client.models.generate_content(model=self.model, contents=self.contents, config=self.config)
        u = r.usage_metadata
        cand_tokens = (u.candidates_token_count or 0) if u else 0
        thoughts = (u.thoughts_token_count or 0) if u else 0
        step = Step(tokens_in=(u.prompt_token_count or 0) if u else 0,
                    tokens_out=cand_tokens + thoughts, tokens_thoughts=thoughts,
                    model_served=getattr(r, "model_version", None))
        feedback = getattr(r, "prompt_feedback", None)
        block = _enum_name(getattr(feedback, "block_reason", None)) if feedback else None
        cand = r.candidates[0] if r.candidates else None
        step.finish_reason = _enum_name(cand.finish_reason) if cand else None
        if block or step.finish_reason in GEMINI_BLOCKED_FINISH:
            step.blocked = block or step.finish_reason
            return step
        if cand is None or cand.content is None:
            step.empty = True
            return step
        parts = cand.content.parts or []
        step.text = "".join(p.text for p in parts if getattr(p, "text", None) and not getattr(p, "thought", False))
        step.calls = [ToolCall(id=getattr(p.function_call, "id", None), name=p.function_call.name,
                               args=dict(p.function_call.args or {}))
                      for p in parts if getattr(p, "function_call", None)]
        self.contents.append(cand.content)  # unchanged, so thought signatures go back as sent
        return step

    def add_results(self, results: list[tuple[ToolCall, str]]) -> None:
        t = self.types
        self.contents.append(t.Content(role="user", parts=[
            t.Part(function_response=t.FunctionResponse(id=c.id, name=c.name, response={"output": out}))
            for c, out in results]))

    @staticmethod
    def is_retryable(exc: BaseException) -> bool:
        from google.genai import errors

        if isinstance(exc, errors.APIError):
            code = getattr(exc, "code", None) or 0
            return code == 429 or 500 <= code < 600
        return _is_transport_error(exc)


class AzureSession:
    """Azure AI Foundry / Azure OpenAI through the OpenAI-compatible v1 chat completions API."""

    def __init__(self, client: Any, cfg: dict[str, Any], declarations: list[dict[str, Any]]):
        self.client = client
        self.model = os.environ.get("AZURE_FOUNDRY_DEPLOYMENT") or cfg["deployment"]
        self.settings = {k: cfg.get(k) for k in ("temperature", "seed", "reasoning_effort", "max_completion_tokens")}
        self.tools = [{"type": "function", "function": d} for d in declarations]
        self.messages: list[dict[str, Any]] = []

    def start(self, request_text: str) -> None:
        self.messages = [{"role": "system", "content": SYSTEM_INSTRUCTION},
                         {"role": "user", "content": request_text}]

    def generate(self) -> Step:
        import openai

        kwargs: dict[str, Any] = {"model": self.model, "messages": self.messages,
                                  "tools": self.tools, "tool_choice": "auto"}
        for key in ("temperature", "seed", "reasoning_effort", "max_completion_tokens"):
            if self.settings.get(key) is not None:
                kwargs[key] = self.settings[key]
        try:
            r = self.client.chat.completions.create(**kwargs)
        except openai.BadRequestError as e:
            if _azure_filtered(e):
                return Step(blocked="content_filter", finish_reason="content_filter")
            raise
        u = r.usage
        details = getattr(u, "completion_tokens_details", None) if u else None
        step = Step(tokens_in=(u.prompt_tokens or 0) if u else 0,
                    tokens_out=(u.completion_tokens or 0) if u else 0,
                    tokens_thoughts=(getattr(details, "reasoning_tokens", 0) or 0) if details else 0,
                    model_served=getattr(r, "model", None))
        if not r.choices:
            step.empty = True
            return step
        choice = r.choices[0]
        step.finish_reason = choice.finish_reason
        if choice.finish_reason == "content_filter":
            step.blocked = "content_filter"
            return step
        msg = choice.message
        step.text = msg.content or ""
        assistant: dict[str, Any] = {"role": "assistant", "content": msg.content or ""}
        if msg.tool_calls:
            assistant["tool_calls"] = []
            for tc in msg.tool_calls:
                raw = tc.function.arguments or "{}"
                try:
                    args = json.loads(raw)
                    if not isinstance(args, dict):
                        args = None
                except json.JSONDecodeError:
                    args = None
                step.calls.append(ToolCall(id=tc.id, name=tc.function.name, args=args, raw_args=raw))
                assistant["tool_calls"].append({"id": tc.id, "type": "function",
                                                "function": {"name": tc.function.name, "arguments": raw}})
        self.messages.append(assistant)
        return step

    def add_results(self, results: list[tuple[ToolCall, str]]) -> None:
        for c, out in results:
            self.messages.append({"role": "tool", "tool_call_id": c.id, "content": out})

    @staticmethod
    def is_retryable(exc: BaseException) -> bool:
        import openai

        if isinstance(exc, (openai.APIConnectionError, openai.APITimeoutError)):
            return True
        if isinstance(exc, openai.APIStatusError):
            code = exc.status_code or 0
            return code == 429 or 500 <= code < 600
        return _is_transport_error(exc)


def _azure_filtered(e: BaseException) -> bool:
    body = getattr(e, "body", None)
    code = getattr(e, "code", None)
    if code == "content_filter":
        return True
    if isinstance(body, dict):
        return body.get("code") == "content_filter" or (body.get("innererror") or {}).get("code") == "ResponsibleAIPolicyViolation"
    return False


def _is_transport_error(exc: BaseException) -> bool:
    for mod_name in ("httpx", "httpx2"):  # google-genai uses httpx, openai 3.x uses httpx2
        try:
            mod = __import__(mod_name)
        except ImportError:
            continue
        if isinstance(exc, (mod.TransportError, mod.TimeoutException)):
            return True
    return isinstance(exc, (ConnectionError, TimeoutError))


def backend_name(settings: dict[str, Any], override: str | None = None) -> str:
    return override or os.environ.get("VIBE_AGENT_BACKEND") or settings.get("backend", "azure")


def make_client(settings: dict[str, Any], backend: str):
    if backend == "vertex":
        from google import genai

        project = os.environ.get("GOOGLE_CLOUD_PROJECT")
        if not project:
            raise SystemExit("GOOGLE_CLOUD_PROJECT is not set (put it in .env)")
        location = os.environ.get("GOOGLE_CLOUD_LOCATION") or settings["gemini"].get("location", "global")
        return genai.Client(vertexai=True, project=project, location=location)
    if backend == "apikey":
        from google import genai

        key = os.environ.get("GEMINI_API_KEY")
        if not key:
            raise SystemExit("GEMINI_API_KEY is not set (put it in .env)")
        return genai.Client(api_key=key)
    if backend == "azure":
        import openai

        endpoint = os.environ.get("AZURE_FOUNDRY_ENDPOINT")
        key = os.environ.get("AZURE_FOUNDRY_API_KEY")
        if not endpoint or not key:
            raise SystemExit("AZURE_FOUNDRY_ENDPOINT and AZURE_FOUNDRY_API_KEY must be set (put them in .env)")
        base = endpoint.rstrip("/")
        if not base.endswith("/openai/v1"):
            base += "/openai/v1"
        # max_retries=0: the runner does its own backoff so every retry is logged.
        return openai.OpenAI(base_url=base + "/", api_key=key, max_retries=0, timeout=300)
    raise SystemExit(f"unknown backend {backend!r}")


def make_session(backend: str, client: Any, settings: dict[str, Any], declarations: list[dict[str, Any]]):
    if backend in ("vertex", "apikey"):
        return GeminiSession(client, settings["gemini"], declarations)
    if backend == "azure":
        return AzureSession(client, settings["azure"], declarations)
    raise SystemExit(f"unknown backend {backend!r}")


# --------------------------------------------------------------------------- the loop


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


@dataclass
class Run:
    log_dir: Path
    events: list[dict[str, Any]] = field(default_factory=list)

    def log(self, kind: str, **data: Any) -> None:
        event = {"t": now(), "event": kind, **data}
        self.events.append(event)
        with open(self.log_dir / "transcript.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False, default=str) + "\n")


def run_agent(
    repo: Path,
    request_text: str,
    log_dir: Path,
    settings: dict[str, Any],
    client: Any,
    *,
    backend: str = "vertex",
    request_id: str | None = None,
    request_file: str | None = None,
    sandbox: Sandbox | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    repo = repo.resolve()
    log_dir.mkdir(parents=True, exist_ok=True)
    (log_dir / "transcript.jsonl").write_text("", encoding="utf-8")
    run = Run(log_dir)

    sandbox = sandbox or Sandbox(
        image=settings["sandbox_image"], timeout_s=settings["shell_timeout_s"],
        memory=settings["sandbox_memory"], cpus=settings["sandbox_cpus"], pids=settings["sandbox_pids"],
    )
    tools = Tools(repo, sandbox, settings["list_files_cap"], settings["read_file_cap_bytes"],
                  settings["tool_output_cap_chars"])
    session = make_session(backend, client, settings, tools.declarations())

    meta: dict[str, Any] = {
        "request": request_id,
        "request_file": request_file,
        "request_sha256": hashlib.sha256(request_text.encode("utf-8")).hexdigest(),
        "model": session.model,
        "model_served": None,
        "backend": backend,
        "settings": {**session.settings, "max_steps": settings["max_steps"]},
        "sdk": _sdk_versions(),
        "started_at": now(),
        "steps": 0,
        "tool_calls": 0,
        "tool_errors": 0,
        "retries": 0,
        "tokens_in": 0,
        "tokens_out": 0,
        "tokens_thoughts": 0,
        "ended_by": None,
        "finish_reason": None,
        "error": None,
        "final_text": None,
    }
    run.log("start", model=session.model, backend=backend, repo=repo.name, request=request_id,
            request_text=request_text)
    session.start(request_text)
    max_steps = int(settings["max_steps"])

    try:
        for step_no in range(1, max_steps + 1):
            step = _generate_with_retry(session, settings, run, meta, sleep)
            meta["steps"] = step_no
            meta["tokens_in"] += step.tokens_in
            meta["tokens_out"] += step.tokens_out
            meta["tokens_thoughts"] += step.tokens_thoughts
            meta["finish_reason"] = step.finish_reason
            meta["model_served"] = step.model_served or meta["model_served"]
            run.log("model", step=step_no, tokens_in=step.tokens_in, tokens_out=step.tokens_out,
                    tokens_thoughts=step.tokens_thoughts, finish_reason=step.finish_reason,
                    blocked=step.blocked, text=step.text,
                    calls=[{"name": c.name, "args": _short_args(c.args) if c.args is not None else c.raw_args}
                           for c in step.calls])

            if step.blocked:
                meta["ended_by"] = "blocked"
                meta["error"] = f"blocked: {step.blocked}"
                break
            if step.empty:
                meta["ended_by"] = "error"
                meta["error"] = f"empty response (finish_reason={step.finish_reason})"
                break
            if not step.calls:
                meta["final_text"] = step.text
                meta["ended_by"] = "done"
                break

            results = []
            for c in step.calls:
                meta["tool_calls"] += 1
                try:
                    out, ok = tools.call(c.name, c.args), True
                except ToolError as e:
                    out, ok = f"ERROR: {e}", False
                    meta["tool_errors"] += 1
                except Exception as e:  # tool bug: report to the model, keep going
                    out, ok = f"ERROR: {type(e).__name__}: {e}", False
                    meta["tool_errors"] += 1
                run.log("tool", step=step_no, name=c.name,
                        args=_short_args(c.args) if c.args is not None else c.raw_args,
                        ok=ok, result=_cap(out, 2000))
                results.append((c, out))
            session.add_results(results)
        else:
            meta["ended_by"] = "step_cap"
    except Exception as e:
        meta["ended_by"] = "error"
        meta["error"] = f"{type(e).__name__}: {e}"
        run.log("error", error=meta["error"])

    meta["ended_at"] = now()
    run.log("end", ended_by=meta["ended_by"], steps=meta["steps"], tokens_in=meta["tokens_in"],
            tokens_out=meta["tokens_out"], error=meta["error"])
    with open(log_dir / "agent.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return meta


def _generate_with_retry(session, settings, run: Run, meta, sleep) -> Step:
    attempts = int(settings["retry_attempts"])
    delay0 = float(settings["retry_initial_delay_s"])
    delay_max = float(settings["retry_max_delay_s"])
    for attempt in range(attempts):
        try:
            return session.generate()
        except Exception as e:
            if not session.is_retryable(e) or attempt == attempts - 1:
                raise
            delay = min(delay_max, delay0 * (2 ** attempt)) * (0.5 + random.random() / 2)
            meta["retries"] += 1
            run.log("retry", attempt=attempt + 1, delay_s=round(delay, 2),
                    error=f"{type(e).__name__}: {str(e)[:300]}")
            sleep(delay)
    raise RuntimeError("unreachable")


def _short_args(args: dict[str, Any]) -> dict[str, Any]:
    out = {}
    for k, v in args.items():
        if isinstance(v, str) and len(v) > 500:
            out[k] = v[:500] + f"... [{len(v)} characters]"
        else:
            out[k] = v
    return out


def _sdk_versions() -> dict[str, str | None]:
    versions: dict[str, str | None] = {}
    try:
        from google import genai

        versions["google-genai"] = getattr(genai, "__version__", None)
    except ImportError:  # pragma: no cover
        pass
    try:
        import openai

        versions["openai"] = openai.__version__
    except ImportError:  # pragma: no cover
        pass
    return versions


# --------------------------------------------------------------------------- CLI


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("repo", type=Path)
    p.add_argument("request_file", type=Path)
    p.add_argument("log_dir", type=Path)
    p.add_argument("--request", help="request id for agent.json (A, B, C, D, BUILD)")
    p.add_argument("--settings", type=Path, default=DEFAULT_SETTINGS)
    p.add_argument("--backend", choices=["vertex", "apikey", "azure"])
    a = p.parse_args(argv)

    if not a.repo.is_dir():
        p.error(f"repo is not a folder: {a.repo}")
    load_dotenv(PROJECT_ROOT / ".env")
    settings = load_settings(a.settings)
    backend = backend_name(settings, a.backend)
    client = make_client(settings, backend)
    request_text = a.request_file.read_text(encoding="utf-8")
    meta = run_agent(a.repo, request_text, a.log_dir, settings, client, backend=backend,
                     request_id=a.request, request_file=a.request_file.as_posix())
    print(f"{meta['ended_by']}: steps={meta['steps']} tool_calls={meta['tool_calls']} "
          f"tokens_in={meta['tokens_in']} tokens_out={meta['tokens_out']} retries={meta['retries']}"
          + (f" error={meta['error']}" if meta["error"] else ""))
    return {"done": 0, "step_cap": 0, "blocked": 2}.get(meta["ended_by"], 1)


if __name__ == "__main__":
    sys.exit(main())
