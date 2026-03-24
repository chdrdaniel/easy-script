# Script Console

Author: yuanxun.mei@gmail.com

## 服务是干什么的

Script Console 是一个本机脚本控制台服务，用来把固定的 Shell 脚本通过网页统一管理和执行。

核心能力：
- 登录后访问（密码来自配置文件）
- 首页脚本卡片展示（桌面端每行 6 个）
- 点击卡片进入脚本详情页并执行脚本
- 保存每次运行记录（时间、状态、退出码、日志文件）
- 支持在页面查看 stdout / stderr 日志内容

## 怎么用

1. 在配置文件里定义可执行脚本（白名单）和登录密码。
2. 打开网页并登录。
3. 在首页选择脚本卡片进入详情页。
4. 点击“运行”执行脚本。
5. 在历史记录中查看本脚本最近执行结果和日志（最新在最上）。

## 架构

### 组件
- Web Server: Node.js + Express（路由、鉴权、脚本执行 API）
- View Layer: EJS 模板（登录页、脚本卡片页、脚本详情页）
- Frontend: 原生 JS + CSS（运行操作、日志弹窗、轮询刷新）
- Config: `config/app.config.json`（密码、session 密钥、脚本列表）
- Storage:
  - 运行历史：`data/run-history.jsonl`
  - 执行日志：`logs/*-stdout.log`、`logs/*-stderr.log`
- Process Manager: PM2（进程守护与重启）

### 执行流
1. 用户登录，建立会话。
2. 前端调用 `/api/run/:scriptId`。
3. 服务端按配置找到脚本并用 shell 启动执行。
4. stdout/stderr 分别写入日志文件。
5. 执行结束后写入历史记录 JSONL。
6. 前端通过历史接口展示最新记录并支持查看日志。

## 安装与启动步骤

### 1) 安装依赖

```bash
cd /Users/bookit002/projects/guide/auto-deploy
npm install
```

### 2) 准备配置

```bash
cp config/app.config.example.json config/app.config.json
```

编辑 `config/app.config.json`：
- `adminPassword`: 登录密码
- `sessionSecret`: 会话密钥
- `scripts`: 脚本列表（`id`、`name`、`command`、`cwd`）

### 3) 启动服务（PM2）

如果本机还没有 PM2：

```bash
npm install -g pm2
```

启动：

```bash
pm2 start ecosystem.config.js
pm2 status
pm2 logs script-console
```

重启：

```bash
pm2 restart script-console
```

### 4) 访问

浏览器打开：

```text
http://localhost:3000
```
