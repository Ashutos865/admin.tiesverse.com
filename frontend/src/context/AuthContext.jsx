import React, { createContext, useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import axios from 'axios';

export const AuthContext = createContext();

// Auto-logout after this many ms of no user activity. Any activity resets it.
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const darkenColor = (hex, percent) => {
  if (!hex || !hex.startsWith('#')) return hex;
  try {
    let num = parseInt(hex.replace("#", ""), 16),
      amt = Math.round(2.55 * percent),
      R = (num >> 16) - amt,
      G = (num >> 8 & 0x00FF) - amt,
      B = (num & 0x0000FF) - amt;
    return "#" + (0x1000000 + (R < 255 ? R < 0 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 0 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 0 ? 0 : B : 255)).toString(16).slice(1);
  } catch (e) {
    return hex;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authTokens, setAuthTokens] = useState(() => 
    localStorage.getItem('authTokens') ? JSON.parse(localStorage.getItem('authTokens')) : null
  );
  const [loading, setLoading] = useState(true);

  const applyThemeAndColor = (profileData) => {
    if (!profileData) return;
    const root = document.documentElement;
    if (profileData.theme === 'light') {
      root.classList.add('light');
    } else {
      root.classList.remove('light');
    }

    if (profileData.accent_color) {
      root.style.setProperty('--primary', profileData.accent_color);
      const hoverColor = darkenColor(profileData.accent_color, 10);
      root.style.setProperty('--primary-hover', hoverColor);
    }
  };

  const fetchUserProfile = async (token) => {
    try {
      const response = await axios.get('http://localhost:8000/api/accounts/profile/', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (response.status === 200) {
        setProfile(response.data.profile);
        applyThemeAndColor(response.data.profile);
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  };

  const loginUser = async (username, password) => {
    try {
      const response = await axios.post('http://localhost:8000/api/token/', {
        username,
        password
      });
      if (response.status === 200) {
        setAuthTokens(response.data);
        const decoded = jwtDecode(response.data.access);
        setUser(decoded);
        localStorage.setItem('authTokens', JSON.stringify(response.data));
        return { success: true };
      }
    } catch (error) {
      return { success: false, error: 'Invalid username or password' };
    }
  };

  const logoutUser = () => {
    setAuthTokens(null);
    setUser(null);
    setProfile(null);
    localStorage.removeItem('authTokens');
    
    // Reset to defaults
    const root = document.documentElement;
    root.classList.remove('light');
    root.style.removeProperty('--primary');
    root.style.removeProperty('--primary-hover');
  };

  const updateProfileState = (updatedProfile) => {
    setProfile(updatedProfile);
    applyThemeAndColor(updatedProfile);
  };

  useEffect(() => {
    if (authTokens) {
      setUser(jwtDecode(authTokens.access));
      fetchUserProfile(authTokens.access);
    } else {
      setUser(null);
      setProfile(null);
      const root = document.documentElement;
      root.classList.remove('light');
      root.style.removeProperty('--primary');
      root.style.removeProperty('--primary-hover');
    }
    setLoading(false);
  }, [authTokens]);

  // ── Idle auto-logout ──────────────────────────────────────────────
  // While signed in, sign the user out after IDLE_TIMEOUT_MS with no
  // activity. Any activity resets the countdown to zero.
  useEffect(() => {
    if (!authTokens) return; // only run while signed in

    let timerId;
    let lastReset = 0;

    const handleIdle = () => {
      // Flag read by the Login page to explain the redirect.
      sessionStorage.setItem('sessionExpired', 'idle');
      logoutUser();
    };

    const resetTimer = () => {
      clearTimeout(timerId);
      timerId = setTimeout(handleIdle, IDLE_TIMEOUT_MS);
    };

    // Throttle: a stream of mousemove events shouldn't reset the timer on
    // every fire — once per second is plenty for a 10-minute window.
    const onActivity = () => {
      const now = Date.now();
      if (now - lastReset < 1000) return;
      lastReset = now;
      resetTimer();
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click', 'wheel'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    resetTimer(); // start the countdown

    return () => {
      clearTimeout(timerId);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [authTokens]);

  // ── Cross-tab auth sync ───────────────────────────────────────────
  // If the user logs out (idle or manual) or in from another tab, mirror it.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'authTokens') {
        setAuthTokens(e.newValue ? JSON.parse(e.newValue) : null);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const contextData = {
    user,
    profile,
    authTokens,
    loginUser,
    logoutUser,
    updateProfileState,
    applyThemeAndColor,
  };

  return (
    <AuthContext.Provider value={contextData}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
