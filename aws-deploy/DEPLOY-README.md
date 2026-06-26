# InfraCo OS — AWS Deployment Kit
Land Fortune Holdings / EOS Technology

Provisions the InfraCo OS production stack on a single EC2 instance via
CloudFormation. The runtime stack itself is the repo's committed `docker/`
compose stack — this kit only adds the AWS infrastructure and an unattended
bootstrap that brings that stack up.

- **Backend**: NestJS 10 + Prisma 5
- **Database**: PostGIS 16-3.4 (schema auto-applies on first boot from `db/infraco_os_schema.sql`)
- **Connection pooler**: PgBouncer (transaction mode) between the API and Postgres
- **Cache / queues**: Redis (BullMQ — SMS/USSD delivery)
- **Frontend**: React 18 + Vite + Tailwind + react-leaflet + Recharts
- **Web server**: nginx (serves the built SPA, reverse-proxies the API, terminates TLS)

---

## What's in this folder

| File | Purpose |
|------|---------|
| `infraco-os-cloudformation.yaml` | Provisions VPC, EC2, Elastic IP, security group, IAM, and bootstraps the stack |
| `DEPLOY-README.md` | This guide |

The runtime stack lives in the repo's **`docker/`** directory and is **not**
duplicated here:

| File | Purpose |
|------|---------|
| `docker/docker-compose.prod.yml` | Production compose (db + pgbouncer + redis + api + web) |
| `docker/api.Dockerfile` | Multi-stage build for the NestJS API (Debian base — Prisma needs glibc) |
| `docker/web.Dockerfile` | Multi-stage build for React → nginx |
| `docker/nginx.conf` | nginx: HTTP→HTTPS redirect, SPA routing, API proxy, rate limiting |
| `docker/.env.production.example` | Environment template (the bootstrap copies this to `docker/.env`) |
| `docker/install.sh` | Manual installer (same steps as the bootstrap, for servers you already have) |

---

## Before you deploy

1. **Push to GitHub** so the EC2 instance can clone the repo.
2. **Create an EC2 key pair** (EC2 → Key Pairs → Create). Note the name.
3. **Configure the AWS CLI** on your machine: `aws configure`

---

## Deploy — two ways

### Option A: AWS Console (no CLI needed)
1. CloudFormation → Create stack → Upload template file → `infraco-os-cloudformation.yaml`
2. Fill in the parameters (key pair name, your Git repo URL, domain name)
3. Click Create — takes 5–10 minutes

### Option B: CLI
```bash
aws cloudformation create-stack \
  --stack-name infraco-os \
  --region af-south-1 \
  --template-body file://infraco-os-cloudformation.yaml \
  --parameters \
    ParameterKey=KeyPairName,ParameterValue=infraco-os-key \
    ParameterKey=SSHLocation,ParameterValue=YOUR.IP.ADDRESS/32 \
    ParameterKey=GitRepoUrl,ParameterValue=https://github.com/Chamvari/infraco-os.git \
    ParameterKey=DomainName,ParameterValue=portal.landfortune.co.zw \
  --capabilities CAPABILITY_NAMED_IAM

aws cloudformation wait stack-create-complete --stack-name infraco-os --region af-south-1
```

---

## What the bootstrap does automatically

- Installs Docker, the compose plugin, certbot, fail2ban, awscli
- Enables the host firewall (ufw: 22/80/443 only) alongside the AWS security group
- Clones your repo into `/opt/infraco-os`
- Writes `docker/.env` from `docker/.env.production.example`, generating strong
  random `DB_PASSWORD`, `REDIS_PASSWORD`, and `AUTH_JWT_SECRET`
- Seeds a self-signed TLS cert into `docker/ssl/` so nginx's `:443` vhost can start
- Runs `docker compose -f docker/docker-compose.prod.yml --env-file docker/.env up -d --build`
  — PostGIS starts and the schema auto-applies from `db/infraco_os_schema.sql`,
  PgBouncer + Redis come up, the API builds and starts, the SPA builds and nginx serves it

> The `AT_*` (Africa's Talking SMS/USSD) and `PAYMENTS_*` keys are left as
> placeholders — fill them into `docker/.env` and re-run `up -d` before those
> features go live.

---

## After the stack creates

The Outputs show your **Elastic IP**. Then, from `/opt/infraco-os`:

```bash
# 1. Point the DNS A record for portal.landfortune.co.zw → Elastic IP

# 2. SSH in (or use SSM Session Manager — see the SessionManagerCommand output)
ssh -i ~/.ssh/infraco-os-key.pem ubuntu@<ElasticIP>

# 3. Watch the bootstrap complete
sudo tail -f /var/log/infraco-bootstrap.log

# 4. Issue a real TLS cert (after DNS propagates — check with: dig portal.landfortune.co.zw).
#    certbot --standalone needs port 80, which nginx holds, so stop web first:
cd /opt/infraco-os
sudo docker compose -f docker/docker-compose.prod.yml --env-file docker/.env stop web
sudo certbot certonly --standalone -d portal.landfortune.co.zw \
  --non-interactive --agree-tos -m admin@landfortune.co.zw
sudo cp /etc/letsencrypt/live/portal.landfortune.co.zw/fullchain.pem docker/ssl/infraco.crt
sudo cp /etc/letsencrypt/live/portal.landfortune.co.zw/privkey.pem  docker/ssl/infraco.key
sudo docker compose -f docker/docker-compose.prod.yml --env-file docker/.env up -d web

# 5. Add SMS + payment keys, then bring the stack back to desired state
sudo nano docker/.env
sudo docker compose -f docker/docker-compose.prod.yml --env-file docker/.env up -d

# 6. Verify
curl -I https://portal.landfortune.co.zw
```

---

## After you're live — hardening checklist

- [ ] Lock `SSHLocation` to your admin IP (`x.x.x.x/32`) or switch to SSM Session Manager
- [ ] Set up nightly `pg_dump` to S3 **before real customers** — this is the critical one
- [ ] Verify Africa's Talking sender ID registered with Econet/NetOne (3–5 business days)
- [ ] Replace payment placeholder keys with real Sqwarma/VGIL production credentials
- [ ] Run a load test against production endpoints (the prior ASA portal failed under load — confirm this build holds up)
- [ ] Set up CloudWatch alarms for CPU, disk, API error rate
- [ ] Test a backup restore

---

## Schema migrations (note)

The schema loads once on first DB boot from `db/infraco_os_schema.sql`. If you
later run `prisma migrate deploy` against prod, it must use a **direct** Postgres
connection — migrations cannot run through PgBouncer transaction pooling. See the
`DIRECT_DATABASE_URL` note in `docker/.env.production.example`.

---

## Region

`af-south-1` (Cape Town) is recommended — lowest latency from Zimbabwe and most
African countries. The AMI parameter resolves automatically for whichever region
you deploy to.

---

## Cost estimate (af-south-1, on-demand)

| Resource | ~Monthly |
|---------|---------|
| t3.medium EC2 | ~$30–40 |
| 80 GB gp3 EBS | ~$7 |
| Elastic IP (attached) | Free |
| Data transfer | Varies |
| **Total launch** | **~$40–50/mo** |
</content>
</invoke>
