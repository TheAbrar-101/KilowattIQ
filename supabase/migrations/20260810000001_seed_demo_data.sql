-- KilowattIQ Realistic Seed & Demo Data Migration
-- Migration: 20260810000001_seed_demo_data.sql

DO $$
DECLARE
  v_demo_user_id UUID := '00000000-0000-0000-0000-000000000001';
  v_household_id UUID := 'a0000000-0000-0000-0000-000000000001';
  
  -- Room IDs
  v_rm_master UUID := 'b0000000-0000-0000-0000-000000000001';
  v_rm_living UUID := 'b0000000-0000-0000-0000-000000000002';
  v_rm_kitchen UUID := 'b0000000-0000-0000-0000-000000000003';
  v_rm_bath UUID := 'b0000000-0000-0000-0000-000000000004';

  -- Appliance IDs
  v_app_fridge UUID := 'c0000000-0000-0000-0000-000000000001';
  v_app_ac UUID := 'c0000000-0000-0000-0000-000000000002';
  v_app_geyser UUID := 'c0000000-0000-0000-0000-000000000003';
  v_app_tv UUID := 'c0000000-0000-0000-0000-000000000004';
  v_app_fan UUID := 'c0000000-0000-0000-0000-000000000005';
  v_app_washer UUID := 'c0000000-0000-0000-0000-000000000006';
  v_app_micro UUID := 'c0000000-0000-0000-0000-000000000007';
  v_app_router UUID := 'c0000000-0000-0000-0000-000000000008';
  v_app_main UUID := 'c0000000-0000-0000-0000-000000000009';

  -- Device IDs
  v_dev_desco UUID := 'd0000000-0000-0000-0000-000000000001';
  v_dev_tuya_ac UUID := 'd0000000-0000-0000-0000-000000000002';
  v_dev_mqtt_pzem UUID := 'd0000000-0000-0000-0000-000000000003';

  -- Tariff ID
  v_tariff_id UUID := 'e0000000-0000-0000-0000-000000000001';

BEGIN

  -- 1. Create Demo Household
  INSERT INTO public.households (id, name, utility_provider, account_number, sanctioned_load_kw, monthly_budget_bdt, address_division, address_city, address_area)
  VALUES (
    v_household_id,
    'Gulshan Residence - Flat 4B',
    'DESCO',
    'DESCO-88294012',
    4.50,
    4500.00,
    'Dhaka',
    'Dhaka North',
    'Gulshan 2'
  )
  ON CONFLICT (id) DO NOTHING;

  -- 2. Create Rooms
  INSERT INTO public.rooms (id, household_id, name, floor_level, icon) VALUES
    (v_rm_master, v_household_id, 'Master Bedroom', 4, 'bed'),
    (v_rm_living, v_household_id, 'Living & Dining Area', 4, 'tv'),
    (v_rm_kitchen, v_household_id, 'Kitchen & Utility', 4, 'utensils'),
    (v_rm_bath, v_household_id, 'Master Bathroom', 4, 'bath')
  ON CONFLICT (id) DO NOTHING;

  -- 3. Create Appliances (All 9 required appliances)
  INSERT INTO public.appliances (
    id, household_id, room_id, name, category, rated_wattage, standby_wattage, 
    purchase_price, average_hours_per_day, is_inverter_type, energy_rating_stars, is_vampire_risk
  ) VALUES
    (v_app_fridge, v_household_id, v_rm_kitchen, 'Frost Double Door Fridge', 'REFRIGERATOR', 210.00, 14.00, 52000.00, 24.00, FALSE, 3, TRUE),
    (v_app_ac, v_household_id, v_rm_master, 'Master Bedroom 1.5T AC', 'AIR_CONDITIONER', 1650.00, 16.00, 68000.00, 7.00, FALSE, 2, TRUE),
    (v_app_geyser, v_household_id, v_rm_bath, 'Smart Fast Geyser 30L', 'WATER_HEATER', 2000.00, 8.00, 14500.00, 1.50, FALSE, 3, TRUE),
    (v_app_tv, v_household_id, v_rm_living, 'Living Room Smart TV (55")', 'TELEVISION', 120.00, 12.00, 48000.00, 5.00, FALSE, 4, TRUE),
    (v_app_fan, v_household_id, v_rm_master, 'Master Bed BLDC Ceiling Fan', 'FAN', 30.00, 1.00, 5500.00, 10.00, TRUE, 5, FALSE),
    (v_app_washer, v_household_id, v_rm_kitchen, 'Front Load Washing Machine', 'WASHING_MACHINE', 1200.00, 4.00, 42000.00, 0.80, TRUE, 4, FALSE),
    (v_app_micro, v_household_id, v_rm_kitchen, 'Digital Solo Microwave 23L', 'MICROWAVE', 1200.00, 6.00, 12000.00, 0.30, FALSE, 3, TRUE),
    (v_app_router, v_household_id, v_rm_living, 'Fiber Dual-Band Wi-Fi Router', 'ROUTER', 12.00, 12.00, 3200.00, 24.00, FALSE, 5, FALSE),
    (v_app_main, v_household_id, v_rm_living, 'Whole-House Service Entry', 'MAIN_FEED', 4500.00, 0.00, 0.00, 24.00, FALSE, 5, FALSE)
  ON CONFLICT (id) DO NOTHING;

  -- 4. Create IoT Devices
  INSERT INTO public.devices (
    id, household_id, room_id, appliance_id, name, device_type, integration_tier, 
    adapter_type, protocol, mac_or_serial, mqtt_topic, is_online, config
  ) VALUES
    (
      v_dev_desco, v_household_id, v_rm_living, v_app_main, 
      'Main DESCO Smart Meter Gateway', 'SMART_METER', 'tier_2', 
      'DESCOAdapter', 'AMI_REST', 'DSK-9901-4412', NULL, TRUE, 
      '{"sanctionedLoadKw": 4.5, "meterType": "Prepaid_AMI"}'::jsonb
    ),
    (
      v_dev_tuya_ac, v_household_id, v_rm_master, v_app_ac, 
      'AC Wi-Fi Smart Power Plug', 'SMART_PLUG', 'tier_1', 
      'TuyaAdapter', 'TUYA_CLOUD', 'TUYA-8812-7741', NULL, TRUE, 
      '{"ratedWatts": 1650, "vampireDetection": true}'::jsonb
    ),
    (
      v_dev_mqtt_pzem, v_household_id, v_rm_living, NULL, 
      'Distribution Box ESP32 PZEM Monitor', 'ESP32_PZEM', 'tier_1', 
      'MQTTAdapter', 'MQTT', 'ESP32-9021-PZEM', 'kilowattiq/gulshan/pzem01', TRUE, 
      '{"samplingIntervalMs": 5000}'::jsonb
    )
  ON CONFLICT (id) DO NOTHING;

  -- Link devices back to appliances where appropriate
  UPDATE public.appliances SET device_id = v_dev_desco WHERE id = v_app_main;
  UPDATE public.appliances SET device_id = v_dev_tuya_ac WHERE id = v_app_ac;

  -- 5. Create DESCO Residential LT-A Tiered Tariff
  INSERT INTO public.tariffs (id, household_id, name, tariff_type, utility_provider, is_active)
  VALUES (v_tariff_id, v_household_id, 'DESCO Residential LT-A Tiered Tariff', 'tiered', 'DESCO', TRUE)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.tariff_rate_rules (tariff_id, slab_min_kwh, slab_max_kwh, rate_per_kwh_bdt, description) VALUES
    (v_tariff_id, 0.00, 50.00, 4.35, 'Lifeline Slab (0 - 50 kWh)'),
    (v_tariff_id, 51.00, 75.00, 4.85, 'First Slab (51 - 75 kWh)'),
    (v_tariff_id, 76.00, 200.00, 6.63, 'Second Slab (76 - 200 kWh)'),
    (v_tariff_id, 201.00, 300.00, 6.95, 'Third Slab (201 - 300 kWh)'),
    (v_tariff_id, 301.00, 400.00, 7.34, 'Fourth Slab (301 - 400 kWh)'),
    (v_tariff_id, 401.00, 600.00, 11.51, 'Fifth Slab (401 - 600 kWh)'),
    (v_tariff_id, 601.00, NULL, 13.26, 'Upper Slab (601+ kWh)')
  ON CONFLICT DO NOTHING;

  -- 6. Create Budget & Budget History
  INSERT INTO public.budgets (household_id, monthly_target_bdt, currency, is_active)
  VALUES (v_household_id, 4500.00, 'BDT', TRUE)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.budget_history (household_id, month, target_bdt, actual_spend_bdt, projected_spend_bdt, actual_kwh, is_over_budget)
  VALUES
    (v_household_id, '2026-06', 4500.00, 4120.00, 4120.00, 580.0, FALSE),
    (v_household_id, '2026-07', 4500.00, 4780.00, 4780.00, 640.0, TRUE),
    (v_household_id, '2026-08', 4500.00, 1850.00, 4350.00, 245.8, FALSE)
  ON CONFLICT DO NOTHING;

  -- 7. Create Sample Historical & Current Telemetry Readings
  INSERT INTO public.readings (device_id, household_id, timestamp, power_watts, voltage_v, current_a, power_factor, frequency_hz, energy_kwh, cumulative_energy_kwh, state)
  VALUES
    (v_dev_desco, v_household_id, NOW() - INTERVAL '3 hours', 1850.0, 222.5, 8.4, 0.95, 50.0, 0.155, 245.5, 'active'),
    (v_dev_desco, v_household_id, NOW() - INTERVAL '2 hours', 1620.0, 223.1, 7.3, 0.96, 49.9, 0.135, 245.65, 'active'),
    (v_dev_desco, v_household_id, NOW() - INTERVAL '1 hour', 920.0, 221.8, 4.2, 0.94, 50.1, 0.077, 245.73, 'active'),
    (v_dev_desco, v_household_id, NOW(), 845.0, 221.8, 3.8, 0.95, 50.0, 0.070, 245.80, 'active'),
    (v_dev_tuya_ac, v_household_id, NOW() - INTERVAL '1 hour', 1650.0, 221.8, 7.5, 0.98, 50.0, 0.138, 78.26, 'active'),
    (v_dev_tuya_ac, v_household_id, NOW(), 16.0, 221.8, 0.07, 0.65, 50.0, 0.001, 78.27, 'standby');

  -- 8. Create Suggestions
  INSERT INTO public.suggestions (
    household_id, device_id, appliance_id, type, title, description, 
    severity, priority, potential_savings_bdt, action_step, status, supporting_data
  ) VALUES
    (
      v_household_id, v_dev_tuya_ac, v_app_ac, 'standby',
      'Vampire Load Detected on Master Bedroom AC',
      'The Master Bedroom 1.5T AC draws 16W continuously in standby mode, wasting approximately ৳125/month.',
      'MEDIUM', 'HIGH', 125.00,
      'Use the Smart Plug timer or physically isolate the AC breaker when not in active use.',
      'new', '{"vampireWatts": 16, "monthlyLossBdt": 125}'::jsonb
    ),
    (
      v_household_id, v_dev_desco, v_app_main, 'diagnostic',
      'Approaching DESCO 300 kWh Slab Step',
      'At current consumption rates, you will exceed 300 kWh in 4 days, shifting your rate from ৳6.95/kWh to ৳7.34/kWh.',
      'HIGH', 'HIGH', 320.00,
      'Reduce AC runtime by 1.5 hours daily during peak evening hours (5 PM - 11 PM).',
      'new', '{"currentKwh": 245.8, "targetSlabLimit": 300}'::jsonb
    ),
    (
      v_household_id, NULL, v_app_fridge, 'roi',
      'Inverter Refrigerator Upgrade Assessment',
      'Upgrading your Non-Inverter Refrigerator to a 5-Star Inverter model reduces energy use by 42%.',
      'LOW', 'MEDIUM', 480.00,
      'Estimated payback period: 2.8 years based on current DESCO LT-A tariff rates.',
      'new', '{"currentWattage": 210, "inverterWattage": 120, "paybackYears": 2.8}'::jsonb
    )
  ON CONFLICT DO NOTHING;

END $$;
