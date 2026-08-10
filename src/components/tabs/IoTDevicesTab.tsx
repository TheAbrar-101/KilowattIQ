import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Cpu, Radio, ShieldCheck, Plus, Terminal, RefreshCw, CheckCircle2, Wifi, X, Sparkles, Activity } from 'lucide-react';
import { IoTDevice, AdapterType } from '../../../shared/types/iot';
import { Household } from '../../../shared/types/household';

interface IoTDevicesTabProps {
  household: Household;
  devices: IoTDevice[];
  onAddDevice: (device: Omit<IoTDevice, 'id' | 'lastSeen'>) => void;
}

export const IoTDevicesTab: React.FC<IoTDevicesTabProps> = ({ household, devices, onAddDevice }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<IoTDevice | null>(devices[0] || null);
  const [logs, setLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] MQTT Broker connected to tcp://192.168.1.120:1883`,
    `[${new Date().toLocaleTimeString()}] Subscribed to topic "kilowattiq/telemetry/#"`,
    `[${new Date().toLocaleTimeString()}] ESP32-PZEM-01 Heartbeat received (RSSI -62 dBm)`,
  ]);
  const [isPinging, setIsPinging] = useState(false);

  // New device form state
  const [deviceName, setDeviceName] = useState('');
  const [adapterType, setAdapterType] = useState<AdapterType>('MQTTAdapter');
  const [deviceType, setDeviceType] = useState<'SMART_METER' | 'SMART_PLUG' | 'ESP32_PZEM'>('ESP32_PZEM');
  const [macSerial, setMacSerial] = useState('');

  const adapters: Array<{ name: AdapterType; desc: string; latency: string; protocol: string }> = [
    { name: 'MockAdapter', desc: 'Simulated IoT device engine for dev & offline testing', latency: '15ms', protocol: 'Internal Mock' },
    { name: 'TuyaAdapter', desc: 'Tuya Cloud API integration for Wi-Fi Smart Plugs', latency: '45ms', protocol: 'HTTPS OpenAPI' },
    { name: 'MQTTAdapter', desc: 'ESP32 + PZEM-004T circuit monitor broker feed', latency: '10ms', protocol: 'MQTT / TCP' },
    { name: 'DESCOAdapter', desc: 'DESCO/DPDC Smart Meter AMI API connector', latency: '120ms', protocol: 'REST / SOAP' },
    { name: 'CompositeAdapter', desc: 'Unified household aggregator combining multiple sub-adapters', latency: '25ms', protocol: 'Composite Engine' },
  ];

  const handleSimulatePing = () => {
    setIsPinging(true);
    const newLog = `[${new Date().toLocaleTimeString()}] PING ${selectedDevice?.macOrSerial || 'ESP32'}: 220.4V • 8.35A • 1840W • PF 0.96 [OK]`;
    setTimeout(() => {
      setLogs(prev => [...prev, newLog]);
      setIsPinging(false);
    }, 600);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceName) return;

    onAddDevice({
      householdId: household.id,
      name: deviceName,
      deviceType,
      adapterType,
      macOrSerial: macSerial || `SN-${Date.now()}`,
      isOnline: true,
      config: { ratedWatts: 1200, accumulatedKwh: 10 },
    });

    setDeviceName('');
    setMacSerial('');
    setShowAddModal(false);
  };

  return (
    <div className="space-y-5">
      
      {/* Header & Add Button */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Cpu className="w-4.5 h-4.5 text-emerald-400" />
            <span>IoT Device & Adapter Abstraction Layer</span>
          </h3>
          <p className="text-[11px] text-slate-400">
            Pluggable IoT adapters supporting Tuya, MQTT ESP32, and DESCO AMI feeds
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-emerald-500/20 shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Register IoT Device</span>
        </button>
      </div>

      {/* Adapter Registry Overview */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
        <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Supported Adapter Abstractions</h4>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {adapters.map((a) => (
            <div key={a.name} className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-400 font-mono text-[11px]">{a.name}</span>
                <span className="text-[9px] bg-emerald-950 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-900 font-bold uppercase">
                  ACTIVE
                </span>
              </div>
              <p className="text-slate-400 text-[10px] leading-snug">{a.desc}</p>
              <div className="pt-2 border-t border-slate-900 flex justify-between text-[9px] text-slate-500 font-mono">
                <span>{a.protocol}</span>
                <span>{a.latency}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Connected Devices Grid & Live Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Left 2 Cols: Registered Devices List */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Registered Hardware Adapters ({devices.length})</h4>
            <span className="text-[10px] text-emerald-400 font-bold font-mono">100% Signal Coverage</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {devices.map((dev) => (
              <div
                key={dev.id}
                onClick={() => setSelectedDevice(dev)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                  selectedDevice?.id === dev.id
                    ? 'bg-slate-950 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs">{dev.name}</span>
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono font-bold">
                    <Wifi className="w-3 h-3" />
                    Online
                  </span>
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>Adapter: {dev.adapterType}</span>
                  <span>{dev.macOrSerial}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Col: Live Terminal Log Inspector */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span>Live Adapter Console</span>
              </h4>
              <button
                onClick={handleSimulatePing}
                disabled={isPinging}
                className="text-[10px] font-bold bg-slate-950 hover:bg-slate-800 border border-slate-800 text-emerald-400 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isPinging ? 'animate-spin' : ''}`} />
                <span>Test Ping</span>
              </button>
            </div>

            {/* Terminal View */}
            <div className="mt-3 bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[10px] text-emerald-400 space-y-1.5 h-48 overflow-y-auto">
              {logs.map((log, i) => (
                <p key={i} className="leading-snug text-slate-300">{log}</p>
              ))}
            </div>
          </div>

          <div className="pt-2 text-[10px] text-slate-500 text-center font-mono">
            MQTT Broker • Port 1883 • QoS Level 1
          </div>
        </div>

      </div>

      {/* Add Device Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Register IoT Adapter Hardware</span>
                </h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Adapter Device Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Main DB ESP32 Power Meter"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-bold mb-1">Adapter Type</label>
                    <select
                      value={adapterType}
                      onChange={(e) => setAdapterType(e.target.value as AdapterType)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="MQTTAdapter">MQTT (ESP32 / PZEM)</option>
                      <option value="TuyaAdapter">Tuya Cloud API</option>
                      <option value="DESCOAdapter">DESCO Smart AMI</option>
                      <option value="MockAdapter">Mock Simulator</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 font-bold mb-1">Hardware Class</label>
                    <select
                      value={deviceType}
                      onChange={(e) => setDeviceType(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="ESP32_PZEM">ESP32 + PZEM-004T</option>
                      <option value="SMART_PLUG">Smart Plug</option>
                      <option value="SMART_METER">Smart Prepaid Meter</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">MAC Address / Serial Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 24:62:AB:E4:11:02"
                    value={macSerial}
                    onChange={(e) => setMacSerial(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 bg-slate-950 hover:bg-slate-800 text-slate-300 font-bold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl shadow-md"
                  >
                    Register Hardware
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
