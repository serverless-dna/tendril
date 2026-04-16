/**
 * Stronghold-based API key management.
 * Uses @tauri-apps/plugin-stronghold for encrypted storage.
 */
import { Stronghold } from '@tauri-apps/plugin-stronghold';
import { appDataDir } from '@tauri-apps/api/path';

const VAULT_PASSWORD = 'tendril-vault-v1'; // App-derived password; vault is local-only
const CLIENT_NAME = 'tendril-keys';

let strongholdInstance: Stronghold | null = null;

async function getStronghold(): Promise<Stronghold> {
  if (strongholdInstance) return strongholdInstance;
  const dir = await appDataDir();
  const vaultPath = `${dir}/vault.hold`;
  strongholdInstance = await Stronghold.load(vaultPath, VAULT_PASSWORD);
  return strongholdInstance;
}

async function getStore() {
  const stronghold = await getStronghold();
  let client;
  try {
    client = await stronghold.loadClient(CLIENT_NAME);
  } catch {
    client = await stronghold.createClient(CLIENT_NAME);
  }
  return client.getStore();
}

export async function saveApiKey(provider: string, apiKey: string): Promise<void> {
  const store = await getStore();
  const key = `${provider}_api_key`;
  const data = Array.from(new TextEncoder().encode(apiKey));
  await store.insert(key, data);
  const stronghold = await getStronghold();
  await stronghold.save();
}

export async function hasApiKey(provider: string): Promise<boolean> {
  try {
    const store = await getStore();
    const key = `${provider}_api_key`;
    const data = await store.get(key);
    return data !== null && data !== undefined && data.length > 0;
  } catch {
    return false;
  }
}

export async function getApiKey(provider: string): Promise<string | null> {
  try {
    const store = await getStore();
    const key = `${provider}_api_key`;
    const data = await store.get(key);
    if (!data || data.length === 0) return null;
    return new TextDecoder().decode(new Uint8Array(data));
  } catch {
    return null;
  }
}

export async function deleteApiKey(provider: string): Promise<void> {
  const store = await getStore();
  const key = `${provider}_api_key`;
  await store.remove(key);
  const stronghold = await getStronghold();
  await stronghold.save();
}

/**
 * Build env vars array for the agent process based on the current provider.
 * Retrieves API keys from Stronghold and returns them as env var tuples.
 */
export async function getAgentEnvVars(provider: string): Promise<[string, string][]> {
  const envVarMap: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
  };

  const envKey = envVarMap[provider];
  if (!envKey) return [];

  const apiKey = await getApiKey(provider);
  if (!apiKey) return [];

  return [[envKey, apiKey]];
}
