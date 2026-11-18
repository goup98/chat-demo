import clsx from 'clsx'
import { useRef } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { IconMicFill16, IconMicOutline16 } from '../base/icons.js'
import { Tooltip } from '../base/Tooltip.js'
import type { VoiceInputStatus } from './useVoiceInput.js'
import styles from './VoiceButton.module.css'

/**
 * 语音输入按钮。
 * 录音中为两层圆：外层半透明光圈 + 内层实心品牌色；
 * 外层先展开、内层随后放大，之后外层按固定节奏呼吸，与音量无关。
 * 按钮左侧显示「录音中 Ns」，窄屏不展示读秒。
 */
export const VoiceButton = ({
  status,
  disabled = false,
  seconds,
  onClick,
  onHoldStart,
  onHoldEnd,
}: {
  status: VoiceInputStatus
  /** 非安全上下文中按钮置灰，tooltip 提示录音需要 HTTPS */
  disabled?: boolean
  /** 本次录音已录秒数，录音中显示在按钮左侧 */
  seconds: number
  onClick: () => void
  /** 按住说话：按下即开始录音（未传则退化为点击切换） */
  onHoldStart?: () => void
  /** 按住说话：松手结束并转写 */
  onHoldEnd?: () => void
}) => {
  const t = useTranslate()
  // pointerdown 已经处理过一次的话，浏览器随后补发的 click 要忽略，
  // 否则松手瞬间会「结束录音 → 又开始录音」，按钮永远停在录音中
  const holdHandled = useRef(false)
  const recording = status === 'recording'

  const label = disabled
    ? t('voiceInputRequiresHttps')
    : recording
      ? t('voiceInputStop')
      : status === 'transcribing'
        ? t('voiceInputCancel')
        : t('voiceInput')

  return (
    <>
      {recording ? <span className={styles.timer}>{t('voiceInputTimer', { seconds })}</span> : null}
      <Tooltip content={label}>
        <button
          type="button"
          className={clsx(
            styles.button,
            recording && styles.recording,
            disabled && styles.disabled
          )}
          aria-label={label}
          aria-pressed={recording}
          aria-disabled={disabled}
          onPointerDown={(event) => {
            if (disabled || !onHoldStart) {
              return
            }
            holdHandled.current = true
            // 捕获指针：手指滑出按钮再松开时仍能收到 pointerup，
            // 不捕获的话会一直停在录音状态
            try {
              event.currentTarget.setPointerCapture(event.pointerId)
            } catch {
              // 老内核不支持捕获时忽略，靠 pointercancel 兜底
            }
            onHoldStart()
          }}
          onPointerUp={() => {
            if (onHoldEnd) {
              onHoldEnd()
            }
          }}
          onPointerCancel={() => {
            if (onHoldEnd) {
              onHoldEnd()
            }
          }}
          onClick={() => {
            if (holdHandled.current) {
              holdHandled.current = false
              return
            }
            if (!disabled) {
              onClick()
            }
          }}
        >
          {recording ? (
            <span className={styles.active}>
              <span className={styles.halo} />
              <span className={styles.core} />
              <span className={styles.outline}>
                <IconMicOutline16 />
              </span>
              <span className={styles.glyph}>
                <IconMicFill16 />
              </span>
            </span>
          ) : status === 'transcribing' ? (
            <span className={styles.loading} />
          ) : (
            <IconMicOutline16 />
          )}
        </button>
      </Tooltip>
    </>
  )
}
