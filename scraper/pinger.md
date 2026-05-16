# External pinger — bypassing GitHub's scheduler throttling

## Why this exists

`scraper.yml` declares `cron: '*/10 * * * *'` (144 fires/day). Soak data from
2026-05-15 showed only **13 of 144 expected slots actually fired** (9%) over a
24h window — a documented limitation of GitHub Actions free-tier scheduling.
GitHub silently drops most `schedule` triggers on low-activity repos under
platform load. Fires that do happen complete green; the loss is purely in
slot delivery.

`workflow_dispatch` triggers are **not** subject to the same throttling. An
external cron service that POSTs `workflow_dispatch` every 10 min restores
close-to-full coverage without changing the workflow logic.

The `schedule:` block stays in `scraper.yml` as a backstop in case the
pinger goes down — belt-and-braces.

## What you need

1. A free **cron-job.org** account (no card, no signup wall).
2. A GitHub **fine-grained personal access token (PAT)** scoped to this repo only.

## Step 1 — mint the PAT

Visit https://github.com/settings/personal-access-tokens/new and configure:

- **Token name**: `promo-tool-pinger`
- **Expiration**: 1 year (renew via calendar reminder)
- **Repository access**: *Only select repositories* → `alexfsong/promo-tool`
- **Permissions** → *Repository permissions*:
  - **Actions**: Read and write
  - (leave everything else at "No access")

Click *Generate token*. Copy the `github_pat_...` string immediately — GitHub
will not show it again.

## Step 2 — verify the PAT manually

```bash
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <PAT>" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/alexfsong/promo-tool/actions/workflows/scraper.yml/dispatches \
  -d '{"ref":"main"}'
```

Expected: HTTP `204 No Content`, empty body. Confirm with:

```bash
gh run list -w scraper.yml --event workflow_dispatch --limit 3
```

A new run should appear within ~10 s.

## Step 3 — configure cron-job.org

Sign up at https://cron-job.org, then *Cronjobs → Create cronjob*:

| Field | Value |
|------|------|
| Title | `promo-tool scraper ping` |
| URL | `https://api.github.com/repos/alexfsong/promo-tool/actions/workflows/scraper.yml/dispatches` |
| Schedule | Every 10 minutes (`*/10 * * * *`) |
| Request method | `POST` |
| Request headers | `Accept: application/vnd.github+json`<br>`Authorization: Bearer <PAT>`<br>`X-GitHub-Api-Version: 2022-11-28`<br>`User-Agent: promo-tool-pinger` |
| Request body | `{"ref":"main"}` |
| Notifications | Email on failure (3 consecutive) |
| Expected status code | `204` |

`User-Agent` is required by the GitHub REST API; cron-job.org sends one by
default but pinning an explicit value makes troubleshooting easier.

Save. The first fire should hit within 10 min — verify in cron-job.org's
*History* tab (should show `204`) and in the GitHub run list.

## Step 4 — re-soak

Leave for 24h, then re-run T041:

```bash
gh run list -w scraper.yml --limit 200 --json conclusion,createdAt,event \
  --jq '[.[] | {c:.conclusion,t:.createdAt,e:.event}]'
```

Pass criteria (relaxed from the original SC-005 to acknowledge the platform
limitation):

- ≥ 95% of `workflow_dispatch` fires green
- ≥ 95% of 10-min slots had **some** fire (either `schedule` or
  `workflow_dispatch`) within ±5 min
- P95 of `last_update` ages across `odds/*.json` ≤ 20 min (SC-002)

## Failure modes & fixes

| Symptom | Likely cause | Fix |
|------|------|------|
| `401 Unauthorized` from API | PAT expired or wrong scope | Re-mint with `Actions: Read and write` |
| `404 Not Found` | Wrong repo path or workflow filename | Verify `alexfsong/promo-tool` and `scraper.yml` |
| `422 Unprocessable` | Missing `ref` in body | Body must be `{"ref":"main"}` |
| cron-job.org shows green but no GH run | Workflow disabled (60-day inactivity) | `gh workflow enable scraper.yml` |
| Duplicate runs at same minute | Schedule + pinger collided | Harmless — `concurrency.group: scraper` serializes |

## When to retire this

If GitHub fixes scheduler reliability, or this repo's activity gets high
enough that schedule fires reliably, delete the cron-job.org job and the PAT.
The workflow itself needs no change — `schedule:` already covers the fallback.
