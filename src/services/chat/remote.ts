import type { Session } from './types.js'

/**
 * 云同步的 HTTP 客户端。后端是本站自己的 Worker（/api/chat/*），
 * 正文存 R2、索引存 D1，走与站点页面相同的 Basic 密码关，
 * 所以这里用同源绝对路径，并把凭据一起带上。
 */
const API = '/api/chat'

/** 索引条目：列表和增量判断都靠它，不含正文 */
export type RemoteIndexItem = {
  id: string
  title: string
  msgCount: number
  bytes: number
  createdAt: number
  updatedAt: number
}

/** 同步被拒绝时抛这个，调用方据此提示用户而不是静默重试 */
export class SyncError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

const request = async (path: string, init?: RequestInit): Promise<Response> => {
  let response: Response
  try {
    response = await fetch(API + path, { credentials: 'same-origin', ...init })
  } catch (error) {
    throw new SyncError(error instanceof Error ? error.message : String(error), 0)
  }
  if (!response.ok) {
    throw new SyncError(`sync ${response.status}`, response.status)
  }
  return response
}

/** 拉索引。since > 0 时只取该毫秒时间之后更新过的会话，用于增量。 */
export const fetchIndex = async (since = 0): Promise<RemoteIndexItem[]> => {
  const { items } = await fetchIndexWithOwner(since)
  return items
}

/** 同 fetchIndex，但把服务端回报的 owner（数据归属账号）一起带回 */
export const fetchIndexWithOwner = async (
  since = 0
): Promise<{ items: RemoteIndexItem[]; owner: string }> => {
  const response = await request(`/index${since > 0 ? `?since=${since}` : ''}`)
  const data = (await response.json()) as { items?: RemoteIndexItem[]; owner?: string }
  return { items: data.items ?? [], owner: data.owner ?? '' }
}

/** 批量取正文；不存在的 id 由服务端跳过，不报错 */
export const fetchSessions = async (
  ids: string[]
): Promise<{ id: string; session: Session }[]> => {
  if (ids.length === 0) {
    return []
  }
  const query = ids.map(encodeURIComponent).join(',')
  const response = await request(`/batch?ids=${query}`)
  const data = (await response.json()) as { items?: { id: string; session: Session }[] }
  return data.items ?? []
}

export const putSession = async (session: Session): Promise<void> => {
  await request(`/session/${encodeURIComponent(session.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(session),
  })
}

export const deleteSession = async (id: string): Promise<void> => {
  await request(`/session/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** 探测服务端是否可用（首次同步前用，避免没配后端时反复报错） */
export const ping = async (): Promise<boolean> => {
  try {
    await fetchIndex(0)
    return true
  } catch {
    return false
  }
}
