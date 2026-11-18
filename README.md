# 早间电台

移动优先的私人通勤播单。固定顺序：资讯早7点、声动早咖啡；仅收录北京时间当天发布的公开单集。页面由 iPhone 直接读取 Apple 播客目录，音频直接从公开原始地址播放。体验地址：https://morning-radio-phobal.phobal.chatgpt.site

## 本地运行

Node 22.13+。执行 `npm ci`、`npm run dev`。运行 `node --test tests/*.test.mjs` 验证筛选和源站异常，`npx tsc --noEmit` 检查类型，`npm run build` 生成发布文件。

## Docker Compose

安装 Docker Desktop 或 Docker Engine 后，一条命令启动生产模式：

```bash
cp .env.example .env
docker compose up --build -d
```

然后访问 `http://localhost:3000`。停止服务：

```bash
docker compose down
```

如需使用其他主机端口，可执行 `PORT=8080 docker compose up --build -d`。

## 行为

- 打开或手动刷新获取当天节目，目录失败与未更新分别显示。
- 单个 audio 元素负责连播，Media Session 对接系统暂停、继续、跳转和前后集。
- localStorage 保存本机当日进度；页面回到前台与每 30 秒检查北京时间日期，跨日清除旧队列。
- 不转存音频，不包含登录小宇宙、离线缓存或多设备进度同步。
- 公开页面字段和音频地址可能变化，解析失败需维护适配器。

