/**
 * @osai/os-integration -- Platform detection utility
 *
 * Detects the current operating system (linux or windows).
 */

import type { Platform } from "./types.js";

/**
 * Detect the current platform.
 *
 * Returns "linux" or "windows" based on process.platform.
 * Throws if the platform is not supported by osaI v3.
 */
export function detectPlatform(): Platform {
  switch (process.platform) {
    case "linux":
      return "linux";
    case "win32":
      return "windows";
    default:
      throw new Error(
        `Unsupported platform: ${process.platform}. osaI v3 supports linux and windows only.`,
      );
  }
}

/**
 * Check if current platform is Linux.
 */
export function isLinux(): boolean {
  return process.platform === "linux";
}

/**
 * Check if current platform is Windows.
 */
export function isWindows(): boolean {
  return process.platform === "win32";
}
