import * as db from './db.js'
import { mergeSessionMessages } from './mergeSession.js'
import { fetchIndexWithOwner, fetchSessions, putSession } from './remote.js'
import type { Session } from './types.js'

export type SyncResult = {
  /** 云端有、本地没有，直接新增的会话数 */
  added: number
  /** 两边都有且云端带来新消息，按消息 id 并集补进来的会话数 */
  merged: number
  /** 实际从云端取回正文的会话数 */
  pulled: number
  /** 需同步但云端没给到正文（对象丢失）的会话数 */
  missing: number
  /** 本地比云端新、本次上传成功的会话数 */
  pushed: number
  /** 还要上传但本轮没赶上（留给下次同步继续）的会话数 */
  pendingPush: number
  /** 本次实际被改动的会话 id，调用方据此失效内存缓存 */
  touched: string[]
  /** 服务端回报的数据归属账号，用于界面显示 */
  owner: string
}

/** 服务端 /batch 单次最多 40 个 id */
const BATCH = 40
/**
 * 单轮最多上传多少个会话。
 *
 * 原先是硬上限 50：本地积压 2476 个会话时要手动点 50 次「立即同步」才能
 * 补齐，代价太大。改成「一轮走完、边推边报进度」——每推完一个就回调一次，
 * 界面能显示「已上传 X / 共 N」，用户点一次就够。
 * 仍保留分批推进的粒度，便于将来插限速或中断。
 */
const PUSH_CHUNK = 50

/**
 * 与云端双向对齐历史会话。
 *
 * 顺序是**先拉后推**：如果先推，本地某条更旧的副本可能覆盖云端较新的版本，
 * 再拉回来时虽然能靠消息并集救回来，但没必要多绕一圈。
 *
 * 合并口径与「导入历史对话 → 合并导入」完全一致：按会话 id 判断新老，
 * 同 id 时按消息 id 求并集，本地已有的消息一律保留（含分支选择），
 * 所以两台设备同时聊过同一个会话不会丢任何一方的消息。
 *
 * 附件说明：这里只同步会话结构，图片等原件仍留在各自的浏览器里
 * （官方导出的 ZIP 也只带图片原件，非图片附件本来就只存文件信息）。
 */
/** 同步的两个阶段：先从云端往下拉，再把本地较新的往上推 */
export type SyncPhase = 'pull' | 'push'

export const syncFromRemote = async (
  onProgress?: (phase: SyncPhase, done: number, total: number) => void
): Promise<SyncResult> => {
  const { items: index, owner } = await fetchIndexWithOwner(0)
  const local = await db.loadSessionSummaries()
  const localById = new Map(local.map((summary) => [summary.id, summary]))
  const remoteById = new Map(index.map((item) => [item.id, item]))

  const result: SyncResult = {
    added: 0,
    merged: 0,
    pulled: 0,
    missing: 0,
    pushed: 0,
    pendingPush: 0,
    touched: [],
    owner,
  }

  // ── 第一步：向下拉。只取本地没有的、或云端更新过的；两边一样就跳过，省流量 ──
  const need: string[] = []
  for (const item of index) {
    const mine = localById.get(item.id)
    if (!mine || item.updatedAt > mine.updatedAt) {
      need.push(item.id)
    }
  }
  for (let start = 0; start < need.length; start += BATCH) {
    const items = await fetchSessions(need.slice(start, start + BATCH))
    const got = new Set<string>()
    for (const { id, session } of items) {
      got.add(id)
      const mine = localById.has(id) ? await db.loadSession(id) : undefined
      if (!mine) {
        await db.saveSession(session)
        result.added += 1
        result.touched.push(id)
      } else {
        const combined = mergeSessionMessages(mine, session)
        if (combined) {
          await db.saveSession(combined)
          result.merged += 1
          result.touched.push(id)
        }
      }
      result.pulled += 1
    }
    // 索引里有、正文却取不到：多半是索引写了但正文没落地，计入缺失
    for (const id of need.slice(start, start + BATCH)) {
      if (!got.has(id)) {
        result.missing += 1
      }
    }
    onProgress?.('pull', Math.min(start + BATCH, need.length), need.length)
  }

  // ── 第二步：向上推。本地有、云端没有的，或本地更新的，都要传上去 ──
  // 刚拉下来合并过的会话已经从云端取过，updatedAt 不会比云端旧，这里不会重复推。
  const toPush = local.filter((summary) => {
    const remote = remoteById.get(summary.id)
    return !remote || summary.updatedAt > remote.updatedAt
  })
  for (let start = 0; start < toPush.length; start += PUSH_CHUNK) {
    const chunk = toPush.slice(start, start + PUSH_CHUNK)
    for (const summary of chunk) {
      const session = await db.loadSession(summary.id)
      if (!session) {
        continue
      }
      try {
        await putSession(session)
        result.pushed += 1
      } catch {
        // 单个失败不阻断整批；这个会话下次保存或下次同步会再推
      }
      onProgress?.('push', result.pushed, toPush.length)
    }
  }
  // 只有推送失败（putSession 抛错）的才算遗留；成功的都已落地
  result.pendingPush = Math.max(0, toPush.length - result.pushed)

  return result
}

/** 把一批本地会话推到云端，返回成功条数 */
export const pushLocalSessions = async (
  sessions: Session[],
  onProgress?: (done: number, total: number) => void
): Promise<number> => {
  let done = 0
  for (const session of sessions) {
    try {
      await putSession(session)
      done += 1
    } catch {
      // 同上：单个失败留给后续同步兜底
    }
    onProgress?.(done, sessions.length)
  }
  return done
}
