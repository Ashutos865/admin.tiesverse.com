import React, { createContext, useContext, useMemo } from 'react';
import { AuthContext } from './AuthContext';

export const PermissionContext = createContext();

/**
 * PermissionProvider reads the decoded JWT token from AuthContext
 * and provides permission-checking helpers to the entire app.
 *
 * Usage:
 *   const { hasPermission, hasAnyPermission } = usePermissions();
 *   if (hasPermission('add_event')) { ... }
 */
export const PermissionProvider = ({ children }) => {
  const { user } = useContext(AuthContext);

  const value = useMemo(() => {
    const permissions = user?.permissions || [];
    const isSuperuser = user?.is_superuser || false;

    /**
     * Check if the current user has a specific permission.
     * Superusers always return true.
     * @param {string} codename - e.g. 'add_event', 'view_article'
     */
    const hasPermission = (codename) => {
      if (isSuperuser) return true;
      return permissions.includes(codename);
    };

    /**
     * Check if the user has ANY of the listed permissions.
     * Useful for showing/hiding entire portal sections.
     * @param {string[]} codenames - array of permission codenames
     */
    const hasAnyPermission = (codenames) => {
      if (isSuperuser) return true;
      return codenames.some(c => permissions.includes(c));
    };

    /**
     * Check if the user has ALL of the listed permissions.
     * @param {string[]} codenames
     */
    const hasAllPermissions = (codenames) => {
      if (isSuperuser) return true;
      return codenames.every(c => permissions.includes(c));
    };

    return {
      permissions,
      isSuperuser,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
    };
  }, [user]);

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
};

/** Convenience hook */
export const usePermissions = () => useContext(PermissionContext);
