/**
 * Barrel exports for all UI components.
 */

// Chat components
export { default as ChatMessage } from './ChatMessage.svelte';
export { default as ChatInput } from './ChatInput.svelte';
export { default as ChatArea } from './ChatArea.svelte';
export { renderMarkdown } from './render-markdown';
export { generateMessageId, formatTimestamp } from './chat-utils';

// Trace View components
export { default as TraceList } from './traces/TraceList.svelte';
export { default as TraceEntry } from './traces/TraceEntry.svelte';
export { default as TraceTimeline } from './traces/TraceTimeline.svelte';
export { default as TokenUsage } from './traces/TokenUsage.svelte';
export {
  formatDuration,
  formatTokens,
  formatCost,
  computeTokenSummary,
  extractToolNames,
  filterByStatus,
  filterByToolName
} from './traces/trace-utils';
export type { TokenSummary, StatusFilter } from './traces/trace-utils';

// Permission components
export { default as RiskBadge } from './RiskBadge.svelte';
export { default as PermissionPrompt } from './PermissionPrompt.svelte';
export { default as PermissionList } from './PermissionList.svelte';

// Permission utilities
export {
  getRiskLabel,
  getRiskColorClass,
  getRiskBgClass,
  getRiskBorderClass,
  getActionCategory,
  formatParams,
  truncateParams,
  getPermissionSummary,
  createPermissionActions
} from './permissions/permission-actions';
export type { PermissionActions } from './permissions/permission-actions';

// System Status components
export { default as SystemStatus } from './status/SystemStatus.svelte';
export { default as StatusCard } from './status/StatusCard.svelte';
export { default as HealthIndicator } from './status/HealthIndicator.svelte';

// System Status utilities
export {
  getUsageColorClass,
  getUsageBgClass,
  getUsageBarBgClass,
  getUsageBorderClass,
  getHealthColorClass,
  getHealthLabel,
  getHealthTextClass,
  formatBytes,
  formatUptime,
  formatCpuSpeed,
  formatPercent,
  computeHealthStatus,
  detectTrend,
  getTrendIndicator
} from './status/status-utils';
export type {
  CpuInfo,
  MemoryInfo,
  DiskInfo,
  SystemInfo,
  HealthStatus,
  SystemStatusData,
  TrendDirection
} from './status/status-utils';

// Memory Search components
export { default as MemorySearch } from './memory/MemorySearch.svelte';
export { default as MemoryResult } from './memory/MemoryResult.svelte';
export { default as MemoryFilters } from './memory/MemoryFilters.svelte';

// Memory Search utilities
export {
  getCategoryLabel,
  getCategoryColorClass,
  getConfidencePercentage,
  getConfidenceColorClass,
  formatMemoryDate,
  truncateContent,
  MEMORY_CATEGORIES
} from './memory/memory-utils';
export type { MemoryCategory, MemorySearchResult, MemorySearchResponse, MemoryCategoryOption } from './memory/memory-utils';

// Sidebar components
export { default as Sidebar } from './sidebar/Sidebar.svelte';
export { default as SidebarNav } from './sidebar/SidebarNav.svelte';
export { default as SessionList } from './sidebar/SessionList.svelte';
export { default as SessionItem } from './sidebar/SessionItem.svelte';
export { default as NewSessionButton } from './sidebar/NewSessionButton.svelte';

// Settings components
export { default as SettingsPage } from './SettingsPage.svelte';
export { default as SettingSection } from './SettingSection.svelte';
export { default as SettingToggle } from './SettingToggle.svelte';
export { default as SettingInput } from './SettingInput.svelte';
export { default as SettingSelect } from './SettingSelect.svelte';
