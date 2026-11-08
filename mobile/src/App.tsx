import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { Identity } from 'spacetimedb';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { hydrateLocalStorage } from './localStorageShim';
import { personaById } from './personas';
import { Shell } from './screens/Shell';
import { tokenKey } from './settings';
import { SetupScreen } from './SetupScreen';
import { loadSettings, saveSettings, type Settings } from './storage';
import { C } from './theme';
import { DbConnection, type ErrorContext } from './web';
import { LiveProviders } from './live/LiveProviders';

function Connected({ settings, onSwitch }: { settings: Settings & { persona: NonNullable<Settings['persona']> }; onSwitch: () => void }) {
  const persona = personaById(settings.persona);
  const key = tokenKey(settings.host, settings.db, settings.persona);
  // The builder is created once per (host, db, persona); the parent remounts this component when they change.
  const builder = useMemo(() => {
    const read = () => globalThis.localStorage.getItem(key) ?? undefined;
    return DbConnection.builder()
      .withUri(settings.host)
      .withDatabaseName(settings.db)
      .withToken(read())
      // React Native has no DecompressionStream; ask the server for uncompressed updates.
      .withCompression('none')
      .onConnect((_conn: DbConnection, identity: Identity, token: string) => {
        globalThis.localStorage.setItem(key, token);
        console.info(`[safenight] connected as ${persona.id} (${identity.toHexString().slice(0, 8)})`);
      })
      .onDisconnect(() => console.info('[safenight] disconnected'))
      .onConnectError((_ctx: ErrorContext, err: Error) => console.warn('[safenight] connection error', err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <SpacetimeDBProvider connectionBuilder={builder}>
      <LiveProviders persona={persona}>
        <Shell persona={persona} host={settings.host} dbName={settings.db} onSwitch={onSwitch} />
      </LiveProviders>
    </SpacetimeDBProvider>
  );
}

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    (async () => {
      await hydrateLocalStorage();
      setSettings(await loadSettings());
    })().catch((e: unknown) => console.warn('startup failed', e));
  }, []);

  if (!settings) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.accent} />
        <Text style={{ color: C.muted, marginTop: 8 }}>Loading…</Text>
      </View>
    );
  }

  const chosen = settings.persona;
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {!chosen || choosing ? (
        <SetupScreen
          initial={settings}
          onDone={(s) => {
            void saveSettings(s);
            setSettings(s);
            setChoosing(false);
          }}
        />
      ) : (
        <Connected key={`${settings.host}|${settings.db}|${chosen}`} settings={{ ...settings, persona: chosen }} onSwitch={() => setChoosing(true)} />
      )}
    </SafeAreaProvider>
  );
}
