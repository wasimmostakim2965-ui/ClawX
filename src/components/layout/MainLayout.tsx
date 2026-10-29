/**
 * Main Layout Component
 * Platform-aware application shell.
 */
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';
import { MAC_SIDEBAR_CHROME_HEIGHT } from '@shared/sidebar-layout';
import { cn } from '@/lib/utils';
import { WebBrowserHost } from '@/components/web-browser/WebBrowserHost';
import { useGatewayStore } from '@/stores/gateway';

export function MainLayout() {
  const platform = window.electron?.platform;
  const isMac = platform === 'darwin';
  const isWin = platform === 'win32';
  const gatewayStatus = useGatewayStore((state) => state.status);
  const gatewayReady = gatewayStatus.state === 'running' && gatewayStatus.gatewayReady !== false;

  return (
    <div
      data-testid="main-layout"
      data-platform={platform}
      className={cn(
        'flex h-screen overflow-hidden',
        isWin ? 'bg-surface-sidebar' : 'bg-background',
        isMac ? 'flex-row' : 'flex-col',
      )}
    >
      <TitleBar />

      <div className="flex min-h-0 flex-1 overflow-hidden bg-surface-sidebar">
        <Sidebar />
        <main
          data-testid="main-content"
          className={cn(
            'relative min-h-0 flex-1 overflow-auto rounded-tl-2xl border-l border-border/60 bg-background p-6',
            !isWin && 'border-t border-border/60',
          )}
        >
          {isMac && (
            <div
              data-testid="mac-main-drag-region"
              aria-hidden="true"
              className="drag-region absolute inset-x-0 top-0 z-10"
              style={{ height: MAC_SIDEBAR_CHROME_HEIGHT }}
            />
          )}
          <Outlet />
        </main>
        <WebBrowserHost />
      </div>
      {gatewayReady && (
        <span
          data-testid="gateway-ready-indicator"
          role="status"
          aria-label="Gateway ready"
          title="Gateway ready"
          className="pointer-events-none fixed bottom-3 right-4 z-[100] h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_hsl(var(--background)),0_0_12px_hsl(142_71%_45%/0.45)]"
        />
      )}
    </div>
  );
}
