# Monitoring Plan

---

## Health Check Endpoint

Every deployment must expose a `GET /health` endpoint that returns:

```json
{ "status": "ok" }
```

This endpoint is used by:
- The cloud host (App Runner / App Service) for container health checks
- The keep-alive ping that prevents cold starts (see below)
- Manual spot checks to confirm the app is running

---

## Structured Logging

All significant events should be logged in JSON format for easy querying in CloudWatch or Azure Monitor.

Each log entry should include:

| Field | Description |
|-------|-------------|
| `timestamp` | ISO 8601 |
| `origin_zip` | From Shopify rate request |
| `destination_zip` | From Shopify rate request |
| `total_weight_lbs` | Calculated before TMS call |
| `tms_response_time_ms` | Duration of outbound TMS call |
| `outcome` | `rate_returned`, `cache_hit`, `timeout`, `validation_failure`, `hmac_rejected`, `tms_no_quote` |

Events to log:
- Every incoming rate request
- Every outbound TMS call (and its response time)
- Cache hits and misses
- TMS timeouts (>7 seconds)
- Input validation failures (missing ZIPs, zero-weight items)
- HMAC verification rejections (unauthorized requests)
- App errors and unhandled exceptions

---

## Keep-Alive Ping (Cold Start Prevention)

AWS App Runner and Azure App Service can spin down idle containers. Shopify's rate request timeout is 3–10 seconds — a cold start on a quiet store will silently fail and show only UPS rates.

**Mitigation:** A scheduled ping to `/health` every 5 minutes keeps the container warm.

| Platform | Method |
|----------|--------|
| AWS | CloudWatch Scheduled Event (EventBridge rule) → targets the App Runner `/health` URL |
| Azure | Azure Timer Function that calls the App Service `/health` URL |

This must be confirmed working via the cold start test in `TESTING.md` before go-live.

---

## Cloud Monitoring

### AWS (App Runner + CloudWatch)

Set up the following after deploying to App Runner:

**Alarms:**
- Error rate alarm — alert when 5xx responses exceed a threshold (e.g., 5 errors in 5 minutes)
- Response time alarm — alert when p95 latency approaches the Shopify timeout (e.g., >5 seconds)

**Log groups:**
- App Runner streams container logs to CloudWatch automatically
- Query logs by `outcome` field to investigate issues

**Notification:** Route alarms to an SNS topic → email to whoever is on-call or responsible for the app.

---

### Azure (App Service + Azure Monitor)

Set up the following after deploying to App Service:

**Alerts:**
- Error rate alert — trigger on elevated HTTP 5xx response rate
- Response time alert — trigger when average response time approaches the Shopify timeout

**Log stream:**
- App Service streams container logs to Azure Monitor / Log Analytics automatically
- Use KQL queries to filter by `outcome` field

**Notification:** Route alerts to an Action Group → email to whoever is responsible for the app.

---

## Operational Reference

| Symptom | Where to Look |
|---------|---------------|
| LTL rates not appearing at checkout | CloudWatch / Azure Monitor logs — check for `timeout`, `tms_no_quote`, or `validation_failure` outcomes |
| App returning HTTP 401 to Shopify | Logs show `hmac_rejected` — Shopify secret may have changed; verify `SHOPIFY_CLIENT_SECRET` in Secrets Manager |
| Rates slow or timing out | Check `tms_response_time_ms` in logs — TMS may be degraded; check TMS status separately |
| First checkout of the day fails | Cold start — verify the keep-alive ping is still active and hitting `/health` every 5 minutes |
| TMS credentials stopped working | Update the value directly in AWS Secrets Manager or Azure Key Vault — app reads secrets at startup |
