# KilowattIQ - Project Handoff

## Project
KilowattIQ

AI-Powered Smart Energy & Tariff Analytics for Bangladesh.

## Current Architecture

Frontend:
- React
- TypeScript
- Vite

Backend:
- Node.js
- Express
- TypeScript

Database:
- Supabase PostgreSQL

Authentication:
- Supabase Auth
- JWT Bearer authentication

## Current Status

Supabase PostgreSQL:
CONNECTED

Database:
14 tables created and verified

RLS:
ENABLED and verified

Mock data:
DISABLED
USE_MOCK_DATA=false

Authentication:
IMPLEMENTED AND VERIFIED

Household authorization:
IMPLEMENTED

API:
12/12 endpoints verified

Frontend:
Connected to Express REST API

Build:
PASSED
0 compile errors
0 lint errors

## Database Tables

1. profiles
2. households
3. household_members
4. rooms
5. appliances
6. devices
7. readings
8. tariffs
9. tariff_rate_rules
10. budgets
11. budget_history
12. suggestions
13. device_credentials
14. audit_logs

## Demo Household

Gulshan Residence - Flat 4B

DESCO account:
8820-9941-01

Sanctioned load:
5.5 kW

Rooms:
- Living Room
- Master Bedroom
- Dining Room & Kitchen

Appliances:
9 demo appliances

IoT Devices:
4 devices

## Existing Features

- Supabase database integration
- Real-time telemetry
- Historical telemetry
- Tariff calculation
- Budget tracking
- AI recommendations
- Household management
- User authentication
- Login
- Registration
- Logout
- Session restoration
- JWT authentication
- Household-based authorization
- Admin access
- RLS
- Dashboard
- Reports

## Security

SUPABASE_SERVICE_ROLE_KEY must remain backend-only.

Never expose it in:
- React frontend
- localStorage
- GitHub
- client-side environment variables

## IMPORTANT

Do NOT recreate the database from scratch.

Do NOT delete existing Supabase tables.

Do NOT replace real database data with mock data.

Continue development from the current implementation.

Before making changes:
1. Inspect the existing code.
2. Understand the current architecture.
3. Preserve existing working features.
4. Only then implement the requested feature.

## Next Development Task

[WRITE THE NEXT TASK HERE]
