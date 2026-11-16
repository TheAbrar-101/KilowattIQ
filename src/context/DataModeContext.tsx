import React, { createContext, useContext, useState } from 'react';

export type AppDataMode = 'DEMO' | 'REAL';

interface DataModeContextType {
  dataMode: AppDataMode;
  isDemoData: boolean;
  setDataMode: (mode: AppDataMode) => void;
  toggleDataMode: () => void;
}

const DATA_MODE_STORAGE_KEY = 'kilowattiq_data_mode';

const DataModeContext = createContext<DataModeContextType | undefined>(undefined);

export const DataModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dataMode, setDataModeState] = useState<AppDataMode>(() => {
    try {
      const saved = localStorage.getItem(DATA_MODE_STORAGE_KEY);
      if (saved === 'REAL' || saved === 'DEMO') return saved;
    } catch {
      // Ignore storage errors
    }
    return 'DEMO';
  });

  const setDataMode = (mode: AppDataMode) => {
    setDataModeState(mode);
    try {
      localStorage.setItem(DATA_MODE_STORAGE_KEY, mode);
    } catch {
      // Ignore storage errors
    }
  };

  const toggleDataMode = () => {
    setDataMode(dataMode === 'DEMO' ? 'REAL' : 'DEMO');
  };

  return (
    <DataModeContext.Provider
      value={{
        dataMode,
        isDemoData: dataMode === 'DEMO',
        setDataMode,
        toggleDataMode,
      }}
    >
      {children}
    </DataModeContext.Provider>
  );
};

export const useDataMode = (): DataModeContextType => {
  const context = useContext(DataModeContext);
  if (!context) {
    throw new Error('useDataMode must be used within a DataModeProvider');
  }
  return context;
};
