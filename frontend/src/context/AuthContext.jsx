import React, { createContext, useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import axios from 'axios';
import { setApiToken } from '../apiClient';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export const AuthContext = createContext();

// Idle auto-logout window (minutes) used until the user's profile loads.
// The real value comes from profile.session_timeout (the "Session Invalidation
// Timeout" security setting), so there's a single source of truth.
const DEFAULT_SESSION_TIMEOUT_MIN = 10;

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
  const [authTokens, setAuthTokens] = useState(null);
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
      const response = await axios.get(`${API_URL}/api/accounts/profile/`, {
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
      const response = await axios.post(`${API_URL}/api/token/`, {
        username,
        password
      });
      if (response.status === 200) {
        setAuthTokens(response.data);
        setApiToken(response.data.access);
        const decoded = jwtDecode(response.data.access);
        setUser(decoded);
        return { success: true };
      }
    } catch (error) {
      return { success: false, error: 'Invalid username or password' };
    }
  };

  const logoutUser = () => {
    setAuthTokens(null);
    setApiToken(null);
    setUser(null);
    setProfile(null);
    
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
      setApiToken(authTokens.access);
      setUser(jwtDecode(authTokens.access));
      fetchUserProfile(authTokens.access);
    } else {
      setApiToken(null);
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
  // While signed in, sign the user out after the user's configured
  // "Session Invalidation Timeout" (profile.session_timeout, in minutes) with
  // no activity. Any activity resets the countdown to zero. Re-arms whenever
  // the setting changes (saved in ProfileSettings → updateProfileState).
  useEffect(() => {
    if (!authTokens) return; // only run while signed in

    const minutes = Number(profile?.session_timeout) || DEFAULT_SESSION_TIMEOUT_MIN;
    const timeoutMs = minutes * 60 * 1000;

    let timerId;
    let lastReset = 0;

    const handleIdle = () => {
      // Flag read by the Login page to explain the redirect.
      sessionStorage.setItem('sessionExpired', 'idle');
      logoutUser();
    };

    const resetTimer = () => {
      clearTimeout(timerId);
      timerId = setTimeout(handleIdle, timeoutMs);
    };

    // Throttle: a stream of mousemove events shouldn't reset the timer on
    // every fire — once per second is plenty for a multi-minute window.
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
  }, [authTokens, profile?.session_timeout]);


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
