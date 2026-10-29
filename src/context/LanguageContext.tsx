import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'en' | 'bn';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, fallback?: string) => string;
  formatCurrency: (amount: number, options?: { showDecimals?: boolean }) => string;
  formatNumber: (num: number | string) => string;
}

const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBengaliNumerals(strOrNum: string | number): string {
  return String(strOrNum).replace(/[0-9]/g, (digit) => BENGALI_DIGITS[parseInt(digit, 10)]);
}

const translations: Record<string, { en: string; bn: string }> = {
  // Navigation Tabs
  'nav.live': { en: 'Live Monitor', bn: 'লাইভ মনিটর' },
  'nav.cost': { en: 'Cost & Slabs', bn: 'খরচ ও স্ল্যাব' },
  'nav.payments': { en: 'Payments', bn: 'বিল ও রিচার্জ' },
  'nav.appliances': { en: 'Appliances', bn: 'যন্ত্রপাতি' },
  'nav.schedule': { en: 'Scheduler', bn: 'শিডিউলার' },
  'nav.iot': { en: 'IoT Devices', bn: 'আইওটি ডিভাইস' },
  'nav.recommendations': { en: 'AI Advisor', bn: 'এআই অ্যাডভাইজর' },
  'nav.reports': { en: 'Audit Reports', bn: 'অডিট রিপোর্ট' },
  'nav.alerts': { en: 'Alerts', bn: 'সতর্কবার্তা' },
  'nav.admin': { en: 'Admin Panel', bn: 'অ্যাডমিন প্যানেল' },

  // Header & Profile
  'header.tagline': { en: 'Intelligent Energy OS for Bangladesh', bn: 'বাংলাদেশের জন্য স্মার্ট এনার্জি ওএস' },
  'header.offline': { en: 'Offline (Cached)', bn: 'অফলাইন (ক্যাশড)' },
  'header.online': { en: 'Live Grid Connected', bn: 'লাইভ গ্রিড সংযুক্ত' },
  'header.logout': { en: 'Sign Out', bn: 'লগআউট' },
  'header.household': { en: 'Household', bn: 'বাসাবাড়ি' },
  'header.language': { en: 'Language', bn: 'ভাষা' },
  'header.switch_lang': { en: 'বাংলায় দেখুন', bn: 'Switch to English' },

  // Live Dashboard Metrics
  'live.active_load': { en: 'Active Load', bn: 'বর্তমান লোড' },
  'live.grid_voltage': { en: 'Grid Voltage', bn: 'গ্রিড ভোল্টেজ' },
  'live.projected_bill': { en: 'Projected Bill', bn: 'প্রত্যাশিত বিল' },
  'live.current_slab': { en: 'Current Tariff Slab', bn: 'বর্তমান ট্যারিফ স্ল্যাব' },
  'live.sanctioned_load': { en: 'Sanctioned Load', bn: 'অনুমোদিত লোড' },
  'live.monthly_budget': { en: 'Monthly Budget', bn: 'মাসিক বাজেট' },
  'live.vampire_waste': { en: 'Vampire Standby Loss', bn: 'ভ্যাম্পায়ার বিদ্যুৎ অপচয়' },
  'live.live_stream': { en: 'Live Telemetry (1 Hz)', bn: 'লাইভ টেলিমেট্রি (১ হার্টজ)' },
  'live.quick_toggle': { en: 'Quick Appliance Toggles', bn: 'যন্ত্রপাতি দ্রুত চালু/বন্ধ' },
  'live.anomaly_feed': { en: 'Grid & Electrical Health', bn: 'গ্রিড ও বিদ্যুৎ নিরাপত্তা' },
  'live.all_systems_normal': { en: 'All electrical parameters normal', bn: 'সকল বৈদ্যুতিক পরিমাপক স্বাভাবিক' },

  // Buttons & Actions
  'btn.retry': { en: 'Try Again', bn: 'পুনরায় চেষ্টা করুন' },
  'btn.save': { en: 'Save Changes', bn: 'সংরক্ষণ করুন' },
  'btn.cancel': { en: 'Cancel', bn: 'বাতিল' },
  'btn.refresh': { en: 'Refresh Data', bn: 'রিফ্রেশ করুন' },
  'btn.add_appliance': { en: 'Add Appliance', bn: 'নতুন যন্ত্রপাতি যুক্ত করুন' },
  'btn.add_device': { en: 'Pair IoT Device', bn: 'নতুন ডিভাইস যুক্ত করুন' },
  'btn.pay_now': { en: 'Pay Bill Now', bn: 'এখনই বিল পরিশোধ করুন' },
  'btn.recharge': { en: 'Recharge Token', bn: 'টোকেন রিচার্জ করুন' },
  'btn.export_pdf': { en: 'Download Audit PDF', bn: 'অডিট পিডিএফ ডাউনলোড' },
  'btn.export_csv': { en: 'Export CSV', bn: 'সিএসভি এক্সপোর্ট' },
  'btn.analyze': { en: 'Analyze My Energy', bn: 'এনার্জি বিশ্লেষণ করুন' },
  'btn.analyzing': { en: 'Analyzing Energy...', bn: 'বিশ্লেষণ করা হচ্ছে...' },
  'btn.saving': { en: 'Saving...', bn: 'সংরক্ষণ হচ্ছে...' },
  'btn.success': { en: 'Success!', bn: 'সফল হয়েছে!' },
  'btn.close': { en: 'Close', bn: 'বন্ধ করুন' },

  // Warnings & Tariff Slabs
  'slab.warning_title': { en: 'Tariff Step Jump Alert', bn: 'ট্যারিফ স্ল্যাব অতিক্রমের ঝুঁকি' },
  'slab.warning_desc': { en: 'You are near the next tariff threshold. Marginal unit cost will increase.', bn: 'আপনি পরবর্তী ট্যারিফ স্ল্যাবের কাছাকাছি। প্রতি ইউনিটের খরচ বৃদ্ধি পাবে।' },
  'slab.step': { en: 'Step', bn: 'ধাপ' },
  'slab.units_left': { en: 'units remaining in current step', bn: 'ইউনিট বর্তমান ধাপে বাকি আছে' },

  // Empty & Error States
  'empty.no_appliances_title': { en: 'No Appliances Registered', bn: 'কোনো যন্ত্রপাতি যোগ করা হয়নি' },
  'empty.no_appliances_desc': { en: 'Add your high-power appliances (AC, refrigerator, water pump) to detect phantom loads and calculate savings.', bn: 'আপনার উচ্চ ক্ষমতাসম্পন্ন যন্ত্রপাতি (এসি, ফ্রিজ, মোটর) যোগ করুন অপচয় কমাতে।' },
  'empty.no_devices_title': { en: 'No IoT Adapters Connected', bn: 'কোনো আইওটি ডিভাইস সংযুক্ত নেই' },
  'empty.no_devices_desc': { en: 'Connect DESCO/DPDC smart meter, ESP32 PZEM, or Tuya smart plugs to stream 1 Hz live telemetry.', bn: 'স্মার্ট মিটার বা প্লাগ যুক্ত করে রিয়েল-টাইম বিদ্যুৎ ব্যবহার মনিটর করুন।' },
  'empty.no_alerts_title': { en: 'No Active Alerts', bn: 'কোনো সক্রিয় সতর্কবার্তা নেই' },
  'empty.no_alerts_desc': { en: 'Your household electrical grid and appliance health are operating within optimal parameters.', bn: 'আপনার বাসাবাড়ির বিদ্যুৎ গ্রিড ও যন্ত্রপাতি সম্পূর্ণ স্বাভাবিক রয়েছে।' },
  'error.generic_title': { en: 'Something Went Wrong', bn: 'একটি সমস্যা হয়েছে' },
  'error.generic_desc': { en: 'Unable to complete the requested operation. Please verify your connection and try again.', bn: 'অনুরোধটি সম্পন্ন করা সম্ভব হয়নি। অনুগ্রহ করে ইন্টারনেট চেক করে পুনরায় চেষ্টা করুন।' },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('kilowattiq_lang');
      if (saved === 'bn' || saved === 'en') return saved;
    } catch (e) {}
    return 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('kilowattiq_lang', lang);
    } catch (e) {}
  };

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'bn' : 'en');
  };

  const t = (key: string, fallback?: string): string => {
    const entry = translations[key];
    if (entry) {
      return entry[language];
    }
    return fallback || key;
  };

  /**
   * Formats currency with ৳ and standard comma separators.
   * In Bengali: ৳১২,৪৫০
   * In English: ৳12,450
   */
  const formatCurrency = (amount: number, options?: { showDecimals?: boolean }): string => {
    const isNegative = amount < 0;
    const absVal = Math.abs(amount);
    const formattedNum = options?.showDecimals
      ? absVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : Math.round(absVal).toLocaleString('en-US');

    const result = `${isNegative ? '-' : ''}৳${formattedNum}`;
    if (language === 'bn') {
      return toBengaliNumerals(result);
    }
    return result;
  };

  /**
   * Formats numbers into English or Bengali digits with locale grouping
   */
  const formatNumber = (num: number | string): string => {
    const n = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(n)) return String(num);

    const formatted = n.toLocaleString('en-US');
    if (language === 'bn') {
      return toBengaliNumerals(formatted);
    }
    return formatted;
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        toggleLanguage,
        t,
        formatCurrency,
        formatNumber,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
