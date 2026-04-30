# CCH Portal API 契约

本文是 CCH 与 fk-web-glm 之间的门户套餐和订阅 API 契约。相同内容需要保留在两个仓库：

- CCH：`/mnt/x/project/claude-code-hub/docs/fork/cch-portal-api-contract.md`
- fk-web-glm：`/mnt/x/fk-web-glm/docs/cch-portal-api-contract.md`

## 服务边界

CCH 是门户套餐、订阅、CCH 用户和默认 key 的数据源。fk-web-glm 只通过 HTTP 调用 CCH，不伪造 CCH 返回。

fk-web-glm 暴露给本地页面或测试 agent 的路由在 `/api/cch/portal/*`。这些路由只做参数校验、bridge token 校验、转发 CCH 结果和返回 CCH 错误。

## 环境变量

CCH 侧：

- `PORTAL_PROVIDER_GROUP=portal`
- `PORTAL_TEST_KEY_GROUP=test-key`
- `FKCODEX_PORTAL_PLAN_READ_TOKEN`
- `FKCODEX_PORTAL_SUBSCRIPTION_READ_TOKEN`
- `FKCODEX_PORTAL_SUBSCRIPTION_WRITE_TOKEN`
- `FK_WEB_PORTAL_CALLBACK_URL`
- `FK_WEB_PORTAL_CALLBACK_TOKEN`
- `FK_WEB_PORTAL_CALLBACK_SIGNING_SECRET`

fk-web-glm 侧：

- `FK_CCH_API_BASE_URL=http://127.0.0.1:23000`
- `FK_WEB_BASE_URL=http://127.0.0.1:3301`
- `FK_CCH_PORTAL_PLAN_READ_TOKEN`
- `FK_CCH_PORTAL_SUBSCRIPTION_READ_TOKEN`
- `FK_CCH_PORTAL_SUBSCRIPTION_WRITE_TOKEN`
- `FK_PORTAL_CCH_BRIDGE_TOKEN`
- `FK_CCH_PORTAL_CALLBACK_TOKEN`
- `FK_CCH_PORTAL_CALLBACK_SIGNING_SECRET`
- `FK_CCH_PORTAL_PLANS_CACHE_TTL_MS` 可选，默认 30000，最大 300000。只影响公开 plans 代理的进程内缓存。

token 和 signing secret 只写 `.env.local`，不要提交。`FK_WEB_PORTAL_CALLBACK_SIGNING_SECRET` 与 `FK_CCH_PORTAL_CALLBACK_SIGNING_SECRET` 必须使用同一个值，只是两边环境变量名不同。

`PORTAL_PROVIDER_GROUP` 和 `PORTAL_TEST_KEY_GROUP` 可以改成部署自己的分组名。CCH 会为这些分组补建 provider group 和临时 key 所需的 user group config。

## 鉴权

CCH 原始 API 使用 `Authorization: Bearer <purpose-token>`。

- `GET /api/portal/plans` 使用 `FKCODEX_PORTAL_PLAN_READ_TOKEN`
- `GET /api/portal/subscriptions` 使用 `FKCODEX_PORTAL_SUBSCRIPTION_READ_TOKEN`
- `GET /api/portal/subscriptions/:id` 使用 `FKCODEX_PORTAL_SUBSCRIPTION_READ_TOKEN`
- `POST /api/portal/subscriptions/provision` 使用 `FKCODEX_PORTAL_SUBSCRIPTION_WRITE_TOKEN`
- `PATCH /api/portal/subscriptions/:id/revoke` 使用 `FKCODEX_PORTAL_SUBSCRIPTION_WRITE_TOKEN`

fk-web-glm 代理 API：

- `GET /api/cch/portal/plans` 不需要 `FK_PORTAL_CCH_BRIDGE_TOKEN`
- `GET /api/cch/portal/subscriptions` 需要 `FK_PORTAL_CCH_BRIDGE_TOKEN`
- `POST /api/cch/portal/subscriptions/provision` 需要 `FK_PORTAL_CCH_BRIDGE_TOKEN`
- `POST /api/cch/portal/callback` 需要 `FK_CCH_PORTAL_CALLBACK_TOKEN`、`X-FK-Portal-Timestamp` 和 `X-FK-Portal-Signature`

`X-FK-Portal-Signature` 格式为 `sha256=<hex>`。签名内容是 `${timestamp}.${rawBody}`，CCH 用 `FK_WEB_PORTAL_CALLBACK_SIGNING_SECRET` 生成，fk-web-glm 用 `FK_CCH_PORTAL_CALLBACK_SIGNING_SECRET` 验证。两边 secret 必须同值。时间戳单位为毫秒，允许 5 分钟窗口。窗口内重复签名返回 HTTP 409。

## CCH 原始 API

### `GET /api/portal/plans`

返回启用且未删除的套餐。禁用套餐不会出现在返回中。

成功响应：

```json
{
  "ok": true,
  "data": {
    "plans": [
      {
        "id": 1,
        "planId": "pro",
        "name": "Pro",
        "description": "Local CCH portal integration plan",
        "priceAmount": 99,
        "currency": "rmb",
        "validDays": 30,
        "providerGroup": "portal",
        "weeklyLimitUsd": 200,
        "monthlyLimitUsd": 800,
        "totalLimitUsd": 800,
        "rpmLimit": 30,
        "enabled": true,
        "sortOrder": 10,
        "features": ["local-smoke", "portal"],
        "createdAt": "2026-04-29T00:00:00.000Z",
        "updatedAt": "2026-04-29T00:00:00.000Z",
        "deletedAt": null
      }
    ]
  }
}
```

### `GET /api/portal/subscriptions?limit=100`

返回最近订阅。`limit` 范围由 CCH 限制，当前最大值为 500。

成功响应：

```json
{
  "ok": true,
  "data": {
    "subscriptions": [
      {
        "id": 10,
        "sourceOrderId": "mock-order-001",
        "portalUserId": "mock-user-001",
        "email": "mock-user-001@example.test",
        "planId": "pro",
        "status": "active",
        "startsAt": "2026-04-29T00:00:00.000Z",
        "expiresAt": "2026-05-29T00:00:00.000Z",
        "assignedSource": "portal-local-mock-data",
        "providerGroup": "portal",
        "weeklyLimitUsd": 200,
        "monthlyLimitUsd": 800,
        "totalLimitUsd": 800,
        "rpmLimit": 30,
        "cchUserId": 3,
        "defaultKeyId": 3,
        "notes": "local mock subscription",
        "createdAt": "2026-04-29T00:00:00.000Z",
        "updatedAt": "2026-04-29T00:00:00.000Z"
      }
    ]
  }
}
```

### `POST /api/portal/subscriptions/provision`

请求体：

```json
{
  "sourceOrderId": "mock-order-smoke-idempotent",
  "portalUserId": "mock-user-smoke-idempotent",
  "email": "mock-user-smoke-idempotent@example.test",
  "planId": "pro",
  "assignedSource": "fk-web-glm-local-smoke",
  "notes": "local smoke"
}
```

字段规则：

- `sourceOrderId` 必填，全局幂等键。重复请求同一个值，且 `portalUserId`、`email`、`planId` 与已有订阅一致时返回已有订阅；不一致时返回 `409 IDEMPOTENCY_CONFLICT`。
- `portalUserId` 必填，门户用户在 fk-web-glm 侧的稳定 id。
- `email` 必填，CCH 用户名会使用该邮箱。
- `planId` 必填，必须是启用套餐。
- `assignedSource` 可选，默认由调用方指定；fk-web-glm 默认写 `fk-web-glm-local`。
- `notes` 可选。

首次开通成功响应使用 HTTP 201，重复订单成功响应使用 HTTP 200。

成功响应：

```json
{
  "ok": true,
  "data": {
    "result": {
      "idempotent": false,
      "plan": {
        "planId": "pro",
        "providerGroup": "portal",
        "weeklyLimitUsd": 200,
        "monthlyLimitUsd": 800,
        "totalLimitUsd": 800,
        "rpmLimit": 30
      },
      "portalUser": {
        "portalUserId": "mock-user-smoke-idempotent",
        "email": "mock-user-smoke-idempotent@example.test",
        "cchUserId": 4,
        "defaultKeyId": 4,
        "lastProvisionedAt": "2026-04-29T00:00:00.000Z"
      },
      "subscription": {
        "sourceOrderId": "mock-order-smoke-idempotent",
        "portalUserId": "mock-user-smoke-idempotent",
        "planId": "pro",
        "status": "active",
        "providerGroup": "portal",
        "cchUserId": 4,
        "defaultKeyId": 4
      },
      "cchUser": {
        "id": 4,
        "name": "mock-user-smoke-idempotent@example.test",
        "providerGroup": "portal",
        "rpm": 30,
        "limitWeeklyUsd": 200,
        "limitMonthlyUsd": 800,
        "limitTotalUsd": 800
      },
      "defaultKey": {
        "id": 4,
        "name": "default",
        "key": "sk-...",
        "providerGroup": "portal",
        "limitWeeklyUsd": 200,
        "limitMonthlyUsd": 800,
        "limitTotalUsd": 800
      }
    },
    "callback": {
      "skipped": false,
      "ok": true,
      "status": 200
    }
  }
}
```

注意：CCH 原始响应会包含 `defaultKey.key`。fk-web-glm 代理响应、页面、日志和测试输出必须脱敏。

禁用套餐示例：

```json
{
  "ok": false,
  "error": "Portal plan is not available",
  "errorCode": "PLAN_NOT_AVAILABLE"
}
```

### `PATCH /api/portal/subscriptions/:id/revoke`

撤销订阅，当前只更新 CCH 订阅状态为 `revoked`，并触发 fk-web-glm 回调。

成功响应：

```json
{
  "ok": true,
  "data": {
    "subscription": {
      "id": 10,
      "status": "revoked"
    },
    "callback": {
      "skipped": false,
      "ok": true,
      "status": 200
    }
  }
}
```

## fk-web-glm 代理 API

### `GET /api/cch/portal/plans`

成功响应：

```json
{
  "ok": true,
  "plans": []
}
```

该公开响应只返回页面展示所需套餐字段，不返回 `endpoint`、`auth`、内部 base URL、端口、token 或 key。

fk-web-glm 会对该公开 plans 代理做短期进程内缓存，默认 30 秒。缓存只覆盖套餐读取，不覆盖订阅、开通、quota 或 callback。

### `GET /api/cch/portal/subscriptions`

需要 `Authorization: Bearer $FK_PORTAL_CCH_BRIDGE_TOKEN`。

成功响应：

```json
{
  "ok": true,
  "subscriptions": []
}
```

### `POST /api/cch/portal/subscriptions/overview`

给可信服务端调用使用。需要 `Authorization: Bearer $FK_PORTAL_CCH_BRIDGE_TOKEN`。浏览器页面不能直接调用，因为当前 auth 仍是前端 mock，服务端不能可信地判断当前用户身份。

请求体：

```json
{
  "portalUserId": "mock-user-001",
  "email": "mock-user-001@example.test"
}
```

成功响应：

```json
{
  "ok": true,
  "overview": {
    "balanceDisplay": "N/A",
    "quotaAvailableDisplay": "N/A",
    "quotaTotalDisplay": "$800.00",
    "quotaPairDisplay": "N/A / $800.00",
    "currentSubscription": {
      "id": "10",
      "planId": "pro",
      "planName": "Pro",
      "status": "active",
      "rateMultiplierDisplay": "30 RPM"
    },
    "plans": []
  }
}
```

该响应不得返回 raw subscription、token、provider key、default key 明文。真实服务端 auth 接入后，再由服务端会话推导当前用户身份，不从浏览器请求体信任任意 email。

### `POST /api/cch/portal/subscriptions/provision`

需要 `Authorization: Bearer $FK_PORTAL_CCH_BRIDGE_TOKEN`。

请求体与 CCH 原始 API 一致。fk-web-glm 会拒绝多余字段，并限制 `sourceOrderId`、`portalUserId`、`planId` 只能使用字母、数字、`.`、`_`、`:`、`-`。`sourceOrderId` 和 `portalUserId` 最长 200 字符，`planId` 最长 100 字符，`email` 最长 320 字符且必须是邮箱格式，`assignedSource` 最长 100 字符，`notes` 最长 2000 字符。

成功响应：

```json
{
  "ok": true,
  "result": {
    "idempotent": true
  },
  "callback": {
    "skipped": false,
    "ok": true,
    "status": 200
  }
}
```

## fk-web-glm 回调 API

### `POST /api/cch/portal/callback`

CCH 在开通或撤销订阅后调用。需要 `Authorization: Bearer $FK_CCH_PORTAL_CALLBACK_TOKEN`，并同时提供签名头：

- `X-FK-Portal-Timestamp: <unix_ms>`
- `X-FK-Portal-Signature: sha256=<hex_hmac>`

请求体：

```json
{
  "event": "portal.subscription.provisioned",
  "data": {
    "result": {
      "subscription": {
        "sourceOrderId": "mock-order-001",
        "portalUserId": "mock-user-001",
        "planId": "pro"
      }
    }
  }
}
```

事件：

- `portal.subscription.provisioned`
- `portal.subscription.revoked`

`portal.subscription.revoked` 必须包含 `data.subscription.id` 和 `data.subscription.status=revoked`。

开通事件必须把 CCH 开通结果放在 `data.result`，并让订阅字段出现在 `data.result.subscription`。如果 CCH 只发送 `data.subscription`，fk-web-glm 会返回 `CCH_PORTAL_CALLBACK_DATA_REQUIRED`。

成功响应：

```json
{
  "ok": true,
  "received": {
    "event": "portal.subscription.provisioned"
  }
}
```

## 错误格式

CCH 原始 API：

```json
{
  "ok": false,
  "error": "Unauthorized",
  "errorCode": "UNAUTHORIZED"
}
```

fk-web-glm 代理 API：

```json
{
  "ok": false,
  "error": {
    "code": "CCH_PORTAL_BRIDGE_UNAUTHORIZED",
    "message": "Invalid portal bridge token."
  }
}
```

错误响应不得包含 token、provider key、本地 portal key、内部 endpoint、内部 base URL 或请求体敏感字段。

## CCH quota bridge

`POST /api/cch/quota` 是 fk-web-glm 内部接口，需要 `Authorization: Bearer $FK_PORTAL_CCH_BRIDGE_TOKEN`。它不再接受浏览器请求体里的 `{ "apiKey": "..." }`。当前没有服务端可信身份时，只能使用服务端环境变量 `FK_CCH_API_KEY`；未配置时返回 503。

## 本地固定数据

`npm run portal:mock-data` 写入：

- `pro`：启用，30 天，99 RMB，weekly 200、monthly 800、total 800、rpm 30
- `trial`：启用，7 天，10 RMB，weekly 50、monthly 75、total 75、rpm 20
- `disabled-local`：禁用，30 天，1 RMB，用于验证禁用套餐不能开通
- 示例订阅：`portalUserId=mock-user-001`、`sourceOrderId=mock-order-001`、`email=mock-user-001@example.test`、`planId=pro`

## 验收点

- CCH `GET /api/portal/plans` 返回 `pro` 和 `trial`，不返回 `disabled-local`。
- fk-web-glm `GET /api/cch/portal/plans` 返回 `ok=true` 且包含 `pro`。
- fk-web-glm `GET /api/cch/portal/plans` 不返回 `endpoint`、`auth` 或内部 base URL。
- fk-web-glm `GET /api/cch/portal/subscriptions` 在无 bridge token 时返回 401。
- fk-web-glm `POST /api/cch/portal/subscriptions/provision` 在无 bridge token 时返回 401。
- fk-web-glm `POST /api/cch/quota` 带公开 `{ apiKey }` 且无内部 token 时返回 401。
- fk-web-glm callback 正确签名返回 200，篡改签名返回 401。
- 固定 `sourceOrderId=mock-order-smoke-idempotent` 第二次开通返回 `idempotent=true`。
- 同一 `sourceOrderId` 搭配不同 `portalUserId`、`email` 或 `planId` 返回 `409 IDEMPOTENCY_CONFLICT`。
- 时间戳订单开通后，订阅、CCH 用户、默认 key 都在 `portal` 分组。
- `disabled-local` 开通失败，错误码为 `PLAN_NOT_AVAILABLE`。
- 错误 CCH token 请求原始 API 返回 401。
- `/pricing` 展示 CCH plans，包含 `pro` 和 `trial`，不包含 `disabled-local`。
- `/subscriptions` 展示公开 CCH plans；真实服务端 auth 接入前，不从浏览器请求体按 email 查询订阅。
