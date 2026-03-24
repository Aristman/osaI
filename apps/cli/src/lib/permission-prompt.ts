/**
 * Permission Prompt -- interactive prompt for permission requests
 *
 * Displays tool name, action, params, risk level and collects y/N response.
 */

import type { PermissionRequest } from '@osai/types';
import * as readline from 'node:readline';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PermissionPromptOptions {
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  timeout?: number; // ms, default 30_000
}

export interface PermissionDecision {
  approved: boolean;
  requestId: string;
}

// ---------------------------------------------------------------------------
// ANSI color helpers
// ---------------------------------------------------------------------------

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function riskColor(level: string): string {
  switch (level) {
    case 'high': return RED;
    case 'medium': return YELLOW;
    case 'low': return GREEN;
    default: return RESET;
  }
}

function truncate(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen - 3) + '...';
}

// ---------------------------------------------------------------------------
// renderPermissionRequest
// ---------------------------------------------------------------------------

export function renderPermissionRequest(request: PermissionRequest): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`${BOLD}Permission Required${RESET}`);
  lines.push(`  Tool:     ${request.tool}`);
  lines.push(`  Action:   ${request.action}`);
  lines.push(`  Risk:     ${riskColor(request.risk_level)}${request.risk_level.toUpperCase()}${RESET}`);

  const paramStr = truncate(JSON.stringify(request.params, null, 2), 200);
  lines.push(`  Params:   ${DIM}${paramStr}${RESET}`);
  lines.push('');
  lines.push(`  ${BOLD}Approve? [y/N]:${RESET} `);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// promptPermission
// ---------------------------------------------------------------------------

export async function promptPermission(
  request: PermissionRequest,
  options?: PermissionPromptOptions,
): Promise<PermissionDecision> {
  const rl = readline.createInterface({
    input: options?.stdin ?? process.stdin,
    output: options?.stdout ?? process.stdout,
  });

  const timeout = options?.timeout ?? 30_000;

  return new Promise<PermissionDecision>((resolve) => {
    const output = options?.stdout ?? process.stdout;
    output.write(renderPermissionRequest(request));

    const timer = setTimeout(() => {
      rl.close();
      output.write(`${RED}Timeout -- denied${RESET}\n`);
      resolve({ approved: false, requestId: request.request_id });
    }, timeout);

    const cleanup = () => {
      clearTimeout(timer);
    };

    rl.question('', (answer) => {
      cleanup();
      rl.close();
      const normalized = answer.trim().toLowerCase();
      const approved = normalized === 'y' || normalized === 'yes';
      output.write(approved ? `${GREEN}Approved${RESET}\n` : `${RED}Denied${RESET}\n`);
      resolve({ approved, requestId: request.request_id });
    });

    rl.on('close', () => {
      cleanup();
    });
  });
}

// ---------------------------------------------------------------------------
// promptPermissionMultiple
// ---------------------------------------------------------------------------

export async function promptPermissionMultiple(
  requests: PermissionRequest[],
  options?: PermissionPromptOptions,
): Promise<PermissionDecision[]> {
  const results: PermissionDecision[] = [];
  for (const request of requests) {
    const decision = await promptPermission(request, options);
    results.push(decision);
    if (!decision.approved) {
      // Stop processing remaining requests if one is denied
      break;
    }
  }
  return results;
}
