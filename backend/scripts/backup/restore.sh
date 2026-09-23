#!/bin/bash
#
# HSR PostgreSQL Restore Script
#
# Features:
# - Restore from local backup or S3
# - Pre-restore safety checks
# - Optional point-in-time recovery
# - Verification after restore
#
# Usage:
#   ./restore.sh latest                    # Restore from latest backup
#   ./restore.sh /path/to/backup.dump      # Restore from specific file
#   ./restore.sh s3://bucket/path/file     # Restore from S3
#   ./restore.sh --list                    # List available backups
#   ./restore.sh --test                    # Restore to test database
#
# WARNING: This will DROP and recreate the database!

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-subdomain_registry}"
DB_USER="${DB_USER:-subdomain_user}"
DB_PASSWORD="${DB_PASSWORD:-REDACTED}"
DB_ADMIN_USER="${DB_ADMIN_USER:-postgres}"
DB_ADMIN_PASSWORD="${DB_ADMIN_PASSWORD:-postgres}"

BACKUP_DIR="${BACKUP_DIR:-/home/localai/Desktop/HSR/backups}"
AWS_PROFILE="${AWS_PROFILE:-default}"

# =============================================================================
# Functions
# =============================================================================

log() {
    local level="$1"
    shift
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [${level}] $*"
}

error_exit() {
    log "ERROR" "$1"
    exit 1
}

confirm() {
    local message="$1"
    echo ""
    echo "WARNING: ${message}"
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " response
    if [[ "${response}" != "yes" ]]; then
        echo "Aborted."
        exit 0
    fi
}

list_backups() {
    echo ""
    echo "Available Local Backups:"
    echo "========================"
    if [[ -d "${BACKUP_DIR}" ]]; then
        ls -lh "${BACKUP_DIR}"/*.dump 2>/dev/null | awk '{print $9, $5, $6, $7, $8}' || echo "No backups found"
    else
        echo "Backup directory not found: ${BACKUP_DIR}"
    fi
    echo ""

    if [[ -n "${S3_BUCKET:-}" ]]; then
        echo "Available S3 Backups:"
        echo "====================="
        aws s3 ls "s3://${S3_BUCKET}/${S3_PATH:-hsr-backups}/" --profile "${AWS_PROFILE}" 2>/dev/null || echo "Could not list S3 backups"
        echo ""
    fi
}

download_from_s3() {
    local s3_path="$1"
    local local_path="/tmp/hsr_restore_$(date +%s).dump"

    log "INFO" "Downloading from S3: ${s3_path}"
    aws s3 cp "${s3_path}" "${local_path}" --profile "${AWS_PROFILE}" \
        || error_exit "Failed to download from S3"

    echo "${local_path}"
}

verify_backup_file() {
    local backup_file="$1"

    if [[ ! -f "${backup_file}" ]]; then
        error_exit "Backup file not found: ${backup_file}"
    fi

    if [[ ! -s "${backup_file}" ]]; then
        error_exit "Backup file is empty: ${backup_file}"
    fi

    log "INFO" "Verifying backup file integrity..."
    pg_restore --list "${backup_file}" > /dev/null 2>&1 \
        || error_exit "Backup file appears to be corrupted"

    local object_count=$(pg_restore --list "${backup_file}" 2>/dev/null | wc -l)
    log "INFO" "Backup contains ${object_count} objects"
}

stop_application() {
    log "INFO" "Stopping HSR backend..."
    pm2 stop halcyon-backend 2>/dev/null || true
    sleep 2
}

start_application() {
    log "INFO" "Starting HSR backend..."
    pm2 start halcyon-backend 2>/dev/null || true
}

perform_restore() {
    local backup_file="$1"
    local target_db="$2"
    local drop_existing="${3:-true}"

    export PGPASSWORD="${DB_ADMIN_PASSWORD}"

    if [[ "${drop_existing}" == "true" ]]; then
        log "INFO" "Terminating existing connections to ${target_db}..."
        psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_ADMIN_USER}" -d postgres -c \
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${target_db}' AND pid <> pg_backend_pid();" \
            2>/dev/null || true

        log "INFO" "Dropping existing database ${target_db}..."
        psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_ADMIN_USER}" -d postgres -c \
            "DROP DATABASE IF EXISTS ${target_db};" \
            || error_exit "Failed to drop database"

        log "INFO" "Creating fresh database ${target_db}..."
        psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_ADMIN_USER}" -d postgres -c \
            "CREATE DATABASE ${target_db} OWNER ${DB_USER};" \
            || error_exit "Failed to create database"
    fi

    log "INFO" "Restoring database from backup..."
    pg_restore \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_ADMIN_USER}" \
        -d "${target_db}" \
        --no-owner \
        --no-acl \
        --clean \
        --if-exists \
        "${backup_file}" \
        2>&1 | grep -v "already exists" || true

    # Grant permissions
    log "INFO" "Granting permissions to ${DB_USER}..."
    psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_ADMIN_USER}" -d "${target_db}" -c \
        "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${DB_USER};" 2>/dev/null || true
    psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_ADMIN_USER}" -d "${target_db}" -c \
        "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${DB_USER};" 2>/dev/null || true

    unset PGPASSWORD

    log "INFO" "Restore completed successfully"
}

verify_restore() {
    local target_db="$1"

    log "INFO" "Verifying restored database..."

    export PGPASSWORD="${DB_PASSWORD}"

    # Check table count
    local table_count=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${target_db}" -t -c \
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')

    # Check critical tables exist
    local critical_tables=("domains" "tlds" "audit_log" "nonces")
    for table in "${critical_tables[@]}"; do
        psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${target_db}" -c \
            "SELECT 1 FROM ${table} LIMIT 1;" > /dev/null 2>&1 \
            || log "WARN" "Table '${table}' may be empty or missing"
    done

    # Get row counts for key tables
    local domain_count=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${target_db}" -t -c \
        "SELECT COUNT(*) FROM domains;" 2>/dev/null | tr -d ' ')
    local tld_count=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${target_db}" -t -c \
        "SELECT COUNT(*) FROM tlds;" 2>/dev/null | tr -d ' ')

    unset PGPASSWORD

    echo ""
    echo "=============================================="
    echo "  Restore Verification"
    echo "=============================================="
    echo "  Database:     ${target_db}"
    echo "  Tables:       ${table_count}"
    echo "  Domains:      ${domain_count}"
    echo "  TLDs:         ${tld_count}"
    echo "=============================================="
    echo ""

    log "INFO" "Database verification completed"
}

# =============================================================================
# Main
# =============================================================================

main() {
    local backup_source="${1:-}"
    local test_mode=false

    # Parse arguments
    case "${backup_source}" in
        --list|-l)
            list_backups
            exit 0
            ;;
        --test|-t)
            test_mode=true
            backup_source="${2:-latest}"
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS] <backup_source>"
            echo ""
            echo "Options:"
            echo "  --list, -l     List available backups"
            echo "  --test, -t     Restore to test database (hsr_test)"
            echo "  --help, -h     Show this help"
            echo ""
            echo "Backup sources:"
            echo "  latest                        Restore from latest local backup"
            echo "  /path/to/backup.dump          Restore from specific file"
            echo "  s3://bucket/path/file.dump    Restore from S3"
            exit 0
            ;;
        "")
            error_exit "No backup source specified. Use --help for usage."
            ;;
    esac

    # Determine target database
    local target_db="${DB_NAME}"
    if [[ "${test_mode}" == true ]]; then
        target_db="hsr_test"
        log "INFO" "Test mode: restoring to database '${target_db}'"
    fi

    # Resolve backup file path
    local backup_file=""
    if [[ "${backup_source}" == "latest" ]]; then
        backup_file="${BACKUP_DIR}/latest.dump"
        if [[ ! -f "${backup_file}" ]]; then
            # Find most recent backup
            backup_file=$(ls -t "${BACKUP_DIR}"/hsr_backup_*.dump 2>/dev/null | head -1)
        fi
    elif [[ "${backup_source}" == s3://* ]]; then
        backup_file=$(download_from_s3 "${backup_source}")
    else
        backup_file="${backup_source}"
    fi

    if [[ -z "${backup_file}" ]]; then
        error_exit "No backup file found"
    fi

    log "INFO" "Backup source: ${backup_file}"

    # Verify backup file
    verify_backup_file "${backup_file}"

    # Confirmation for production restore
    if [[ "${test_mode}" == false ]]; then
        confirm "This will DROP and RECREATE the database '${target_db}'. All existing data will be LOST!"
        stop_application
    fi

    # Perform restore
    perform_restore "${backup_file}" "${target_db}"

    # Verify restore
    verify_restore "${target_db}"

    # Restart application if we stopped it
    if [[ "${test_mode}" == false ]]; then
        start_application
    fi

    log "INFO" "Restore process completed successfully"
}

main "$@"
