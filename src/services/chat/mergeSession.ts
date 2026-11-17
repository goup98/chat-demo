import type { Session } from './types.js'

/**
 * 同 id 会话的合并：两台设备用过同一个会话时，id 相同但消息数不同。
 * 这里按消息 id 求并集——消息 id 是随机 UUID，同一条消息在两份归档里 id 一致，
 * 所以并集不会重复；本地已有的消息一律保留原样（内容、状态、分支都不动），
 * 只追加归档里本地没有的消息。返回 null 表示归档没有带来任何新内容。
 *
 * 分支处理：归档里新增的消息自带 parentId，指向的父消息在本地同样存在，
 * 因此直接沿用即可挂回原来的分支树。另外若本地某条消息在归档里的
 * selectedChildId 指向新增消息，说明那台设备切到了新分支，跟随归档的选择。
 */
export const mergeSessionMessages = (local: Session, incoming: Session): Session | null => {
  const localIds = new Set(local.messages.map((message) => message.id))
  const extra = incoming.messages.filter((message) => !localIds.has(message.id))
  if (extra.length === 0) {
    return null
  }
  const extraIds = new Set(extra.map((message) => message.id))
  const incomingById = new Map(incoming.messages.map((message) => [message.id, message]))
  const kept = local.messages.map((message) => {
    const source = incomingById.get(message.id)
    const branch = source?.selectedChildId
    if (branch && extraIds.has(branch) && message.selectedChildId !== branch) {
      return { ...message, selectedChildId: branch }
    }
    return message
  })
  // messages 约定按创建顺序存放，合并后重新排序才能让新消息出现在原本的位置上。
  const messages = [...kept, ...extra].sort((left, right) => left.createdAt - right.createdAt)
  return {
    ...local,
    messages,
    updatedAt: Math.max(local.updatedAt, incoming.updatedAt),
    // 本地还没定根（空会话）时用归档的根，否则新增消息会挂不上分支树。
    rootMessageId: local.rootMessageId ?? incoming.rootMessageId,
  }
}
