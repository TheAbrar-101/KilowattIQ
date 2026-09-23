import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthPage } from './components/auth/AuthPage';
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

function MainAppContent() {
  const { user, token, loading, households, activeHousehold, setActiveHousehold } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('LIVE');
  const [isAdminMode, setIsAdminMode] = useState<boolean>(false);

  // Core Data States
  const [rooms, setRooms] = useState<Room[]>([]);
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [devices, setDevices] = useState<IoTDevice[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);

  // Live Telemetry States
  const [liveReadings, setLiveReadings] = useState<PowerReading[]>([]);
  const [totalActiveWatts, setTotalActiveWatts] = useState<number>(1845);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(true);
  const [streamMode, setStreamMode] = useState<'SSE' | 'POLLING'>('SSE');
  const [activeApplianceStates, setActiveApplianceStates] = useState<Record<string, boolean>>({
    'c0000000-0000-0000-0000-000000000001': true,
    'c0000000-0000-0000-0000-000000000002': true,
    'c0000000-0000-0000-0000-000000000008': true,
  });

  // Auth Header Helper
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: token ? `Bearer ${token}` : '',
  };

  // Load data whenever activeHousehold changes
  const loadHouseholdData = useCallback((householdId: string) => {
    const headers = { Authorization: token ? `Bearer ${token}` : '' };

    // Fetch Rooms
    fetch(`/api/v1/households/${householdId}/rooms`, { headers })
      .then(res => res.json())
      .then(res => { if (res.status === 'success') setRooms(res.data); })
      .catch(err => console.error(err));

    // Fetch Appliances
    fetch(`/api/v1/households/${householdId}/appliances`, { headers })
      .then(res => res.json())
      .then(res => {
        if (res.status === 'success') {
          setAppliances(res.data);
          const initialStates: Record<string, boolean> = {};
          res.data.forEach((app: Appliance) => {
            initialStates[app.id] = app.category === 'REFRIGERATOR' || app.category === 'AIR_CONDITIONER' || app.category === 'WATER_HEATER';
          });
          setActiveApplianceStates(prev => ({ ...initialStates, ...prev }));
        }
      })
      .catch(err => console.error(err));

    // Fetch Devices
    fetch(`/api/v1/devices?householdId=${householdId}`, { headers })
      .then(res => res.json())
      .then(res => { if (res.status === 'success') setDevices(res.data); })
      .catch(err => console.error(err));

    // Fetch Recommendations
    fetch(`/api/v1/recommendations?householdId=${householdId}`, { headers })
      .then(res => res.json())
      .then(res => { if (res.status === 'success') setRecommendations(res.data); })
      .catch(err => console.error(err));
  }, [token]);

  useEffect(() => {
    if (activeHousehold) {
      loadHouseholdData(activeHousehold.id);
    }
  }, [activeHousehold, loadHouseholdData]);

  // Telemetry Polling Fallback
  const pollTelemetry = useCallback(() => {
    if (!activeHousehold) return;

    fetch(`/api/v1/telemetry/live?householdId=${activeHousehold.id}`, {
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    })
      .then(res => res.json())
      .then(res => {
        if (res.status === 'success' && res.data) {
          if (res.data.summary && typeof res.data.summary.totalActivePowerW === 'number') {
            setTotalActiveWatts(res.data.summary.totalActivePowerW);
          }
          setLiveReadings(prev => {
            const newReadings = res.data.readings || [];
            if (newReadings.length === 0) return prev;
            const combined = [...prev, ...newReadings];
            return combined.slice(-20);
          });
          setIsLiveConnected(true);
        }
      })
      .catch(err => {
        console.warn('Telemetry polling error:', err);
        setIsLiveConnected(false);
      });
  }, [activeHousehold, token]);

  // Real-Time Telemetry: Server-Sent Events (SSE) Stream with Polling Fallback
  useEffect(() => {
    if (!activeHousehold) return;

    let eventSource: EventSource | null = null;
    let fallbackInterval: any = null;

    try {
      const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
      const streamUrl = `/api/v1/telemetry/stream?householdId=${encodeURIComponent(activeHousehold.id)}${tokenParam}`;
      eventSource = new EventSource(streamUrl);

      eventSource.addEventListener('telemetry', (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload && payload.summary && typeof payload.summary.totalActivePowerW === 'number') {
            setTotalActiveWatts(payload.summary.totalActivePowerW);
          }
          if (payload && payload.readings) {
            setLiveReadings(prev => {
              const combined = [...prev, ...(payload.readings || [])];
              return combined.slice(-20);
            });
          }
          setIsLiveConnected(true);
          setStreamMode('SSE');
        } catch (err) {
          console.warn('SSE frame parse error:', err);
        }
      });

      eventSource.onerror = () => {
        // Switch to polling fallback if SSE stream disconnects or encounters an error
        setStreamMode('POLLING');
        eventSource?.close();
        eventSource = null;
        if (!fallbackInterval) {
          pollTelemetry();
          fallbackInterval = setInterval(pollTelemetry, 3000);
        }
      };
    } catch (err) {
      setStreamMode('POLLING');
      pollTelemetry();
      fallbackInterval = setInterval(pollTelemetry, 3000);
    }

    return () => {
      if (eventSource) eventSource.close();
      if (fallbackInterval) clearInterval(fallbackInterval);
    };
  }, [activeHousehold, token, pollTelemetry]);

  // If loading auth state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center font-sans">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-400 font-medium">Restoring KilowattIQ Supabase Auth Session...</p>
        </div>
      </div>
    );
  }

  // If user is not authenticated
  if (!user || !token) {
    return <AuthPage />;
  }

  // Handle toggling appliance ON/OFF dynamically
  const handleToggleAppliance = (applianceId: string) => {
    if (!activeHousehold) return;
    const isCurrentlyOn = !!activeApplianceStates[applianceId];
    const newState = !isCurrentlyOn;

    // Optimistic UI update
    setActiveApplianceStates(prev => ({ ...prev, [applianceId]: newState }));

    // Send API toggle command to backend
    fetch(`/api/v1/households/${activeHousehold.id}/appliances/${applianceId}/toggle`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ isOn: newState }),
    })
      .then(res => res.json())
      .then(res => {
        if (res.status === 'success') {
          pollTelemetry();
        }
      })
      .catch(err => {
        console.error('Appliance toggle error:', err);
        // Revert on error
        setActiveApplianceStates(prev => ({ ...prev, [applianceId]: isCurrentlyOn }));
      });
  };

  // Handle adding new appliance
  const handleAddAppliance = (newApp: Omit<Appliance, 'id'>) => {
    if (!activeHousehold) return;
    fetch(`/api/v1/households/${activeHousehold.id}/appliances`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(newApp),
    })
      .then(res => res.json())
      .then(res => {
        if (res.status === 'success' && res.data) {
          setAppliances(prev => [...prev, res.data]);
        } else {
          const localApp: Appliance = {
            ...newApp,
            id: `app_${Date.now()}`,
          };
          setAppliances(prev => [...prev, localApp]);
        }
      })
      .catch(() => {
        const localApp: Appliance = {
          ...newApp,
          id: `app_${Date.now()}`,
        };
        setAppliances(prev => [...prev, localApp]);
      });
  };

  // Handle adding new IoT device
  const handleAddDevice = (newDeviceData: Omit<IoTDevice, 'id' | 'lastSeen'>) => {
    fetch('/api/v1/devices', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(newDeviceData),
    })
      .then(res => res.json())
      .then(res => {
        if (res.status === 'success' && res.data) {
          setDevices(prev => [...prev, res.data]);
        } else {
          const localDev: IoTDevice = {
            ...newDeviceData,
            id: `dev_${Date.now()}`,
            lastSeen: new Date().toISOString(),
          };
          setDevices(prev => [...prev, localDev]);
        }
      })
      .catch(() => {
        const localDev: IoTDevice = {
          ...newDeviceData,
          id: `dev_${Date.now()}`,
          lastSeen: new Date().toISOString(),
        };
        setDevices(prev => [...prev, localDev]);
      });
  };

  // Resolve recommendation
  const handleResolveRecommendation = (recId: string) => {
    setRecommendations(prev =>
      prev.map(r => (r.id === recId ? { ...r, status: 'resolved' as const } : r))
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased flex flex-col selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Application Header */}
      <Header
        households={households}
        activeHousehold={activeHousehold}
        onSelectHousehold={setActiveHousehold}
        isAdminMode={isAdminMode}
        onToggleAdminMode={() => setIsAdminMode(!isAdminMode)}
        isLiveConnected={isLiveConnected}
        totalActiveWatts={totalActiveWatts}
        streamMode={streamMode}
      />

      {/* Main Navigation Tabs */}
      <Navigation
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isAdminMode={isAdminMode}
      />

      {/* Main Tab Content with Motion */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {activeTab === 'LIVE' && activeHousehold && (
              <LiveDashboardTab
                household={activeHousehold}
                liveReadings={liveReadings}
                appliances={appliances}
                totalActiveWatts={totalActiveWatts}
                activeApplianceStates={activeApplianceStates}
                onToggleAppliance={handleToggleAppliance}
                onSetTotalWatts={setTotalActiveWatts}
              />
            )}

            {activeTab === 'COST' && activeHousehold && (
              <CostAnalysisTab household={activeHousehold} />
            )}

            {activeTab === 'APPLIANCES' && activeHousehold && (
              <AppliancesTab
                household={activeHousehold}
                rooms={rooms}
                appliances={appliances}
                activeApplianceStates={activeApplianceStates}
                onToggleAppliance={handleToggleAppliance}
                onAddAppliance={handleAddAppliance}
              />
            )}

            {activeTab === 'DEVICES' && activeHousehold && (
              <IoTDevicesTab
                household={activeHousehold}
                devices={devices}
                onAddDevice={handleAddDevice}
              />
            )}

            {activeTab === 'RECOMMENDATIONS' && (
              <RecommendationsTab
                household={activeHousehold || undefined}
                token={token}
                recommendations={recommendations}
                onResolve={handleResolveRecommendation}
              />
            )}

            {activeTab === 'REPORTS' && activeHousehold && (
              <ReportsTab household={activeHousehold} />
            )}

            {activeTab === 'ADMIN' && isAdminMode && (
              <AdminTab households={households} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 text-[11px] text-slate-500 py-3.5 text-center mt-auto">
        <p className="max-w-7xl mx-auto px-4">
          KilowattIQ Smart Energy & Cost System • Live Telemetry & DESCO Tariff Optimization • Real-time Meter Gateway v1.0.4
        </p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}
