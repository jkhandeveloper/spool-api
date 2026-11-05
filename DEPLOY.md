# Deploying Spool API

Production runs at **https://api.spool.zasstech.com** on the DigitalOcean droplet `68.183.89.22` (Ubuntu 24.04). The server also hosts the zass apps, so Spool keeps to its own user, folder, containers and nginx site.

| What | Where |
|---|---|
| App folder | `/opt/spool-api` (owned by `deploy`) |
| Secrets | `/opt/spool-api/.env` (mode 600, never in git) |
| Containers | `spool_api` (port `127.0.0.1:3010`), `spool_postgres` (volume `spool_spool-pg`) |
| nginx site | `/etc/nginx/sites-available/api.spool.zasstech.com` → `127.0.0.1:3010` |
| Image | `ghcr.io/jkhandeveloper/spool-api:<commit sha>` |

## 1. Log in to the server

Two keys work, for two users:

| Key on your machine | User | Use it for |
|---|---|---|
| `~/.ssh/digitalocean_key` | `root` | Server admin (nginx, certbot, users) |
| `~/.ssh/spool_deploy` | `deploy` | Spool only (Docker, `/opt/spool-api`). GitHub Actions uses this one too. |

Add this to `~/.ssh/config` so you don't have to remember them:

```
Host spool
    HostName 68.183.89.22
    User root
    IdentityFile ~/.ssh/digitalocean_key
    IdentitiesOnly yes

Host spool-deploy
    HostName 68.183.89.22
    User deploy
    IdentityFile ~/.ssh/spool_deploy
    IdentitiesOnly yes
```

Then `ssh spool` (root) or `ssh spool-deploy`.

## 2. One-time server setup

**Already done:** the `deploy` user (in the `docker` group, with the `spool_deploy` public key), `/opt/spool-api/.env` with generated database and JWT secrets, and the nginx site. These are the steps that remain.

### 2a. DNS

`zasstech.com` uses Cloudflare. In Cloudflare → DNS, add:

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `api.spool` | `68.183.89.22` | **DNS only (grey cloud)** |

Keep it grey. Cloudflare's free certificate only covers one level (`*.zasstech.com`), so a proxied `api.spool.zasstech.com` would fail TLS. The certificate comes from Let's Encrypt on the server instead.

Check it: `dig +short api.spool.zasstech.com` should print `68.183.89.22`.

### 2b. HTTPS certificate

```bash
ssh spool
certbot --nginx -d api.spool.zasstech.com --redirect -m you@example.com --agree-tos -n
```

Certbot edits the nginx site to add TLS and an http → https redirect, and its timer renews the certificate automatically.

### 2c. Anthropic API key (for session summaries)

```bash
ssh spool-deploy
nano /opt/spool-api/.env        # set ANTHROPIC_API_KEY=sk-ant-...
cd /opt/spool-api && docker compose -f docker-compose.prod.yml up -d
```

Until a key is set, everything else works, but summaries fail and the app offers **Try again**.

## 3. GitHub Actions secrets

In GitHub → **jkhandeveloper/spool-api** → Settings → Secrets and variables → Actions → **New repository secret**:

| Name | Value |
|---|---|
| `DEPLOY_HOST` | `68.183.89.22` |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | The whole contents of `~/.ssh/spool_deploy` (the private key, including the `-----BEGIN` / `-----END` lines). Print it with `cat ~/.ssh/spool_deploy`. |

The workflow also uses a `production` environment, which GitHub creates on the first run. To require a manual approval before each deploy, open Settings → Environments → production and add yourself as a required reviewer.

## 4. How CI/CD works

[.github/workflows/ci-cd.yml](.github/workflows/ci-cd.yml):

1. **On every push and pull request:** it runs lint, typecheck, unit tests, e2e tests (against a throwaway Postgres) and the build.
2. **On push to `main`,** after the tests pass:
   - It builds the Docker image and pushes it to GHCR, tagged with the commit SHA and `latest`.
   - It copies [deploy/docker-compose.prod.yml](deploy/docker-compose.prod.yml) and [deploy/deploy.sh](deploy/deploy.sh) to `/opt/spool-api`, then runs `deploy.sh` over SSH as `deploy`.
   - `deploy.sh` pulls the new image and restarts `spool_api`. Database migrations run on startup. It then waits for the container's health check. **If the new version isn't healthy within 90 seconds, it rolls back to the previous image** and the job fails.
   - Last, it calls `https://api.spool.zasstech.com/api/v1/health`.

The server never builds anything. It only pulls images, because 1 GB of RAM is too little to compile next to the zass apps.

Deploy manually without a new commit: Actions → CI/CD → **Run workflow**.

## 5. Day-to-day commands

```bash
ssh spool-deploy
cd /opt/spool-api
docker compose -f docker-compose.prod.yml ps            # status
docker logs -f --tail 100 spool_api                      # API logs
cat .current-image                                       # what's deployed
SPOOL_IMAGE=ghcr.io/jkhandeveloper/spool-api:<older-sha> ./deploy.sh   # roll back*
```

\*Pulling from GHCR needs a login if the image is private: `docker login ghcr.io -u <github user>` with a personal access token that has the `read:packages` scope. CI logs in and out on every deploy by itself.

Database backup and restore:

```bash
docker exec spool_postgres pg_dump -U spool -Fc spool > spool-$(date +%F).dump
docker exec -i spool_postgres pg_restore -U spool -d spool --clean < spool-YYYY-MM-DD.dump
```

## 6. Recommended hardening (not done automatically)

- **Firewall.** `ufw` is currently inactive. To turn it on, keep your SSH session open and run the following, then confirm a *new* SSH session still works:
  ```bash
  ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable
  ```
  Docker ports here are bound to `127.0.0.1`, so they stay private either way.
- **Root SSH by key only.** Once `ssh spool` works for you with the key, set `PasswordAuthentication no` in `/etc/ssh/sshd_config` and run `systemctl reload ssh`.
- **Memory.** The droplet has 1 GB RAM and 2 GB swap, already about half used before Spool. Spool adds about 100 MB (the containers are capped at 320 MB and 160 MB). If things slow down, resize to 2 GB.
- **Password reset email.** It isn't wired up yet. In production the reset code is only written to the API log (`docker logs spool_api | grep -i reset`), so users can't reset passwords themselves until a mail provider is added.
