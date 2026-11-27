# Agent runner

One request = one fresh agent session over one app repo (plan guide B.5).

The default backend is **Azure AI Foundry** (`gpt-5.4-mini`), see `docs/DECISIONS.md`
(2026-11-27). Gemini on Vertex AI (`vertex`) and the AI Studio key (`apikey`) are kept as
fallbacks and chosen with `--backend` or `VIBE_AGENT_BACKEND`.

## Set up (once per machine)

1. Copy `.env.example` to `.env` at the repo root (git-ignored) and fill in the Azure lines.
   The endpoint and key are in the Azure portal under the resource's
   **Resource Management → Keys and Endpoint**. Never commit `.env` or paste the key in chat.
   ```
   VIBE_AGENT_BACKEND=azure
   AZURE_FOUNDRY_ENDPOINT=https://<resource-name>.cognitiveservices.azure.com/
   AZURE_FOUNDRY_API_KEY=<key 1>
   AZURE_FOUNDRY_DEPLOYMENT=gpt-5.4-mini
   ```
2. Docker must be running: the agent's `run_shell` tool uses a disposable
   `node:20.20.2-alpine` container with only the app repo mounted and no credentials in its
   environment.

The team's resource is `comp3226-vibe-audit-ai` in resource group `comp3226-vibe-audit`
(Azure for Students, Germany West Central), with a `gpt-5.4-mini` GlobalStandard deployment.

## Run one request

```
uv run --no-project --with-requirements agent/requirements.txt \
    python agent/agent_runner.py <repo> <request_file> <log_dir> --request A
```

It writes `<log_dir>/transcript.jsonl` (every model and tool call) and
`<log_dir>/agent.json` (model, steps, tokens, how it ended), which `tools/ingest.py` reads.
Exit code 0 = done or step cap, 2 = blocked by the API's content filter, 1 = error.

Settings are fixed in `agent/settings.json`; see `docs/DECISIONS.md` before changing anything.

## Check a backend is reliable

```
uv run --no-project --with-requirements agent/requirements.txt \
    python agent/reliability_check.py --backend azure
```

20 single-call pings, 5 toy agent runs, one path-escape attempt and one sandboxed shell
run. Results go to `work/agent-reliability/<backend>-<UTC time>/summary.json` (git-ignored).

## Tests

```
uv run --no-project --with-requirements agent/requirements.txt --with pytest \
    python -m pytest -q -p no:cacheprovider agent/tests
```

The model is faked, so the tests make no API calls. The two sandbox tests run only when
Docker answers.
