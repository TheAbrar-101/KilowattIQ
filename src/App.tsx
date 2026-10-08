import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuthPage } from './components/auth/AuthPage';
import { Header } from './components/Header';
import { Navigation, TabType } from './components/Navigation';
import { LiveDashboardTab } from './components/tabs/LiveDashboardTab';
import { CostAnalysisTab } from './components/tabs/CostAnalysisTab';
import { AppliancesTab } from './components/tabs/AppliancesTab';
import { IoTDevicesTab } from './components/tabs/IoTDevicesTab';
import { RecommendationsTab } from './components/tabs/RecommendationsTab';
import { ReportsTab } from './components/tabs/ReportsTab';
import { AlertsTab } from './components/tabs/AlertsTab';
import { AdminTab } from './components/tabs/AdminTab';
import { OfflineBanner } from './components/pwa/OfflineBanner';
import { PWAInstallPrompt } from './components/pwa/PWAInstallPrompt';

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
  const [totalActiveWatts, setTotalActiveWatts] = useState<number>(() => {
    try {
      const cached = localStorage.getItem('kilowattiq_last_telemetry');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (typeof parsed.activeWatts === 'number') return parsed.activeWatts;
      }
    } catch (e) {}
    return 1845;
  });
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(true);
  const [streamMode, setStreamMode] = useState<'SSE' | 'POLLING'>('SSE');
  const [activeApplianceStates, setActiveApplianceStates] = useState<Record<string, boolean>>({
    'c0000000-0000-0000-0000-000000000001': true,
    'c0000000-0000-0000-0000-000000000002': true,
    'c0000000-0000-0000-0000-000000000008': true,
  });

  // Persist last known telemetry reading for offline caching
  useEffect(() => {
    try {
      localStorage.setItem(
        'kilowattiq_last_telemetry',
        JSON.stringify({
          activeWatts: totalActiveWatts,
          totalKwh: 285.0,
          timestamp: new Date().toISOString(),
          householdId: activeHousehold?.id,
        })
      );
    } catch (e) {}
  }, [totalActiveWatts, activeHousehold]);

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

      eventSource.onopen = () => {
        setIsLiveConnected(true);
        setStreamMode('SSE');
        if (fallbackInterval) {
          clearInterval(fallbackInterval);
          fallbackInterval = null;
        }
      };

      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed && typeof parsed.totalActivePowerW === 'number') {
            setTotalActiveWatts(parsed.totalActivePowerW);
            setLiveReadings(prev => {
              const point: PowerReading = {
                id: `pt_${Date.now()}`,
                deviceId: 'dev_stream',
                timestamp: parsed.timestamp || new Date().toISOString(),
                powerWatts: parsed.totalActivePowerW,
                voltage: parsed.gridVoltage || 220,
                currentAmps: parsed.totalCurrentA || 8.2,
                frequencyHz: parsed.frequencyHz || 50,
                powerFactor: parsed.powerFactor || 0.95,
              };
              return [...prev.slice(-19), point];
            });
          }
        } catch (e) {
          console.warn('Failed to parse SSE payload:', e);
        }
      };

      eventSource.onerror = () => {
        console.warn('[SSE Stream] Disconnected. Falling back to HTTP polling.');
        setIsLiveConnected(false);
        setStreamMode('POLLING');
        eventSource?.close();
        eventSource = null;

        if (!fallbackInterval) {
          pollTelemetry();
          fallbackInterval = setInterval(pollTelemetry, 3000);
        }
      };
    } catch (err) {
      console.warn('[SSE Init Error]', err);
      setStreamMode('POLLING');
      pollTelemetry();
      fallbackInterval = setInterval(pollTelemetry, 3000);
    }

    return () => {
      if (eventSource) eventSource.close();
      if (fallbackInterval) clearInterval(fallbackInterval);
    };
  }, [activeHousehold, token, pollTelemetry]);

  // Toggle Appliance Active State via Supabase API
  const handleToggleAppliance = async (applianceId: string) => {
    const currentState = !!activeApplianceStates[applianceId];
    const newState = !currentState;

    setActiveApplianceStates(prev => ({
      ...prev,
      [applianceId]: newState,
    }));

    const app = appliances.find(a => a.id === applianceId);
    if (app) {
      const delta = app.ratedPowerWatts * (newState ? 1 : -1);
      setTotalActiveWatts(prev => Math.max(120, prev + delta));
    }

    try {
      await fetch(`/api/v1/appliances/${applianceId}/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ isOn: newState }),
      });
    } catch (err) {
      console.error('Failed to sync appliance toggle state:', err);
    }
  };

  // Add Appliance Handler
  const handleAddAppliance = async (newApp: Omit<Appliance, 'id' | 'createdAt'>) => {
    if (!activeHousehold) return;

    try {
      const res = await fetch(`/api/v1/households/${activeHousehold.id}/appliances`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify(newApp),
      });
      const json = await res.json();
      if (json.status === 'success' && json.data) {
        setAppliances(prev => [...prev, json.data]);
        setActiveApplianceStates(prev => ({ ...prev, [json.data.id]: true }));
        setTotalActiveWatts(prev => prev + json.data.ratedPowerWatts);
      }
    } catch (err) {
      console.error('Failed to add appliance:', err);
    }
  };

  // Add IoT Device Handler
  const handleAddDevice = async (newDevice: Omit<IoTDevice, 'id' | 'createdAt'>) => {
    if (!activeHousehold) return;

    try {
      const res = await fetch('/api/v1/devices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ ...newDevice, householdId: activeHousehold.id }),
      });
      const json = await res.json();
      if (json.status === 'success' && json.data) {
        setDevices(prev => [...prev, json.data]);
      }
    } catch (err) {
      console.error('Failed to register device:', err);
    }
  };

  // Resolve / Dismiss recommendation
  const handleResolveRecommendation = (recId: string) => {
    setRecommendations(prev => prev.filter(r => r.id !== recId));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 font-display">
          Initializing KilowattIQ
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1">
          Establishing connection to DESCO grid gateway...
        </p>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col transition-colors duration-200">
      {/* Header */}
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

      {/* Offline Status Warning Banner */}
      <OfflineBanner />

      {/* Navigation Sub-header Bar */}
      <Navigation
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isAdminMode={isAdminMode}
      />

      {/* Main Tab Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
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

            {activeTab === 'ALERTS' && activeHousehold && (
              <AlertsTab household={activeHousehold} />
            )}

            {activeTab === 'ADMIN' && isAdminMode && (
              <AdminTab households={households} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* In-App Install Prompt on Mobile (Respects 7-day dismissal) */}
      <PWAInstallPrompt />

      {/* Footer */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 py-3.5 text-center mt-auto transition-colors duration-200">
        <p className="max-w-7xl mx-auto px-4 font-sans">
          KilowattIQ Smart Energy & Cost System • Live Telemetry & DESCO Tariff Optimization • Installable PWA v1.0.5
        </p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <MainAppContent />
      </ThemeProvider>
    </AuthProvider>
  );
}
