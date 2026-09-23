#!/bin/bash
#
# HSR PostgreSQL Backup Script
#
# Features:
# - Full database dump with pg_dump
# - Compression with gzip
# - Retention policy (keeps last N backups)
# - Optional S3/cloud upload
# - Backup verification
# - Logging
#
# Usage:
#   ./backup.sh              # Run backup
#   ./backup.sh --verify     # Run backup and verify
#   ./backup.sh --upload     # Run backup and upload to cloud
#
# Cron example (daily at 2 AM):
#   0 2 * * * /home/localai/Desktop/HSR/backend/scripts/backup/backup.sh >> /var/log/hsr-backup.log 2>&1

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

# Database settings (override with environment variables)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-subdomain_registry}"
DB_USER="${DB_USER:-subdomain_user}"
DB_PASSWORD="${DB_PASSWORD:-REDACTED}"

# Backup settings
BACKUP_DIR="${BACKUP_DIR:-/home/localai/Desktop/HSR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
RETENTION_COUNT="${RETENTION_COUNT:-30}"

# Cloud storage settings (optional)
S3_BUCKET="${S3_BUCKET:-}"
S3_PATH="${S3_PATH:-hsr-backups}"
AWS_PROFILE="${AWS_PROFILE:-default}"

# Notification settings (optional)
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"

# =============================================================================
# Setup
# =============================================================================

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_ONLY=$(date +%Y%m%d)
BACKUP_FILE="hsr_backup_${TIMESTAMP}.sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"
LOG_FILE="${BACKUP_DIR}/backup.log"

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] ${message}" | tee -a "${LOG_FILE}"
}

# Error handler
error_exit() {
    log "ERROR" "$1"
    send_notification "FAILED" "$1"
    exit 1
}

# Send notification (Slack or email)
send_notification() {
    local status="$1"
    local message="$2"

    if [[ -n "${SLACK_WEBHOOK}" ]]; then
        curl -s -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"HSR Backup ${status}: ${message}\"}" \
            "${SLACK_WEBHOOK}" > /dev/null 2>&1 || true
    fi

    if [[ -n "${ADMIN_EMAIL}" ]] && command -v mail &> /dev/null; then
        echo "${message}" | mail -s "HSR Backup ${status}" "${ADMIN_EMAIL}" || true
    fi
}

# =============================================================================
# Backup Functions
# =============================================================================

perform_backup() {
    log "INFO" "Starting backup of database '${DB_NAME}'..."

    # Export password for pg_dump
    export PGPASSWORD="${DB_PASSWORD}"

    # Perform backup with pg_dump
    # Options:
    #   -Fc: Custom format (allows parallel restore)
    #   --no-owner: Don't output ownership commands
    #   --no-acl: Don't output access privilege commands
    #   -Z9: Maximum compression

    pg_dump \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        --no-owner \
        --no-acl \
        -Z9 \
        -Fc \
        -f "${BACKUP_PATH%.gz}" \
        || error_exit "pg_dump failed"

    # Rename to indicate it's compressed (pg_dump -Fc already compresses)
    mv "${BACKUP_PATH%.gz}" "${BACKUP_PATH%.sql.gz}.dump"
    BACKUP_PATH="${BACKUP_PATH%.sql.gz}.dump"
    BACKUP_FILE="${BACKUP_FILE%.sql.gz}.dump"

    # Get backup size
    BACKUP_SIZE=$(du -h "${BACKUP_PATH}" | cut -f1)

    log "INFO" "Backup completed: ${BACKUP_FILE} (${BACKUP_SIZE})"

    unset PGPASSWORD
}

verify_backup() {
    log "INFO" "Verifying backup integrity..."

    # Check if file exists and has content
    if [[ ! -f "${BACKUP_PATH}" ]]; then
        error_exit "Backup file not found: ${BACKUP_PATH}"
    fi

    if [[ ! -s "${BACKUP_PATH}" ]]; then
        error_exit "Backup file is empty: ${BACKUP_PATH}"
    fi

    # Verify the dump file is readable
    pg_restore --list "${BACKUP_PATH}" > /dev/null 2>&1 \
        || error_exit "Backup verification failed - file may be corrupted"

    # Count objects in backup
    OBJECT_COUNT=$(pg_restore --list "${BACKUP_PATH}" 2>/dev/null | wc -l)

    log "INFO" "Backup verified: ${OBJECT_COUNT} objects in backup"
}

cleanup_old_backups() {
    log "INFO" "Cleaning up old backups (keeping last ${RETENTION_COUNT})..."

    # Count existing backups
    BACKUP_COUNT=$(find "${BACKUP_DIR}" -name "hsr_backup_*.dump" -type f | wc -l)

    if [[ ${BACKUP_COUNT} -gt ${RETENTION_COUNT} ]]; then
        # Delete oldest backups beyond retention count
        find "${BACKUP_DIR}" -name "hsr_backup_*.dump" -type f -printf '%T+ %p\n' \
            | sort \
            | head -n -${RETENTION_COUNT} \
            | cut -d' ' -f2- \
            | xargs -r rm -f

        DELETED=$((BACKUP_COUNT - RETENTION_COUNT))
        log "INFO" "Deleted ${DELETED} old backup(s)"
    else
        log "INFO" "No old backups to clean up (${BACKUP_COUNT} backups exist)"
    fi

    # Also delete backups older than retention days
    find "${BACKUP_DIR}" -name "hsr_backup_*.dump" -type f -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
}

upload_to_cloud() {
    if [[ -z "${S3_BUCKET}" ]]; then
        log "INFO" "S3 bucket not configured, skipping cloud upload"
        return 0
    fi

    log "INFO" "Uploading backup to S3: s3://${S3_BUCKET}/${S3_PATH}/"

    if ! command -v aws &> /dev/null; then
        log "WARN" "AWS CLI not installed, skipping S3 upload"
        return 0
    fi

    aws s3 cp "${BACKUP_PATH}" "s3://${S3_BUCKET}/${S3_PATH}/${BACKUP_FILE}" \
        --profile "${AWS_PROFILE}" \
        || error_exit "S3 upload failed"

    log "INFO" "Upload completed successfully"

    # Clean up old S3 backups (keep last 90 days)
    log "INFO" "Cleaning up old S3 backups..."
    aws s3 ls "s3://${S3_BUCKET}/${S3_PATH}/" --profile "${AWS_PROFILE}" \
        | while read -r line; do
            file_date=$(echo "$line" | awk '{print $1}')
            file_name=$(echo "$line" | awk '{print $4}')
            if [[ -n "$file_name" ]]; then
                days_old=$(( ($(date +%s) - $(date -d "$file_date" +%s)) / 86400 ))
                if [[ $days_old -gt 90 ]]; then
                    aws s3 rm "s3://${S3_BUCKET}/${S3_PATH}/${file_name}" --profile "${AWS_PROFILE}" || true
                    log "INFO" "Deleted old S3 backup: ${file_name}"
                fi
            fi
        done 2>/dev/null || true
}

create_latest_symlink() {
    # Create/update symlink to latest backup
    ln -sf "${BACKUP_PATH}" "${BACKUP_DIR}/latest.dump"
    log "INFO" "Updated latest.dump symlink"
}

print_summary() {
    echo ""
    echo "=============================================="
    echo "  HSR Backup Summary"
    echo "=============================================="
    echo "  Timestamp:  ${TIMESTAMP}"
    echo "  Database:   ${DB_NAME}"
    echo "  File:       ${BACKUP_FILE}"
    echo "  Size:       ${BACKUP_SIZE}"
    echo "  Location:   ${BACKUP_PATH}"
    if [[ -n "${S3_BUCKET}" ]]; then
        echo "  S3:         s3://${S3_BUCKET}/${S3_PATH}/${BACKUP_FILE}"
    fi
    echo "=============================================="
    echo ""
}

# =============================================================================
# Main
# =============================================================================

main() {
    log "INFO" "========== HSR Backup Started =========="

    local do_verify=false
    local do_upload=false

    # Parse arguments
    for arg in "$@"; do
        case $arg in
            --verify)
                do_verify=true
                ;;
            --upload)
                do_upload=true
                ;;
            --help)
                echo "Usage: $0 [--verify] [--upload]"
                echo "  --verify  Verify backup integrity after creation"
                echo "  --upload  Upload backup to S3 (requires S3_BUCKET env var)"
                exit 0
                ;;
        esac
    done

    # Run backup steps
    perform_backup

    if [[ "${do_verify}" == true ]]; then
        verify_backup
    fi

    cleanup_old_backups
    create_latest_symlink

    if [[ "${do_upload}" == true ]]; then
        upload_to_cloud
    fi

    print_summary

    log "INFO" "========== HSR Backup Completed =========="
    send_notification "SUCCESS" "Backup completed: ${BACKUP_FILE} (${BACKUP_SIZE})"
}

main "$@"
