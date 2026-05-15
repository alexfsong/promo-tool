# Deploying the promo-tool feed

End-to-end ops guide for the promo-tool feed. The architecture is split:

- **Scraper compute** runs on **GitHub Actions** (this repo). Free for
  public repos, passes Pinnacle's Cloudflare WAF (which the VPS's Hetzner
  IP does not — see `specs/005-vps-feed-cutover/research.md` R9).
- **Static feed host** is the existing VPS at **195.201.99.206**, which
  already runs **caddy** alongside `lisearch.195-201-99-206.sslip.io`
  and `portfolio.195-201-99-206.sslip.io`. This guide adds a third site:
  **`promo-tool.195-201-99-206.sslip.io`**.

Every 10 minutes, the Actions workflow runs `node scraper/run.js`, then
rsyncs `/var/www/promo-tool/` to the VPS over a restricted SSH key. caddy
serves the result behind per-friend Basic Auth.

DNS comes for free — [sslip.io](https://sslip.io) wildcard-resolves any
`*.195-201-99-206.sslip.io` host to that IP. caddy auto-provisions and
auto-renews Let's Encrypt TLS on first request.

## Prerequisites (assumed present)

- VPS reachable at `195.201.99.206` over SSH as a non-root user.
- `caddy` v2+ running, with `/etc/caddy/Caddyfile` already configured for
  the two existing sites.
- `rsync` installed on the VPS (Ubuntu default).
- `gh` CLI authenticated locally for triggering workflow runs.

Verify on the VPS:

```bash
ssh maintainer@195.201.99.206
caddy version       # expect v2.x
rsync --version     # expect 3.x
systemctl status caddy --no-pager | head
```

Install `rrsync` (the restricted-rsync wrapper). **Do not use the version
shipped with the Ubuntu `rsync` package** — it is an older Perl script
that rejects flags emitted by modern rsync clients
(`/usr/local/bin/rrsync error: invalid rsync-command syntax or options`).
Grab the upstream Python version, which accepts the current flag set:

```bash
sudo curl -fsSL -o /usr/local/bin/rrsync \
  https://raw.githubusercontent.com/RsyncProject/rsync/master/support/rrsync
sudo chmod +x /usr/local/bin/rrsync
head -3 /usr/local/bin/rrsync   # expect: #!/usr/bin/env python3
which rrsync                     # expect: /usr/local/bin/rrsync
```

## Create the deploy user and the feed directory

The scraper workflow rsyncs as a dedicated low-privilege user, `deploy`,
restricted to writing inside `/var/www/promo-tool` only.

```bash
sudo useradd -m -s /bin/bash deploy
sudo usermod -aG caddy deploy

sudo mkdir -p /var/www/promo-tool/odds
sudo chown -R deploy:caddy /var/www/promo-tool
sudo chmod -R 750 /var/www/promo-tool
```

## Mint the deploy SSH key and pin it to rrsync

Generate the key **locally** (not on the VPS):

```bash
ssh-keygen -t ed25519 -f /tmp/vps_deploy_key -N '' -C 'gha-promo-tool-deploy'
# Two files emitted:
#   /tmp/vps_deploy_key       (private — goes into GitHub repo secret)
#   /tmp/vps_deploy_key.pub   (public — goes into VPS authorized_keys)
```

Capture the VPS host key fingerprint so the workflow doesn't trust a
spoofed host:

```bash
ssh-keyscan -t ed25519 195.201.99.206 > /tmp/vps_known_hosts
```

On the VPS, install the public half with a `command=` restriction so
this key can ONLY run rrsync inside the feed directory:

```bash
sudo -u deploy mkdir -p /home/deploy/.ssh
sudo -u deploy chmod 700 /home/deploy/.ssh
sudo -u deploy touch /home/deploy/.ssh/authorized_keys
sudo -u deploy chmod 600 /home/deploy/.ssh/authorized_keys

# Append a single line — paste the contents of /tmp/vps_deploy_key.pub
# inline after the restriction prefix:
sudo -u deploy $EDITOR /home/deploy/.ssh/authorized_keys
```

The line MUST look like (one line, no wraps):

```
command="/usr/local/bin/rrsync /var/www/promo-tool",restrict ssh-ed25519 AAAA...gha-promo-tool-deploy
```

Test from your laptop:

```bash
ssh -i /tmp/vps_deploy_key deploy@195.201.99.206 'ls /var/www/promo-tool'
# Expect: rsync error message about "rrsync: only rsync allowed". This
# confirms the key works AND the restriction is in force.

# Sanity rsync — should succeed:
echo '[]' > /tmp/sports.json
rsync -av -e "ssh -i /tmp/vps_deploy_key" /tmp/sports.json deploy@195.201.99.206:./sports.json
ssh maintainer@195.201.99.206 'cat /var/www/promo-tool/sports.json'   # → []
rm /tmp/sports.json
```

## Add the GitHub repo secrets

GitHub → repo Settings → Secrets and variables → Actions → New repository secret.
Create three secrets:

| Name | Value |
|---|---|
| `VPS_DEPLOY_KEY` | full contents of `/tmp/vps_deploy_key` (including the `-----BEGIN OPENSSH PRIVATE KEY-----` and `END` lines) |
| `VPS_KNOWN_HOSTS` | full contents of `/tmp/vps_known_hosts` |
| `VPS_DEPLOY_USER` | `deploy` |

Once verified in the Actions tab, scrub the local copies:

```bash
shred -u /tmp/vps_deploy_key /tmp/vps_deploy_key.pub /tmp/vps_known_hosts
```

## Add the caddy site

Append the following block to `/etc/caddy/Caddyfile`. Replace the bcrypt
hash placeholder with the real one generated below.

```caddyfile
promo-tool.195-201-99-206.sslip.io {
    root * /var/www/promo-tool
    file_server

    basicauth {
        maintainer $2a$14$<maintainer-bcrypt-hash>
        # alice    $2a$14$<alice-bcrypt-hash>
        # bob      $2a$14$<bob-bcrypt-hash>
    }

    @json path *.json
    header @json {
        Content-Type "application/json"
        Cache-Control "max-age=60, must-revalidate"
    }

    encode gzip
}
```

Two non-obvious choices baked into the block above:

- **`basicauth` not `basic_auth`**: caddy v2 has both directives. The
  newer `basic_auth` expects passwords as **base64-encoded** bcrypt and
  rejects a raw `$2a$14$...` hash with `illegal base64 data at input
  byte 2`. The older `basicauth` directive accepts raw bcrypt directly,
  which matches what `caddy hash-password` emits on this host. Using
  `basicauth` is what works without conversion.
- **No `log { output file ... }` block**: on this host, caddy's
  systemd unit (`ProtectSystem=full` plus AppArmor) cannot create or
  write to files inside `/var/log/caddy/`, even when the file is
  pre-created `caddy:caddy 640`. Reload silently times out after 90s
  with `permission denied`. caddy still logs everything to the systemd
  journal — tail with `sudo journalctl -u caddy -f` — so the file
  output is redundant.

Reload:

```bash
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

If reload hangs >10s, caddy is wedged on a stale failed reload
(`Active: reloading (reload-notify)`). Hard-restart to clear it
(causes a ~1s blip for the other sites on the host):

```bash
sudo systemctl restart caddy
```

caddy provisions the TLS cert on the first request to that hostname.
Watch caddy's journal for the issuance:

```bash
journalctl -u caddy -f --since '2 minutes ago'
```

## Generate per-friend Basic Auth credentials

caddy's `basic_auth` directive takes bcrypt hashes inline. Generate one
per friend:

```bash
caddy hash-password --plaintext '<a-long-random-password>'
# → $2a$14$abcdef...
```

**Save the plaintext to a password manager before doing anything else.**
The hash is one-way — losing the plaintext means re-generating the hash
and re-distributing the new URL to every friend who already has the old
one. Repeat the same step for each friend (each gets a unique
username + password).

Send each friend exactly one string via DM:

```
https://<their-username>:<their-password>@promo-tool.195-201-99-206.sslip.io
```

The extension's `vpsFeed` provider parses the `user:pass@` portion out
of that URL and injects it as `Authorization: Basic …` on every request.

## Write and trigger the scraper workflow

The workflow file lives at `.github/workflows/scraper.yml` in this repo.
Commit it, push, then trigger manually:

```bash
gh workflow run scraper.yml
gh run watch
```

Expected run shape (≤ 90 s):

1. checkout
2. `node scraper/run.js` (writes JSON under `$RUNNER_TEMP/promo-out`)
3. `ssh-agent` loads `VPS_DEPLOY_KEY`
4. `rsync -az --delete $RUNNER_TEMP/promo-out/ <user>@195.201.99.206:`
   (note the **empty** path after the colon — the `command=`-restricted
   SSH wrapper pins the destination to `/var/www/promo-tool`. Modern
   Python rrsync rejects an explicit `./` as unsafe with
   `rrsync error: unsafe arg: ./`, so the workflow sends nothing.)

Verify from a separate machine:

```bash
# Without creds → 401.
curl -I https://promo-tool.195-201-99-206.sslip.io/sports.json
# Expect: HTTP/2 401 + WWW-Authenticate: Basic ...

# With creds → 200.
curl -u maintainer:<password> https://promo-tool.195-201-99-206.sslip.io/sports.json | jq '.[0]'

# Forced http should redirect to https (caddy default).
curl -I http://promo-tool.195-201-99-206.sslip.io/sports.json
# Expect: 308 → https://...
```

## Observability

Recent runs:

```bash
gh run list -w scraper.yml --limit 20
gh run view <run-id> --log
```

Freshness from the VPS:

```bash
ssh maintainer@195.201.99.206 \
  'stat -c "%y %n" /var/www/promo-tool/sports.json /var/www/promo-tool/odds/*.json'
```

**Known limitation — GitHub free-tier scheduler drift.** The workflow
requests `*/10 * * * *` but on free-tier public-repo runners, GitHub
deprioritizes scheduled workflows in low-activity repos. Observed
cadence on this repo has been **hourly with occasional skipped slots**,
not every 10 minutes. The 15-minute mtime budget above is an
*aspiration*, not a guarantee. Friends are expected to cross-check odds
at bet-placement time anyway; the feed is a heuristic, not a source of
truth. Mitigations if it ever matters: (a) keep the repo active (any
push refreshes the priority), (b) pay for Actions credits, (c) move to
a self-hosted runner, or (d) fall back to laptop-driven rsync. Tracked
as gotcha [68].

caddy access log (in case auth/cache misconfig surfaces):

```bash
sudo journalctl -u caddy --since '15 minutes ago' | grep promo-tool
```

(File logging at `/var/log/caddy/*.log` is intentionally disabled on
this host — the systemd sandbox blocks file writes there. The journal
captures the same lines.)

### TLS expiry

caddy auto-renews Let's Encrypt certs ~30 days before expiry. To verify
the current expiry from any machine:

```bash
echo | openssl s_client -servername promo-tool.195-201-99-206.sslip.io \
  -connect promo-tool.195-201-99-206.sslip.io:443 2>/dev/null | \
  openssl x509 -noout -dates
```

If the cert is within 14 days of expiry and caddy hasn't renewed, watch
the journal for ACME errors:

```bash
sudo journalctl -u caddy --since '24 hours ago' | grep -iE 'acme|tls|cert'
```

Common cause: outbound 80/443 to `acme-v02.api.letsencrypt.org` blocked
(firewall change on the VPS). Fix the egress, then `sudo systemctl
reload caddy` to retry immediately.

### Disk usage / disk-full failure mode

`/var/www/promo-tool` is small (<5 MB per snapshot), so a sustained
disk-full failure is unlikely to come from feed JSON. The risk is
**other tenants on the VPS** filling the partition; rsync then writes
partial files or fails outright, and caddy serves stale JSON.

Check disk + the feed dir size:

```bash
df -h /var/www/promo-tool
du -sh /var/www/promo-tool
```

If the partition is >90% full, rotate logs / clear caches on the noisy
tenant before the next scraper run lands. If rsync silently truncated a
file mid-write, the easiest fix is `gh workflow run scraper.yml` after
the disk pressure clears.

## Adding a friend

```bash
caddy hash-password --plaintext '<their-new-password>'
sudo $EDITOR /etc/caddy/Caddyfile
#   inside the basicauth { } block, add a line:
#     newfriend  $2a$14$<their-bcrypt-hash>
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

DM them: `https://newfriend:<password>@promo-tool.195-201-99-206.sslip.io`.

## Revoking a friend

```bash
sudo $EDITOR /etc/caddy/Caddyfile
#   delete the friend's line inside basicauth { }
sudo systemctl reload caddy
```

Confirm:

```bash
curl -u revokedfriend:<password> -o /dev/null -w '%{http_code}\n' \
  https://promo-tool.195-201-99-206.sslip.io/sports.json
# Expect: 401

curl -u maintainer:<password> -o /dev/null -w '%{http_code}\n' \
  https://promo-tool.195-201-99-206.sslip.io/sports.json
# Expect: 200
```

## Rotating the deploy SSH key

If `VPS_DEPLOY_KEY` is ever suspected leaked:

1. Mint a new key locally (see "Mint the deploy SSH key" above).
2. On the VPS, replace the old line in `/home/deploy/.ssh/authorized_keys`
   with the new public key (keeping the `command=` restriction).
3. Update the `VPS_DEPLOY_KEY` repo secret in GitHub.
4. `gh workflow run scraper.yml` to confirm the new key works.
5. Shred the local copies.

Blast radius of a leaked key (before rotation): an attacker can only
overwrite or delete files under `/var/www/promo-tool` via rsync. They
cannot get a shell, escalate, or touch other paths on the VPS — that's
what the `command=` restriction enforces.

## Standby host

If 195.201.99.206 dies long-term, stand up a replacement and either:

- Move the Caddyfile + the `deploy` user + the `authorized_keys` line
  to the new host. Update `VPS_KNOWN_HOSTS` (new fingerprint), update the
  workflow's hardcoded IP (if any), and repoint
  `promo-tool.<new-ip>.sslip.io` (friends need the new URL via DM), **or**
- If you own a real domain and have CNAMEd `feeds.<your-domain>.tld`
  in front of sslip, just swap the A record. Friends keep their URL.

The extension's `host_permissions` wildcard
(`https://*.195-201-99-206.sslip.io/*`) is currently scoped to **this
specific IP's sslip subdomain space**. If you migrate to a different IP
or to a custom domain, `manifest.json` needs an update and every
friend needs to re-install the unpacked extension. Plan accordingly.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `curl ... → 401` even with `-u user:pass` | typo in password OR wrong bcrypt hash in Caddyfile (bcrypt is one-way; if plaintext is lost it must be regenerated) | regenerate hash with `caddy hash-password`, replace the line in the `basicauth` block, reload |
| `caddy validate → "illegal base64 data at input byte 2"` | Caddyfile uses the newer `basic_auth` directive (expects base64-encoded passwords), but the value is raw `$2a$14$...` bcrypt | rename the directive to `basicauth` (no underscore), which accepts raw bcrypt directly |
| `systemctl reload caddy` hangs ~90s then errors `permission denied` on a `/var/log/caddy/*.log` path | caddy's sandboxed systemd unit cannot write files under `/var/log/caddy/` on this host | remove the `log { output file ... }` block from the site stanza; rely on `journalctl -u caddy` instead. After: `sudo systemctl restart caddy` to clear the wedged `reloading` state |
| Actions run fails on the rsync step with "Permission denied (publickey)" | `VPS_DEPLOY_KEY` secret missing/corrupt OR public key not in `~deploy/.ssh/authorized_keys` | re-paste both halves; verify file perms (700 on `.ssh`, 600 on `authorized_keys`) |
| Actions run fails with "Host key verification failed" | `VPS_KNOWN_HOSTS` secret stale (VPS reinstalled, fingerprint rotated) | `ssh-keyscan -t ed25519 195.201.99.206` and overwrite the secret |
| Actions run succeeds but `/var/www/promo-tool` empty | `command=` restriction or `rrsync` arguments wrong; the workflow's rsync flags don't match what rrsync allows | `gh run view <id> --log` and look at the rsync error; the rrsync man page lists the allowed flags |
| `curl ... → 404 sports.json` | workflow hasn't run yet, or rsync wrote into the wrong directory | check `ls -la /var/www/promo-tool/` and `gh run list -w scraper.yml` |
| `curl ... → 403` | caddy can't read the file — perms wrong | `sudo chown -R deploy:caddy /var/www/promo-tool && sudo chmod -R 750 /var/www/promo-tool` |
| `gh run list` shows scheduled runs missing | GitHub free-tier scheduler deprioritizes low-activity repos — observed cadence is ~hourly with skips, NOT every 10 min (gotcha [68]) | manually `gh workflow run scraper.yml` to catch up; accept as a heuristic-quality feed, not a real-time one |
| All `odds/*.json` are stale (mtime > 30 min) and Actions tab is silent | workflow disabled (auto-disables after 60 days of repo inactivity for scheduled workflows) | re-enable in the Actions tab; `gh workflow enable scraper.yml` |
| Pinnacle source 403 in the Actions log | Cloudflare WAF rotated to block Azure IPs too | re-run `pinnacle-probe.yml` from a fresh runner; if confirmed, swap to laptop-rsync as a temporary fallback (see specs/005-vps-feed-cutover/research.md R9 alternatives) |
| One source consistently errors in log | Pinnacle key rotated OR Action Network book_id rotated | patch `scraper/sources/<src>.js`, push |
| TLS cert is past expiry in browser warning | caddy didn't auto-renew (egress to Let's Encrypt blocked, or caddy wedged) | check `journalctl -u caddy --since '24 hours ago' \| grep -iE 'acme\|cert'`, fix egress, `sudo systemctl reload caddy` |
| rsync step succeeds but files truncated/zero-byte | VPS partition full; another tenant filled the disk mid-write | `df -h /var/www/promo-tool`, free space on the host, then re-run the workflow once disk pressure clears |

## Cost / capacity check

- VPS: already paid for (host runs lisearch + portfolio).
- GitHub Actions: free for public repos. If repo is private, ~3,000 min/mo at `*/10` cadence — slip the cron to `*/15` or accept ~$8/mo overage.
- Bandwidth: ≤ 10 friends × ~6 reads/hour × < 1 MB each ≈ < 5 GB / month additive on the VPS.
- TLS: free via Let's Encrypt (caddy auto-renews).
- Total marginal cost: **$0 / month** (public repo) — improves on SC-004's ≤ $5 target.
