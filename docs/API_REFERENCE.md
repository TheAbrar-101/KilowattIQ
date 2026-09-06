# KilowattIQ — Backend REST API Reference

All backend endpoints are scoped under `/api/v1` and require HTTP Bearer authentication (`Authorization: Bearer <token>`) unless specified otherwise.

---

## 1. Authentication (`/api/v1/auth`)

- `POST /api/v1/auth/login`
  - Body: `{ email, password }`
  - Returns: `{ status: 'success', token, user }`
- `POST /api/v1/auth/register`
  - Body: `{ email, password, fullName, phone }`
- `GET /api/v1/auth/me`
  - Headers: `Authorization: Bearer <token>`
  - Returns current user profile and authorized household IDs.

---

## 2. Households & Assets (`/api/v1/households`)

- `GET /api/v1/households` — List authorized households for user
- `GET /api/v1/households/:id/rooms` — List rooms in household
- `GET /api/v1/households/:id/appliances` — List appliances in household

---

## 3. IoT Telemetry & Appliance Control (`/api/v1/telemetry` & `/api/v1/devices`)

- `GET /api/v1/telemetry/live?householdId=...` — Returns live power, voltage, current, power factor, frequency, and connected adapter status.
- `POST /api/v1/devices/control` — Toggle appliance relay ON/OFF.
  - Body: `{ applianceId: string, isOn: boolean }`

---

## 4. Tariff & Billing (`/api/v1/tariffs` & `/api/v1/budgets`)

- `GET /api/v1/tariffs/calculate?householdId=...&totalKwh=...` — Calculates DESCO/DPDC 7-step slab cost breakdown.
- `GET /api/v1/budgets/status?householdId=...` — Evaluates monthly budget utilization and overage projection.

---

## 5. AI Energy Advisor (`/api/v1/recommendations`)

- `GET /api/v1/recommendations/ai-advisor?householdId=...&language=en|bn` — Server-side Gemini AI analysis grounded in actual household metrics.

---

## 6. Reports & Export (`/api/v1/reports`)

- `GET /api/v1/reports/data?householdId=...` — Full JSON payload for reports tab.
- `GET /api/v1/reports/export?householdId=...&format=csv|pdf` — Downloads formatted CSV or PDF energy audit file.

---

## 7. Administrative (`/api/v1/admin`)

- `GET /api/v1/admin/overview` — Requires `ADMIN` role. System health, adapter statuses, and national grid frequency.
