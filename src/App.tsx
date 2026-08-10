import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { Navigation, TabType } from './components/Navigation';
import { LiveDashboardTab } from './components/tabs/LiveDashboardTab';
import { CostAnalysisTab } from './components/tabs/CostAnalysisTab';
import { AppliancesTab } from './components/tabs/AppliancesTab';
import { IoTDevicesTab } from './components/tabs/IoTDevicesTab';
import { RecommendationsTab } from './components/tabs/RecommendationsTab';
import { ReportsTab } from './components/tabs/ReportsTab';
import { AdminTab } from './components/tabs/AdminTab';

import { Household, Room, Appliance } from '../shared/types/household';
import { IoTDevice } from '../shared/types/iot';
import { PowerReading, RecommendationItem } from '../shared/types/energy';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('LIVE');
  const [isAdminMode, setIsAdminMode] = useState<boolean>(false);

  // Core Data States
  const [households, setHouseholds] = useState<Household[]>([]);
  const [activeHousehold, setActiveHousehold] = useState<Household | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [devices, setDevices] = useState<IoTDevice[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);

  // Live Telemetry States
  const [liveReadings, setLiveReadings] = useState<PowerReading[]>([]);
  const [totalActiveWatts, setTotalActiveWatts] = useState<number>(420);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(true);

  // 1. Fetch initial Households
  useEffect(() => {
    fetch('/api/v1/households')
      .then(res => res.json())
      .then(res => {
        if (res.status === 'success' && res.data && res.data.length > 0) {
          setHouseholds(res.data);
          setActiveHousehold(res.data[0]);
        }
      })
      .catch(err => console.error('Failed to load households:', err));
  }, []);

  // 2. Load data whenever activeHousehold changes
  const loadHouseholdData = useCallback((householdId: string) => {
    // Fetch Rooms
    fetch(`/api/v1/households/${householdId}/rooms`)
      .then(res => res.json())
      .then(res => { if (res.status === 'success') setRooms(res.data); })
      .catch(err => console.error(err));

    // Fetch Appliances
    fetch(`/api/v1/households/${householdId}/appliances`)
      .then(res => res.json())
      .then(res => { if (res.status === 'success') setAppliances(res.data); })
      .catch(err => console.error(err));

    // Fetch Devices
    fetch(`/api/v1/devices?householdId=${householdId}`)
      .then(res => res.json())
      .then(res => { if (res.status === 'success') setDevices(res.data); })
      .catch(err => console.error(err));

    // Fetch Recommendations
    fetch(`/api/v1/recommendations?householdId=${householdId}`)
      .then(res => res.json())
      .then(res => { if (res.status === 'success') setRecommendations(res.data); })
      .catch(err => console.error(err));
  }, []);

  useEffect(() => {
    if (activeHousehold) {
      loadHouseholdData(activeHousehold.id);
    }
  }, [activeHousehold, loadHouseholdData]);

  // 3. Poll Live Telemetry every 3 seconds
  useEffect(() => {
    if (!activeHousehold) return;

    const pollTelemetry = () => {
      fetch(`/api/v1/telemetry/live?householdId=${activeHousehold.id}`)
        .then(res => res.json())
        .then(res => {
          if (res.status === 'success' && res.data) {
            setLiveReadings(res.data.readings || []);
            setTotalActiveWatts(res.data.summary?.totalActivePowerW || 0);
            setIsLiveConnected(true);
          }
        })
        .catch(err => {
          console.warn('Telemetry polling error:', err);
          setIsLiveConnected(false);
        });
    };

    pollTelemetry();
    const interval = setInterval(pollTelemetry, 3000);
    return () => clearInterval(interval);
  }, [activeHousehold]);

  // Handle adding new IoT device via API
  const handleAddDevice = (newDeviceData: Omit<IoTDevice, 'id' | 'lastSeen'>) => {
    fetch('/api/v1/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDeviceData),
    })
      .then(res => res.json())
      .then(res => {
        if (res.status === 'success' && res.data && activeHousehold) {
          setDevices(prev => [...prev, res.data]);
        }
      })
      .catch(err => console.error('Failed to create device:', err));
  };

  if (!activeHousehold) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center font-sans">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-400 font-medium">Initializing KilowattIQ Architecture...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased flex flex-col">
      {/* Top Application Header */}
      <Header
        households={households}
        activeHousehold={activeHousehold}
        onSelectHousehold={setActiveHousehold}
        isAdminMode={isAdminMode}
        onToggleAdminMode={() => setIsAdminMode(!isAdminMode)}
        isLiveConnected={isLiveConnected}
        totalActiveWatts={totalActiveWatts}
      />

      {/* Main Navigation Tabs */}
      <Navigation
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isAdminMode={isAdminMode}
      />

      {/* Main Tab Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {activeTab === 'LIVE' && (
          <LiveDashboardTab
            household={activeHousehold}
            liveReadings={liveReadings}
            appliances={appliances}
            totalActiveWatts={totalActiveWatts}
          />
        )}

        {activeTab === 'COST' && (
          <CostAnalysisTab household={activeHousehold} />
        )}

        {activeTab === 'APPLIANCES' && (
          <AppliancesTab
            household={activeHousehold}
            rooms={rooms}
            appliances={appliances}
          />
        )}

        {activeTab === 'DEVICES' && (
          <IoTDevicesTab
            household={activeHousehold}
            devices={devices}
            onAddDevice={handleAddDevice}
          />
        )}

        {activeTab === 'RECOMMENDATIONS' && (
          <RecommendationsTab recommendations={recommendations} />
        )}

        {activeTab === 'REPORTS' && (
          <ReportsTab household={activeHousehold} />
        )}

        {activeTab === 'ADMIN' && isAdminMode && (
          <AdminTab households={households} />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 text-[11px] text-slate-500 py-3 text-center">
        <p>
          KilowattIQ Smart Energy & Cost System • High Density Operations Dashboard • BERC / DESCO / DPDC Tariff Standards
        </p>
      </footer>
    </div>
  );
}
