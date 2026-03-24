# Script Console

Local web console for running a curated set of shell scripts with authentication, run history, and log browsing.

Author: yuanxun.mei@gmail.com

## Features

- Password-protected web access using session authentication
- Whitelisted script execution from `config/app.config.json`
- One-click run from dashboard and script detail pages
- Per-run history with status, exit code, duration, and timestamps
- Live server-side run tracking (`/api/running`)
- Persistent stdout/stderr log files per run
- PM2-ready process config (`ecosystem.config.js`)

## Quick Start

### 1. Install

```bash
cd /Users/bookit002/projects/guide/auto-deploy
npm install
```

### 2. Configure

```bash
cp config/app.config.example.json config/app.config.json
```

Update `config/app.config.json`:

- `adminPassword`: login password
- `sessionSecret`: long random secret for sessions
- `port`: optional, defaults to `3000`
- `scripts`: allowed scripts (`id`, `name`, `command`, `cwd`)

### 3. Run

Run directly with Node.js:

```bash
npm start
```

Or run with PM2:

```bash
pm2 start ecosystem.config.js
pm2 status
pm2 logs script-console
```

Open: `http://localhost:3000`

## Configuration

Main config file: `config/app.config.json`

Example schema:

```json
{
  "port": 3000,
  "sessionSecret": "replace-with-a-long-random-secret",
  "adminPassword": "ChangeMe123!",
  "scripts": [
    {
      "id": "deploy-example",
      "name": "Example Deploy Script",
      "command": "./scripts/deploy-example.sh",
      "cwd": "."
    }
  ]
}
```

Notes:

- `id` must be unique.
- Script runs via `/bin/zsh -lc "<command>"`.
- `cwd` is resolved relative to project root.

## API

All endpoints below require authentication unless noted.

### Auth

- `GET /login`: render login page
- `POST /login`: login with form field `password`
- `POST /logout`: clear session and redirect to login

### Pages

- `GET /`: dashboard with all scripts
- `GET /script/:scriptId`: script detail with recent history

### JSON APIs

- `GET /api/history`
  - Return latest global history (up to 100 records)
- `GET /api/history/:scriptId`
  - Return latest history for one script (up to 100 records)
- `GET /api/running`
  - Return currently running jobs
- `GET /api/logs?type=stdout&stdoutFile=<path>`
- `GET /api/logs?type=stderr&stderrFile=<path>`
  - Read a log file under `logs/`
- `POST /api/run/:scriptId`
  - Start a script if not currently running
  - Returns `409` if that script is already running

Common error behavior:

- `401` for unauthenticated API requests
- `404` for unknown script IDs or missing log files
- `400` for invalid log file path

## Data and Logs

- Run history: `data/run-history.jsonl`
- Script logs: `logs/*-stdout.log`, `logs/*-stderr.log`
- PM2 logs (by ecosystem config):
  - `logs/pm2-out.log`
  - `logs/pm2-error.log`

Each history line is a JSON object including:

- `runId`, `scriptId`, `scriptName`
- `command`, `cwd`
- `startTime`, `endTime`, `durationMs`
- `status`, `exitCode`, `signal`
- `stdoutFile`, `stderrFile`

## Project Structure

```text
auto-deploy/
├── config/
│   ├── app.config.example.json
│   └── app.config.json
├── data/
│   └── run-history.jsonl
├── logs/
├── public/
├── scripts/
├── src/
│   └── server.js
├── views/
├── ecosystem.config.js
└── README.md
```

## Troubleshooting

### `Missing config file` on startup

Copy config first:

```bash
cp config/app.config.example.json config/app.config.json
```

### Login always fails

- Verify `adminPassword` in `config/app.config.json`
- Restart server after config changes

### `Script not found`

- Ensure script ID exists in `scripts[]`
- Ensure route uses exact `scriptId`

### Script starts but fails

- Check `cwd` is correct
- Run command manually in terminal to verify dependencies and permissions
- Inspect `stdout`/`stderr` files in `logs/`

### `Script is already running`

The same script ID cannot run concurrently. Wait for completion or use a separate script ID.

### PM2 process not visible

Use:

```bash
pm2 status
pm2 logs script-console
```

## Security Notes

- This service is intended for local/private network use.
- Use a strong `adminPassword` and `sessionSecret`.
- Only whitelist trusted commands in `scripts`.
- Avoid exposing the service directly to the public internet.

## License

ISC (see `package.json`).
