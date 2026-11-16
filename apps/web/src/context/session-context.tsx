'use client';

import { AppRole, AuthUserView } from '@apuestas/shared';
import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { fetchCurrentUser, logoutAccount } from '../lib/api-client';

export interface RoleMetadata {
  role: AppRole;
  title: string;
  badgeClass: string;
  summary: string;
}

export const ROLE_METADATA: Readonly<Record<AppRole, RoleMetadata>> = {
  bettor: {
    role: 'bettor',
    title: 'Apostador',
    badgeClass: 'role-badge role-badge-bettor',
    summary: 'Consulta partidos en vivo, recarga tu billetera y protege la cuenta con 2FA.',
  },
  operator: {
    role: 'operator',
    title: 'Operador',
    badgeClass: 'role-badge role-badge-operator',
    summary: 'Gestiona cartelera deportiva, transiciones de estado, cuotas y sync API-Football.',
  },
  admin: {
    role: 'admin',
    title: 'Administrador',
    badgeClass: 'role-badge role-badge-admin',
    summary: 'Control total de usuarios, asignación de roles RBAC y auditoría del sistema.',
  },
};

export interface SessionContextValue {
  user: AuthUserView | null;
  loading: boolean;
  isManagedByProvider: boolean;
  refreshSessionUser: () => Promise<void>;
  setSessionUser: (nextUser: AuthUserView | null) => void;
  logout: () => Promise<void>;
}

const DEFAULT_SESSION_CONTEXT: SessionContextValue = {
  user: null,
  loading: false,
  isManagedByProvider: false,
  refreshSessionUser: () => Promise.resolve(),
  setSessionUser: () => undefined,
  logout: () => Promise.resolve(),
};

const SessionContext = createContext<SessionContextValue>(DEFAULT_SESSION_CONTEXT);

export function SessionProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [user, setUser] = useState<AuthUserView | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshSessionUser = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchCurrentUser();
      setUser(response.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof globalThis.fetch !== 'function') {
      setLoading(false);
      return;
    }

    const controller = { cancelled: false };
    void (async () => {
      try {
        const response = await fetchCurrentUser();
        if (!controller.cancelled) {
          setUser(response.user);
        }
      } catch {
        if (!controller.cancelled) {
          setUser(null);
        }
      } finally {
        if (!controller.cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      controller.cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutAccount();
    } catch {
      // Clear local client state even if cookie was already expired
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      loading,
      isManagedByProvider: true,
      refreshSessionUser,
      setSessionUser: setUser,
      logout,
    }),
    [user, loading, refreshSessionUser, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
