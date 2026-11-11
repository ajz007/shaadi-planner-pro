import { createContext, useContext, useMemo } from 'react'

type WorkspaceFetch = (url: string, options?: RequestInit) => Promise<Response>
const liveFetch: WorkspaceFetch = (url, options) => fetch(url, options)

export const WorkspacePreview = createContext<WorkspaceFetch | null>(null)

export function useWorkspaceData() {
  const preview = useContext(WorkspacePreview)
  const fetchWorkspace = preview ?? liveFetch
  return useMemo(() => ({
    preview: preview !== null,
    fetchWorkspace,
    request: createWorkspaceRequest(fetchWorkspace),
  }), [preview, fetchWorkspace])
}

function createWorkspaceRequest(fetchWorkspace: WorkspaceFetch) {
  return async function request<T>(path: string, body?: object, signal?: AbortSignal): Promise<T> {
    const result = await fetchWorkspace('/api/workspace' + path, body === undefined ? { signal } : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (result.status === 204) return undefined as T
    const data = await result.json()
    if (!result.ok) throw new Error(data.error || 'The workspace request could not be completed.')
    return data
  }
}

export const workspaceRequest = createWorkspaceRequest(liveFetch)
