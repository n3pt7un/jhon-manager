import { Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { StatusBar } from './StatusBar';

export function AppShell() {
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);

  return (
    <div
      className={cn(
        'grid h-screen grid-rows-[56px_1fr_32px]',
        sidebarCollapsed
          ? 'grid-cols-[64px_1fr]'
          : 'grid-cols-[280px_1fr]'
      )}
      style={{ transition: 'grid-template-columns 300ms ease' }}
    >
      {/* Sidebar spans all rows */}
      <Sidebar />

      {/* Header */}
      <Header />

      {/* Main content */}
      <main className="overflow-auto bg-background p-6">
        <Outlet />
      </main>

      {/* Status bar */}
      <StatusBar />
    </div>
  );
}
