<h1 align="center">ChatGPT2API</h1>

<p align="center">基于 <a href="https://github.com/basketikun/chatgpt2api">basketikun/chatgpt2api</a> 的二开分支，新增注册代理轮询功能，支持多代理自动切换、智能黑名单、夜间模式等增强特性。</p>

> [!WARNING]
> 本项目仅供个人学习、技术研究与非商业性技术交流使用，请勿用于任何商业或违规用途。使用者应自行承担全部风险。

## 功能特性

### 核心功能

- **图片生成 API** - 兼容 OpenAI `/v1/images/generations` 接口
- **图片编辑 API** - 兼容 `/v1/images/edits` 接口，支持参考图上传
- **聊天补全 API** - 兼容 `/v1/chat/completions`、`/v1/responses` 接口
- **在线画图工作台** - 内置 Web UI，支持多图生成与编辑
- **号池管理** - 自动轮询账号、Token 刷新、限流检测

### 新增功能（代理轮询）

- 支持三种代理来源：单代理、代理列表 URL、粘贴代理列表
- 代理列表 URL 自动定时拉取刷新
- 每个注册 worker 轮询使用不同代理
- 120 秒租约机制，避免并发重复使用同一代理
- 智能黑名单代理机制，自动剔除失败代理
- 评分排序与新代理探索比例限制
- 代理状态持久化到 `data/register_proxy_state.json`
- 注册页支持夜间模式

## 快速开始

### Docker 部署

```bash
git clone https://github.com/fairy-iu/chatgpt2api.git
cd chatgpt2api
docker compose up -d
```

启动前请先在 `config.json` 中设置 `auth-key`。

- Web 面板：`http://localhost:3000`
- API 地址：`http://localhost:3000/v1`

### 本地部署

```bash
# 安装后端依赖
uv sync

# 启动后端
uv run main.py

# 安装前端依赖并启动
cd web && bun install && bun run dev
```

### PM2 部署

```bash
# 安装依赖
uv sync
cd web && bun install && bun run build && cd ..

# 使用 PM2 启动
pm2 start ecosystem.config.cjs
```

## 代理轮询配置

### 支持的代理格式

```
http://1.2.3.4:8080
https://1.2.3.4:8443
socks5://1.2.3.4:1080
socks5h://1.2.3.4:1080
1.2.3.4:8080
```

### 使用方法

1. 访问注册页面 `/register/`
2. 在「注册代理」部分选择代理来源：
   - **单代理**：填写一个代理地址
   - **代理列表 URL**：填写代理列表链接（一行一个）
   - **粘贴代理列表**：直接粘贴代理列表
3. 设置刷新秒数（URL 模式自动拉取间隔）
4. 点击「保存代理配置」
5. 启动注册任务

## WARP / FlareSolverr 部署

如果遇到 Cloudflare 拦截，可启用 WARP + Privoxy + FlareSolverr：

```bash
docker compose -f docker-compose.warp.yml up -d --build
```

启动组件：
- `warp-proxy` - WARP SOCKS5 出口
- `privoxy` - SOCKS5 转 HTTP 代理
- `flaresolverr` - Cloudflare clearance

## 自动同步上游

本项目使用 GitHub Actions 自动同步上游更新：

- 每天自动检查 [basketikun/chatgpt2api](https://github.com/basketikun/chatgpt2api) 更新
- 自动合并并解决冲突
- 自动重新应用代理池 patch

手动触发：GitHub 仓库 → Actions → Sync Upstream → Run workflow

### 手动更新

```bash
./update-from-upstream.sh
```

## API 文档

所有接口需要请求头：`Authorization: Bearer <auth-key>`

| 接口 | 说明 |
|------|------|
| `GET /v1/models` | 获取模型列表 |
| `POST /v1/images/generations` | 图片生成 |
| `POST /v1/images/edits` | 图片编辑 |
| `POST /v1/chat/completions` | 聊天补全 |
| `POST /v1/responses` | Responses API |

### 示例：图片生成

```bash
curl https://your-domain.com/v1/images/generations \
  -H "Authorization: Bearer your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "一只太空猫",
    "n": 1
  }'
```

## 支持的模型

| 模型 | 用途 |
|------|------|
| `gpt-image-2` | 图片生成 |
| `codex-gpt-image-2` | Codex 画图 |
| `auto` | 自动选择 |
| `gpt-5` / `gpt-5-mini` | 文本对话 |

## 存储后端

支持通过 `STORAGE_BACKEND` 环境变量切换：

| 类型 | 说明 |
|------|------|
| `json` | 本地 JSON 文件（默认） |
| `sqlite` | SQLite 数据库 |
| `postgres` | PostgreSQL（需配置 `DATABASE_URL`） |

## 相关链接

- 原版项目：[basketikun/chatgpt2api](https://github.com/basketikun/chatgpt2api)
- 本项目：[fairy-iu/chatgpt2api](https://github.com/fairy-iu/chatgpt2api)

[![Star History Chart](https://api.star-history.com/chart?repos=basketikun/chatgpt2api&type=date&legend=top-left)](https://www.star-history.com/?repos=basketikun%2Fchatgpt2api&type=date&legend=top-left)
