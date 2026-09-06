# KilowattIQ - Project Handoff & Architecture Overview

## Executive Summary
KilowattIQ is an IoT-enabled Smart Energy Monitoring and Cost Analysis System custom-built for Bangladeshi households. It integrates real-time power telemetry, DESCO slab-tariff calculations, appliance breakdown, vampire load detection, and AI recommendations into a responsive web dashboard.

---

## Technical Stack & Architecture

### Frontend Architecture
- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS v4
- **Animation**: Motion (`motion/react`)
- **Visualizations**: Recharts
- **Icons**: Lucide React (`lucide-react`)

### Backend Architecture
- **Runtime**: Node.js + Express + TypeScript (`tsx` dev / `esbuild` bundled production CJS)
- **Database**: Supabase PostgreSQL (`@supabase/supabase-js`)
- **Authentication**: JWT Bearer Tokens with Supabase Auth session support & fallback user simulation
- **IoT Services**: MQTT Telemetry Service, Device Adapters (DESCO, Tuya, ESP32 PZEM, Composite, Mock)
- **Analytics & Engine**: TariffCalculator (DESCO LT-A 7-tier slab model), VampirePowerEngine, BudgetEngine, RecommendationEngine

---

## Verified Core Database Tables (14 Schemas)
1. `users`
2. `households`
3. `household_members`
4. `rooms`
5. `appliances`
6. `devices`
7. `tariffs`
8. `tariff_rules`
9. `telemetry_live`
10. `telemetry_hourly`
11. `telemetry_daily`
12. `budgets`
13. `budget_history`
14. `suggestions` / `reports`

---

## Verified API Routes (`/api/v1`)
- `/auth/login`, `/auth/register`, `/auth/me`
- `/households`, `/households/:id/rooms`, `/households/:id/appliances`
- `/devices`
- `/telemetry/live`, `/telemetry/historical`
- `/tariffs`
- `/budgets`
- `/recommendations`
- `/reports`
- `/admin`

---

## Current State
- **Build Status**: Verified and compiling (`npm run build`).
- **Lint Status**: Verified clean (`tsc --noEmit`).
- **Dev Server**: Running on port 3000.
- **Data Persistence**: Robust handling for both live Supabase connection and seamless fallback state ensuring 100% UI stability.
