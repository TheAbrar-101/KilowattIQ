# KilowattIQ — Faculty Demonstration Checklist

Pre-flight verification checklist for demonstrating KilowattIQ to academic evaluators.

---

## 📋 Pre-Demo Verification Items

- [x] **Server Status**: Express server active on port 3000 (`http://localhost:3000`).
- [x] **TypeScript Build**: Compiles cleanly with `npm run build` / `tsc --noEmit`.
- [x] **Linter**: Zero syntax errors or unresolved imports (`npm run lint`).
- [x] **Health Endpoint**: `GET /api/health` returns HTTP 200 OK.
- [x] **Authentication Protection**: `GET /api/v1/auth/me` without Bearer token returns 401 Unauthorized.
- [x] **Household Isolation**: Accessing unauthorized household ID returns 403 Forbidden.
- [x] **Admin Route Security**: `/api/v1/admin/overview` without ADMIN role returns 403 Forbidden.
- [x] **Appliance Relay Toggle**: Turning AC ON/OFF dynamically updates live power gauge and telemetry.
- [x] **DESCO Tariff Engine**: LT-A 7-tier slab calculation displays exact step breakdowns and 5% VAT.
- [x] **Budget Engine**: Projected monthly spending and overage warnings reflect current consumption.
- [x] **Vampire Load Audit**: Standby watts and monthly/annual BDT loss correctly calculated.
- [x] **Gemini AI Advisor**: Multi-lingual (English / Bangla) advice generated via server-side endpoint.
- [x] **CSV Export**: Downloads `kilowattiq-energy-report-YYYY-MM.csv` with valid headers and escaped values.
- [x] **PDF Export**: Downloads `kilowattiq-energy-report-YYYY-MM.pdf` formatted via PDFKit.
- [x] **Analytics Charting**: 6-Month historical trend and appliance share pie charts render cleanly.
