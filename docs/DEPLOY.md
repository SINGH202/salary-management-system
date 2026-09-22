# Deploy: GCP Always Free (API + SQLite) + Vercel (web)

**Recommended path for this project** (~$0 backend if you stay in free limits).


| Piece                | Where                             | Cost        |
| -------------------- | --------------------------------- | ----------- |
| Express API + SQLite | GCP Compute Engine `**e2-micro**` | Always Free |
| Next.js UI           | **Vercel Hobby**                  | Free        |


Do **not** put SQLite on Vercel — the filesystem is ephemeral.

### Free-tier limits (must follow)


| Limit   | Value                                                     |
| ------- | --------------------------------------------------------- |
| Machine | `**e2-micro**` only (shared vCPU, **1 GB RAM**)           |
| Regions | `**us-central1**`, `**us-west1**`, or `**us-east1**` only |
| Disk    | Up to **30 GB** standard persistent disk                  |
| Egress  | **1 GB/month** outbound (enough for a demo)               |


1 GB RAM is tight for the 10k seed — use the swap + `tmux` steps in §5 (or temporarily resize to `e2-small`, seed, then resize back).

Alternative (paid credits): [AWS EC2 + Vercel](#alternative-aws-ec2--vercel).

---

## 0. GCP account prep

1. Open [console.cloud.google.com](https://console.cloud.google.com) and sign in.
2. Create a project (e.g. `acme-salary`).
3. Link a **billing account** (required even for Always Free; you are not charged if you stay in limits).
4. **Billing → Budgets & alerts** → create alerts at **$1** and **$5**.
5. Enable **Compute Engine API** when prompted on first VM create.

New accounts may also get a **$300 trial credit** — useful if you briefly use `e2-small` to seed.

---

## 1. Create the free VM

1. **Compute Engine → VM instances → Create instance**.
2. Set:


| Field        | Value                                                            |
| ------------ | ---------------------------------------------------------------- |
| Name         | `acme-api`                                                       |
| Region       | `**us-central1**` (or `us-west1` / `us-east1`)                   |
| Zone         | e.g. `us-central1-a`                                             |
| Series       | **E2**                                                           |
| Machine type | `**e2-micro**`                                                   |
| Boot disk    | **Ubuntu 24.04 LTS**, **20–30 GB**, **Standard persistent disk** |
| Firewall     | ✅ **Allow HTTP traffic**, ✅ **Allow HTTPS traffic**              |


1. Click **Create** → wait for **Running**.
2. Copy the **External IP** (call it `EXTERNAL_IP` below).

### Firewall check

If HTTP does not work later: **VPC network → Firewall** and confirm rules allow tcp **80** / **443** from `0.0.0.0/0` (default `default-allow-http` / `default-allow-https`).

Use the console **SSH** button (no need to open port 22 publicly).

---

## 2. SSH into the VM

VM instances → `acme-api` → **SSH**.

Or:

```bash
gcloud compute ssh acme-api --zone=us-central1-a --project=YOUR_PROJECT_ID
```

---

## 3. Install Node 20, pnpm, Nginx, PM2 + swap

```bash
sudo apt update
sudo apt install -y nano nginx git curl build-essential tmux
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pnpm@9 pm2

node -v   # expect v20.x
pnpm -v   # expect 9.x
```

(`nano` is used later to edit `apps/api/.env`. On a minimal image you can also install it alone with `sudo apt update && sudo apt install -y nano`.)
**Swap is required** on 1 GB RAM:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

---

## 4. Clone repo and configure API env

```bash
sudo mkdir -p /var/lib/acme /opt/acme
sudo chown "$USER":"$USER" /var/lib/acme /opt/acme
cd /opt/acme
git clone https://github.com/SINGH202/salary-management-system.git .
pnpm install --filter @acme/api...
```

```bash
nano /opt/acme/apps/api/.env
```

```bash
DATABASE_URL="file:/var/lib/acme/acme.db?connection_limit=1"
PORT=4000
BASE_CURRENCY=INR
# Update after Vercel deploy (exact origin, no trailing slash)
CORS_ORIGIN="http://localhost:3000"
DEMO_ACCESS_TOKEN="pick-a-long-random-string"
```

Save: `Ctrl+O`, Enter, `Ctrl+X`.

---

## 5. Migrate and seed

```bash
cd /opt/acme
pnpm --filter @acme/api db:migrate
```

Seed in `tmux` so an SSH drop does not kill it (can take 15–40+ minutes on e2-micro).

Use a **small batch size** so Prisma interactive transactions do not hit **P2028** (transaction timed out / closed) on 1 GB RAM:

```bash
cd /opt/acme/apps/api
tmux new -s seed
SEED_BATCH_SIZE=50 NODE_OPTIONS="--max-old-space-size=768" pnpm db:seed
# Detach: Ctrl+B then D
# Reattach: tmux attach -t seed
```

If you see `P2028` / “Transaction not found”, re-run with an even smaller batch (`SEED_BATCH_SIZE=25`) or temporarily resize to **`e2-small`**, seed, then resize back.

If the process is killed (exit **137** / OOM):

1. Stop the VM → edit → change type to `**e2-small**` → start
2. Re-run seed
3. Stop → change type back to `**e2-micro**` → start
  (`/var/lib/acme/acme.db` stays on disk)

```bash
ls -lh /var/lib/acme/acme.db
```

---

## 6. Build and run with PM2

```bash
cd /opt/acme
pnpm --filter @acme/api build
cd apps/api
pm2 start dist/server.js --name acme-api
pm2 save
pm2 startup
# Run the sudo command that PM2 prints
```

```bash
curl -s http://127.0.0.1:4000/api/health
# {"status":"ok"}
```

---

## 7. Nginx on port 80

```bash
sudo tee /etc/nginx/sites-available/acme-api >/dev/null <<'EOF'
server {
  listen 80;
  server_name _;

  client_max_body_size 10m;

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
EOF

sudo ln -sf /etc/nginx/sites-available/acme-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

```bash
curl -s http://EXTERNAL_IP/api/health
```

### HTTPS (strongly recommended before Vercel)

Vercel serves **HTTPS**. A browser calling an **HTTP** API from that page will hit **mixed content** errors.

1. Point a DNS **A** record (e.g. `api.yourdomain.com`) at `EXTERNAL_IP`.
2. On the VM:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

Use `https://api.yourdomain.com` in all later env vars.

---

## 8. Frontend on Vercel

1. [vercel.com](https://vercel.com) → **Add New Project** → import `SINGH202/salary-management-system`.
2. **Root Directory:** `apps/web` (see also `apps/web/vercel.json`).
3. Framework: **Next.js**, Node **20**.
4. **Environment variables (Production):**

```bash
# Prefer HTTPS API URL (see §7)
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
API_INTERNAL_URL=https://api.yourdomain.com
NEXT_PUBLIC_DEMO_ACCESS_TOKEN=pick-a-long-random-string
```

If you only have the raw IP for a quick test (HTTP):

```bash
NEXT_PUBLIC_API_URL=http://EXTERNAL_IP
API_INTERNAL_URL=http://EXTERNAL_IP
NEXT_PUBLIC_DEMO_ACCESS_TOKEN=pick-a-long-random-string
```

`NEXT_PUBLIC_DEMO_ACCESS_TOKEN` **must** equal the API `DEMO_ACCESS_TOKEN`.

1. Deploy → copy the site URL (e.g. `https://acme-salary.vercel.app`).
2. On the VM, lock CORS and restart:

```bash
nano /opt/acme/apps/api/.env
# CORS_ORIGIN="https://acme-salary.vercel.app"
pm2 restart acme-api
```

---

## 9. Smoke checklist

- [ ] `GET /api/health` on the API returns ok  
- [ ] Vercel Employees page loads (active list)  
- [ ] Search / filters work  
- [ ] Employee detail + salary history  
- [ ] Analytics charts  
- [ ] CSV export  
- [ ] Hire / raise / terminate (spot-check)  
- [ ] Demo URL + token noted in root `README.md` and `docs/DEMO.md`  

---

## 10. Stay free

- Keep `**e2-micro**` in `**us-central1` / `us-west1` / `us-east1**`
- Disk ≤ **30 GB** standard  
- Do not reserve unused static IPs unnecessarily  
- Watch budget alert emails

```bash
pm2 status
pm2 logs acme-api
pm2 restart acme-api

cd /opt/acme && git pull && pnpm install --filter @acme/api... \
  && pnpm --filter @acme/api build && pm2 restart acme-api
```

**Stop spending:** VM → **Stop**. **Delete** when the assessment is over (copy `acme.db` off first if you want a backup).

---

## Troubleshooting


| Symptom                 | Fix                                                                               |
| ----------------------- | --------------------------------------------------------------------------------- |
| Seed exit 137 / killed  | Swap + `tmux`; or seed on `e2-small`, resize back to `e2-micro`                   |
| Seed `P2028` / Transaction not found | `SEED_BATCH_SIZE=50` (or `25`); pull latest seed; or seed on `e2-small` |
| CORS errors             | `CORS_ORIGIN` must match the Vercel origin exactly (`https://…`, no trailing `/`) |
| Mixed content           | Put HTTPS on the API (Certbot) before using Vercel                                |
| Can’t create `e2-micro` | Wrong region, or request quota for E2 micros                                      |
| `pnpm: not found`       | `sudo npm i -g pnpm@9`                                                            |
| Build OOM               | Rely on swap; build only `@acme/api`                                              |


---

## Alternative: AWS EC2 + Vercel

Use this if GCP signup fails and your **AWS account is fully activated** (payment verified). Rough cost: small EC2 while using credits (~few $/mo equivalent).

1. Launch **Ubuntu 24.04**, `**t3.small`** (or `t3.micro`), 20 GB disk, SG: 22 (your IP), 80/443 public.
2. Same install/clone/env/migrate/seed/pm2/nginx steps as §§3–7, with `DATABASE_URL=file:/var/lib/acme/acme.db?connection_limit=1`.
3. Same Vercel steps as §8, pointing at the EC2 API URL.
4. Set an AWS billing alarm at $5–10.

GCP Always Free remains the preferred $0 path for this assessment.