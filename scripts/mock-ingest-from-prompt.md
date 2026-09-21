# Mock ingest from prompt

Run the agent prompt at **`prompts/MOCK_INGESTION_SCRIPT_PROMPT.md`** to populate `POST /api/events` with 40–80 synthetic BLS/O*NET-style career events.

```bash
# API origin only; default is the live Render service
EVENTS_API_URL=https://hardcall-api.onrender.com
```

That prompt is self-contained: contract, channel/tag mix, quality bar, and verification. Records are demo/synthetic unless a later live adapter is wired. No BLS or O*NET API keys.
