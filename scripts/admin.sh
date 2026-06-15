#!/usr/bin/env bash
# Low Battery Town — Admin CLI
# Usage: bash scripts/admin.sh [command] [args]
#
# Commands:
#   users                    — 列出最近 20 個用戶
#   find <email>             — 查詢特定用戶
#   logs [n]                 — 看後端最新 log（預設 100 行）
#   deactivate <email>       — 停用用戶（封鎖）
#   activate <email>         — 重新啟用用戶
#   reset-password <email>   — 重設用戶密碼

set -euo pipefail

ENV="${LBT_ENV:-dev}"

if [[ "$ENV" == "prod" ]]; then
  DB_URL="${PROD_DATABASE_URL:?請設定 PROD_DATABASE_URL}"
  SERVICE="lowbatterytown-prod"
else
  DB_URL="${DEV_DATABASE_URL:?請設定 DEV_DATABASE_URL}"
  SERVICE="lowbatterytown-dev"
fi

REGION="ap-northeast-1"
PROFILE="lowbatterytown"

cmd="${1:-help}"

case "$cmd" in

  users)
    echo "=== 最近 20 個用戶 ==="
    psql "$DB_URL" -x -c "
      SELECT id, email, display_name, is_active, is_bot, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 20;
    "
    ;;

  find)
    EMAIL="${2:?用法: admin.sh find <email>}"
    echo "=== 查詢用戶: $EMAIL ==="
    psql "$DB_URL" -x -c "
      SELECT id, email, display_name, is_active, is_bot,
             terms_accepted_at, marketing_opt_in, created_at
      FROM users
      WHERE email = '$EMAIL';
    "
    ;;

  logs)
    N="${2:-100}"
    echo "=== 後端 log（最新 $N 行）==="
    aws lightsail get-container-log \
      --service-name "$SERVICE" \
      --container-name backend \
      --profile "$PROFILE" \
      --region "$REGION" \
      --query "logEvents[-$N:].message" \
      --output text
    ;;

  deactivate)
    EMAIL="${2:?用法: admin.sh deactivate <email>}"
    echo "停用用戶: $EMAIL"
    psql "$DB_URL" -c "
      UPDATE users SET is_active = false WHERE email = '$EMAIL'
      RETURNING id, email, is_active;
    "
    echo "已停用。用戶將無法登入。"
    ;;

  activate)
    EMAIL="${2:?用法: admin.sh activate <email>}"
    echo "啟用用戶: $EMAIL"
    psql "$DB_URL" -c "
      UPDATE users SET is_active = true WHERE email = '$EMAIL'
      RETURNING id, email, is_active;
    "
    echo "已啟用。"
    ;;

  reset-password)
    EMAIL="${2:?用法: admin.sh reset-password <email>}"
    NEW_PASS="${3:-}"
    if [[ -z "$NEW_PASS" ]]; then
      NEW_PASS="$(openssl rand -base64 12)"
      echo "新密碼（自動產生）: $NEW_PASS"
    fi
    # bcrypt hash via Python
    HASH=$(python3 -c "
import bcrypt, sys
pw = sys.argv[1].encode()
print(bcrypt.hashpw(pw, bcrypt.gensalt(rounds=12)).decode())
" "$NEW_PASS")
    psql "$DB_URL" -c "
      UPDATE users SET password_hash = '$HASH' WHERE email = '$EMAIL'
      RETURNING id, email;
    "
    echo "密碼已重設為: $NEW_PASS"
    echo "請透過安全管道告知用戶新密碼，並提醒他們盡快修改。"
    ;;

  help|*)
    echo "Low Battery Town Admin CLI"
    echo ""
    echo "用法: bash scripts/admin.sh <command> [args]"
    echo ""
    echo "Commands:"
    echo "  users                    列出最近 20 個用戶"
    echo "  find <email>             查詢特定用戶"
    echo "  logs [n]                 後端 log（預設 100 行）"
    echo "  deactivate <email>       停用用戶"
    echo "  activate <email>         重新啟用用戶"
    echo "  reset-password <email> [new_password]  重設密碼"
    echo ""
    echo "環境變數:"
    echo "  LBT_ENV=dev|prod         目標環境（預設 dev）"
    echo "  DEV_DATABASE_URL         dev 資料庫連線字串"
    echo "  PROD_DATABASE_URL        prod 資料庫連線字串"
    ;;

esac
