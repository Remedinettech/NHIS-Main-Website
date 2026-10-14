import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from '../context/AuthContext';
import { can, type Capability } from '../utils/capabilities';

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

/** True when the signed-in role has the capability. The server enforces the same rule; this only shapes the interface. */
export function useCan(capability: Capability): boolean {
  return can(useAuth().role, capability);
}
