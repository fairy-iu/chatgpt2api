# 代理池功能更新指南

## 概述

本项目基于 [basketikun/chatgpt2api](https://github.com/basketikun/chatgpt2api) 添加了注册代理池功能。

当原版项目更新时，你可以使用自动脚本将代理池功能合并到最新版本。

## 文件说明

| 文件 | 说明 |
|------|------|
| `proxy-pool.patch` | 代理池功能的 patch 文件 |
| `update-from-upstream.sh` | 自动更新脚本 |
| `PROXY-POOL-UPDATE.md` | 本文档 |

## 自动更新

### 使用方法

```bash
cd /root/chatgpt2api-proxy-pool
chmod +x update-from-upstream.sh
./update-from-upstream.sh
```

### 脚本功能

1. 备份当前配置和数据
2. 从原版仓库拉取最新代码
3. 合并更新（自动解决冲突）
4. 应用代理池 patch
5. 安装依赖并构建前端
6. 重启服务

## 手动更新

如果你想手动更新，按以下步骤操作：

### 1. 添加上游仓库

```bash
git remote add upstream https://github.com/basketikun/chatgpt2api.git
```

### 2. 获取上游更新

```bash
git fetch upstream main
```

### 3. 合并更新

```bash
# 备份配置
cp config.json config.json.bak

# 合并
git merge upstream/main

# 如果有冲突，解决冲突
# config.json - 保留本地配置
git checkout --ours config.json
git add config.json

# README.md - 使用上游版本
git checkout --theirs README.md
git add README.md

# 完成合并
git commit --no-edit
```

### 4. 应用代理池 patch

```bash
# 检查 patch 是否可以应用
git apply --check proxy-pool.patch

# 应用 patch
git apply proxy-pool.patch

# 如果有冲突，使用 3-way merge
git apply --3way proxy-pool.patch
```

### 5. 恢复配置并重启

```bash
# 恢复配置
cp config.json.bak config.json

# 安装依赖
uv sync

# 构建前端
cd web && bun install && NEXT_PUBLIC_API_URL= bun run build && cd ..

# 重启服务
pm2 restart chatgpt2api-backend chatgpt2api-frontend
```

## 代理池功能改动文件

| 文件 | 改动说明 |
|------|----------|
| `api/register.py` | 添加代理池 API 端点 |
| `services/register/proxy_pool.py` | 代理池核心逻辑（新增） |
| `services/register/openai_register.py` | 注册时使用代理池 |
| `services/register_service.py` | 注册服务集成代理池 |
| `web/public/proxy_pool_ui.js` | 代理池前端 UI（新增） |
| `web/src/app/register/page.tsx` | 注册页面添加代理池 UI |

## 常见问题

### Q: patch 应用失败怎么办？

A: 可能是上游有重大改动导致冲突。你可以：
1. 查看冲突文件：`git diff --name-only --diff-filter=U`
2. 手动解决冲突
3. 或者使用 strongshuai 的 fork：`git remote add strongshuai https://github.com/strongshuai/chatgpt2api-proxy-pool.git`

### Q: 如何生成新的 patch 文件？

A: 在 strongshuai 的 fork 中执行：
```bash
git format-patch upstream/main --stdout > proxy-pool.patch
```

### Q: 更新后配置丢失了？

A: 脚本会自动备份配置到 `backup-*` 目录。你可以手动恢复：
```bash
cp backup-*/config.json .
```

## 相关链接

- 原版项目: https://github.com/basketikun/chatgpt2api
- 代理池 Fork: https://github.com/strongshuai/chatgpt2api-proxy-pool
