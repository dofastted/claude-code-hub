# CCH Portal 本地使用指南

本文记录 CCH + fk-web-glm 本地 API 测试流程。相同内容需要保留在两个仓库：

- CCH：`/mnt/x/project/claude-code-hub/docs/cch-portal-local-usage-guide.md`
- fk-web-glm：`/mnt/x/fk-web-glm/docs/cch-portal-local-usage-guide.md`

## 1. 准备环境

CCH 本地端口：`http://127.0.0.1:23000`

fk-web-glm 本地端口：`http://127.0.0.1:3301`

CCH `.env.local` 必须包含：

- `DSN`
- `PORTAL_MANAGEMENT_TOKEN`
- `PORTAL_PROVIDER_GROUP=portal`
- `PORTAL_TEST_KEY_GROUP=test-key`
- `FKCODEX_PORTAL_PLAN_READ_TOKEN`
- `FKCODEX_PORTAL_SUBSCRIPTION_READ_TOKEN`
- `FKCODEX_PORTAL_SUBSCRIPTION_WRITE_TOKEN`
- `FK_WEB_PORTAL_CALLBACK_URL=http://127.0.0.1:3301/api/cch/portal/callback`
- `FK_WEB_PORTAL_CALLBACK_TOKEN`
- `DISABLE_CLOUD_PRICE_SYNC=true`

fk-web-glm `.env.local` 必须包含：

- `FK_CCH_API_BASE_URL=http://127.0.0.1:23000`
- `FK_WEB_BASE_URL=http://127.0.0.1:3301`
- `FK_CCH_PORTAL_PLAN_READ_TOKEN`
- `FK_CCH_PORTAL_SUBSCRIPTION_READ_TOKEN`
- `FK_CCH_PORTAL_SUBSCRIPTION_WRITE_TOKEN`
- `FK_PORTAL_CCH_BRIDGE_TOKEN`
- `FK_CCH_PORTAL_CALLBACK_TOKEN`

`.env.local` 不要提交。

## 2. 写入 mock 数据

在 CCH 仓库执行：

```bash
npm run portal:mock-data
```

只检查安全规则，不写库：

```bash
npm run portal:mock-data -- --dry-run
```

脚本只允许本地 DSN 主机。非本地 DSN 会直接退出。

## 3. 配置真实上游测试 provider

CCH 本地数据库需要一个 `portal` 分组的 provider，指向真实 `https://cch.fkcodex.com`。该 provider 用来验证本地 CCH 开通出的 portal key 是否能真实调用模型。

在 CCH 仓库执行：

```bash
CCH_TEST_PROVIDER_KEY='<local-only-provider-key>' npm run provider:local-cch-test
```

脚本默认配置：

- provider name：`fkcodex remote test`
- provider url：`https://cch.fkcodex.com`
- provider type：`codex`
- provider group：`portal`
- allowed models：不限制，由上游实际模型列表决定

脚本输出会把 provider key 显示为 `[redacted]`。

## 4. 启动服务

先启动 CCH：

```bash
npx next dev --webpack --hostname 127.0.0.1 --port 23000
```

再启动 fk-web-glm。这个仓库的固定本地端口是 `3301`：

```bash
npm run dev -- --hostname 127.0.0.1 --port 3301
```

## 5. API 测试

在 fk-web-glm 仓库执行：

```bash
npm run cch:smoke
```

本地测试标准和同步延迟基准见 `docs/cch-portal-local-test-standard.md`。需要让延迟超标也返回非 0 时执行：

```bash
CCH_SMOKE_ENFORCE_LATENCY=true npm run cch:smoke
```

脚本会验证：

- CCH 直连套餐读取
- fk-web-glm 套餐代理
- fk-web-glm 订阅列表代理
- fk-web-glm 订阅开通代理
- 固定订单幂等
- 时间戳订单新增开通
- 禁用套餐开通失败
- bridge token 缺失返回 401
- CCH 原始 API 错误 token 返回 401
- 新开订阅、CCH 用户、默认 key 都在 `portal` 分组

脚本会输出 `latency summary`，其中 `readAfterWrite` 是新订单开通响应返回后，到订阅列表读到该订单的同步延迟。

## 6. 真实上游验证

先确认真实上游模型列表：

```bash
curl https://cch.fkcodex.com/v1/models \
  -H "Authorization: Bearer $CCH_TEST_PROVIDER_KEY"
```

再使用本地 CCH 开通出的 portal key 请求本地 CCH：

```bash
curl http://127.0.0.1:23000/v1/models \
  -H "Authorization: Bearer <local-portal-key>"
```

如果要测 Responses API，可选一个 `/v1/models` 返回的模型：

```bash
curl http://127.0.0.1:23000/v1/responses \
  -H "Authorization: Bearer <local-portal-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.3-codex",
    "input": [
      {
        "type": "message",
        "role": "user",
        "content": [
          {
            "type": "input_text",
            "text": "ping"
          }
        ]
      }
    ],
    "store": false,
    "stream": false,
    "reasoning": {
      "effort": "low",
      "summary": "auto"
    }
  }'
```

日志或测试输出不得展示真实 provider key 或本地 portal key。

## 7. web 侧需要重点检查

web 侧 agent 可以按下面顺序测：

1. 读 `docs/cch-portal-api-contract.md`。
2. 读 `docs/cch-portal-local-usage-guide.md`。
3. 读 `docs/cch-portal-local-test-standard.md`。
4. 读 `docs/cch-web-agent-handoff.md`。
5. 启动 fk-web-glm 后执行 `npm run cch:smoke`。
6. 第二次执行 `npm run cch:smoke`，用 `latency summary` 作为 warm run 基准。
7. 在页面或 API 层读取 `GET /api/cch/portal/plans`，确认页面展示来自 CCH。
8. 调用 `POST /api/cch/portal/subscriptions/provision`，保存返回的 `sourceOrderId`、`portalUserId`、`cchUserId`、`defaultKeyId`。
9. 再读 `GET /api/cch/portal/subscriptions`，确认刚开通的订单可见。
10. 重复请求同一个 `sourceOrderId`，确认 `idempotent=true`。
11. 请求 `disabled-local`，确认返回错误并且页面不当作成功。
12. 检查回调结果：`callback.ok=true` 表示 CCH 已通知 fk-web-glm；`callback.skipped=true` 表示 CCH 未配置回调 URL 或 token。

## 8. 常见问题

- `Unauthorized`：先查 token 是否放在对应仓库的 `.env.local`，再重启 dev 服务。
- `PLAN_NOT_AVAILABLE`：`planId` 不存在、被禁用或已删除。
- `callback result was not returned`：通常是 fk-web-glm dev 服务还没重启到最新代码，或 web 代理还没有透出 CCH 的 callback 字段。
- 上游模型调用失败：先直连 `https://cch.fkcodex.com/v1/models`，再检查本地 provider 是否在 `portal` 分组。
