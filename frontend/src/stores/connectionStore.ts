import { create } from 'zustand';

interface ConnectionState {
  wsConnected: boolean;
  reconnectAttempts: number;
  setConnected: () => void;
  setDisconnected: () => void;
  incrementReconnect: () => void;
  resetReconnect: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  wsConnected: false,
  reconnectAttempts: 0,
  setConnected: () => set({ wsConnected: true, reconnectAttempts: 0 }),
  setDisconnected: () => set({ wsConnected: false }),
  incrementReconnect: () =>
    set((state) => ({ reconnectAttempts: state.reconnectAttempts + 1 })),
  resetReconnect: () => set({ reconnectAttempts: 0 }),
}));
