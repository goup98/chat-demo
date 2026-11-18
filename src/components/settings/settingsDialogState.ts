import { create } from 'zustand'
import { showToast } from '../base/toastState.js'
import { useSettings } from '../../services/settings.js'

/** 设置弹窗的分组：通用设置 / 数据管理 */
export type SettingsSection = 'general' | 'data'

/** 设置弹窗：侧边栏底部、没有 API Key 时的操作与 401 提示都可以打开；section 为打开时选中的分组 */
export const useSettingsDialog = create(() => ({
  open: false,
  section: 'general' as SettingsSection,
}))

export const openSettings = (section: SettingsSection) =>
  useSettingsDialog.setState({ open: true, section })

export const closeSettings = () => useSettingsDialog.setState({ open: false })

/** 没有 API Key 时打开设置并选中 API Key 所在的「数据管理」，返回是否已有 Key */
export const ensureApiKey = () => {
  if (useSettings.getState().apiKey) {
    return true
  }
  // 只把设置窗口弹出来、不说原因的话，用户点麦克风或回形针时看到设置自己
  // 跳出来，会以为按钮坏了。（语音转写和文件上传都要拿 Key 调接口，所以
  // 两个按钮都卡这一关。）
  showToast({ key: 'apiKeyRequired' })
  openSettings('data')
  return false
}
