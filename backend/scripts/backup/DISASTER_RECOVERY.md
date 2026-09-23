# HSR Disaster Recovery Runbook

## Overview

This document outlines the procedures for recovering the HSR (Halcyon Subdomain Registry) system from various disaster scenarios.

**Last Updated:** 2026-01-26
**Recovery Time Objective (RTO):** 1 hour
**Recovery Point Objective (RPO):** 24 hours (daily backups)

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Backup Strategy](#backup-strategy)
3. [Recovery Scenarios](#recovery-scenarios)
4. [Step-by-Step Procedures](#step-by-step-procedures)
5. [Verification Checklist](#verification-checklist)
6. [Contact Information](#contact-information)

---

## Quick Reference

### Critical Commands

```bash
# Check backup status
ls -lh /home/localai/Desktop/HSR/backups/

# Restore from latest backup
cd /home/localai/Desktop/HSR/backend/scripts/backup
./restore.sh latest

# Restore to test database first (RECOMMENDED)
./restore.sh --test latest

# Manual backup
./backup.sh --verify

# Check database connection
psql -h localhost -U subdomain_user -d subdomain_registry -c "SELECT COUNT(*) FROM domains;"
```

### Critical Paths

| Component | Path |
|-----------|------|
| Backend | `/home/localai/Desktop/HSR/backend` |
| Frontend | `/home/localai/Desktop/HSR/frontend` |
| Contracts | `/home/localai/Desktop/HSR/contracts` |
| Backups | `/home/localai/Desktop/HSR/backups` |
| PM2 Logs | `~/.pm2/logs/` |
| .env File | `/home/localai/Desktop/HSR/backend/.env` |

### Service Management

```bash
# Check all services
pm2 status

# Restart backend
pm2 restart halcyon-backend

# View logs
pm2 logs halcyon-backend --lines 100

# Restart all HSR services
pm2 restart halcyon-backend halcyon-frontend halcyon-hsd
```

---

## Backup Strategy

### Backup Schedule

| Type | Frequency | Retention | Location |
|------|-----------|-----------|----------|
| Full Database | Daily @ 2 AM | 30 days | Local + S3 |
| Audit Logs | Daily | 90 days | Database |
| Config Files | On change | Git | Repository |

### What's Backed Up

- **Database:** All tables including domains, TLDs, audit_log, nonces, purchases
- **NOT Backed Up:** Generated images (regeneratable), node_modules, build artifacts

### Backup Verification

Backups are automatically verified after creation:
- File integrity check
- Object count verification
- Restore test to temporary database (weekly)

---

## Recovery Scenarios

### Scenario 1: Database Corruption

**Symptoms:**
- API returns 500 errors
- Database queries fail
- PM2 logs show "relation does not exist" errors

**Recovery Steps:**
1. Stop the backend: `pm2 stop halcyon-backend`
2. Restore from latest backup: `./restore.sh latest`
3. Verify restoration: Check domain counts
4. Restart backend: `pm2 start halcyon-backend`

### Scenario 2: Accidental Data Deletion

**Symptoms:**
- Missing domains or TLDs
- Users report lost data

**Recovery Steps:**
1. Identify time of deletion from audit logs
2. Restore to test database: `./restore.sh --test latest`
3. Export specific tables needed
4. Import to production or do full restore

### Scenario 3: Server Hardware Failure

**Symptoms:**
- Complete system unavailability
- SSH connection fails

**Recovery Steps:**
1. Provision new server
2. Install dependencies (Node.js, PostgreSQL, HSD)
3. Clone repository
4. Restore database from S3 backup
5. Configure environment variables
6. Start services

### Scenario 4: Ransomware/Security Breach

**Symptoms:**
- Encrypted files
- Unauthorized changes
- Suspicious audit log entries

**Recovery Steps:**
1. **ISOLATE:** Disconnect from network immediately
2. Preserve evidence (disk image if possible)
3. Provision clean server
4. Restore from known-good backup (verify date)
5. Rotate all credentials:
   - Database passwords
   - API keys
   - Admin wallets
6. Review and update security measures

### Scenario 5: Smart Contract Issue

**Symptoms:**
- Failed transactions
- Incorrect NFT states

**Recovery Steps:**
1. Pause contract operations if possible
2. Identify issue in contract
3. Database state is separate from chain state
4. May need to sync database with on-chain data
5. Run `/backend/scripts/syncBatchDomains.js` if needed

---

## Step-by-Step Procedures

### Procedure 1: Full System Restore

```bash
# 1. Verify you have the latest backup
ls -lh /home/localai/Desktop/HSR/backups/latest.dump

# 2. Stop all services
pm2 stop all

# 3. Restore database
cd /home/localai/Desktop/HSR/backend/scripts/backup
./restore.sh latest

# 4. Verify database
psql -h localhost -U subdomain_user -d subdomain_registry << EOF
SELECT 'Domains:', COUNT(*) FROM domains;
SELECT 'TLDs:', COUNT(*) FROM tlds;
SELECT 'Audit Logs:', COUNT(*) FROM audit_log;
EOF

# 5. Start services
pm2 start halcyon-backend
pm2 start halcyon-frontend
pm2 start halcyon-hsd

# 6. Verify API health
curl http://localhost:8000/api/v1/health

# 7. Check logs for errors
pm2 logs halcyon-backend --lines 50
```

### Procedure 2: Point-in-Time Recovery

If you need to recover to a specific point (e.g., before an incident):

```bash
# 1. List available backups with timestamps
ls -lh /home/localai/Desktop/HSR/backups/hsr_backup_*.dump

# 2. Identify the backup just before the incident
# Format: hsr_backup_YYYYMMDD_HHMMSS.dump

# 3. Restore specific backup to test database
./restore.sh --test /home/localai/Desktop/HSR/backups/hsr_backup_20260125_020000.dump

# 4. Verify data in test database
psql -h localhost -U subdomain_user -d hsr_test -c "SELECT * FROM domains ORDER BY created_at DESC LIMIT 10;"

# 5. If verified, restore to production
./restore.sh /home/localai/Desktop/HSR/backups/hsr_backup_20260125_020000.dump
```

### Procedure 3: Restore from S3

```bash
# 1. List S3 backups
aws s3 ls s3://your-bucket/hsr-backups/

# 2. Restore directly from S3
./restore.sh s3://your-bucket/hsr-backups/hsr_backup_20260125_020000.dump
```

---

## Verification Checklist

After any recovery, verify:

- [ ] **Database Connection:** `psql` connects successfully
- [ ] **API Health:** `curl localhost:8000/api/v1/health` returns OK
- [ ] **Domain Count:** Matches expected (check audit log for last known count)
- [ ] **TLD Status:** All TLDs active and correct
- [ ] **HNS Node:** Synced and connected
- [ ] **Frontend:** Loads and can search domains
- [ ] **Wallet Connect:** Can authenticate with wallet
- [ ] **Admin Panel:** Accessible and shows correct data
- [ ] **Recent Transactions:** Visible in audit log

### Health Check Script

```bash
#!/bin/bash
echo "=== HSR Health Check ==="

echo -n "Backend API: "
curl -s http://localhost:8000/api/v1/health | jq -r '.status'

echo -n "Database: "
psql -h localhost -U subdomain_user -d subdomain_registry -t -c "SELECT 'Connected'" 2>/dev/null || echo "FAILED"

echo -n "HNS Node: "
curl -s http://localhost:8000/api/v1/health | jq -r '.services.hns'

echo -n "Domain Count: "
psql -h localhost -U subdomain_user -d subdomain_registry -t -c "SELECT COUNT(*) FROM domains;"

echo -n "PM2 Status: "
pm2 jlist | jq -r '.[] | select(.name | startswith("halcyon")) | "\(.name): \(.pm2_env.status)"'
```

---

## Setting Up Automated Backups

### Cron Configuration

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /home/localai/Desktop/HSR/backend/scripts/backup/backup.sh --verify >> /var/log/hsr-backup.log 2>&1

# Add weekly restore test (Sunday 3 AM)
0 3 * * 0 /home/localai/Desktop/HSR/backend/scripts/backup/restore.sh --test latest >> /var/log/hsr-backup-test.log 2>&1
```

### S3 Configuration (Optional)

```bash
# Add to .env file
S3_BUCKET=your-backup-bucket
S3_PATH=hsr-backups
AWS_PROFILE=default

# Or run with S3 upload
./backup.sh --verify --upload
```

---

## Contact Information

| Role | Contact | Notes |
|------|---------|-------|
| System Admin | [Your contact] | Primary on-call |
| Database Admin | [Your contact] | PostgreSQL issues |
| DevOps | [Your contact] | Infrastructure |

---

## Appendix: Manual Backup Commands

If scripts fail, manual backup:

```bash
# Manual pg_dump
PGPASSWORD=REDACTED pg_dump \
  -h localhost \
  -U subdomain_user \
  -d subdomain_registry \
  -Fc \
  -f /home/localai/Desktop/HSR/backups/manual_backup_$(date +%Y%m%d).dump

# Manual restore
PGPASSWORD=postgres psql -h localhost -U postgres -c "DROP DATABASE subdomain_registry;"
PGPASSWORD=postgres psql -h localhost -U postgres -c "CREATE DATABASE subdomain_registry OWNER subdomain_user;"
PGPASSWORD=postgres pg_restore \
  -h localhost \
  -U postgres \
  -d subdomain_registry \
  --no-owner \
  /path/to/backup.dump
```

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-26 | 1.0 | Initial version |
