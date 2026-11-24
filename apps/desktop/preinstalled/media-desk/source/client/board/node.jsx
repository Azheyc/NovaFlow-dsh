// 画布节点：文本、图片、视频素材，以及图片生成、视频生成和分组。
import React from 'react'
import { t } from '../i18n.js'
import { Icon, IconButton } from '../ui.jsx'
import { renderMarkdown } from '../util.js'
import { fileUrl, NODE_INFO, PORTS, RATIOS, TIERS } from './api.js'
import { sizeOf } from '../../src/board-layout.js'
import { allowsVideoMode } from './connections.js'
import { CardSurface } from '../card.jsx'

const JOB_TEXT = { running: '生成中…', unknown: '结果未知，请先查看状态', failed: '生成失败', completed: '已完成' }

function Port({ node, side, onPortDown, onPortKey }) {
  const label = side === 'source' ? t('输出连接点') : t('输入连接点')
  return (
    <button type="button" className={`md-port is-${side}`} data-socket={side}
      title={label} aria-label={label} onPointerDown={event => onPortDown(event, node, side)}
      onClick={event => { if (event.detail === 0) onPortKey(node, side) }}
    />
  )
}

const ICONS = { text: 'list', image: 'image', video: 'film', imageGen: 'image', videoGen: 'film', group: 'folder' }

function Preview({ node }) {
  const text = node.type === 'text' ? node.data.text : ''
  const markdown = React.useMemo(() => text ? renderMarkdown(text) : '', [text])
  if (markdown) return <div className="md-prose md-board-markdown" inert="" dangerouslySetInnerHTML={{ __html: markdown }} />
  const src = fileUrl(node.data.src)
  if (!src) return <div className="md-node-empty"><Icon name={ICONS[node.type]} size={36} stroke={1.3} /></div>
  if (node.type === 'video' || node.type === 'videoGen') return <><video className="md-node-media" src={src} playsInline muted preload="metadata" /><span className="md-card-play"><Icon name="play" size={12} fill /></span></>
  return <img className="md-node-media" src={src} alt={node.data.label ?? ''} draggable={false} />
}

function SelectParameter({ label, value, onChange, children }) {
  return <label className="md-node-param">
    <span>{label}</span>
    <span className="md-node-select">
      <select value={value} onChange={onChange}>{children}</select>
      <Icon name="chevD" size={13} />
    </span>
  </label>
}

function GenControls({ node, model, imageInputCount, onChange }) {
  const isImage = node.type === 'imageGen'
  const allowed = (field, value) => (field !== 'modes' || allowsVideoMode(imageInputCount, value)) && (!model?.capabilities?.[field] || model.capabilities[field].includes(value))
  return (
    <div className="md-node-controls" onPointerDown={e => e.stopPropagation()}>
      {isImage ? (
        <SelectParameter label={t('分辨率')} value={node.data.tier ?? '2K'} onChange={e => onChange({ tier: e.target.value })}>
          {TIERS.map(tier => <option key={tier} value={tier} disabled={!allowed('tiers', tier)}>{tier}</option>)}
        </SelectParameter>
      ) : (
        <>
          <SelectParameter label={t('生成方式')} value={node.data.mode ?? ''} onChange={e => onChange({ mode: e.target.value || undefined })}>
            <option value="">{t('自动')}</option>
            <option value="text" disabled={!allowed('modes', 'text')}>{t('文生视频')}</option>
            <option value="firstFrame" disabled={!allowed('modes', 'firstFrame')}>{t('首帧')}</option>
            <option value="reference" disabled={!allowed('modes', 'reference')}>{t('多图参考')}</option>
          </SelectParameter>
          <label className="md-node-param"><span>{t('时长（秒）')}</span>
            <input type="number" min="1" max="60" placeholder={t('自动')} value={node.data.seconds ?? ''} onChange={e => onChange({ seconds: e.target.value ? Number(e.target.value) : undefined })} />
          </label>
        </>
      )}
      <SelectParameter label={t('画面比例')} value={node.data.ratio ?? '16:9'} onChange={e => onChange({ ratio: e.target.value })}>
        {RATIOS.filter(ratio => isImage || !['3:2', '2:3'].includes(ratio)).map(ratio => <option key={ratio} value={ratio} disabled={!allowed('ratios', ratio)}>{ratio}</option>)}
      </SelectParameter>
    </div>
  )
}

export function BoardNode({ node, selected, editing, onOpen, onPreview, onPortDown, onPortKey, resize }) {
  const drag = React.useRef(null)
  const { w, h } = sizeOf(node)
  const title = node.data.label || t(NODE_INFO[node.type].label)
  return (
    <div className={`md-bnode is-${node.type}${selected ? ' is-selected' : ''}`} data-bnode={node.id} style={{ left: node.position.x, top: node.position.y, width: w, height: h, '--group': node.data.color }}>
      <CardSurface className="md-bnode-face" role="button" tabIndex={0} aria-expanded={editing} aria-label={title}
        onDoubleClick={onPreview} title={onPreview ? t('放大预览') : undefined}
        onClick={e => { if (e.detail === 0 && e.target === e.currentTarget) onOpen() }}
        onKeyDown={e => { if (e.target === e.currentTarget && ['Enter', ' '].includes(e.key)) { e.preventDefault(); onOpen() } }}>
        {node.type !== 'group' && <div className={node.type === 'text' ? 'md-bnode-body md-card-note' : 'md-bnode-body md-card-media'}><Preview node={node} /></div>}
        <span className="md-bnode-caption md-card-foot" title={title}><Icon name={ICONS[node.type]} size={15} /><b>{title}</b></span>
        {node.data.job && node.data.job.status !== 'completed' && <span className="md-bnode-status" title={node.data.job.error}>{t(JOB_TEXT[node.data.job.status] ?? node.data.job.status)}</span>}
      </CardSurface>
      {PORTS[node.type].inputs.length > 0 && <Port node={node} side="target" onPortDown={onPortDown} onPortKey={onPortKey} />}
      {PORTS[node.type].outputs.length > 0 && <Port node={node} side="source" onPortDown={onPortDown} onPortKey={onPortKey} />}
      {selected && <button type="button" className="md-node-resize" title={t('调整大小')} aria-label={t('调整大小')}
        onPointerDown={e => {
          if (e.button !== 0 || drag.current) return
          e.stopPropagation()
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, node }
        }}
        onPointerMove={e => {
          const start = drag.current
          if (start?.id === e.pointerId) resize(start.node, e.clientX - start.x, e.clientY - start.y, false)
        }}
        onPointerUp={e => {
          const start = drag.current
          if (start?.id !== e.pointerId) return
          drag.current = null
          resize(start.node, e.clientX - start.x, e.clientY - start.y, true)
        }}
        onLostPointerCapture={() => { if (drag.current) { drag.current = null; resize(null) } }}
        onKeyDown={e => {
          const delta = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[e.key]
          if (delta) { e.preventDefault(); resize(node, ...delta, true, true) }
        }} />}
    </div>
  )
}

export function NodeEditor({ panelRef, node, model, imageInputCount, promptSource, busy, onClose, onChange, onRun, onStatus, onUpload, onHistory, onPreview }) {
  const fileInput = React.useRef(null)
  const asset = node.type === 'image' || node.type === 'video'
  const mediaGen = node.type === 'imageGen' || node.type === 'videoGen'
  const job = node.data.job
  const pending = busy || job?.status === 'running'
  const promptHint = node.type === 'text' ? t('让模型写这段文字…') : t('描述要生成的画面，可连接文本节点补充')
  const modelLabel = model ? [model.id, model.group].filter(Boolean).join(' · ') : t('请在「设置 → 模型」中选择媒体模型')
  return <section ref={panelRef} className="md-node-editor md-board-chrome" aria-label={t('编辑节点')}
    onKeyDown={e => { if (e.key === 'Escape' && !e.nativeEvent.isComposing) { e.stopPropagation(); onClose() } }}>
    <header><label className="md-node-name"><Icon name={ICONS[node.type]} /><input aria-label={t('节点名称')} value={node.data.label ?? ''} placeholder={t(NODE_INFO[node.type].label)} maxLength={80} onChange={e => onChange({ label: e.target.value })} /></label>
      {onPreview && <IconButton icon="expand" label={t('放大预览')} onClick={onPreview} />}
      <IconButton icon="close" label={t('收起编辑器')} onClick={onClose} /></header>
    {node.type === 'text' && <label className="md-node-field"><span>{t('文本')}</span><textarea rows={3} value={node.data.text ?? ''} placeholder={t('写点什么，支持 Markdown')} onChange={e => onChange({ text: e.target.value })} /></label>}
    {asset && <><input ref={fileInput} type="file" hidden accept={node.type === 'image' ? 'image/jpeg,image/png,image/webp,image/gif' : 'video/mp4,video/webm,video/quicktime'} onChange={e => { const file = e.target.files?.[0]; if (file) onUpload(file); e.target.value = '' }} />
      <button type="button" className="md-btn md-node-upload" onClick={() => fileInput.current?.click()}><Icon name="upload" />{node.data.src ? t('替换文件') : t('上传')}</button></>}
    {(mediaGen || node.type === 'text') && <>
      <label className="md-node-field"><span>{t('提示词')}</span>
        <textarea rows={node.type === 'text' ? 2 : 3} disabled={!!promptSource} placeholder={promptSource ? t('请在已连接的文本节点中填写提示词') : promptHint} value={(promptSource ? promptSource.data.text : node.data.prompt) ?? ''} onChange={e => onChange({ prompt: e.target.value })}
          onKeyDown={e => { if (node.type === 'text' && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !pending && node.data.prompt?.trim()) { e.preventDefault(); onRun() } }} />
      </label>
      {promptSource && <small className="md-muted">{t('提示词来自「{name}」，请到该文本节点修改。', { name: promptSource.data.label || t('文本') })}</small>}
      {mediaGen && <GenControls node={node} model={model} imageInputCount={imageInputCount} onChange={onChange} />}
      <footer>
        {mediaGen && <small className="md-editor-model" title={modelLabel}>{modelLabel}</small>}
        {node.data.history?.length > 0 && <IconButton icon="clock" label={t('历史 {n}', { n: node.data.history.length })} onClick={onHistory} />}
        {['running', 'unknown'].includes(job?.status) && <button type="button" className="md-btn is-small" onClick={onStatus}>{t('查看状态')}</button>}
        <IconButton icon="send" className="md-node-generate" label={pending ? t('生成中…') : t('生成')} disabled={pending || job?.status === 'unknown' || (promptSource && !promptSource.data.text?.trim()) || (node.type === 'text' && !node.data.prompt?.trim())} onClick={onRun} />
      </footer>
    </>}
  </section>
}
