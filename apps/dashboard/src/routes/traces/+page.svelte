<script lang="ts">
  /**
   * Traces page -- Agent Trace View.
   *
   * Uses TraceList and TokenUsage components from the shared component library.
   * All trace data is sourced from the traces store (bound to activeSession).
   */
  import { TraceList } from '../../lib/components';
</script>

<TraceList />
