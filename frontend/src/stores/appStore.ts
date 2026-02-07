import { create } from 'zustand';

interface AppState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  activeModal: string | null;
  openModal: (id: string) => void;
  closeModal: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  activeModal: null,
  openModal: (id: string) => set({ activeModal: id }),
  closeModal: () => set({ activeModal: null }),
}));
