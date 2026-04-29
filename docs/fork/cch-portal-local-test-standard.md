# CCH Portal 本地测试标准与同步延迟基准

本文给本地 CCH + fk-web-glm 测试使用。目标是让不同 agent 跑同一套步骤时，能用相同口径判断功能是否通过，以及同步延迟是否异常。

相同内容需要保留在两个仓库：

- CCH：`/mnt/x/project/claude-code-hub/docs/fork/cch-portal-local-test-standard.md`
- fk-web-glm：`/mnt/x/fk-web-glm/docs/cch-portal-local-test-standard.md`

## 适用范围

本标准只覆盖本地 API 测试：

- CCH 本地服务：`http://127.0.0.1:23000`
- fk-web-glm 本地服务：`http://127.0.0.1:3301`
- CCH 是套餐、订阅、CCH 用户、默认 key 的数据源。
- fk-web-glm 只通过 `/api/cch/portal/*` 调 CCH。

不覆盖浏览器购买页、不覆盖真实支付、不覆盖生产 CCH 写入。

## 测试前置条件

CCH：

- `npm run portal:mock-data` 已执行。
- 本地 DB 存在 `pro`、`trial`、`disabled-local`。
- 本地 DB 存在 `mock-user-001` 和 `mock-order-001` 示例订阅。
- 本地 provider 已用 `npm run provider:local-cch-test` 配到 `portal` 分组。
- `FK_WEB_PORTAL_CALLBACK_URL` 指向当前 web 服务端口。

fk-web-glm：

- `.env.local` 存在，且包含 `FK_CCH_API_BASE_URL`、`FK_WEB_BASE_URL`、三类 `FK_CCH_PORTAL_*_TOKEN`、`FK_PORTAL_CCH_BRIDGE_TOKEN`、`FK_CCH_PORTAL_CALLBACK_TOKEN`。
- `FK_WEB_BASE_URL` 与实际启动端口一致。
- 当前运行态包含 `/api/cch/portal/*` 路由。

如果 `GET http://127.0.0.1:3301/api/cch/portal/plans` 返回 404，说明 web 运行态还不是当前代码，先重启 web。

## 标准命令

功能检查：

```bash
npm run cch:smoke
```

严格检查同步延迟：

```bash
CCH_SMOKE_ENFORCE_LATENCY=true npm run cch:smoke
```

临时端口检查：

```bash
FK_WEB_BASE_URL=http://127.0.0.1:3310 npm run cch:smoke
```

## 功能通过标准

脚本退出码为 0，并满足以下结果：

| 编号 | 项目 | 通过标准 |
| --- | --- | --- |
| F-01 | CCH 原始套餐 | `GET /api/portal/plans` 返回 `ok=true`，包含 `pro` 和 `trial` |
| F-02 | 禁用套餐隐藏 | 套餐列表不包含 `disabled-local` |
| F-03 | web 套餐代理 | `GET /api/cch/portal/plans` 返回 `ok=true`，包含 `pro` |
| F-04 | web 订阅代理 | 带 bridge token 请求 `GET /api/cch/portal/subscriptions` 返回 `ok=true` |
| F-05 | bridge token | 不带 bridge token 请求订阅列表返回 401 |
| F-06 | 开通鉴权 | 不带 bridge token 请求开通返回 401 |
| F-07 | CCH token | 错误 CCH purpose token 请求原始 API 返回 401 |
| F-08 | 固定订单 | `mock-order-smoke-idempotent` 第二次开通返回 `idempotent=true` |
| F-09 | 新订单 | `mock-order-smoke-<timestamp>` 返回 `idempotent=false` |
| F-10 | 写后可读 | 新订单开通后，订阅列表能查到同一个 `sourceOrderId` |
| F-11 | 分组 | 新订阅、CCH 用户、默认 key 都在 `portal` 分组 |
| F-12 | 禁用套餐 | `disabled-local` 开通失败，错误码保持 `PLAN_NOT_AVAILABLE` |
| F-13 | 敏感信息 | 输出不展示 token、provider key、本地 portal key 原文 |

## 同步延迟口径

脚本使用以下口径记录耗时：

| 名称 | 含义 |
| --- | --- |
| `directPlans` | fk-web-glm 脚本直连 CCH 读取套餐的 HTTP 耗时 |
| `proxyPlans` | 脚本请求 fk-web-glm，再由 fk-web-glm 请求 CCH 读取套餐的总耗时 |
| `subscriptions` | 脚本请求 fk-web-glm 订阅列表代理的总耗时 |
| `fixedProvisionFirst` | 固定订单第一次开通请求的总耗时 |
| `fixedProvisionSecond` | 固定订单第二次开通请求的总耗时 |
| `timestampProvision` | 新订单开通请求的总耗时 |
| `readAfterWrite` | 新订单开通响应返回后，到订阅列表能查到该订单的耗时 |
| `disabledPlan` | 禁用套餐失败路径的总耗时 |
| `total` | 整个 smoke 脚本耗时 |

`readAfterWrite` 是本地数据同步的主要基准。它只计算“开通响应已返回”之后，web 订阅列表能读到新订单所需时间。

## 延迟对照基准

以下基准适用于 warm run，也就是 CCH 和 fk-web-glm 已经启动，Next.js 已编译相关 API 路由之后的测试。

| 名称 | 目标值 | 说明 |
| --- | ---: | --- |
| `directPlans` | `<= 1000ms` | 本地 CCH 套餐读取 |
| `proxyPlans` | `<= 1500ms` | web 代理套餐读取 |
| `subscriptions` | `<= 1500ms` | web 代理订阅列表 |
| `subscriptionsNoToken` | `<= 1500ms` | web 订阅鉴权失败路径 |
| `provisionNoToken` | `<= 1500ms` | web 开通鉴权失败路径 |
| `wrongCchToken` | `<= 1500ms` | CCH token 失败路径 |
| `fixedProvisionFirst` | `<= 3000ms` | 固定订单第一次请求；已有订单时仍应很快返回 |
| `fixedProvisionSecond` | `<= 3000ms` | 固定订单幂等请求 |
| `timestampProvision` | `<= 3000ms` | 新订单开通 |
| `readAfterWrite` | `<= 1000ms` | 新订单写后可读 |
| `disabledPlan` | `<= 1500ms` | 禁用套餐失败路径 |
| `total` | `<= 10000ms` | 全脚本耗时 |

Cold run 不使用这些数值判定异常。Next.js 首次编译 API 路由时，单个请求可能明显超过基准。先跑一次 `npm run cch:smoke` 预热，再跑第二次作为基准结果。

## 当前本机 warm run 样本

本样本来自 2026-04-29 的本机测试。测试时 web 临时跑在 `http://127.0.0.1:3310`，CCH 跑在 `http://127.0.0.1:23000`。因为 CCH 回调 URL 当时仍指向 `3301`，callback 返回 404；该结果只说明回调入口端口不一致，不影响 CCH 订阅写入和 `readAfterWrite` 判断。

| 名称 | 样本值 | 预算 | 结果 |
| --- | ---: | ---: | --- |
| `directPlans` | `118ms` | `1000ms` | 通过 |
| `proxyPlans` | `154ms` | `1500ms` | 通过 |
| `subscriptions` | `173ms` | `1500ms` | 通过 |
| `subscriptionsNoToken` | `78ms` | `1500ms` | 通过 |
| `provisionNoToken` | `60ms` | `1500ms` | 通过 |
| `wrongCchToken` | `65ms` | `1500ms` | 通过 |
| `fixedProvisionFirst` | `143ms` | `3000ms` | 通过 |
| `fixedProvisionSecond` | `136ms` | `3000ms` | 通过 |
| `timestampProvision` | `160ms` | `3000ms` | 通过 |
| `readAfterWrite` | `138ms` | `1000ms` | 通过 |
| `disabledPlan` | `129ms` | `1500ms` | 通过 |
| `total` | `1361ms` | `10000ms` | 通过 |

## 结果解释

脚本默认只因功能错误失败。延迟超过基准时，输出 `latency summary`，但退出码仍保持 0。

需要让延迟超标也失败时，设置：

```bash
CCH_SMOKE_ENFORCE_LATENCY=true npm run cch:smoke
```

排查顺序：

1. `directPlans` 慢：优先看 CCH 本地服务和 DB。
2. `directPlans` 正常但 `proxyPlans` 慢：看 fk-web-glm dev server、Next.js 编译状态和 CCH client。
3. `timestampProvision` 慢：看 CCH provider、DB 写入、回调 URL。
4. `readAfterWrite` 慢：看订阅列表查询和 web 代理缓存；当前实现不应缓存订阅列表。
5. `callback.ok=false` 但开通成功：开通已写入 CCH，问题在 CCH 回调请求或 web 回调入口。

## 记录格式

每次交接测试建议记录：

- CCH commit 或分支。
- fk-web-glm commit 或分支。
- CCH base URL。
- fk-web-glm base URL。
- `timestampOrderId`。
- `latency summary.records`。
- callback 状态。

记录中不得包含 token、provider key、本地 portal key 原文。
