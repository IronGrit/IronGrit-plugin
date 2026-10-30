# dsh-guard-panel

DSH（DeepSeek Harness）侧栏「安装守卫」面板：在界面里**拍快照、重启后验证、预演/执行回滚**，并查看历史快照与崩溃日志。

它把 `toolkit/guard.mjs` 的能力搬到了侧栏，面板上的每个动作和终端里执行 `node toolkit/guard.mjs ...` 完全等价——因为两者调用的是同一份 CLI，不存在"页面显示已备份、实际没备份"的分叉。

## 功能

| 面板动作 | 等价命令 |
|---|---|
| 拍快照 | `guard.mjs snapshot <标签>` |
| 重启后验证 | `guard.mjs verify` |
| 预演回滚 | `guard.mjs rollback --dry-run` |
| 回滚到已知良好 | `guard.mjs rollback` |
| 撤销回滚 | `guard.mjs undo` |

另外展示：最近一次快照 / 已知良好 / 最近 80 条快照时间线 / 最近崩溃日志。

## 安装

```bash
# 从 GitHub 仓库安装
dsh plugin --profile desktop add github:<owner>/dsh-guard-panel

# 或从本地目录安装（开发调试用）
dsh plugin --profile desktop add file:<repo-path>
```

装完**重启 DSH**，侧栏出现「安装守卫」条目。

## 依赖：guard CLI

面板本身不含任何快照逻辑，所有操作都 shell out 到外部的 `guard.mjs`。查找顺序：

1. 插件配置项 `guardCli`
2. 环境变量 `DSH_GUARD_CLI`
3. 与本包同级的 `toolkit/guard.mjs`
4. `~/.dsh/toolkit/guard.mjs`

找不到时面板会显示提示，但**不会影响 DSH 启动**。

## 安全

- 两个 HTTP 路由（`/api/dsh-guard/state`、`/api/dsh-guard/action`）只接受回环来源，跨源请求直接 403。
- CLI 输出在返回给页面前会脱敏 `apiKey:` 与 `sk-/pk-/ak-` 形式的密钥。
- 快照仓库（`~/.dsh/install-guard/profile.git`）含明文配置，**只应留在本地，不要 push 到任何远端**。

## 开发

```bash
# 改完重装 + 重启
dsh plugin --profile desktop add file:<repo-path>
```

改动前端 `client.js` 后按 `快照 → 重启 → verify` 的流程验收，跳过 verify 会漏掉启动失败。

## 许可

[MIT](./LICENSE)
