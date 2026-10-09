/**
 * Types for `manifest.mjs`, which stays JavaScript so plain Node scripts can import
 * it. `tsc` has `allowJs: false`, so `vite.config.ts` needs this file to import it.
 */

export type Target = 'chrome' | 'firefox'

export declare const TARGETS: readonly Target[]
export declare const GECKO_ID: string
export declare const GECKO_MIN_VERSION: string
export declare const DATA_COLLECTION: { required: string[]; optional?: string[] }

export declare function buildManifest(target: Target, version: string): Record<string, unknown>
