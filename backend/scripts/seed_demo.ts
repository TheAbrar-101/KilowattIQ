import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

let url = process.env.SUPABASE_URL || '';
if (url.includes('supabase.com/dashboard/project/')) {
  const ref = url.split('supabase.com/dashboard/project/')[1].split('/')[0];
  url = `https://${ref}.supabase.co`;
} else if (!url.startsWith('http://') && !url.startsWith('https://')) {
  url = `https://${url}`;
}

const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const client = createClient(url, key);

async function runSeed() {
  console.log('[SeedScript] Seeding live Supabase database at:', url);

  const householdId = '11111111-1111-4111-a111-111111111111';

  // 1. Household
  const { data: hData, error: hErr } = await client.from('households').upsert({
    id: householdId,
    name: 'Gulshan Residence - Flat 4B',
    utility_provider: 'DESCO',
    account_number: '8820-9941-01',
    sanctioned_load_kw: 5.50,
    address_street: 'Road 113, House 24',
    address_city: 'Dhaka',
    address_area: 'Gulshan 2'
  }).select();
  if (hErr) console.error('Household error:', hErr);
  else console.log('Household seeded:', hData?.length);

  // 2. Rooms
  const rLiving = '22222222-2222-4222-a222-222222222201';
  const rMaster = '22222222-2222-4222-a222-222222222202';
  const rKitchen = '22222222-2222-4222-a222-222222222203';

  const { data: rData, error: rErr } = await client.from('rooms').upsert([
    { id: rLiving, household_id: householdId, name: 'Living Room', floor_level: 4, icon: 'sofa' },
    { id: rMaster, household_id: householdId, name: 'Master Bedroom', floor_level: 4, icon: 'bed' },
    { id: rKitchen, household_id: householdId, name: 'Dining Room & Kitchen', floor_level: 4, icon: 'utensils' }
  ]).select();
  if (rErr) console.error('Rooms error:', rErr);
  else console.log('Rooms seeded:', rData?.length);

  // 3. Appliances
  const { data: aData, error: aErr } = await client.from('appliances').upsert([
    { id: '33333333-3333-4333-a333-333333333301', household_id: householdId, room_id: rKitchen, name: 'Frost Double Door Fridge', category: 'REFRIGERATOR', rated_power_w: 180, standby_power_w: 18, purchase_price_bdt: 68000, purchase_date: '2022-03-15', star_rating: 3, is_vampire_risk: true, is_inverter_type: false, average_hours_per_day: 24 },
    { id: '33333333-3333-4333-a333-333333333302', household_id: householdId, room_id: rMaster, name: 'Master Bedroom 1.5T AC', category: 'AIR_CONDITIONER', rated_power_w: 1650, standby_power_w: 8, purchase_price_bdt: 62000, purchase_date: '2021-06-10', star_rating: 3, is_vampire_risk: true, is_inverter_type: false, average_hours_per_day: 7 },
    { id: '33333333-3333-4333-a333-333333333303', household_id: householdId, room_id: rMaster, name: 'Smart Fast Geyser 30L', category: 'WATER_HEATER', rated_power_w: 2000, standby_power_w: 0, purchase_price_bdt: 18500, purchase_date: '2023-11-01', star_rating: 4, is_vampire_risk: false, is_inverter_type: false, average_hours_per_day: 1.5 },
    { id: '33333333-3333-4333-a333-333333333304', household_id: householdId, room_id: rLiving, name: 'Living Room Smart TV 55"', category: 'TELEVISION', rated_power_w: 120, standby_power_w: 12, purchase_price_bdt: 54000, purchase_date: '2022-09-20', star_rating: 4, is_vampire_risk: true, is_inverter_type: false, average_hours_per_day: 5 },
    { id: '33333333-3333-4333-a333-333333333305', household_id: householdId, room_id: rMaster, name: 'Master Bed BLDC Ceiling Fan', category: 'FAN', rated_power_w: 30, standby_power_w: 1, purchase_price_bdt: 4800, purchase_date: '2024-01-12', star_rating: 5, is_vampire_risk: false, is_inverter_type: true, average_hours_per_day: 10 },
    { id: '33333333-3333-4333-a333-333333333306', household_id: householdId, room_id: rKitchen, name: 'Front Load Washing Machine', category: 'WASHING_MACHINE', rated_power_w: 1200, standby_power_w: 5, purchase_price_bdt: 42000, purchase_date: '2023-04-18', star_rating: 4, is_vampire_risk: true, is_inverter_type: false, average_hours_per_day: 1 },
    { id: '33333333-3333-4333-a333-333333333307', household_id: householdId, room_id: rKitchen, name: 'Digital Solo Microwave 23L', category: 'MICROWAVE', rated_power_w: 900, standby_power_w: 6, purchase_price_bdt: 12500, purchase_date: '2022-12-05', star_rating: 3, is_vampire_risk: true, is_inverter_type: false, average_hours_per_day: 0.5 },
    { id: '33333333-3333-4333-a333-333333333308', household_id: householdId, room_id: rLiving, name: 'Fiber Dual-Band Wi-Fi Router', category: 'ROUTER', rated_power_w: 12, standby_power_w: 12, purchase_price_bdt: 3200, purchase_date: '2023-08-14', star_rating: 5, is_vampire_risk: true, is_inverter_type: false, average_hours_per_day: 24 },
    { id: '33333333-3333-4333-a333-333333333309', household_id: householdId, room_id: null, name: 'Whole-House Service Entry', category: 'OTHER', rated_power_w: 5500, standby_power_w: 0, purchase_price_bdt: 0, purchase_date: '2020-01-01', star_rating: 5, is_vampire_risk: false, is_inverter_type: false, average_hours_per_day: 24 }
  ]).select();
  if (aErr) console.error('Appliances error:', aErr);
  else console.log('Appliances seeded:', aData?.length);

  // 4. Devices
  const devMeter = '44444444-4444-4444-a444-444444444401';
  const devPlugAc = '44444444-4444-4444-a444-444444444402';
  const devEsp32 = '44444444-4444-4444-a444-444444444403';
  const devPlugRt = '44444444-4444-4444-a444-444444444404';

  const { data: dData, error: dErr } = await client.from('devices').upsert([
    { id: devMeter, household_id: householdId, room_id: null, appliance_id: '33333333-3333-4333-a333-333333333309', name: 'DESCO Smart AMI Service Meter', device_type: 'DESCO_AMI', adapter_type: 'DESCOAdapter', integration_tier: 'tier_2', mac_or_serial: 'DESCO-AMI-908123', mqtt_topic: 'desco/ami/8820994101', is_online: true, config: { sanctionedLoadKw: 5.5, accountNo: '8820-9941-01' } },
    { id: devPlugAc, household_id: householdId, room_id: rMaster, appliance_id: '33333333-3333-4333-a333-333333333302', name: 'Master AC Tuya Smart Plug', device_type: 'SMART_PLUG', adapter_type: 'TuyaAdapter', integration_tier: 'tier_1', mac_or_serial: 'TUYA-AC-88127', mqtt_topic: 'tuya/plug/ac01', is_online: true, config: { ratedWatts: 1650, cutoffTemp: 25 } },
    { id: devEsp32, household_id: householdId, room_id: rLiving, appliance_id: '33333333-3333-4333-a333-333333333304', name: 'Distribution Box ESP32 PZEM', device_type: 'ESP32_PZEM', adapter_type: 'MQTTAdapter', integration_tier: 'tier_2', mac_or_serial: 'ESP32-PZEM-9021', mqtt_topic: 'kilowattiq/gulshan/pzem', is_online: true, config: { frequencyHz: 50.0 } },
    { id: devPlugRt, household_id: householdId, room_id: rLiving, appliance_id: '33333333-3333-4333-a333-333333333308', name: 'Wi-Fi Router Smart Plug', device_type: 'SMART_PLUG', adapter_type: 'MockAdapter', integration_tier: 'tier_0', mac_or_serial: 'MOCK-PLUG-1001', mqtt_topic: 'mock/plug/router', is_online: true, config: { standbyKill: true } }
  ]).select();
  if (dErr) console.error('Devices error:', dErr);
  else console.log('Devices seeded:', dData?.length);

  // 5. Readings
  const { data: rdData, error: rdErr } = await client.from('readings').upsert([
    { id: '55555551-1111-4111-a111-111111111111', device_id: devMeter, household_id: householdId, timestamp: new Date(Date.now() - 30 * 60000).toISOString(), power_watts: 2450.00, voltage_v: 228.50, current_a: 11.20, power_factor: 0.95, frequency_hz: 50.00, energy_kwh: 1.225, cumulative_energy_kwh: 285.40, state: 'active' },
    { id: '55555552-2222-4222-a222-222222222222', device_id: devMeter, household_id: householdId, timestamp: new Date(Date.now() - 15 * 60000).toISOString(), power_watts: 2310.00, voltage_v: 229.10, current_a: 10.55, power_factor: 0.95, frequency_hz: 50.01, energy_kwh: 0.577, cumulative_energy_kwh: 285.98, state: 'active' },
    { id: '55555553-3333-4333-a333-333333333333', device_id: devMeter, household_id: householdId, timestamp: new Date().toISOString(), power_watts: 1850.00, voltage_v: 230.20, current_a: 8.42, power_factor: 0.96, frequency_hz: 49.99, energy_kwh: 0.462, cumulative_energy_kwh: 286.44, state: 'active' },
    { id: '55555554-4444-4444-a444-444444444444', device_id: devPlugAc, household_id: householdId, timestamp: new Date().toISOString(), power_watts: 1380.00, voltage_v: 230.20, current_a: 6.25, power_factor: 0.96, frequency_hz: 49.99, energy_kwh: 0.345, cumulative_energy_kwh: 122.45, state: 'active' },
    { id: '55555555-5555-4555-a555-555555555555', device_id: devPlugRt, household_id: householdId, timestamp: new Date().toISOString(), power_watts: 12.00, voltage_v: 230.20, current_a: 0.05, power_factor: 0.98, frequency_hz: 49.99, energy_kwh: 0.003, cumulative_energy_kwh: 18.20, state: 'standby' }
  ]).select();
  if (rdErr) console.error('Readings error:', rdErr);
  else console.log('Readings seeded:', rdData?.length);

  // 6. Tariffs & Rules
  const tariffId = '55555555-5555-4555-a555-555555555501';
  const { data: tData, error: tErr } = await client.from('tariffs').upsert({
    id: tariffId,
    household_id: householdId,
    utility_provider: 'DESCO',
    tariff_type: 'tiered',
    tariff_code: 'DESCO_LT_A_2024',
    effective_date: '2024-03-01',
    vat_percentage: 5.00,
    demand_charge_per_kw_bdt: 42.00,
    meter_rent_bdt: 40.00,
    is_system_global: true
  }).select();
  if (tErr) console.error('Tariff error:', tErr);

  const { data: trData, error: trErr } = await client.from('tariff_rate_rules').upsert([
    { id: '66666661-1111-4111-a111-111111111111', tariff_id: tariffId, step_number: 1, step_name: 'Life Line (0-50 kWh)', slab_min_kwh: 0, slab_max_kwh: 50, rate_bdt_per_kwh: 4.63 },
    { id: '66666662-2222-4222-a222-222222222222', tariff_id: tariffId, step_number: 2, step_name: 'First Step (51-75 kWh)', slab_min_kwh: 51, slab_max_kwh: 75, rate_bdt_per_kwh: 5.26 },
    { id: '66666663-3333-4333-a333-333333333333', tariff_id: tariffId, step_number: 3, step_name: 'Second Step (76-200 kWh)', slab_min_kwh: 76, slab_max_kwh: 200, rate_bdt_per_kwh: 7.20 },
    { id: '66666664-4444-4444-a444-444444444444', tariff_id: tariffId, step_number: 4, step_name: 'Third Step (201-300 kWh)', slab_min_kwh: 201, slab_max_kwh: 300, rate_bdt_per_kwh: 7.59 },
    { id: '66666665-5555-4555-a555-555555555555', tariff_id: tariffId, step_number: 5, step_name: 'Fourth Step (301-400 kWh)', slab_min_kwh: 301, slab_max_kwh: 400, rate_bdt_per_kwh: 8.02 },
    { id: '66666666-6666-4666-a666-666666666666', tariff_id: tariffId, step_number: 6, step_name: 'Fifth Step (401-600 kWh)', slab_min_kwh: 401, slab_max_kwh: 600, rate_bdt_per_kwh: 12.67 },
    { id: '66666667-7777-4777-a777-777777777777', tariff_id: tariffId, step_number: 7, step_name: 'Sixth Step (>600 kWh)', slab_min_kwh: 601, slab_max_kwh: null, rate_bdt_per_kwh: 14.61 }
  ]).select();
  if (trErr) console.error('Tariff rules error:', trErr);
  else console.log('Tariff & rules seeded:', trData?.length);

  // 7. Budgets
  const { data: bData, error: bErr } = await client.from('budgets').upsert({
    id: '77777777-7777-4777-a777-777777777777',
    household_id: householdId,
    target_monthly_bdt: 4500.00,
    target_monthly_kwh: 380.00,
    alert_threshold_percent: 80,
    month: 8,
    year: 2026
  }).select();
  if (bErr) console.error('Budgets error:', bErr);
  else console.log('Budgets seeded:', bData?.length);

  // 8. Budget History
  const { data: bhData, error: bhErr } = await client.from('budget_history').upsert([
    { id: '88888881-1111-4111-a111-111111111111', household_id: householdId, month: 6, year: 2026, target_bdt: 4500.00, actual_spend_bdt: 4120.00, projected_spend_bdt: 4120.00, overage_bdt: 0.00 },
    { id: '88888882-2222-4222-a222-222222222222', household_id: householdId, month: 7, year: 2026, target_bdt: 4500.00, actual_spend_bdt: 4320.00, projected_spend_bdt: 4320.00, overage_bdt: 0.00 },
    { id: '88888883-3333-4333-a333-333333333333', household_id: householdId, month: 8, year: 2026, target_bdt: 4500.00, actual_spend_bdt: 2150.00, projected_spend_bdt: 4400.00, overage_bdt: 0.00 }
  ]).select();
  if (bhErr) console.error('Budget history error:', bhErr);
  else console.log('Budget history seeded:', bhData?.length);

  // 9. Suggestions
  const { data: sData, error: sErr } = await client.from('suggestions').upsert([
    {
      id: '99999991-1111-4111-a111-111111111111',
      household_id: householdId,
      appliance_id: '33333333-3333-4333-a333-333333333302',
      title: 'Upgrade Master Bedroom 1.5T Non-Inverter AC to 5-Star Inverter',
      type: 'roi', severity: 'high', status: 'new',
      description: 'Your 1.5T non-inverter AC runs 7 hours daily consuming ~1,650W continuously. An inverter AC reduces power draw by up to 42% under Dhaka summer temperatures.',
      estimated_monthly_savings_bdt: 1450.00,
      actionable_step: 'Consider replacing the non-inverter AC unit. Payback period is estimated at 1.8 years at current DESCO Step 5 rates.'
    },
    {
      id: '99999992-2222-4222-a222-222222222222',
      household_id: householdId,
      appliance_id: '33333333-3333-4333-a333-333333333304',
      title: 'Eliminate Phantom Standby Power from Smart TV & TV Box',
      type: 'standby', severity: 'medium', status: 'new',
      description: 'Living Room Smart TV and set-top box draw 12W standby power continuously when off, wasting ~8.6 kWh monthly.',
      estimated_monthly_savings_bdt: 240.00,
      actionable_step: 'Use the connected Wi-Fi smart plug to cut off standby power automatically between 12:00 AM and 6:00 AM.'
    }
  ]).select();
  if (sErr) console.error('Suggestions error:', sErr);
  else console.log('Suggestions seeded:', sData?.length);

  console.log('[SeedScript] Completed successfully.');
}

runSeed().catch(console.error);
