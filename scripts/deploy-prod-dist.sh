#!/usr/bin/env bash
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

# ===== Configurable variables (can be overridden by env) =====
DEPLOY_DIR="${DEPLOY_DIR:-/opt/ai/admin-web/prod}"
BUILD_CMD="pnpm run build:antd"
BUILD_OUTPUT_DIR="${BUILD_OUTPUT_DIR:-apps/web-antd/dist}"
REMOTE_NAME="${REMOTE_NAME:-origin}"
INSTALL_DEPS="${INSTALL_DEPS:-false}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "缺少命令: $1"
    exit 1
  fi
}

checkout_branch() {
  local branch="$1"

  # local branch
  if git show-ref --verify --quiet "refs/heads/${branch}"; then
    git checkout "${branch}"
  # remote branch
  elif git ls-remote --exit-code --heads "${REMOTE_NAME}" "${branch}" >/dev/null 2>&1; then
    git checkout -b "${branch}" "${REMOTE_NAME}/${branch}"
  else
    log "分支不存在: ${branch}"
    exit 1
  fi
}

main() {
  require_cmd git
  require_cmd pnpm

  cd "${REPO_ROOT}"

  log "当前仓库: ${REPO_ROOT}"
  log "拉取远端分支信息..."
  git fetch --all --prune

  local current_branch
  current_branch="$(git branch --show-current || true)"

  log "可选分支如下(本地 + 远端):"
  git branch -a --sort=-committerdate | sed 's/^/  /'

  local branch
  branch="${1:-}"

  if [ -n "${branch}" ]; then
    log "收到分支参数: ${branch}"
    log "切换分支: ${branch}"
    checkout_branch "${branch}"
  else
    branch="${current_branch}"
    if [ -z "${branch}" ]; then
      log "未检测到当前分支，请传入分支参数"
      exit 1
    fi
    log "未传分支参数，使用当前分支: ${branch}"
  fi

  log "拉取最新代码: ${REMOTE_NAME}/${branch}"
  git pull --ff-only "${REMOTE_NAME}" "${branch}"

  case "${INSTALL_DEPS}" in
    true|TRUE|1|yes|YES|y|Y)
      log "安装依赖: pnpm install --frozen-lockfile"
      pnpm install --frozen-lockfile
      ;;
    *)
      log "跳过依赖安装: INSTALL_DEPS=${INSTALL_DEPS}"
      ;;
  esac

  log "开始构建: ${BUILD_CMD}"
  eval "${BUILD_CMD}"

  if [ ! -d "${BUILD_OUTPUT_DIR}" ]; then
    log "构建目录不存在: ${BUILD_OUTPUT_DIR}"
    log "请通过环境变量 BUILD_OUTPUT_DIR 指定正确的产物目录"
    exit 1
  fi

  local deploy_parent backup_base ts new_dir backup_dir
  deploy_parent="$(dirname "${DEPLOY_DIR}")"
  backup_base="${deploy_parent}/backup"
  ts="$(date '+%Y%m%d_%H%M%S')"
  new_dir="${deploy_parent}/prod_new_${ts}"
  backup_dir="${backup_base}/prod_${ts}"

  log "准备部署目录: ${DEPLOY_DIR}"
  mkdir -p "${deploy_parent}" "${backup_base}"
  rm -rf "${new_dir}"
  mkdir -p "${new_dir}"

  log "复制新构建产物到临时目录: ${new_dir}"
  cp -a "${BUILD_OUTPUT_DIR}/." "${new_dir}/"

  if test -d "${DEPLOY_DIR}"; then
    log "备份当前目录到: ${backup_dir}"
    mv "${DEPLOY_DIR}" "${backup_dir}"
  else
    log "当前部署目录不存在，跳过备份"
  fi

  log "切换新版本到: ${DEPLOY_DIR}"
  if ! mv "${new_dir}" "${DEPLOY_DIR}"; then
    log "部署失败，尝试回滚..."
    if test -d "${backup_dir}" && ! test -d "${DEPLOY_DIR}"; then
      mv "${backup_dir}" "${DEPLOY_DIR}"
      log "已回滚到备份版本: ${backup_dir}"
    fi
    exit 1
  fi

  log "部署完成"
  log "生效目录: ${DEPLOY_DIR}"
  if test -d "${backup_dir}"; then
    log "备份目录: ${backup_dir}"
  fi
}
main "$@"
