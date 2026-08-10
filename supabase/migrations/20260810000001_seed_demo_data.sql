-- ====================================================================
-- KilowattIQ Seed Demo Data
-- Migration: 20260810000001_seed_demo_data.sql
-- Target: Supabase PostgreSQL
-- ====================================================================

DO $$
DECLARE
    v_household_id UUID := '11111111-1111-4111-a111-111111111111';
    
    -- Room UUIDs
    v_room_living UUID := '22222222-2222-4222-a222-222222222201';
    v_room_master UUID := '22222222-2222-4222-a222-222222222202';
    v_room_kitchen UUID := '22222222-2222-4222-a222-222222222203';

    -- Appliance UUIDs
    v_app_fridge UUID := '33333333-3333-4333-a333-333333333301';
    v_app_ac UUID     := '33333333-3333-4333-a333-333333333302';
    v_app_geyser UUID := '33333333-3333-4333-a333-333333333303';
    v_app_tv UUID     := '33333333-3333-4333-a333-333333333304';
    v_app_fan UUID    := '33333333-3333-4333-a333-333333333305';
    v_app_washer UUID := '33333333-3333-4333-a333-333333333306';
    v_app_micro UUID  := '33333333-3333-4333-a333-333333333307';
    v_app_router UUID := '33333333-3333-4333-a333-333333333308';
    v_app_mains UUID  := '33333333-3333-4333-a333-333333333309';

    -- Device UUIDs
    v_dev_meter UUID  := '44444444-4444-4444-a444-444444444401';
    v_dev_plug_ac UUID := '44444444-4444-4444-a444-444444444402';
    v_dev_esp32 UUID  := '44444444-4444-4444-a444-444444444403';
    v_dev_plug_rt UUID := '44444444-4444-4444-a444-444444444404';

    -- Tariff UUID
    v_tariff_desco UUID := '55555555-5555-4555-a555-555555555501';
BEGIN

    -- 1. Demo Household
    INSERT INTO public.households (
        id, name, utility_provider, account_number, sanctioned_load_kw, address_street, address_city, address_area
    ) VALUES (
        v_household_id, 'Gulshan Residence - Flat 4B', 'DESCO', '8820-9941-01', 5.50, 'Road 113, House 24', 'Dhaka', 'Gulshan 2'
    ) ON CONFLICT (id) DO NOTHING;

    -- 2. Demo Rooms
    INSERT INTO public.rooms (id, household_id, name, floor_level, icon) VALUES
    (v_room_living, v_household_id, 'Living Room', 4, 'sofa'),
    (v_room_master, v_household_id, 'Master Bedroom', 4, 'bed'),
    (v_room_kitchen, v_household_id, 'Dining Room & Kitchen', 4, 'utensils')
    ON CONFLICT (id) DO NOTHING;

    -- 3. Demo Appliances (All 9 required appliances)
    INSERT INTO public.appliances (
        id, household_id, room_id, name, category, rated_power_w, standby_power_w, purchase_price_bdt, purchase_date, star_rating, is_vampire_risk, is_inverter_type, average_hours_per_day
    ) VALUES
    (v_app_fridge, v_household_id, v_room_kitchen, 'Frost Double Door Fridge', 'REFRIGERATOR', 180.00, 18.00, 68000.00, '2022-03-15', 3, true, false, 24.00),
    (v_app_ac,     v_household_id, v_room_master,  'Master Bedroom 1.5T AC', 'AIR_CONDITIONER', 1650.00, 8.00, 62000.00, '2021-06-10', 3, true, false, 7.00),
    (v_app_geyser, v_household_id, v_room_master,  'Smart Fast Geyser 30L', 'WATER_HEATER', 2000.00, 0.00, 18500.00, '2023-11-01', 4, false, false, 1.50),
    (v_app_tv,     v_household_id, v_room_living,  'Living Room Smart TV 55"', 'TELEVISION', 120.00, 12.00, 54000.00, '2022-09-20', 4, true, false, 5.00),
    (v_app_fan,    v_household_id, v_room_master,  'Master Bed BLDC Ceiling Fan', 'FAN', 30.00, 1.00, 4800.00, '2024-01-12', 5, false, true, 10.00),
    (v_app_washer, v_household_id, v_room_kitchen, 'Front Load Washing Machine', 'WASHING_MACHINE', 1200.00, 5.00, 42000.00, '2023-04-18', 4, true, false, 1.00),
    (v_app_micro,  v_household_id, v_room_kitchen, 'Digital Solo Microwave 23L', 'MICROWAVE', 900.00, 6.00, 12500.00, '2022-12-05', 3, true, false, 0.50),
    (v_app_router, v_household_id, v_room_living,  'Fiber Dual-Band Wi-Fi Router', 'ROUTER', 12.00, 12.00, 3200.00, '2023-08-14', 5, true, false, 24.00),
    (v_app_mains,  v_household_id, NULL,           'Whole-House Service Entry', 'OTHER', 5500.00, 0.00, 0.00, '2020-01-01', 5, false, false, 24.00)
    ON CONFLICT (id) DO NOTHING;

    -- 4. Demo Devices
    INSERT INTO public.devices (
        id, household_id, room_id, appliance_id, name, device_type, adapter_type, integration_tier, mac_or_serial, mqtt_topic, is_online, last_seen, config
    ) VALUES
    (v_dev_meter,   v_household_id, NULL,           v_app_mains,  'DESCO Smart AMI Service Meter', 'DESCO_AMI',     'DESCOAdapter', 'tier_2', 'DESCO-AMI-908123', 'desco/ami/8820994101', true, NOW(), '{"sanctionedLoadKw": 5.5, "accountNo": "8820-9941-01"}'::jsonb),
    (v_dev_plug_ac, v_household_id, v_room_master,  v_app_ac,     'Master AC Tuya Smart Plug',     'SMART_PLUG',    'TuyaAdapter',  'tier_1', 'TUYA-AC-88127',     'tuya/plug/ac01',       true, NOW(), '{"ratedWatts": 1650, "cutoffTemp": 25}'::jsonb),
    (v_dev_esp32,   v_household_id, v_room_living,  v_app_tv,     'Distribution Box ESP32 PZEM',   'ESP32_PZEM',    'MQTTAdapter',  'tier_2', 'ESP32-PZEM-9021',   'kilowattiq/gulshan/pzem', true, NOW(), '{"frequencyHz": 50.0}'::jsonb),
    (v_dev_plug_rt, v_household_id, v_room_living,  v_app_router, 'Wi-Fi Router Smart Plug',       'SMART_PLUG',    'MockAdapter',  'tier_0', 'MOCK-PLUG-1001',    'mock/plug/router',     true, NOW(), '{"standbyKill": true}'::jsonb)
    ON CONFLICT (id) DO NOTHING;

    -- 5. Demo Readings (Recent time series snapshots)
    INSERT INTO public.readings (device_id, household_id, timestamp, power_watts, voltage_v, current_a, power_factor, frequency_hz, energy_kwh, cumulative_energy_kwh, state)
    VALUES
    (v_dev_meter,   v_household_id, NOW() - INTERVAL '30 minutes', 2450.00, 228.50, 11.20, 0.95, 50.00, 1.225, 285.40, 'active'),
    (v_dev_meter,   v_household_id, NOW() - INTERVAL '15 minutes', 2310.00, 229.10, 10.55, 0.95, 50.01, 0.577, 285.98, 'active'),
    (v_dev_meter,   v_household_id, NOW(),                        1850.00, 230.20,  8.42, 0.96, 49.99, 0.462, 286.44, 'active'),
    (v_dev_plug_ac, v_household_id, NOW() - INTERVAL '15 minutes', 1420.00, 229.10,  6.48, 0.95, 50.01, 0.355, 122.10, 'active'),
    (v_dev_plug_ac, v_household_id, NOW(),                        1380.00, 230.20,  6.25, 0.96, 49.99, 0.345, 122.45, 'active'),
    (v_dev_esp32,   v_household_id, NOW(),                         115.00, 230.20,  0.52, 0.96, 49.99, 0.028,  45.80, 'active'),
    (v_dev_plug_rt, v_household_id, NOW(),                          12.00, 230.20,  0.05, 0.98, 49.99, 0.003,  18.20, 'standby')
    ON CONFLICT DO NOTHING;

    -- 6. Demo DESCO LT-A Tariff & Tier Rules
    INSERT INTO public.tariffs (
        id, household_id, utility_provider, tariff_type, tariff_code, effective_date, vat_percentage, demand_charge_per_kw_bdt, meter_rent_bdt, is_system_global
    ) VALUES (
        v_tariff_desco, v_household_id, 'DESCO', 'tiered', 'DESCO_LT_A_2024', '2024-03-01', 5.00, 42.00, 40.00, true
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.tariff_rate_rules (tariff_id, step_number, step_name, slab_min_kwh, slab_max_kwh, rate_bdt_per_kwh) VALUES
    (v_tariff_desco, 1, 'Life Line (0-50 kWh)', 0, 50, 4.63),
    (v_tariff_desco, 2, 'First Step (51-75 kWh)', 51, 75, 5.26),
    (v_tariff_desco, 3, 'Second Step (76-200 kWh)', 76, 200, 7.20),
    (v_tariff_desco, 4, 'Third Step (201-300 kWh)', 201, 300, 7.59),
    (v_tariff_desco, 5, 'Fourth Step (301-400 kWh)', 301, 400, 8.02),
    (v_tariff_desco, 6, 'Fifth Step (401-600 kWh)', 401, 600, 12.67),
    (v_tariff_desco, 7, 'Sixth Step (>600 kWh)', 601, NULL, 14.61)
    ON CONFLICT DO NOTHING;

    -- 7. Demo Budgets
    INSERT INTO public.budgets (
        household_id, target_monthly_bdt, target_monthly_kwh, alert_threshold_percent, month, year
    ) VALUES (
        v_household_id, 4500.00, 380.00, 80, 8, 2026
    ) ON CONFLICT (household_id, month, year) DO NOTHING;

    -- 8. Demo Budget History
    INSERT INTO public.budget_history (
        household_id, month, year, target_bdt, actual_spend_bdt, projected_spend_bdt, overage_bdt
    ) VALUES
    (v_household_id, 6, 2026, 4500.00, 4120.00, 4120.00, 0.00),
    (v_household_id, 7, 2026, 4500.00, 4320.00, 4320.00, 0.00),
    (v_household_id, 8, 2026, 4500.00, 2150.00, 4400.00, 0.00)
    ON CONFLICT (household_id, month, year) DO NOTHING;

    -- 9. Demo Suggestions
    INSERT INTO public.suggestions (
        household_id, appliance_id, title, type, severity, status, description, estimated_monthly_savings_bdt, actionable_step
    ) VALUES
    (
        v_household_id, v_app_ac,
        'Upgrade Master Bedroom 1.5T Non-Inverter AC to 5-Star Inverter',
        'roi', 'high', 'new',
        'Your 1.5T non-inverter AC runs 7 hours daily consuming ~1,650W continuously. An inverter AC reduces power draw by up to 42% under Dhaka summer temperatures.',
        1450.00,
        'Consider replacing the non-inverter AC unit. Payback period is estimated at 1.8 years at current DESCO Step 5 rates.'
    ),
    (
        v_household_id, v_app_tv,
        'Eliminate Phantom Standby Power from Smart TV & TV Box',
        'standby', 'medium', 'new',
        'Living Room Smart TV and set-top box draw 12W standby power continuously when off, wasting ~8.6 kWh monthly.',
        240.00,
        'Use the connected Wi-Fi smart plug to cut off standby power automatically between 12:00 AM and 6:00 AM.'
    ),
    (
        v_household_id, NULL,
        'Shift Heavy Appliance Loads Away From Peak Hours (5 PM - 11 PM)',
        'budget', 'high', 'new',
        'Running water geyser and washing machine during peak evening hours places high stress on the utility connection and grid.',
        380.00,
        'Schedule water pumping and laundry operations between 7:00 AM and 3:00 PM.'
    )
    ON CONFLICT DO NOTHING;

END $$;
