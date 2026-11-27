// The shared invitation model uses Vite's import.meta.glob to find templates.
// The video project only imports its types, but TypeScript still checks it.
interface ImportMeta {
  glob<T = unknown>(pattern: string, options?: { eager?: boolean; import?: string }): Record<string, T>
}
declare module '*.css'
