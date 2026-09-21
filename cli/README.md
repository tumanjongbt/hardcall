# events

Standalone CLI that `POST`s one career-market event to the ingest API (`/api/events`). Independent of the API package — own `package.json`, no extra runtime dependencies (Node 20+).

## Install / run

From this directory or the repo root:

```bash
# no install — Node runs the file directly
node cli/src/events.js push --channel university --title "CS salaries up"

# from cli/
node src/events.js push --channel university --title "CS salaries up"

# npx the local package
cd cli
npx --yes . push --channel university --title "CS salaries up"

# global-style command on this machine
cd cli
npm link
events push --channel university --title "CS salaries up"
```

`npm link` puts `events` on your PATH. Unlink with `npm unlink -g events`.

## Usage

```bash
events push --channel <CHANNEL> --title <TITLE> \
  [--description <DESC>] [--icon <EMOJI>] [--tags <TAGS>] \
  [--api-url <URL>]
```

| flag | maps to | notes |
| --- | --- | --- |
| `--channel` | `channel` | required. `university` \| `community_college` \| `trade` \| `apprenticeship` \| `automation` |
| `--title` | `title` | required |
| `--description` | `description` | optional |
| `--icon` | `emoji` | optional emoji / short icon string |
| `--tags` | `tags` | optional comma-separated list → JSON string array |
| `--api-url` | — | API **base** URL (no path). Overrides `EVENTS_API_URL` |

The CLI always sends `source: "cli"` so dashboard badges can distinguish CLI rows from Playground, seed, or live adapters.

**Tags:** `high_school_students` · `college_students` · `parents` · `career_counselors` · `workforce_training_managers`

## API URL

1. `--api-url` if set
2. else `EVENTS_API_URL`
3. else `https://hardcall-api.onrender.com`

```bash
EVENTS_API_URL=http://127.0.0.1:3000 \
  node src/events.js push --channel trade --title "HVAC demand" --icon "🔧" --tags high_school_students,parents
```

## Output and exit codes

- **201:** prints the response JSON on stdout, exit `0`
- **anything else:** message on stderr, exit `1` (validation, network, non-201 HTTP)

```bash
node src/events.js push \
  --channel university \
  --title "CS starting salaries up in metro X" \
  --description "optional" \
  --icon "📈" \
  --tags college_students,parents \
  --api-url https://hardcall-api.onrender.com
```
