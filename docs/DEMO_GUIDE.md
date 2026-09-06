# KilowattIQ — 5-Minute Faculty Demonstration Guide

This guide provides the exact sequence and script for presenting KilowattIQ to academic faculty and evaluators.

---

## ⏱ Step-by-Step Presentation Script

### Minute 1: System Overview & Authentication
1. Launch KilowattIQ in browser (`http://localhost:3000`).
2. Show the initial state or log in using an authorized user account (`shahrearabrar101@gmail.com`).
3. Highlight household selection: "Gulshan Residence - Flat 4B" selected with 5.5 kW sanctioned load and ৳4,500 monthly budget.

### Minute 2: Real-time Telemetry & Bi-directional Appliance Control
1. Navigate to **Live Dashboard**.
2. Note the baseline active load (e.g. ~395 W).
3. Scroll down to Appliances or Control Cards and click **Turn AC ON**.
4. Observe the active power gauge instantly jump to ~2,045 W and voltage/current readings update.
5. Click **Turn AC OFF** and observe power drop back to baseline immediately.
6. Explain: "The system uses an adapter architecture supporting MQTT, ESP32 PZEM-004T sensors, and Tuya smart relays."

### Minute 3: DESCO LT-A Tariff Engine & Budget Analytics
1. Navigate to **Cost Analysis** tab.
2. Point to the **DESCO / DPDC Tariff Step Breakdown**:
   - Step 1 (0-75 kWh @ ৳5.26)
   - Step 2 (76-200 kWh @ ৳7.20)
   - Step 3 (201-300 kWh @ ৳7.59)
3. Show fixed charges: Demand Charge (৳231), Meter Rent (৳40), 5% Govt VAT (৳110.55).
4. Highlight that billing mathematics are 100% deterministic and match official utility guidelines.
5. Show **Budget Progress Bar** (e.g. 54% spent) and **Vampire Power Loss Audit** (৳149/month wasted in standby).

### Minute 4: Server-Side Gemini AI Energy Advisor
1. Navigate to **AI Energy Advisor** tab (or Recommendations tab).
2. Click **Generate AI Advisory**.
3. Point out the English analysis: Executive summary, priority impact actions, and verified source metrics.
4. Switch language to **Bangla (বাংলা)** and re-generate. Show fluent, culturally contextual energy advice in Bengali.
5. Emphasize: "Gemini API key is kept strictly on the backend. AI provides advisory text only and cannot modify billing calculations."

### Minute 5: PDF & CSV Reports & Admin Control
1. Navigate to **Reports & Analytics** tab.
2. Click **[ Export CSV ]** — observe immediate download of `kilowattiq-energy-report-YYYY-MM.csv`.
3. Click **[ Download PDF ]** — open the generated PDF report showing official KilowattIQ branding, tariff steps, and vampire audit tables.
4. Show 6-Month Historical Consumption & Cost Trend chart.
5. Switch to **Admin Tab** (with admin credentials) to demonstrate system health monitoring and adapter status.
