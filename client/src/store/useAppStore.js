import { create } from "zustand";

export const useAppStore = create((set) => ({
  user: null,
  permissions: [],
  company: null,
  theme: "light",
  isOffline: !navigator.onLine,
  setAuthState: (user) =>
    set({
      user,
      permissions: user?.permissions || [],
      company: user?.companyId || user?.company || null,
    }),
  setOfflineStatus: (isOffline) => set({ isOffline }),
  setTheme: (theme) => set({ theme }),
  clearAuthState: () => set({ user: null, permissions: [], company: null }),
}));
