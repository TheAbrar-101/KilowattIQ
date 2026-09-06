import React, { createContext, useContext, useState, useEffect } from 'react';
import { Household } from '../../shared/types/household';

export interface UserAuth {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: string;
}

interface AuthContextType {
  user: UserAuth | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  households: Household[];
  activeHousehold: Household | null;
  setActiveHousehold: (household: Household) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (fullName: string, email: string, phone: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'kilowattiq_auth_token';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserAuth | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [activeHousehold, setActiveHousehold] = useState<Household | null>(null);

  const safeParseJson = async (res: Response): Promise<any> => {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        return await res.json();
      } catch (parseErr) {
        console.error('[AuthContext] JSON parse error:', parseErr);
      }
    }
    const rawText = await res.text();
    console.error('[AuthContext] Received non-JSON response:', res.status, rawText);

    let extractedMessage = '';
    const bodyMatch = rawText.match(/<pre>(.*?)<\/pre>/i) || rawText.match(/<h1>(.*?)<\/h1>/i);
    const titleMatch = rawText.match(/<title>(.*?)<\/title>/i);
    if (bodyMatch && bodyMatch[1]) {
      extractedMessage = bodyMatch[1].trim();
    } else if (titleMatch && titleMatch[1]) {
      extractedMessage = titleMatch[1].trim();
    } else if (rawText && rawText.length < 150 && !rawText.includes('<')) {
      extractedMessage = rawText.trim();
    }

    if (res.status === 500) {
      throw new Error(
        extractedMessage
          ? `Server error (500): ${extractedMessage}`
          : 'Server error (500). If connecting your own Supabase project, verify your SUPABASE_URL and SUPABASE_ANON_KEY in project settings, or click "Gulshan Resident" below.'
      );
    }
    if (res.status === 404) {
      throw new Error('API route not found (404). Please check backend server routing.');
    }
    throw new Error(extractedMessage || `Server returned unexpected status (${res.status}).`);
  };

  const fetchSession = async (currentToken: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/v1/auth/me', {
        headers: {
          Authorization: `Bearer ${currentToken}`,
        },
      });

      if (res.ok) {
        const json = await safeParseJson(res);
        if (json.status === 'success' && json.data) {
          setUser(json.data.user);
          const userHhs = json.data.households || [];
          setHouseholds(userHhs);
          if (userHhs.length > 0) {
            setActiveHousehold(userHhs[0]);
          }
          return;
        }
      }
      // If invalid session token
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
    } catch (err: any) {
      console.error('[AuthContext] Session fetch error:', err);
      setError(err?.message || 'Network error verifying authentication.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchSession(token);
    } else {
      setLoading(false);
    }
  }, []);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const json = await safeParseJson(res);
      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || 'Invalid email or password.');
      }

      const authToken = json.data.token;
      localStorage.setItem(TOKEN_KEY, authToken);
      setToken(authToken);
      setUser(json.data.user);
      const userHhs = json.data.households || [];
      setHouseholds(userHhs);
      if (userHhs.length > 0) {
        setActiveHousehold(userHhs[0]);
      }
    } catch (err: any) {
      setError(err?.message || 'Login failed.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (fullName: string, email: string, phone: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, phone, password }),
      });

      const json = await safeParseJson(res);
      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || 'Registration failed.');
      }

      const authToken = json.data.token;
      if (authToken) {
        localStorage.setItem(TOKEN_KEY, authToken);
        setToken(authToken);
      }
      setUser(json.data.user);
      const userHhs = json.data.households || [];
      setHouseholds(userHhs);
      if (userHhs.length > 0) {
        setActiveHousehold(userHhs[0]);
      }
    } catch (err: any) {
      setError(err?.message || 'Registration failed.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      if (token) {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (e) {
      // ignore
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
      setHouseholds([]);
      setActiveHousehold(null);
    }
  };

  const refreshSession = async () => {
    if (token) {
      await fetchSession(token);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        error,
        households,
        activeHousehold,
        setActiveHousehold,
        signIn,
        signUp,
        signOut,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
