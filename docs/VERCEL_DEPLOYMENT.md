# KilowattIQ — Vercel Production Deployment Guide

This guide details how to deploy KilowattIQ on Vercel using the built-in Express API Serverless Function integration and Vite React SPA output.

---

## 🏗 Architecture Overview

- **Frontend**: Vite + React 18 SPA built into `/dist`.
- **Backend API**: Node.js + Express 4 serverless function exported from `/api/index.ts` (routing `/api/*`).
- **Database & Auth**: Supabase PostgreSQL + Supabase Auth.
- **Routing**: `vercel.json` rewrites `/api/*` to the Express handler and `/*` to `index.html` for client-side SPA fallback.

---

## 🚀 Step-by-Step Vercel Deployment Instructions

### Step 1: Push Repository to GitHub
Ensure all code changes and `vercel.json` are committed to your GitHub repository:
```bash
git add .
git commit -m "Configure KilowattIQ for Vercel deployment"
git push origin main
```

### Step 2: Import Project in Vercel
1. Log in to [Vercel Dashboard](https://vercel.com).
2. Click **[ Add New... ]** → **[ Project ]**.
3. Import your `kilowattiq` GitHub repository.

### Step 3: Configure Build & Framework Settings
Vercel will auto-detect the project settings using `vercel.json`. Verify:
- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Node.js Version**: 20.x or 22.x

### Step 4: Configure Environment Variables
In the Vercel **Environment Variables** section, add the following key-value pairs:

#### Required Production Variables
```env
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
USE_MOCK_DATA=false
```

#### Optional Feature Variables
```env
# Server-side Gemini AI Energy Advisor (Optional)
GEMINI_API_KEY=AIzaSy...

# MQTT Telemetry Adapter Broker (Optional)
MQTT_BROKER_URL=mqtt://broker.hivemq.com:1883
MQTT_USERNAME=
MQTT_PASSWORD=
```

> ⚠️ **CRITICAL SECURITY NOTE**: Never prefix `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, or `MQTT_PASSWORD` with `VITE_`. They must remain backend-only server secrets.

### Step 5: Deploy & Verify
1. Click **[ Deploy ]**.
2. Once deployment completes, test the health check endpoint:
   `https://<your-app>.vercel.app/api/health`
   Expected output when Supabase is connected:
   ```json
   {
     "success": true,
     "data": {
       "service": "KilowattIQ API",
       "database": "Supabase PostgreSQL",
       "databaseStatus": "connected"
     }
   }
   ```
3. Open `https://<your-app>.vercel.app` in your browser.
4. Verify user login, live telemetry dashboard, cost analysis, PDF/CSV report exports, and Gemini AI Advisor.

---

## 🔧 Troubleshooting

- **404 on API Routes**: Ensure `vercel.json` contains the correct rewrite rule `{"source": "/api/(.*)", "destination": "/api"}`.
- **SPA Page Refresh 404**: The `{"source": "/(.*)", "destination": "/index.html"}` rewrite rule ensures React Router handles sub-paths smoothly.
- **503 Service Unavailable on /api/health**: Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are accurately configured in Vercel project settings.
