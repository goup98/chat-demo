import { getVisibleMessages } from './branches.js'
import type { AssistantMessage, Session } from './types.js'

const pad = (value: number) => String(value).padStart(2, '0')

/** 导出文件里记的是本地时间，和界面上看到的一致 */
const formatTime = (ms: number) => {
  const d = new Date(ms)
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

/**
 * 回答只导出正文与思考过程：思考默认收进 <details> 折叠块，
 * 服务端工具调用（搜索、读链接）不写进 Markdown，避免带出内部协议结构。
 */
const replyToMarkdown = (message: AssistantMessage): string => {
  const parts: string[] = []
  for (const block of message.blocks) {
    if (block.type === 'thinking') {
      const thinking = block.thinking.trim()
      if (thinking) {
        parts.push(`<details>\n<summary>思考过程</summary>\n\n${thinking}\n\n</details>`)
      }
    } else if (block.type === 'text') {
      const text = block.text.trim()
      if (text) {
        parts.push(text)
      }
    }
  }
  return parts.join('\n\n')
}

const sessionToMarkdown = (session: Session): string => {
  const lines: string[] = [`# ${session.title || '对话'}`, '', `> 导出时间：${formatTime(Date.now())}`, '']
  for (const message of getVisibleMessages(session)) {
    if (message.role === 'user') {
      lines.push('## 我', '')
      if (message.files.length > 0) {
        lines.push(`附件：${message.files.map((file) => file.name).join('、')}`, '')
      }
      const content = message.content.trim()
      if (content) {
        lines.push(content, '')
      }
    } else {
      lines.push('## DeepSeek', '')
      const body = replyToMarkdown(message)
      if (body) {
        lines.push(body, '')
      }
      if (message.error?.message) {
        lines.push(`> 本轮出错：${message.error.message}`, '')
      }
    }
  }
  return lines.join('\n')
}

/** 去掉各平台文件名不允许的字符，标题为空时用「对话」兜底 */
const toFileName = (title: string) => {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, '_').trim()
  return `${cleaned || '对话'}.md`
}

/** 把当前会话导出为 Markdown 文件并触发下载，返回文件名供调用方提示 */
export const exportSessionMarkdown = (session: Session): string => {
  const name = toFileName(session.title)
  const blob = new Blob([sessionToMarkdown(session)], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return name
}

/** 导出前判断当前会话是否有可导出的内容 */
export const hasExportableContent = (session: Session | undefined): session is Session =>
  Boolean(session && getVisibleMessages(session).length > 0)
