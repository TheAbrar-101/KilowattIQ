KilowattIQ is a smart home electricity monitoring and energy management platform designed to help households understand, monitor, and reduce their electricity consumption and monthly electricity costs.

The system combines a modern React + Vite frontend with an Express + TypeScript backend, Supabase for authentication and database management, and an extensible IoT adapter architecture for real-time electricity telemetry.

Key Features:

Real-time electricity monitoring with Power (W), Voltage (V), Current (A), Frequency (Hz), and Power Factor
Appliance-level monitoring and control
Bi-directional appliance relay control
Live power gauges and real-time consumption charts
Household-based multi-tenant architecture
Secure JWT authentication with Supabase Auth
Role-Based Access Control (RBAC) for administrators
PostgreSQL Row Level Security (RLS)
Household data isolation
DESCO LT-A residential progressive tariff calculation
Electricity bill estimation and monthly cost analysis
Monthly budget tracking and over-budget alerts
Vampire power detection and standby energy-loss analysis
Daily, monthly, and yearly financial impact calculation for standby loads
Appliance upgrade ROI calculator
Energy-efficiency recommendations
Peak-load shifting recommendations
Server-side Google Gemini AI Energy Advisor
English and Bangla energy recommendations
Deterministic fallback recommendations when Gemini is unavailable
MQTT-based IoT telemetry integration
Support architecture for ESP32 and PZEM-004T hardware
CSV and PDF electricity consumption reports
Admin dashboard for system and adapter monitoring
Secure backend-only handling of sensitive API credentials
Vercel-compatible serverless Express API architecture
Responsive modern web interface

Technology Stack:

Frontend:
React
TypeScript
Vite
React Router
Modern CSS/UI components

Backend:
Node.js
Express
TypeScript
Zod
JWT authentication
Server-side service architecture

Database & Authentication:
Supabase
PostgreSQL
Supabase Auth
Row Level Security (RLS)

IoT & Integrations:
MQTT
ESP32
PZEM-004T
Tuya integration architecture
DESCO tariff integration architecture

AI:
Google Gemini API
Deterministic energy recommendation fallback

Reporting:
PDF generation
CSV export

Deployment:
GitHub
Vercel
Vercel Serverless Functions

Project Architecture:

The project follows a modular architecture where the React frontend communicates with the Express REST API through /api/v1 endpoints. The backend manages authentication, authorization, household isolation, energy calculations, appliance control, telemetry processing, reporting, and external integrations.

Supabase is used for production authentication and PostgreSQL data storage, while Row Level Security policies provide database-level protection between different households.

The IoT layer uses an adapter-based architecture, enabling MQTT, ESP32/PZEM sensors, Tuya devices, DESCO-related integrations, and mock/demo telemetry to connect without tightly coupling the core application to a single hardware provider.

Development:

Clone the repository, install dependencies, configure the required environment variables, and run the development server.

npm install

npm run dev

The application runs locally at:

http://localhost:3000

Production Build:

npm run build

npm run start

Deployment:

KilowattIQ is structured for deployment through Vercel. The frontend is built using Vite, while the Express backend is exposed through a Vercel serverless API entry point.

Production deployment requires configuring environment variables such as Supabase credentials and, optionally, Gemini and MQTT credentials in the Vercel project settings.

Security:

Sensitive credentials are kept on the server side and are not exposed through Vite client variables. Supabase Service Role credentials, Gemini API credentials, and MQTT credentials must never be placed in frontend code or variables prefixed with VITE_.

The application also implements JWT authentication, role-based authorization, household-level isolation, PostgreSQL RLS, input validation, and secure API error handling.

Project Status:

KilowattIQ has completed its core development, build, authentication, database, tariff calculation, budget tracking, vampire power analysis, recommendation, reporting, security, and Vercel deployment preparation phases.
