# Deploying the promo-tool feed

End-to-end ops guide for adding the promo-tool feed to the existing
VPS at **195.201.99.206**. The host already runs **caddy** alongside
sites `lisearch.195-201-99-206.sslip.io` and
`portfolio.195-201-99-206.sslip.io`. This spec adds a third site:
**`promo-tool.195-201-99-206.sslip.io`**.

DNS comes for free — [sslip.io](https://sslip.io) wildcard-resolves any
`*.195-201-99-206.sslip.io` host to that IP. caddy auto-provisions and
auto-renews Let's Encrypt TLS on first request.

## Prerequisites (assumed present)

- VPS reachable at `195.201.99.206` over SSH as a non-root user.
- `caddy` v2+ running, with `/etc/caddy/Caddyfile` already configured for
  the two existing sites.
- `node` ≥ 20 installed.

Verify:

```bash
ssh maintainer@195.201.99.206
caddy version       # expect v2.x
node --version      # expect v20.x
systemctl status caddy --no-pager | head
```

## Clone the repo + first scraper run

```bash
sudo mkdir -p /opt && sudo chown $USER:$USER /opt
git clone <repo-url> /opt/promo-tool

sudo mkdir -p /var/www/promo-tool
# caddy on Ubuntu runs as user `caddy`; give it read access:
sudo chown -R $USER:caddy /var/www/promo-tool
sudo chmod -R 750 /var/www/promo-tool

# Dry-run first — confirms Pinnacle + Action Network reach from this IP.
cd /opt/promo-tool/scraper && node run.js --dry-run

# First real run.
OUT_DIR=/var/www/promo-tool node /opt/promo-tool/scraper/run.js

ls /var/www/promo-tool/
ls /var/www/promo-tool/odds/
```

## Generate per-friend Basic Auth credentials

caddy's `basic_auth` directive takes bcrypt hashes inline. Generate one
per friend:

```bash
# For the maintainer:
caddy hash-password --plaintext '<a-long-random-password>'
# → $2a$14$abcdef...     (copy this)

# For each friend, repeat with a different password. Keep the
# plaintext in a password manager — the bcrypt hash is one-way.
```

Send each friend exactly one string via DM:

```
https://<their-username>:<their-password>@promo-tool.195-201-99-206.sslip.io
```

The extension's `vpsFeed` provider parses the `user:pass@` portion out
of that URL and injects it as `Authorization: Basic …` on every request.

## Add the caddy site

Append the following block to `/etc/caddy/Caddyfile`. Replace the
bcrypt hashes with the real ones you generated above.

```caddyfile
promo-tool.195-201-99-206.sslip.io {
    root * /var/www/promo-tool
    file_server

    basic_auth {
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
    log {
        output file /var/log/caddy/promo-tool.log
        format console
    }
}
```

Reload:

```bash
sudo caddy fmt --overwrite /etc/caddy/Caddyfile     # tidy formatting
sudo caddy validate --config /etc/caddy/Caddyfile   # syntax check
sudo systemctl reload caddy
```

caddy provisions the TLS cert on the first request to that hostname.
Watch caddy's journal for the issuance:

```bash
journalctl -u caddy -f --since '2 minutes ago'
# Expect "certificate obtained successfully" within ~10s of the first request.
```

## Verify end-to-end from a separate machine

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

## Cron

Maintainer's crontab, runs every 10 minutes:

```bash
sudo touch /var/log/promo-scraper.log
sudo chown $USER:$USER /var/log/promo-scraper.log

crontab -e
```

Append:

```cron
*/10 * * * * cd /opt/promo-tool/scraper && OUT_DIR=/var/www/promo-tool node run.js >> /var/log/promo-scraper.log 2>&1
```

Wait 11 minutes, then verify:

```bash
tail -20 /var/log/promo-scraper.log
stat -c '%y %n' /var/www/promo-tool/sports.json /var/www/promo-tool/odds/*.json
# Every mtime should be within the last 11 minutes.
```

## Adding a friend

```bash
# Generate a hash:
caddy hash-password --plaintext '<their-new-password>'

# Append a line inside the basic_auth block in /etc/caddy/Caddyfile:
sudo $EDITOR /etc/caddy/Caddyfile
#   add:    newfriend  $2a$14$<their-bcrypt-hash>

sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy   # no downtime — caddy reload is graceful
```

DM them: `https://newfriend:<password>@promo-tool.195-201-99-206.sslip.io`.

## Revoking a friend

```bash
sudo $EDITOR /etc/caddy/Caddyfile
#   delete the friend's line inside basic_auth { }
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

## Standby host

If 195.201.99.206 dies long-term, stand up a replacement and either:

- Move the same Caddyfile + hashes to the new host, repoint
  `promo-tool.<new-ip>.sslip.io` (different hostname — friends need
  the new URL via DM), **or**
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
| `curl ... → 401` even with `-u user:pass` | typo in password OR wrong bcrypt hash in Caddyfile | regenerate hash with `caddy hash-password`, update Caddyfile, reload |
| `curl ... → curl: (60) SSL certificate problem` | caddy hasn't issued the cert yet — DNS or rate-limit issue | `journalctl -u caddy -f`; verify `dig +short promo-tool.195-201-99-206.sslip.io` returns the IP |
| `curl ... → 404 sports.json` | scraper hasn't run yet, or `OUT_DIR` mismatch | `ls /var/www/promo-tool/` and re-run `OUT_DIR=/var/www/promo-tool node run.js` |
| `curl ... → 403` | caddy can't read the file — perms wrong | `sudo chown -R $USER:caddy /var/www/promo-tool && sudo chmod -R 750 /var/www/promo-tool` |
| `cron` log shows `error: ENOSPC` | disk full | `df -h`; rotate logs with `logrotate` |
| All `odds/*.json` are stale (mtime > 30 min) | cron stopped, or scraper hangs | `systemctl status cron` ; run scraper manually to see errors |
| One source consistently errors in log | Pinnacle key rotated OR Action Network book_id rotated | patch `scraper/sources/<src>.js`, redeploy |

## Cost / capacity check

- VPS: already paid for (host runs lisearch + portfolio).
- Bandwidth: ≤ 10 friends × ~6 reads/hour × < 1 MB each ≈ < 5 GB / month additive.
- TLS: free via Let's Encrypt (caddy auto-renews).
- Total marginal cost: **$0 / month** (improves on SC-004's ≤ $5 target).
