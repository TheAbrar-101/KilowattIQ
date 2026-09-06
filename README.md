# KilowattIQ — IoT Smart Energy Management & Cost Analytics Platform

KilowattIQ is an enterprise-grade, full-stack IoT Smart Energy Management platform specifically tailored for Bangladesh power distribution utilities (DESCO / DPDC). It combines real-time IoT power telemetry, automated appliance controls, multi-tier progressive tariff billing, vampire load detection, AI-powered energy advisory, and official PDF/CSV report exports.

---

## 🌟 Key Features

1. **Real-time Telemetry & Appliance Control**: Live active load monitoring (W, V, A, Hz, PF) with bi-directional relay toggling.
2. **DESCO / DPDC Tariff Calculation**: Accurate 7-tier progressive slab rate computation (LT-A residential) including demand charge, meter rent, and 5% VAT.
3. **Vampire Power Audit**: Detection of phantom standby loads with annual BDT waste estimation.
4. **Server-side Gemini AI Energy Advisor**: Contextual multi-lingual (English / Bangla) energy optimization recommendations.
5. **PDF & CSV Export**: Downloadable official energy audit reports and historical analytics.
6. **Household Multi-Tenancy & RLS Security**: Strict JWT auth, household isolation, and role-based access control (Admin vs Resident).

---

## 🛠 Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS v4, Lucide React, Recharts
- **Backend**: Node.js, Express, TypeScript, PDFKit, `@google/genai`
- **Database & Auth**: Supabase PostgreSQL, Supabase Auth
- **IoT Services**: MQTT Protocol, Adapter Pattern (ESP32/PZEM, Tuya, DESCO, Mock)

---

## 🚀 Quick Start Guide

1. **Clone repository & install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   Copy `.env.example` to `.env` and fill in credentials:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   GEMINI_API_KEY=your-gemini-key
   USE_MOCK_DATA=false
   ```

3. **Run development server**:
   ```bash
   npm run dev
   ```

4. **Production Build**:
   ```bash
   npm run build
   npm run start
   ```

---

## 📑 Documentation

- [Vercel Deployment Guide](docs/VERCEL_DEPLOYMENT.md)
- [Demo Guide & Presentation Script](docs/DEMO_GUIDE.md)
- [API Reference](docs/API_REFERENCE.md)
- [Security Architecture](docs/SECURITY.md)
- [Faculty Demonstration Checklist](docs/DEMO_CHECKLIST.md)
