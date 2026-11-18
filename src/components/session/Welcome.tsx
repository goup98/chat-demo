import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import { ChatInput } from '../chatInput/ChatInput.js'
import { MobileHeader } from './MobileHeader.js'
import styles from './Welcome.module.css'

/**
 * 版本标识。
 * 页面这边是构建时间；App 版本由 APK 写进 User-Agent（... DeepSeekChat/2.0），
 * 只有在 WebView 里才读得到。用户分不清自己装的是哪一版，显示出来省得来回问。
 */
const buildLabel = () => {
  const app = navigator.userAgent.match(/DeepSeekChat\/([\d.]+)/)
  return `${app ? `App ${app[1]}` : '浏览器'} · 页面 ${__BUILD_ID__}`
}

/** 新对话：问候语 + 输入框。桌面端居中；移动端输入框吸底 */
export const Welcome = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  return (
    <div className={styles.container}>
      {isMobile ? <MobileHeader /> : null}
      <div className={styles.welcome}>
        {/* 官方 App 欢迎页中央是蓝色鲸鱼；网页版原来只有一行问候语。
            资源取自官方 favicon（本就是透明底、#4D6BFE 单色），随构建带进 dist。 */}
        <img className={styles.logo} src="logo-96.png" alt="" aria-hidden="true" />
        <div className={styles.greeting}>{t('welcomeMessageChat250808')}</div>
        <ChatInput sessionId={null} />
        {isMobile ? <div className={styles.caveat}>{t('contentCaveat')}</div> : null}
        <div className={styles.buildId}>{buildLabel()}</div>
      </div>
    </div>
  )
}
