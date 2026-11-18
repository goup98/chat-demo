import { useCallback, useEffect, useRef, useState } from 'react'
import type { TranslationMessage } from '../../i18n/index.js'
import { ApiError } from '../../services/api/client.js'
import { transcribe } from '../../services/api/speech.js'
import { startRecording, type Recording } from '../../services/speech/recorder.js'
import { useSettings } from '../../services/settings.js'
import { showToast } from '../base/toastState.js'

export type VoiceInputStatus = 'idle' | 'recording' | 'transcribing'

/**
 * 录音依赖 getUserMedia，只在安全上下文可用（HTTPS、localhost、file://）。
 * 普通 HTTP 页面上直接禁用入口，避免点击后必然失败。
 */
const AVAILABLE = typeof window === 'undefined' || window.isSecureContext

/** 录音失败时附带的环境信息：WebView 里缺哪一项一看就知道 */
const envHint = () => {
  if (typeof window === 'undefined') {
    return ''
  }
  const mediaDevices = typeof navigator !== 'undefined' && !!navigator.mediaDevices
  const gum = mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function'
  const AudioCtx =
    typeof window.AudioContext !== 'undefined' ||
    typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !== 'undefined'
  return (
    `［secure=${String(window.isSecureContext)}` +
    ` mediaDevices=${mediaDevices}` +
    ` getUserMedia=${gum}` +
    ` AudioContext=${AudioCtx}］`
  )
}

const describeRecordingError = (error: unknown): TranslationMessage | string => {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return { key: 'voiceInputPermissionDenied' }
    }
    if (error.name === 'NotFoundError') {
      return { key: 'voiceInputNoDevice' }
    }
    return `录音失败（${error.name}）：${error.message.slice(0, 60)} ${envHint()}`
  }
  if (error instanceof Error) {
    return `录音失败（${error.name}）：${error.message.slice(0, 60)} ${envHint()}`
  }
  // Android WebView 抛出的常常既不是 DOMException 也不是标准 Error，
  // 原来这种情况一律退回「语音识别失败，请稍后再试」，等于把真正原因吞了。
  let raw = ''
  try {
    raw = typeof error === 'string' ? error : JSON.stringify(error) ?? String(error)
  } catch {
    raw = String(error)
  }
  return `录音失败（未知类型 ${typeof error}）：${raw.slice(0, 60)} ${envHint()}`
}

/**
 * 转写失败的详细原因。
 * 原来只有「语音识别失败」五个字，看不出是录音没采到声音、网络断了、
 * 还是服务端拒了这段音频 —— 手机上排查全靠猜。这里把状态码和错误名带出来。
 */
const describeTranscriptError = (error: unknown): TranslationMessage | string => {
  if (error instanceof ApiError) {
    // 有 status 说明请求真的到了服务端：401 Key 无效 / 402 余额不足 /
    // 400 音频格式或内容被拒
    const tag = error.status ? `HTTP ${error.status}` : error.kind
    return `语音识别失败（${tag}）：${error.message.slice(0, 70)}`
  }
  if (error instanceof Error) {
    // TypeError: Failed to fetch 多半是网络不通或被 CORS 拦了
    return `语音识别失败（${error.name}）：${error.message.slice(0, 70)}`
  }
  // 走到这里说明抛出来的根本不是 Error 对象（某些 WebView 会这样）。
  // 原来这种情况直接退回「请稍后再试」，等于什么都没告诉用户 ——
  // 现在把原始值硬转成字符串吐出来，至少能看出是啥。
  let raw = ''
  try {
    raw = typeof error === 'string' ? error : JSON.stringify(error) ?? String(error)
  } catch {
    raw = String(error)
  }
  return `语音识别失败（未知类型 ${typeof error}）：${raw.slice(0, 70)}`
}

/**
 * 语音输入（oneshot）：点击开始录音，再次点击结束并转写，结果交给 onText 填入输入框。
 * 转写中再次点击取消。录满 120 秒自动结束。
 */
export const useVoiceInput = (onText: (text: string) => void) => {
  const [status, setStatus] = useState<VoiceInputStatus>('idle')
  /** 本次录音已录秒数，只在录音中递增 */
  const [seconds, setSeconds] = useState(0)
  const recordingRef = useRef<Recording | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const operationRef = useRef(0)
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const cancelOperation = useCallback(() => {
    operationRef.current++
    recordingRef.current?.cancel()
    recordingRef.current = null
    controllerRef.current?.abort()
    controllerRef.current = null
  }, [])

  const cancel = useCallback(() => {
    cancelOperation()
    setStatus('idle')
  }, [cancelOperation])

  const finish = useCallback(async () => {
    const recording = recordingRef.current
    if (!recording) {
      // 仍在等待麦克风授权时也允许取消；迟到的录音对象会立即释放。
      cancel()
      return
    }
    const operation = operationRef.current
    recordingRef.current = null
    let controller: AbortController | null = null
    try {
      let audio: Blob | null
      try {
        audio = await recording.stop()
      } finally {
        recording.cancel()
      }
      if (operationRef.current !== operation || !audio) {
        return
      }
      controller = new AbortController()
      controllerRef.current = controller
      setStatus('transcribing')
      const text = await transcribe(useSettings.getState().apiKey ?? '', audio, controller.signal)
      if (controller.signal.aborted || operationRef.current !== operation) {
        return
      }
      if (text.trim()) {
        onTextRef.current(text.trim())
      } else {
        showToast({ key: 'voiceInputEmpty' })
      }
    } catch (error) {
      if (operationRef.current === operation && !controller?.signal.aborted) {
        showToast(describeTranscriptError(error))
      }
    } finally {
      if (operationRef.current === operation) {
        controllerRef.current = null
        setStatus('idle')
      }
    }
  }, [cancel])

  /** 开始录音。按住说话用这个：按下即调用，松手调 stop()。 */
  const start = useCallback(async () => {
    if (!AVAILABLE || status !== 'idle') {
      return
    }
    const operation = ++operationRef.current
    setStatus('recording')
    try {
      const recording = await startRecording(() => {
        if (operationRef.current === operation) {
          showToast({ key: 'voiceInputLimitReached' })
          void finish()
        }
      })
      if (operationRef.current !== operation) {
        recording.cancel()
        return
      }
      recordingRef.current = recording
    } catch (error) {
      if (operationRef.current === operation) {
        setStatus('idle')
        showToast(describeRecordingError(error))
      }
    }
  }, [status, finish])

  /** 结束录音并转写。按住说话松手时调用。 */
  const stop = useCallback(async () => {
    if (status === 'recording') {
      await finish()
    }
  }, [status, finish])

  /** 点击切换（桌面端与键盘操作仍走这条） */
  const toggle = useCallback(async () => {
    if (!AVAILABLE) {
      return
    }
    if (status === 'recording') {
      await finish()
      return
    }
    if (status === 'transcribing') {
      cancel()
      return
    }
    await start()
  }, [status, finish, cancel, start])

  useEffect(() => {
    if (status !== 'recording') {
      return
    }
    const startedAt = Date.now()
    setSeconds(0)
    // 半秒刷新一次，让显示的秒数与实际录音时长保持一致
    const timer = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 500)
    return () => clearInterval(timer)
  }, [status])

  useEffect(() => cancelOperation, [cancelOperation])

  /** 当前录音的频谱分析节点，未录音时为 null */
  const getAnalyser = useCallback(() => recordingRef.current?.analyser ?? null, [])

  return { status, seconds, getAnalyser, toggle, start, stop, cancel, available: AVAILABLE }
}
