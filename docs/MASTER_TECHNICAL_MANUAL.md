# KilowattIQ — Master Technical Architecture & Engineering Manual

> **System**: IoT-Enabled Smart Energy Management & Cost Analytics Platform  
> **Jurisdiction**: Bangladesh Energy Regulatory Commission (BERC) / DESCO / DPDC  
> **Target Audience**: Software Engineers, IoT Hardware Developers, Technical Interviewers, and Project Maintainers  
> **Version**: 1.1.0 (Production-Verified)  

---

## Table of Contents
1. [System Overview & High-Level Architecture](#1-system-overview--high-level-architecture)
2. [End-to-End Data Ingestion Pipeline](#2-end-to-end-data-ingestion-pipeline)
3. [BERC LT-A Tariff Engine & Mathematical Models](#3-berc-lt-a-tariff-engine--mathematical-models)
4. [Database Architecture & Multi-Tenant RLS Security](#4-database-architecture--multi-tenant-rls-security)
5. [IoT Hardware & Adapter Layer (ESP32, Tuya, DESCO, Mock)](#5-iot-hardware--adapter-layer-esp32-tuya-desco-mock)
6. [Gemini 2.5 Flash AI Advisor & Bilingual Deterministic Engine](#6-gemini-25-flash-ai-advisor--bilingual-deterministic-engine)
7. [Developer Operations & Step-by-Step Workflows](#7-developer-operations--step-by-step-workflows)
8. [Career Growth Roadmap & Engineering Milestones](#8-career-growth-roadmap--engineering-milestones)
9. [Technical Interview Defense Guide](#9-technical-interview-defense-guide)

---

## 1. System Overview & High-Level Architecture

KilowattIQ bridges physical electrical hardware with cloud-native analytics. It translates electrical sensor parameters (Voltage, Current, Active Power, Frequency, Power Factor) into financial insights based on Bangladesh's non-linear utility pricing.

```
+-----------------------------------------------------------------------------------+
|                                PHYSICAL HARDWARE LAYER                            |
|  [ESP32 + PZEM-004T]        [Tuya Smart Plugs]          [DESCO Smart AMI Meters]  |
|  (Split-core CT Sensor)     (WiFi Relay + Shunt)        (Utility Headend System)  |
+--------------------------+---------------------------+----------------------------+
                           |                           |
                  MQTT 3.1.1 (TLS 8883)       HTTPS REST API
                           |                           |
                           v                           v
+-----------------------------------------------------------------------------------+
|                        APPLICATION GATEWAY (NODE.JS / EXPRES)                     |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | Device Adapter Layer (CompositeAdapter, MQTTAdapter, TuyaAdapter, etc.)     |  |
|  +-----------------------------------------------------------------------------+  |
|  | Real-Time Ingestion Buffer & Telemetry Normalizer (W, V, A, PF, Hz)         |  |
|  +-----------------------------------------------------------------------------+  |
|  | Analytics Engines:                                                          |  |
|  |  * TariffCalculator (BERC 7-Tier Progressive Slab Model)                   |  |
|  |  * VampirePowerEngine (Standby Leakage & Phantom Detection)                 |  |
|  |  * BudgetEngine (Linear Burn-Rate & Risk Forecasting)                       |  |
|  |  * GeminiAdvisorService (Gemini 2.5 Flash + Deterministic Bilingual Engine) |  |
|  +-----------------------------------------------------------------------------+  |
+--------------------------+-------------------------------------+------------------+
                           |                                     |
                           v                                     v
+--------------------------------------+  +-----------------------------------------+
|     PERSISTENCE & SECURITY LAYER     |  |          PRESENTATION LAYER             |
|                                      |  |                                         |
|  * Supabase PostgreSQL (14 Tables)   |  |  * React 19 SPA + Vite 6                |
|  * Row-Level Security (Tenant Isolation) |  * Tailwind CSS v4 Engine              |
|  * JWT Auth Verification             |  |  * Lucide React + Recharts              |
|  * Idempotent SQL Migrations         |  |  * Zero-Setup Gulshan / Admin Portals   |
+--------------------------------------+  +-----------------------------------------+
```

---

## 2. End-to-End Data Ingestion Pipeline

### Metric Definitions & Units
| Metric | Symbol | Unit | Typical Range (BD Residential) | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Active Power** | $P$ | Watts (W) | $150\text{ W} - 6,500\text{ W}$ | Actual real power consumed doing work |
| **Voltage** | $V$ | Volts (V) | $195\text{ V} - 235\text{ V}$ AC | Single-phase RMS supply voltage |
| **Current** | $I$ | Amperes (A) | $0.8\text{ A} - 32.0\text{ A}$ | Root Mean Square current drawn |
| **Power Factor** | $PF$ | $\cos(\theta)$ | $0.75 - 0.99$ | Ratio of Real Power to Apparent Power ($P/S$) |
| **Grid Frequency**| $f$ | Hertz (Hz) | $49.5\text{ Hz} - 50.5\text{ Hz}$ | Bangladesh national grid nominal frequency |
| **Accumulated Energy** | $E$ | kWh (Units) | $100 - 800\text{ kWh/month}$ | Time integral: $\int P(t) dt$ |

### Telemetry Packet Schema (MQTT / JSON)
Devices publish payloads to topic `kilowattiq/{householdId}/telemetry`:
```json
{
  "deviceId": "esp32_pzem_001",
  "householdId": "11111111-1111-4111-a111-111111111111",
  "timestamp": "2026-09-23T17:00:00.000Z",
  "voltage": 218.4,
  "current": 8.65,
  "activePower": 1845.2,
  "powerFactor": 0.96,
  "frequency": 50.02,
  "energyKwh": 285.4
}
```

---

## 3. BERC LT-A Tariff Engine & Mathematical Models

Bangladesh Energy Regulatory Commission (BERC) mandates a progressive slab structure for residential consumers (`LT-A`). Bills are not calculated at a flat rate; consumption is sliced into brackets.

### BERC LT-A Residential Tariff Brackets
| Step | Consumption Range | Marginal Rate (BDT / kWh) | Step Capacity |
| :--- | :--- | :--- | :--- |
| **Lifeline** | $0 - 50\text{ kWh}$ (Special low-income rate) | ৳4.63 | 50 kWh |
| **Step 1** | $0 - 75\text{ kWh}$ | ৳5.26 | 75 kWh |
| **Step 2** | $76 - 200\text{ kWh}$ | ৳7.20 | 125 kWh |
| **Step 3** | $201 - 300\text{ kWh}$ | ৳7.59 | 100 kWh |
| **Step 4** | $301 - 400\text{ kWh}$ | ৳8.02 | 100 kWh |
| **Step 5** | $401 - 600\text{ kWh}$ | ৳12.67 | 200 kWh |
| **Step 6** | Above $600\text{ kWh}$ | ৳14.61 | $\infty$ |

### Complete Bill Computation Formula
The total gross monthly bill $B_{\text{total}}$ is defined as:
$$B_{\text{total}} = C_{\text{energy}} + C_{\text{demand}} + C_{\text{meter}} + C_{\text{vat}}$$

1. **Progressive Slab Energy Charge ($C_{\text{energy}}$)**:
   $$C_{\text{energy}} = \sum_{i=1}^{n} \min\left(\max(E - S_{i,\min}, 0), S_{i,\max} - S_{i,\min}\right) \times R_i$$
2. **Fixed Demand Charge ($C_{\text{demand}}$)**:
   $$C_{\text{demand}} = \text{SanctionedLoad}_{\text{kW}} \times 42.00\text{ BDT}$$
3. **Meter Rent ($C_{\text{meter}}$)**:
   $$C_{\text{meter}} = 40.00\text{ BDT (Single Phase)} \quad\text{or}\quad 250.00\text{ BDT (Three Phase)}$$
4. **Government Value Added Tax ($C_{\text{vat}}$)**:
   $$C_{\text{vat}} = 0.05 \times (C_{\text{energy}} + C_{\text{demand}} + C_{\text{meter}})$$
5. **Effective Rate per kWh ($R_{\text{effective}}$)**:
   $$R_{\text{effective}} = \frac{B_{\text{total}}}{E}$$

---

## 4. Database Architecture & Multi-Tenant RLS Security

The database schema (`supabase/migrations/20260810000000_complete_kilowattiq_schema.sql`) enforces complete multi-tenancy. Consumers can only read and modify records linked to their authorized household.

```
       +-----------------------+
       |         users         |
       +-----------+-----------+
                   |
                   | 1:N
                   v
       +-----------------------+           1:N         +-----------------------+
       |      households       +---------------------->+         rooms         |
       +-----------+-----------+                       +-----------+-----------+
                   |                                               |
                   | 1:N                                           | 1:N
                   v                                               v
       +-----------+-----------+                       +-----------+-----------+
       |   household_members   |                       |      appliances       |
       +-----------------------+                       +-----------------------+
                   |                                               |
                   | 1:N                                           | 1:N
                   v                                               v
       +-----------------------+                       +-----------------------+
       |   telemetry_readings  |                       |     energy_budgets    |
       +-----------------------+                       +-----------------------+
```

### Key Tables & Enums
1. **`users`**: Extended profile linked to `auth.users` UUID (`role`: `'CONSUMER' | 'ADMIN' | 'UTILITY_AUDITOR'`).
2. **`households`**: Billing profile, utility provider (`DESCO`, `DPDC`, `BPDB`, `NESCO`, `BREB`, `WZPDCL`), sanctioned load in kW.
3. **`household_members`**: Join table mapping `user_id` to `household_id` with roles (`OWNER`, `MEMBER`, `VIEWER`).
4. **`appliances`**: Electrical specifications (rated wattage, inverter vs non-inverter, room location, vampire standby wattage).
5. **`devices`**: Smart meter gateways and smart plugs (MAC address, protocol, online/offline heartbeat).
6. **`telemetry_readings`**: High-frequency electrical readings with timestamp indexes.
7. **`tariffs` & `tariff_rules`**: Configurable utility provider slab schedules.

### Row Level Security (RLS) Pattern
Every table features strictly enforced RLS policies:
```sql
-- Pattern for multi-tenant household isolation
ALTER TABLE appliances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view appliances in their households" ON appliances;
CREATE POLICY "Users can view appliances in their households"
ON appliances FOR SELECT
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  )
  OR
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ADMIN')
);
```

---

## 5. IoT Hardware & Adapter Layer

The platform utilizes the **Adapter Design Pattern** (`backend/adapters/DeviceAdapter.ts`). Any real or virtual device conforms to the unified interface:

```typescript
export interface DeviceAdapter {
  id: string;
  name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getLatestReading(householdId: string): Promise<PowerReading | null>;
  toggleDevice(deviceId: string, state: boolean): Promise<boolean>;
  getHealth(): AdapterHealth;
}
```

### Supported Hardware Adapters
1. **`ESP32PZEMAdapter`**:
   - Hardware: ESP32 NodeMCU + PZEM-004T v3.0 (TTL UART interface).
   - Ingestion: Listens on local or cloud MQTT brokers.
2. **`TuyaAdapter`**:
   - Hardware: Tuya-compliant WiFi 16A smart plugs with energy metering chips (BL0937 / HLW8012).
   - Integration: OpenAPI cloud signature authentication with relay control.
3. **`DESCOAdapter`**:
   - Integration: Connects to DESCO AMI (Advanced Metering Infrastructure) REST APIs.
4. **`MockAdapter` (Simulation Mode)**:
   - Synthesizes realistic 24-hour diurnal load curves (morning rise, evening peak load spike at 7:00 PM – 10:30 PM, night baseline).

### ESP32 PZEM-004T Wiring Reference
```
ESP32 DevKit                  PZEM-004T v3.0
+------------+                +------------+
|        5V  |--------------->| 5V         |
|        GND |----------------| GND        |
|  GPIO 16   |----(RX2)------>| TX         |
|  GPIO 17   |<---(TX2)-------| RX         |
+------------+                +------------+
                                |    |
                               [AC Live & Neutral] -> Mains In
                               [Split Core CT]     -> Clamped on Phase Wire
```

---

## 6. Gemini 2.5 Flash AI Advisor & Bilingual Engine

The advisory pipeline (`backend/services/GeminiAdvisorService.ts`) runs server-side to protect API credentials and enforce structured JSON schemas.

### Operational Modes
1. **LLM Connected Mode (`gemini-2.5-flash`)**:
   - Context Payload: Current active wattage, monthly kWh projection, overage vs budget, list of non-inverter appliances, vampire standby wattage.
   - Temperature: `0.2` (Low variance for accurate arithmetic and consistent advice).
2. **Deterministic Fallback Engine (Offline / No Key)**:
   - Automatically activates if `GEMINI_API_KEY` is omitted or quota is exceeded.
   - Generates localized BERC slab warnings in **English** or **Bangla (`bn`)**.
   - Identifies specific appliances exceeding 35% of total household consumption.

---

## 7. Developer Operations & Step-by-Step Workflows

### How to Seed Demo Data
To populate a fresh Supabase database with realistic demo households, rooms, appliances, and tariffs:
```bash
npm run seed
```

### How to Add a New Appliance
1. Open `shared/types/household.ts`.
2. Add your category to `ApplianceCategory` enum if not already present.
3. Define default power characteristics in `backend/data/defaultAppliances.ts`.
4. The frontend (`src/components/tabs/AppliancesTab.tsx`) automatically binds the new category and renders the corresponding icon.

### How to Deploy to Vercel
1. Ensure the standalone serverless bundle is generated:
   ```bash
   npm run build
   ```
   This executes `esbuild api_entry.ts --bundle --platform=node --format=esm --outfile=api/index.js`.
2. Push your branch to GitHub.
3. Configure Environment Variables in Vercel Dashboard:
   - `SUPABASE_URL`: `https://your-project.supabase.co` (Do not include `/rest/v1`)
   - `SUPABASE_ANON_KEY`: `your-anon-key`
   - `SUPABASE_SERVICE_ROLE_KEY`: `your-service-role-key`
   - `GEMINI_API_KEY`: `your-gemini-key` (Optional)

---

## 8. Career Growth Roadmap & Engineering Milestones

Use these milestones to continue evolving KilowattIQ into a standout portfolio project:

### Phase 1: Real-Time Stream Migration (Short-Term)
- [ ] Replace 3-second `setInterval` HTTP polling with **Server-Sent Events (SSE)** endpoint (`/api/v1/telemetry/stream`).
- [ ] Implement browser `EventSource` hook with automatic backoff reconnection.

### Phase 2: Time-Series Optimization & Partitioning (Mid-Term)
- [ ] Add monthly PostgreSQL table partitioning on `telemetry_readings` (`PARTITION BY RANGE (recorded_at)`).
- [ ] Create an automated cron rollup function to populate `telemetry_hourly` and `telemetry_daily` summaries, reducing query latency on 6-month historical graphs by 80%.

### Phase 3: PWA & Predictive Electrical Signatures (Advanced)
- [ ] Convert frontend into a full **Progressive Web App (PWA)** with offline IndexedDB caching for energy audits.
- [ ] Implement an **Appliance Health Index (1–100)** heuristic detecting anomalous continuous refrigerator compressor cycles and degraded power factors.

---

## 9. Technical Interview Defense Guide

When asked about KilowattIQ in engineering interviews, structure your responses around these key system design decisions:

### Q1: "Why did you implement non-linear slab logic on the backend instead of standard SQL aggregation?"
> *"Bangladesh BERC residential tariffs cannot be modeled as a flat scalar rate multiplied by total units. They follow a piecewise progressive slab model where units 0–75 cost ৳5.26, 76–200 cost ৳7.20, and 201–300 cost ৳7.59. Moving the arithmetic into a dedicated domain engine (`TariffCalculator`) allows us to unit-test edge cases (e.g. crossing boundaries by 1 kWh), support multi-utility schedules (DESCO vs DPDC), and simulate hypothetical billing changes on the fly without database roundtrips."*

### Q2: "How did you solve the cold-start function invocation failure on Vercel?"
> *"Node.js serverless functions running on Vercel package each API route into isolated AWS Lambda containers. In typical TypeScript projects, relative imports across deep directory trees fail during ESM module resolution (`ERR_MODULE_NOT_FOUND`). I introduced a dedicated single-entry bundling pipeline with `esbuild` (`api_entry.ts` $\to$ `api/index.js`) that tree-shakes and bundles all backend controllers, tariff engines, and services into a single self-contained 141 kB bundle."*

### Q3: "How do you maintain data privacy between households in multi-tenant mode?"
> *"Security is handled at the database kernel level through Supabase PostgreSQL Row-Level Security (RLS). Every table containing telemetry, appliances, or billing information is linked to a `household_id`. Queries execute with the authenticated user's JWT context (`auth.uid()`), where RLS policies ensure records are only returned if the user is a registered member of that household. Even if an attacker manipulates client-side request IDs, the database strictly denies unauthorized row access."*

---
*Maintained by the KilowattIQ Engineering Team. Questions or contributions: Refer to `docs/API_REFERENCE.md`.*
