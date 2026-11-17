import {
  IconMenuOutline20,
  IconNewChatOutline20,
  IconVolumeOffOutline20,
  IconVolumeOutline20,
} from '../base/icons.js'
import { useTranslate } from '../../i18n/index.js'
import { newChat } from '../../services/chat/store.js'
import { setAutoReadAloud, useSettings } from '../../services/settings.js'
import { unlockReadAloudAudio } from '../../services/speech/readAloud.js'
import { IconButton } from '../base/IconButton.js'
import { openMobileSider } from '../sider/mobileSiderState.js'
import styles from './MobileHeader.module.css'

/**
 * 移动端顶栏。
 * 欢迎页（title 未传）：左侧菜单 + 右侧自动朗读开关、新建对话。
 * 会话页：左侧菜单 + 中间标题 + 右侧新建对话。
 */
export const MobileHeader = ({ title }: { title?: string }) => {
  const t = useTranslate()
  const autoRead = useSettings((state) => state.autoReadAloud)

  const toggleAutoRead = () => {
    // 必须在这次点击里同步解锁音频：浏览器只允许在用户手势中创建
    // AudioContext，错过这里，之后回复结束时的自动朗读就是静音的。
    if (!autoRead) {
      unlockReadAloudAudio()
    }
    setAutoReadAloud(!autoRead)
  }

  return (
    <div className={styles.header}>
      <IconButton
        size="xl"
        tone="primary"
        icon={<IconMenuOutline20 />}
        aria-label={t('expandSiderbarButton')}
        onClick={openMobileSider}
      />
      {title === undefined ? (
        <div className={styles.actions}>
          <IconButton
            size="xl"
            tone="primary"
            icon={autoRead ? <IconVolumeOutline20 /> : <IconVolumeOffOutline20 />}
            aria-label={autoRead ? t('autoReadAloudOff') : t('autoReadAloudOn')}
            onClick={toggleAutoRead}
          />
          <IconButton
            size="xl"
            tone="primary"
            icon={<IconNewChatOutline20 />}
            aria-label={t('newChat')}
            onClick={newChat}
          />
        </div>
      ) : (
        <>
          <div className={styles.title}>{title}</div>
          <IconButton
            size="xl"
            tone="primary"
            icon={<IconNewChatOutline20 />}
            aria-label={t('newChat')}
            onClick={newChat}
          />
        </>
      )}
    </div>
  )
}
