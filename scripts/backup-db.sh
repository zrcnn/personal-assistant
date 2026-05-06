#!/bin/bash
# PA 项目数据库自动备份脚本
# 每天凌晨2点执行，保留最近7天的备份

BACKUP_DIR="/root/pa_backups"
DB_NAME="personal_assistant"
DB_USER="pa"
DB_PASS="pa_pass_2026"
RETENTION_DAYS=7
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/personal_assistant_${DATE}.sql.gz"

# 确保备份目录存在
mkdir -p "$BACKUP_DIR"

# 执行备份
mysqldump -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "[$(date)] 备份成功: $BACKUP_FILE"
else
    echo "[$(date)] 备份失败!"
    exit 1
fi

# 删除7天前的备份
find "$BACKUP_DIR" -name "personal_assistant_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete
echo "[$(date)] 已清理 ${RETENTION_DAYS} 天前的旧备份"
