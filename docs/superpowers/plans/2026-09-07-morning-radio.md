# Morning Radio Implementation Plan

**Goal:** 自动生成今日通勤播单并支持 iPhone 音频控制。
**Architecture:** Vinext route handler 获取固定来源；共享纯函数解析与按北京时间筛选；客户端一个 audio 元素与 localStorage 记录当日进度。
**Tech Stack:** React, TypeScript, Vinext, Cloudflare Workers, Node test runner.

- [ ] `lib/podcasts.mjs`：实现日期、严格字段校验、NEXT_DATA 解析、节目固定顺序与单集去重；测试跨北京时间午夜、空更新、坏源与顺序。
- [ ] `app/api/today/route.ts`：并发读取固定两个源，12 秒超时；返回独立源状态，禁止浏览器缓存旧日期。
- [ ] `app/page.tsx`、`app/globals.css`：移动优先播放器，当日恢复、跨日清理、单音频连续播放、Media Session、失败重试。
- [ ] `app/layout.tsx`、`public/manifest.webmanifest`：中文元数据、主屏幕入口。
- [ ] 运行 `node --test tests/*.test.mjs`、`npx tsc --noEmit`、`npm run build`，实际请求 today API；私有发布并提供 iPhone 蓝牙验收步骤。
