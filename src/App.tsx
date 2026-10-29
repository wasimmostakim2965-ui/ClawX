/**
 * Root Application Component
 * Handles routing and global providers
 */
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Component, useEffect, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Toaster } from 'sonner';
import i18n from './i18n';
import { MainLayout } from './components/layout/MainLayout';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Models } from './pages/Models';
import { Chat } from './pages/Chat';
import { Agents } from './pages/Agents';
import { Channels } from './pages/Channels';
import { Skills } from './pages/Skills';
import { Cron } from './pages/Cron';
import { Settings } from './pages/Settings';
import { ComputerUse } from './pages/ComputerUse';
import { useSettingsStore } from './stores/settings';
import { useUpdateStore } from './stores/update';
import { useGatewayStore } from './stores/gateway';
import { useProviderStore } from './stores/providers';
import { rendererExtensionRegistry } from './extensions/registry';
import { loadExternalRendererExtensions } from './extensions/_ext-bridge.generated';
import { UpdateNotifier } from './components/update/UpdateNotifier';
import { useNewChatAction } from './components/layout/use-new-chat-action';
import { hostApi } from './lib/host-api';
import { hostEvents } from './lib/host-events';
import { useResolvedTheme } from './lib/use-resolved-theme';


/**
 * Error Boundary to catch and display React rendering errors
 */
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React Error Boundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          color: '#f87171',
          background: '#0f172a',
          minHeight: '100vh',
          fontFamily: 'monospace'
        }}>
          <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>Something went wrong</h1>
          <pre style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            background: '#1e293b',
            padding: '16px',
            borderRadius: '8px',
            fontSize: '14px'
          }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const skipSetupForE2E = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('e2eSkipSetup') === '1';
  const initSettings = useSettingsStore((state) => state.init);
  const resolvedTheme = useResolvedTheme();
  const language = useSettingsStore((state) => state.language);
  const setupComplete = useSettingsStore((state) => state.setupComplete);
  const markSetupComplete = useSettingsStore((state) => state.markSetupComplete);
  const [settingsInitialized, setSettingsInitialized] = useState(false);
  const backgroundSetupStarted = useRef(false);
  const initGateway = useGatewayStore((state) => state.init);
  const initUpdate = useUpdateStore((state) => state.init);
  const initProviders = useProviderStore((state) => state.init);
  const handleNewChat = useNewChatAction();

  useEffect(() => {
    let cancelled = false;

    void initSettings().finally(() => {
      if (!cancelled) {
        setSettingsInitialized(true);
        void initUpdate();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [initSettings, initUpdate]);

  // Sync i18n language with persisted settings on mount
  useEffect(() => {
    if (language && language !== i18n.language) {
      i18n.changeLanguage(language);
    }
  }, [language]);

  // Initialize Gateway connection on mount
  useEffect(() => {
    initGateway();
  }, [initGateway]);

  // Initialize provider snapshot on mount
  useEffect(() => {
    initProviders();
  }, [initProviders]);

  // Preserve the existing first-run readiness/uv work, but run it without
  // blocking the homepage behind the legacy setup wizard.
  useEffect(() => {
    if (!settingsInitialized || setupComplete || skipSetupForE2E || backgroundSetupStarted.current) return;
    backgroundSetupStarted.current = true;
    void (async () => {
      const pollIntervalMs = 3_000;
      const setupTimeoutMs = 10 * 60_000;
      const startedAt = Date.now();
      let gatewayStartAttempted = false;
      let environmentSetupComplete = false;
      try {
        while (Date.now() - startedAt < setupTimeoutMs) {
          const gateway = await hostApi.gateway.status();
          useGatewayStore.getState().setStatus(gateway);

          if (gateway.state !== 'running' || gateway.gatewayReady === false) {
            const startupHasStalled = Date.now() - startedAt >= 15_000;
            if (
              !gatewayStartAttempted
              && (gateway.state === 'error' || (gateway.state === 'stopped' && startupHasStalled))
            ) {
              gatewayStartAttempted = true;
              await useGatewayStore.getState().start();
            }
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
            continue;
          }

          const runtime = await hostApi.openclaw.status();
          if (!runtime.packageExists || !runtime.isBuilt) {
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
            continue;
          }

          if (!environmentSetupComplete) {
            const result = await hostApi.uv.installAll();
            if (!result.success) {
              console.warn('[setup] Background environment setup failed; it will retry next launch:', result.error);
              return;
            }
            environmentSetupComplete = true;
          }

          const readyGateway = await hostApi.gateway.status();
          useGatewayStore.getState().setStatus(readyGateway);
          if (readyGateway.state === 'running' && readyGateway.gatewayReady !== false) {
            markSetupComplete();
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }
        console.warn('[setup] Background setup timed out; the app will retry on the next launch.');
      } catch (error) {
        console.warn('[setup] Background first-run setup failed; it will retry next launch:', error);
      }
    })();
  }, [settingsInitialized, setupComplete, skipSetupForE2E, markSetupComplete]);

  // Listen for navigation events from main process
  useEffect(() => {
    const unsubscribe = hostEvents.onNavigate((path) => {
      navigate(path);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [navigate]);

  useEffect(() => {
    const unsubscribe = hostEvents.onNewChat(handleNewChat);

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [handleNewChat]);

  // Apply theme. `resolvedTheme` re-resolves live while the setting is
  // 'system' (see use-resolved-theme), so OS scheme changes propagate.
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
  }, [resolvedTheme]);

  // Load external renderer extensions (generated by scripts/generate-ext-bridge.mjs)
  // and initialize all registered extensions.
  useEffect(() => {
    loadExternalRendererExtensions();
    void rendererExtensionRegistry.initializeAll();
    return () => rendererExtensionRegistry.teardownAll();
  }, []);

  const extraRoutes = rendererExtensionRegistry.getExtraRoutes();

  return (
    <ErrorBoundary>
      <TooltipProvider delayDuration={300}>
        <Routes>
          {/* Legacy setup route: first-run users go straight to the main UI. */}
          <Route path="/setup/*" element={<Navigate to="/" replace />} />

          {/* Main application routes */}
          <Route element={<MainLayout />}>
            <Route path="/" element={<Chat />} />
            <Route path="/models" element={<Models />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/channels" element={<Channels />} />
            <Route path="/skills" element={<Skills />} />
            <Route path="/cron" element={<Cron />} />
            <Route path="/computer-use" element={<ComputerUse />} />
            <Route path="/settings/*" element={<Settings />} />
            {extraRoutes.map((r) => (
              <Route key={r.path} path={r.path} element={<r.component />} />
            ))}
          </Route>
        </Routes>

        <UpdateNotifier />

        {/* Global toast notifications */}
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          theme={resolvedTheme}
          style={{ zIndex: 99999 }}
        />
      </TooltipProvider>
    </ErrorBoundary>
  );
}

export default App;
