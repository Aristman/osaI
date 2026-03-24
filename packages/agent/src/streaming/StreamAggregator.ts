/**
 * @osai/agent -- StreamAggregator
 *
 * Accumulates streaming chunks into a final ModelResponse.
 * Tracks content, tool calls, usage, and finish state.
 *
 * @module streaming
 */

import type { StreamChunk, ModelResponse, ToolCall, TokenUsage } from '../types.js';

// ---------------------------------------------------------------------------
// StreamAggregator
// ---------------------------------------------------------------------------

export class StreamAggregator {
  private content = '';
  private toolCalls: ToolCall[] = [];
  private currentToolCall: Partial<ToolCall> | null = null;
  private usage: TokenUsage | null = null;
  private finishReason: ModelResponse['finishReason'] | null = null;
  private complete = false;
  private hasError = false;

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Process a single stream chunk.
   *
   * Accumulates content and tool calls. On 'done', marks
   * the stream as complete. On 'error', flags error state.
   */
  processChunk(chunk: StreamChunk): void {
    switch (chunk.type) {
      case 'content': {
        if (chunk.content) {
          this.content += chunk.content;
        }
        break;
      }

      case 'tool_call': {
        if (chunk.toolCall) {
          // Finalize previous partial tool call if any
          if (this.currentToolCall && chunk.toolCall.id) {
            const finalized = this.finalizeToolCall(this.currentToolCall);
            if (finalized) {
              this.toolCalls.push(finalized);
            }
            this.currentToolCall = null;
          }

          if (chunk.toolCall.id && chunk.toolCall.name) {
            // Complete tool call in a single chunk -- finalize immediately
            const finalized = this.finalizeToolCall(chunk.toolCall);
            if (finalized) {
              this.toolCalls.push(finalized);
            }
          } else if (chunk.toolCall.id) {
            // New tool call started but incomplete
            this.currentToolCall = { ...chunk.toolCall };
          } else if (this.currentToolCall) {
            // Accumulate parameters into current tool call
            if (chunk.toolCall.parameters) {
              this.currentToolCall.parameters = {
                ...(this.currentToolCall.parameters ?? {}),
                ...chunk.toolCall.parameters,
              };
            }
          }
        }
        break;
      }

      case 'done': {
        // Finalize any pending tool call
        if (this.currentToolCall) {
          const finalized = this.finalizeToolCall(this.currentToolCall);
          if (finalized) {
            this.toolCalls.push(finalized);
          }
          this.currentToolCall = null;
        }

        if (chunk.usage) {
          this.usage = chunk.usage;
        }

        if (this.toolCalls.length > 0) {
          this.finishReason = 'tool_calls';
        } else if (this.hasError) {
          this.finishReason = 'error';
        } else {
          this.finishReason = 'stop';
        }

        this.complete = true;
        break;
      }

      case 'error': {
        this.hasError = true;
        break;
      }
    }
  }

  /**
   * Get the final aggregated ModelResponse.
   */
  getResponse(): ModelResponse {
    return {
      content: this.content,
      toolCalls: this.toolCalls.length > 0 ? this.toolCalls : undefined,
      usage: this.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: this.finishReason ?? 'stop',
    };
  }

  /**
   * Get the accumulated content string.
   */
  getContent(): string {
    return this.content;
  }

  /**
   * Get all collected tool calls.
   */
  getToolCalls(): ToolCall[] {
    return [...this.toolCalls];
  }

  /**
   * Check if the stream has received a 'done' chunk.
   */
  isComplete(): boolean {
    return this.complete;
  }

  /**
   * Reset all internal state.
   */
  reset(): void {
    this.content = '';
    this.toolCalls = [];
    this.currentToolCall = null;
    this.usage = null;
    this.finishReason = null;
    this.complete = false;
    this.hasError = false;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private finalizeToolCall(partial: Partial<ToolCall>): ToolCall | null {
    if (!partial.name) {
      return null;
    }

    return {
      id: partial.id ?? `tc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: partial.name,
      parameters: partial.parameters ?? {},
    };
  }
}
