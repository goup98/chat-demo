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

/** 一条搜索结果。snip 里命中的关键词由服务端用 << >> 包起来，前端据此高亮 */
export type SearchHit = {
  id: string
  title: string
  snip: string
  rank: number
}

/**
 * 全文搜索会话。
 *
 * 服务端有两种模式，前端不需要关心：查询词 3 个字符以上走 FTS5（trigram），
 * 2 个字符及以下降级成 LIKE（trigram 最少 3 字符才建得出索引）。
 * 响应里的 mode 字段只用于排查，UI 不依赖它。
 */
export const searchSessions = async (q: string, limit = 40): Promise<SearchHit[]> => {
  const query = q.trim()
  if (!query) {
    return []
  }
  const res = await request(`/search?q=${encodeURIComponent(query)}&limit=${limit}`)
  const data = (await res.json()) as { items?: SearchHit[] }
  return data.items ?? []
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
    // 以前只抛 `sync 401` 这种，用户看到完全不知道发生了什么 —— 分不清是
    // 密码问题、路径不对还是服务端崩了。现在把「哪个接口 + 状态码含义 +
    // 服务端返回的原文」一起带出去。
    let detail = ''
    try {
      detail = (await response.text()).trim().slice(0, 200)
    } catch {
      // 响应体读不出来就只报状态码
    }
    const hint =
      response.status === 401
        ? '需要访问密码，或密码已失效'
        : response.status === 403
          ? '没有权限访问该数据'
          : response.status === 404
            ? '接口不存在（Worker 可能未部署最新版）'
            : response.status === 429
              ? '请求过于频繁，稍后再试'
              : response.status >= 500
                ? '服务端错误'
                : '请求失败'
    throw new SyncError(
      `${path} → HTTP ${response.status}（${hint}）${detail ? `：${detail}` : ''}`,
      response.status
    )
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
