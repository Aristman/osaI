<script lang="ts">
  /**
   * Navigation items for the sidebar.
   * Displays links to all main routes with icons and active state highlighting.
   */
  import { page } from '$app/stores';

  interface NavItem {
    label: string;
    href: string;
    icon: string;
  }

  const navItems: NavItem[] = [
    {
      label: 'Chat',
      href: '/',
      icon: 'chat'
    },
    {
      label: 'Sessions',
      href: '/sessions',
      icon: 'sessions'
    },
    {
      label: 'Traces',
      href: '/traces',
      icon: 'traces'
    },
    {
      label: 'Memory',
      href: '/memory',
      icon: 'memory'
    },
    {
      label: 'Status',
      href: '/status',
      icon: 'status'
    },
    {
      label: 'Settings',
      href: '/settings',
      icon: 'settings'
    }
  ];
</script>

<nav class="flex-1 overflow-y-auto px-2 py-2">
  <p class="px-2 py-1 text-xs font-medium uppercase tracking-wider text-osai-text-muted">
    Navigation
  </p>
  <ul class="space-y-0.5">
    {#each navItems as item}
      {@const isActive = $page.url.pathname === item.href ||
        (item.href !== '/' && $page.url.pathname.startsWith(item.href))}
      <li>
        <a
          href={item.href}
          class="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors {isActive
            ? 'bg-osai-primary-600/20 text-osai-primary-400'
            : 'text-osai-text-secondary hover:bg-osai-surface-700 hover:text-osai-text-primary'}"
          aria-current={isActive ? 'page' : undefined}
        >
          {#if item.icon === 'chat'}
            <!-- Chat icon -->
            <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          {:else if item.icon === 'sessions'}
            <!-- Sessions icon (layers) -->
            <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
              <polyline points="2 17 12 22 22 17"></polyline>
              <polyline points="2 12 12 17 22 12"></polyline>
            </svg>
          {:else if item.icon === 'traces'}
            <!-- Traces icon (activity) -->
            <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
          {:else if item.icon === 'memory'}
            <!-- Memory icon (database) -->
            <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
            </svg>
          {:else if item.icon === 'status'}
            <!-- Status icon (activity pulse) -->
            <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
            </svg>
          {:else if item.icon === 'settings'}
            <!-- Settings icon (cog) -->
            <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          {/if}
          <span>{item.label}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>
