<script lang="ts">
  import type { RiskLevel } from './permissions/permission-actions';
  import { getRiskLabel, getRiskColorClass, getRiskBgClass } from './permissions/permission-actions';

  interface Props {
    level: RiskLevel;
  }

  let { level }: Props = $props();

  const label = $derived(getRiskLabel(level));
  const colorClass = $derived(getRiskColorClass(level));
  const bgClass = $derived(getRiskBgClass(level));
</script>

<span
  class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {colorClass} {bgClass}"
  data-testid="risk-badge"
  data-risk-level={level}
>
  {label}
</span>
