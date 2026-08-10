import React, { useState } from 'react';
import { Cpu, Radio, ShieldCheck, Plus, Terminal, RefreshCw, CheckCircle2 } from 'lucide-react';
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
    <div className="space-y-4">
      
      {/* Header & Add Button */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <span>IoT Device & Adapter Abstraction Layer</span>
          </h3>
          <p className="text-[11px] text-slate-400">
            Pluggable IoT adapters supporting Tuya, MQTT ESP32, and DESCO AMI feeds
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-emerald-500/20 shadow-md"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Register IoT Device</span>
        </button>
      </div>

      {/* Adapter Registry Overview */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
        <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2.5">Supported Adapter Abstractions</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
          {adapters.map((a) => (
            <div key={a.name} className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-400 font-mono text-[11px]">{a.name}</span>
                <span className="text-[9px] bg-emerald-950 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-900 font-bold uppercase">
                  ACTIVE
                </span>
              </div>
              <p className="text-slate-400 text-[10px] leading-snug">{a.desc}</p>
              <div className="pt-1.5 border-t border-slate-900 flex justify-between text-[9px] text-slate-500 font-mono">
                <span>{a.protocol}</span>
                <span>{a.latency}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Connected Devices Grid & Live Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Left 2 Cols: Registered Devices List */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Registered Household IoT Devices</h4>

          <div className="divide-y divide-slate-800/80">
            {devices.map((dev) => (
              <div
                key={dev.id}
                onClick={() => setSelectedDevice(dev)}
                className={`py-2.5 px-3 rounded-xl flex items-center justify-between cursor-pointer transition-all ${
                  selectedDevice?.id === dev.id
                    ? 'bg-emerald-950/40 border border-emerald-500/30'
                    : 'hover:bg-slate-950'
                }`}
              >
                <div className="flex items-center gap-3 text-xs">
                  <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-amber-400">
                    <Radio className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-200 text-xs">{dev.name}</p>
                    <p className="text-[10px] font-mono text-slate-400">
                      {dev.macOrSerial} | Adapter: <span className="text-emerald-400 font-bold">{dev.adapterType}</span>
                    </p>
                  </div>
                </div>

                <div className="text-right text-xs">
                  <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded font-mono font-bold uppercase">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>ONLINE</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Col: Live Adapter Payload Inspector */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span>Adapter Payload Inspector</span>
            </h4>
          </div>

          {selectedDevice ? (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs space-y-2">
              <div className="text-emerald-400 font-bold border-b border-slate-800 pb-1.5 text-[11px]">
                // {selectedDevice.name} ({selectedDevice.adapterType})
              </div>

              <div className="text-slate-300 space-y-1 text-[10px]">
                <p><span className="text-slate-500">device_id:</span> "{selectedDevice.id}"</p>
                <p><span className="text-slate-500">adapter:</span> "{selectedDevice.adapterType}"</p>
                <p><span className="text-slate-500">mac_serial:</span> "{selectedDevice.macOrSerial}"</p>
                <p><span className="text-slate-500">status:</span> "HEALTHY_CONNECTED"</p>
                <p><span className="text-slate-500">grid_frequency:</span> "50.0 Hz"</p>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1">SAMPLE RAW PAYLOAD</span>
                <pre className="bg-slate-900 p-2 rounded text-[9px] text-amber-300 overflow-x-auto leading-tight">
{JSON.stringify({
  timestamp: new Date().toISOString(),
  voltage: 221.8,
  current: 4.82,
  activePowerW: 960.5,
  powerFactor: 0.94,
  frequency: 50.0
}, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Select a device to inspect payload telemetry</p>
          )}
        </div>

      </div>

      {/* Add Device Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-md w-full space-y-3 shadow-2xl">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Register IoT Device / Smart Meter</h3>
            
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Device Name</label>
                <input
                  type="text"
                  placeholder="e.g. Master Bedroom Smart Plug"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Device Category</label>
                <select
                  value={deviceType}
                  onChange={(e) => setDeviceType(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="SMART_PLUG">Wi-Fi Smart Plug</option>
                  <option value="ESP32_PZEM">ESP32 + PZEM-004T Circuit Monitor</option>
                  <option value="SMART_METER">AMI Smart Meter Gateway</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Adapter Binding</label>
                <select
                  value={adapterType}
                  onChange={(e) => setAdapterType(e.target.value as AdapterType)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="MQTTAdapter">MQTTAdapter (ESP32 / Custom)</option>
                  <option value="TuyaAdapter">TuyaAdapter (Smart Life Plugs)</option>
                  <option value="DESCOAdapter">DESCOAdapter (Smart Meter AMI)</option>
                  <option value="MockAdapter">MockAdapter (Simulated)</option>
                  <option value="CompositeAdapter">CompositeAdapter (Aggregated)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">MAC Address / Serial Number</label>
                <input
                  type="text"
                  placeholder="e.g. DSK-9901-88"
                  value={macSerial}
                  onChange={(e) => setMacSerial(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1 bg-slate-800 text-slate-300 font-bold rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 bg-emerald-500 text-slate-950 font-bold rounded"
                >
                  Save Device
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
