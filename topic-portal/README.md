# 选题 + 视觉 · 合并入口预览

本地只读静态预览。数据来自交接快照，**不连接私有线上站点**。

## 快照信息

| 项 | 值 |
|----|-----|
| 快照包 | `handoff-2026-10-13` |
| 创建时间 (UTC) | 2026-10-12T16:24:20Z → 上海时间 **2026-10-13 00:24 CST** |
| 选题 | 126 条（完整导出） |
| 选题反馈 | 已赞 4 · 收藏 0 · 不感兴趣 0 |
| 视觉素材 | 站内核实 113 条；本包仅导出 **1** 条（待核），缺 112 条及逐项反馈 |

## 打开方式

```bash
cd /home/box/topic-monitor/portal
python3 -m http.server 8765
```

浏览器打开：http://127.0.0.1:8765/

> 需要 HTTP 服务才能 `fetch` 同目录 `data/*.json`。直接双击 `index.html`（`file://`）在多数浏览器会失败。

## 文件

```
portal/
  index.html      # 入口
  styles.css      # 深色产品风
  app.js          # Tabs / 滤镜 / 抽屉 / 只读反馈展示
  ARCHITECTURE.md # 架构一页纸
  README.md       # 本说明
  data/           # 从 handoff 复制的 JSON（相对路径加载）
```

## 刷新数据

用新 handoff 覆盖 `data/` 下对应 JSON（至少 `news_topics.json`、`news_feedback.json`、`visual_items.json`、`manifest.json`），然后硬刷新页面。

## 注意事项

- 赞 / 收藏指示来自快照，界面上的切换**不会写回**。
- 视觉素材须展示来源链接与「许可待核」；无下载按钮。
- 图片若跨域失败，卡片会回退到优雅占位，不影响浏览。
