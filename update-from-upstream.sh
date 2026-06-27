#!/bin/bash
# =============================================================================
# 从原版 basketikun/chatgpt2api 更新并合并代理池功能
# 使用方法: ./update-from-upstream.sh
# =============================================================================

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
UPSTREAM_REPO="https://github.com/basketikun/chatgpt2api.git"
PATCH_FILE="$REPO_DIR/proxy-pool.patch"
BACKUP_DIR="$REPO_DIR/backup-$(date +%Y%m%d-%H%M%S)"

echo "=========================================="
echo "  ChatGPT2API 代理池自动更新脚本"
echo "=========================================="

# 检查是否在 git 仓库中
if [ ! -d "$REPO_DIR/.git" ]; then
    echo "❌ 错误: 不在 git 仓库中"
    exit 1
fi

# 检查 patch 文件是否存在
if [ ! -f "$PATCH_FILE" ]; then
    echo "❌ 错误: 找不到 patch 文件: $PATCH_FILE"
    exit 1
fi

# 备份当前配置
echo "📦 备份当前配置..."
mkdir -p "$BACKUP_DIR"
cp "$REPO_DIR/config.json" "$BACKUP_DIR/" 2>/dev/null || true
cp -r "$REPO_DIR/data" "$BACKUP_DIR/" 2>/dev/null || true
echo "✅ 备份完成: $BACKUP_DIR"

# 添加 upstream（如果不存在）
echo "🔗 配置上游仓库..."
git remote add upstream "$UPSTREAM_REPO" 2>/dev/null || echo "upstream 已存在"

# 获取上游更新
echo "📥 获取上游更新..."
git fetch upstream main

# 保存当前修改
echo "💾 暂存本地修改..."
git stash

# 合并上游更新
echo "🔀 合并上游更新..."
if git merge upstream/main --no-edit; then
    echo "✅ 合并成功（无冲突）"
else
    echo "⚠️  有冲突，尝试使用 patch 修复..."

    # 解决 config.json 冲突 - 保留我们的配置
    if [ -f "$REPO_DIR/config.json" ]; then
        git checkout --ours config.json
        git add config.json
        echo "  ✅ config.json 已保留本地配置"
    fi

    # 解决 README.md 冲突 - 使用上游版本
    if [ -f "$REPO_DIR/README.md" ]; then
        git checkout --theirs README.md
        git add README.md
        echo "  ✅ README.md 已使用上游版本"
    fi

    # 完成合并
    git commit --no-edit -m "Merge upstream with conflict resolution"
    echo "✅ 合并完成"
fi

# 应用 patch（代理池功能）
echo "🔧 应用代理池 patch..."
if git apply --check "$PATCH_FILE" 2>/dev/null; then
    git apply "$PATCH_FILE"
    echo "✅ Patch 应用成功"
else
    echo "⚠️  Patch 可能与上游更新冲突，尝试 3-way merge..."
    if git apply --3way "$PATCH_FILE" 2>/dev/null; then
        echo "✅ Patch 3-way merge 成功"
    else
        echo "❌ Patch 应用失败，请手动合并"
        echo "   参考: https://github.com/strongshuai/chatgpt2api-proxy-pool"
        git checkout -- .
        exit 1
    fi
fi

# 恢复暂存的修改
echo "🔄 恢复本地修改..."
git stash pop 2>/dev/null || echo "没有暂存的修改"

# 恢复备份的配置
echo "📋 恢复配置文件..."
cp "$BACKUP_DIR/config.json" "$REPO_DIR/" 2>/dev/null || true

# 安装依赖
echo "📦 安装 Python 依赖..."
export PATH="$HOME/.local/bin:$PATH"
uv sync

# 构建前端
echo "🎨 构建前端..."
cd "$REPO_DIR/web"
bun install
NEXT_PUBLIC_API_URL= bun run build
cd "$REPO_DIR"

# 重启服务
echo "🔄 重启服务..."
pm2 restart chatgpt2api-backend chatgpt2api-frontend 2>/dev/null || echo "PM2 服务未运行"

echo ""
echo "=========================================="
echo "  ✅ 更新完成！"
echo "=========================================="
echo ""
echo "当前版本: $(cat $REPO_DIR/VERSION)"
echo "备份位置: $BACKUP_DIR"
echo ""
echo "如果遇到问题，可以恢复备份:"
echo "  cp $BACKUP_DIR/config.json $REPO_DIR/"
echo "  pm2 restart chatgpt2api-backend"
echo ""
