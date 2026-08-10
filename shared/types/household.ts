export interface Household {
  id: string;
  userId: string;
  name: string;
  utilityProvider: 'DESCO' | 'DPDC' | 'BPDB' | 'WZPDCL' | 'BREB';
  accountNumber: string;
  sanctionedLoadKw: number;
  monthlyBudgetBDT: number;
  address: {
    division: string;
    city: string;
    area: string;
  };
  createdAt: string;
}

export interface Room {
  id: string;
  householdId: string;
  name: string;
  floorLevel?: number;
  icon?: string;
}

export interface Appliance {
  id: string;
  householdId: string;
  roomId: string;
  deviceId?: string; // Connected IoT Device ID if assigned
  name: string;
  category: 'AIR_CONDITIONER' | 'REFRIGERATOR' | 'TELEVISION' | 'WASHING_MACHINE' | 'LIGHTING' | 'FAN' | 'WATER_HEATER' | 'COMPUTER' | 'OTHER';
  ratedPowerW: number;
  standbyPowerW: number;
  averageHoursPerDay: number;
  energyRatingStars?: number; // 1-5 stars
  isInverterType: boolean;
  isVampireRisk: boolean;
  notes?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: 'CONSUMER' | 'ADMIN' | 'UTILITY_AUDITOR';
  created_at: string;
}
