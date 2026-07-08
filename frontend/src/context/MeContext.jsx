import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AuthContext } from './AuthContext';
import { getMe } from '../apiClient';

export const MeContext = createContext();

/**
 * MeProvider fetches /api/career/me — the logged-in user's member profile and
 * access scope — and exposes it to the app. This is what tells the UI whether
 * to show the member self-service ("My Work") area and who the current member is.
 */
export const MeProvider = ({ children }) => {
  const { authTokens } = useContext(AuthContext);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!authTokens) { setMe(null); return; }
    setLoading(true);
    const data = await getMe();
    setMe(data && !data.error ? data : null);
    setLoading(false);
  }, [authTokens]);

  useEffect(() => { refresh(); }, [refresh]);

  const value = {
    me,
    loading,
    refresh,
    isMember: Boolean(me?.is_member),
    isLead: Boolean(me?.is_lead),
    isAdvisory: Boolean(me?.is_advisory),
    isDeveloper: Boolean(me?.is_developer),
    scope: me?.scope || null,
    memberId: me?.member?.id || null,
    member: me?.member || null,
  };

  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
};

export const useMe = () => useContext(MeContext);
