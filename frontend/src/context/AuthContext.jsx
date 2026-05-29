import React, { createContext, useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import axios from 'axios';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [authTokens, setAuthTokens] = useState(() => 
    localStorage.getItem('authTokens') ? JSON.parse(localStorage.getItem('authTokens')) : null
  );
  const [loading, setLoading] = useState(true);

  const loginUser = async (username, password) => {
    try {
      const response = await axios.post('http://localhost:8000/api/token/', {
        username,
        password
      });
      if (response.status === 200) {
        setAuthTokens(response.data);
        const decoded = jwtDecode(response.data.access);
        // Note: Standard simplejwt payload has user_id, but we might want username. 
        // For now, we'll store the decoded token and fetch user details if needed.
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
    localStorage.removeItem('authTokens');
  };

  useEffect(() => {
    if (authTokens) {
      setUser(jwtDecode(authTokens.access));
    }
    setLoading(false);
  }, [authTokens]);

  const contextData = {
    user,
    authTokens,
    loginUser,
    logoutUser,
  };

  return (
    <AuthContext.Provider value={contextData}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
