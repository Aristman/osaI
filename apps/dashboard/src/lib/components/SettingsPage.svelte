<script lang="ts">
  import { settingsStore } from '../stores/settings';
  import type { AppSettings, ThemeOption } from '../stores/settings';
  import SettingSection from './SettingSection.svelte';
  import SettingToggle from './SettingToggle.svelte';
  import SettingInput from './SettingInput.svelte';
  import SettingSelect from './SettingSelect.svelte';

  const themeOptions: Array<{ value: string; label: string }> = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'system', label: 'System' }
  ];

  let settings = $derived($settingsStore);
  let saveMessage = $state<string | null>(null);

  function handleSave() {
    settingsStore.save();
    saveMessage = 'Settings saved';
    setTimeout(() => {
      saveMessage = null;
    }, 2000);
  }

  function handleReset() {
    settingsStore.reset();
    saveMessage = 'Settings reset to defaults';
    setTimeout(() => {
      saveMessage = null;
    }, 2000);
  }

  function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    settingsStore.update(key, value);
  }
</script>

<div class="flex flex-col gap-6 p-6 overflow-y-auto">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-semibold text-osai-text-primary">Settings</h1>
      <p class="mt-1 text-sm text-osai-text-secondary">
        Configure dashboard preferences and agent settings.
      </p>
    </div>
    <div class="flex items-center gap-3">
      {#if saveMessage}
        <span class="text-sm text-osai-success">
          {saveMessage}
        </span>
      {/if}
      <button
        onclick={handleReset}
        type="button"
        class="rounded-md border border-osai-surface-500 bg-osai-surface-700 px-4 py-2 text-sm font-medium text-osai-text-secondary transition-colors hover:bg-osai-surface-600 hover:text-osai-text-primary"
      >
        Reset
      </button>
      <button
        onclick={handleSave}
        type="button"
        class="rounded-md bg-osai-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-osai-primary-700"
      >
        Save
      </button>
    </div>
  </div>

  <!-- Connection Section -->
  <SettingSection title="Connection" description="Gateway WebSocket connection settings.">
    <SettingInput
      label="Gateway URL"
      description="WebSocket URL of the osaI Gateway"
      type="text"
      value={settings.gatewayUrl}
      placeholder="ws://127.0.0.1:18789"
      onchange={(v) => updateSetting('gatewayUrl', v as string)}
    />
    <SettingToggle
      label="Auto-reconnect"
      description="Automatically reconnect when connection is lost"
      checked={settings.reconnectEnabled}
      onchange={(v) => updateSetting('reconnectEnabled', v)}
    />
    <SettingInput
      label="Max Reconnect Attempts"
      description="Maximum number of reconnection attempts"
      type="number"
      value={settings.maxReconnectAttempts}
      placeholder="5"
      min={1}
      max={100}
      step={1}
      onchange={(v) => updateSetting('maxReconnectAttempts', v as number)}
    />
  </SettingSection>

  <!-- Appearance Section -->
  <SettingSection title="Appearance" description="Customize the dashboard look and feel.">
    <SettingSelect
      label="Theme"
      description="Choose the UI theme"
      value={settings.theme}
      options={themeOptions}
      onchange={(v) => updateSetting('theme', v as ThemeOption)}
    />
  </SettingSection>

  <!-- Notifications Section -->
  <SettingSection title="Notifications" description="Configure desktop notification settings.">
    <SettingToggle
      label="Desktop Notifications"
      description="Show desktop notifications for new messages"
      checked={settings.notificationsEnabled}
      onchange={(v) => updateSetting('notificationsEnabled', v)}
    />
  </SettingSection>

  <!-- About Section -->
  <SettingSection title="About" description="osaI Dashboard information.">
    <div class="px-6 py-4">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-osai-text-primary">Version</span>
        <span class="text-sm text-osai-text-secondary">0.1.0</span>
      </div>
    </div>
    <div class="px-6 py-4">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-osai-text-primary">Dashboard</span>
        <a
          href="/"
          class="text-sm text-osai-primary-400 transition-colors hover:text-osai-primary-300"
        >
          Back to Chat
        </a>
      </div>
    </div>
  </SettingSection>
</div>
