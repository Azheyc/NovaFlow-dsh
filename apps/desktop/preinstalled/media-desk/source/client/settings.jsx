// NovaFlow 设置：存储位置、成稿默认、配图数量、分镜格数和分辨率。生图模型在 NovaFlow「设置 → 模型」里选。
import React from 'react'
import { saveSettings, setDesk, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { Dialog, Icon } from './ui.jsx'

/** 打开系统的文件夹选择窗口；网页版没有原生窗口时返回 undefined。 */
export function pickFolder() {
  const picker = globalThis.__DSH_DIRECTORY_PICKER__
  return typeof picker?.pick === 'function' ? picker.pick() : undefined
}

function FolderField({ value, onChange, defaultPath }) {
  const [picking, setPicking] = React.useState(false)
  const native = typeof globalThis.__DSH_DIRECTORY_PICKER__?.pick === 'function'
  const choose = async () => {
    setPicking(true)
    try {
      const path = await pickFolder()
      if (path) onChange(path)
    } finally {
      setPicking(false)
    }
  }
  return (
    <div className="md-field">
      <label htmlFor="md-storage-path">{t('存储位置')}</label>
      <div className="md-folder-field">
        <input id="md-storage-path" value={value || (native ? defaultPath ?? '' : '')} readOnly={native} placeholder={defaultPath || t('客户端默认位置')} onChange={event => onChange(event.target.value)} />
        {native ? <button type="button" className="md-btn" disabled={picking} onClick={choose}><Icon name="folder" size={15} />{picking ? t('选择中…') : t('选择文件夹')}</button> : null}
      </div>
      {value && <button type="button" className="md-inline-link md-storage-reset" onClick={() => onChange('')}>{t('使用默认位置')}</button>}
      <small>{t('素材、生成的图片和视频、画布与成稿导出都会保存在这里。更换后，新文件写入新位置，旧文件留在原处。')}</small>
    </div>
  )
}

export function SettingsDialog() {
  useLang()
  const open = useDesk(state => state.settingsOpen)
  const settings = useDesk(state => state.settings)
  const [form, setForm] = React.useState(null)
  React.useEffect(() => {
    if (open && settings) setForm({
      exportDir: settings.exportDir || '',
      generateImages: settings.generateImages !== false,
      imageCount: settings.imageCount,
      shotCount: settings.shotCount,
      resolution: settings.resolution,
    })
  }, [open, settings])
  if (!open || !form) return null
  const close = () => setDesk({ settingsOpen: false })
  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }))
  return (
    <Dialog title={t('设置')} onClose={close} width={520}>
      <form className="md-form" onSubmit={async (event) => {
        event.preventDefault()
        const { exportDir, ...options } = form
        const path = exportDir.trim()
        if (await saveSettings({ ...options, ...(path !== settings.exportDir ? { exportDir: path } : {}), imageCount: Number(form.imageCount), shotCount: Number(form.shotCount) })) close()
      }}>
        <FolderField value={form.exportDir} defaultPath={settings.exportDir ? undefined : settings.storage?.path} onChange={value => set('exportDir', value)} />
        {settings.storage?.error && form.exportDir === settings.exportDir && <p className="md-msg-error" role="alert">{settings.storage.error}</p>}
        <div className="md-field">
          <span>{t('成稿时默认')}</span>
          <div className="md-presets" role="radiogroup" aria-label={t('成稿时默认')}>
            {[[true, '同时生成图片'], [false, '只出文字']].map(([value, label]) => <button type="button" key={label} role="radio" aria-checked={form.generateImages === value} className={form.generateImages === value ? 'is-on' : ''} onClick={() => set('generateImages', value)}>{t(label)}</button>)}
          </div>
        </div>
        <div className="md-field-row">
          <label className="md-field"><span>{t('配图数量')}</span><input type="number" min="0" max="4" required value={form.imageCount} onChange={event => set('imageCount', event.target.value)} /></label>
          <label className="md-field"><span>{t('分镜格数')}</span><input type="number" min="0" max="12" required value={form.shotCount} onChange={event => set('shotCount', event.target.value)} /></label>
        </div>
        <label className="md-field">
          <span>{t('分辨率')}</span>
          <input value={form.resolution} placeholder="1536x1024" pattern="[0-9]{2,5}[x×][0-9]{2,5}|auto" onChange={event => set('resolution', event.target.value)} />
        </label>
        <div className="md-form-foot">
          <span style={{ flex: 1 }} />
          <button type="button" className="md-btn" onClick={close}>{t('取消')}</button>
          <button type="submit" className="md-btn is-primary">{t('保存')}</button>
        </div>
      </form>
    </Dialog>
  )
}
