/**
 * ModelSelect: the composer's named model seat (`conversation.input.model`).
 * Two-level selection per figma 496:26454's MenuDropdown: the root menu is
 * the Model / Effort row pair (label + current value + a right chevron),
 * each drilling into its own list — the provider-grouped model list over
 * the shared directory, and the effort levels. The trigger (313:14108's
 * ToggleButton) shows both: model name + effort in the caption tone.
 * Model catalogs above four entries show search, which retains focus while
 * ↑/↓ cycle the highlighted result; Enter and Tab accept it. Smaller model
 * catalogs, root panes, and effort panes move focus between rows. Escape and Shift+Tab leave a drilled pane first and otherwise close
 * back to the trigger. A drilled pane focuses the current effort or model
 * search field. Provider headings paint their background only while pinned
 * by scrolling. Clearing a query restores the full list and search focus.
 * Selecting restores trigger focus without a ring until the trigger loses focus
 * or the menu reopens. Mobile devices restore button focus when opening or
 * drilling; model search takes focus only after explicit user input.
 * Model names match a case-insensitive ordered subsequence
 * within each provider group, ranked by
 * prefix, alignment score, then catalog order. Returning to the root pane
 * hands focus back to the cell that opened it. Data and submission ride the
 * same per-session ModelDirectory as the /model popup; exact-model reasoning
 * metadata and the selected effort come from the Host rather than a
 * client-owned vocabulary. A rejected selection announces through the shared
 * transient Toast anchored to the composer card; the in-menu strip with
 * Retry remains the catalog-load surface. While the directory's pending
 * selection is unsettled, the trigger shows a spinner in place of its
 * chevron, and each row whose value that selection carries shows one in place
 * of its check mark.
 */
import { MenuGroup, MenuSurface, observeStickyMenuGroups } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore,
  type CSSProperties, type KeyboardEvent, type FocusEvent, type ReactNode, type Ref,
} from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import type { ModelReasoningEffort, ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import {
  IconCheckOutlineRegular, IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, IconCloseFillRegular,
  IconDataOutlineRegular, IconWarningOutlineRegular, Input, isMobileDevice, rankByName, StateDot, Tag, Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelLabelOwner, ModelSelectInjected } from './slots.ts'
import css from './ModelSelect.module.css'
import { orderModelProviders } from './provider-order.ts'

/** Which pane the dropdown shows: the two-row root or one drilled-in list. */
type Pane = 'root' | 'model' | 'effort'

/** One dynamic effort row; undefined means preserve the provider default. */
interface EffortChoice {
  key: string
  effort: string | undefined
  label: string
}

const compactEffortZh: Readonly<Record<string, string>> = {
  off: '关闭', none: '无', minimal: '最低', low: '低', medium: '中', high: '高', xhigh: '超高', max: '最高',
}

function CompactModelControls({ choices, effort, label, model, group, disabled, modelRef, openModels, commit, sliderName }: {
  choices: readonly EffortChoice[]
  effort: string | undefined
  label: string | undefined
  model: ReactNode
  group: string
  disabled: boolean
  modelRef: Ref<HTMLButtonElement>
  openModels: () => void
  commit: (value: string | undefined) => void
  sliderName: string
}) {
  const [preview, setPreview] = useState<number | null>(null)
  const dragging = useRef(false)
  const current = choices.findIndex(choice => choice.effort === effort)
  const index = preview ?? current
  const last = choices.length - 1
  const caption = choices[Math.round(index)]?.label ?? label
  const apply = (next: number): void => {
    if (!disabled && next !== current && choices[next]) commit(choices[next].effort)
  }
  return <>
    <button type="button" className={css.modelSummary} ref={modelRef} onClick={openModels}>
      {caption && <strong className={css.effortTitle}>{caption}</strong>}
      <span className={css.modelCaption}><span>{model}{group && ` · ${group}`}</span><IconChevronRightOutlineRegular /></span>
    </button>
    {last > 0 && <div className={css.scale} style={{ '--effort-fraction': Math.max(0, index) / last } as CSSProperties}>
      <div aria-hidden="true" className={css.scaleStops}>{choices.map((choice, stop) => <i key={choice.key} data-filled={stop <= index || undefined} />)}</div>
      <input type="range" min={0} max={last} step="any" value={Math.max(0, index)} aria-disabled={disabled}
        aria-label={sliderName} aria-valuetext={caption}
        onKeyDown={(event) => {
          const stop = Math.max(0, current)
          const targets: Record<string, number> = {
            ArrowLeft: stop - 1, ArrowDown: stop - 1, PageDown: stop - 1,
            ArrowRight: stop + 1, ArrowUp: stop + 1, PageUp: stop + 1,
            Home: 0, End: last,
          }
          const target = targets[event.key]
          if (target === undefined) return
          event.preventDefault()
          apply(Math.min(last, Math.max(0, target)))
        }}
        onPointerDown={(event) => {
          if (disabled) { event.preventDefault(); return }
          dragging.current = true
          event.currentTarget.setPointerCapture?.(event.pointerId)
        }}
        onChange={(event) => {
          if (disabled) return
          const next = event.currentTarget.valueAsNumber
          if (dragging.current) setPreview(next)
          else apply(Math.round(next))
        }}
        onPointerUp={(event) => {
          if (!dragging.current) return
          dragging.current = false
          const stop = Math.round(event.currentTarget.valueAsNumber)
          setPreview(null)
          apply(stop)
        }}
        onPointerCancel={() => { dragging.current = false; setPreview(null) }}
      />
    </div>}
  </>
}

/**
 * Render the composer model seat.
 * @param props - owner share (locked) + injected face (shared directory
 * store/verbs) + the standard locale seat.
 * @returns the trigger and, while open, the two-level menu.
 */
export function ModelSelect(
  { locked, available, directory, load, select, resolveText, t, renderSlot }:
  ModelSelectInjected & Pick<PropsRuntime<'conversation.input.model'>, 'locked'> & PropsLocale<'model'>
    & Omit<PropsRenderSlots<'conversation.input.model.label' | 'conversation.input.model.options'>, 'SessionProvider'>,
) {
  const state = useSyncExternalStore(
    fn => directory.subscribe(fn),
    () => directory.getSnapshot(),
  )
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState<Pane>('root')
  const compact = (globalThis as { __DSH_COMPACT_MODEL_PICKER__?: boolean }).__DSH_COMPACT_MODEL_PICKER__ === true
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)
  const [selectionFocus, setSelectionFocus] = useState(false)
  // The in-menu error strip serves catalog loads (its Retry re-runs the
  // load); a rejected SELECTION announces through the transient toast
  // instead, so the strip renders only while the latest failure-capable
  // action was a load.
  const lastActionRef = useRef<'load' | 'select'>('load')
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const toastSeq = useRef(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const transitionFrom = useRef<DOMRect | null>(null)
  const groupsRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const id = useId()
  const anchorStyle: CSSProperties & Record<'--dsh-model-anchor', string> = {
    '--dsh-model-anchor': `--dsh-model-${id.replaceAll(':', '')}`,
  }

  const accountProviderName = t('provider.account')
  const groups = useMemo(() => orderModelProviders(state.groups).map(group => ({
    ...group,
    provider: {
      id: group.id,
      name: group.id === 'deepseek-account' ? accountProviderName : group.name,
    },
  })), [state.groups, accountProviderName])
  const choices = useMemo(() => groups.flatMap(group =>
    group.models.map(model => ({
      group,
      model,
      selection: {
        provider: group.id,
        model: model.id,
        ...model.reasoning?.defaultEffort === undefined
          ? {}
          : { reasoningEffort: model.reasoning.defaultEffort },
      } satisfies ModelSelection,
    }))), [groups])
  const showSearch = choices.length > 4
  const filteredGroups = useMemo(() => groups.map(group => ({
    ...group, models: rankByName(group.models, showSearch ? query.trim() : ''),
  })).filter(group => group.models.length > 0), [groups, query, showSearch])
  const visibleModels = useMemo(() => filteredGroups.flatMap(group => group.models.map(model => ({
    provider: group.id, model: model.id,
  }))), [filteredGroups])
  const currentVisibleIndex = visibleModels.findIndex(model =>
    model.provider === state.current?.provider && model.model === state.current.model)
  const activeModelIndex = Math.min(highlightedIndex ?? Math.max(0, currentVisibleIndex), visibleModels.length - 1)
  const selectedIndex = state.current === null
    ? -1
    : choices.findIndex(c => c.selection.provider === state.current?.provider && c.selection.model === state.current.model)
  const currentChoice = choices[selectedIndex]
  const reasoning = currentChoice?.model.reasoning
  const { pending } = state
  const savingEffort = compact && pending !== null && pending.provider === state.current?.provider && pending.model === state.current.model
  const effectiveEffort = (savingEffort ? pending : state.current)?.reasoningEffort ?? reasoning?.defaultEffort
  const effortLabel = currentChoice === undefined
    ? undefined
    : reasoning === undefined
      ? state.retainedEffort
      : effectiveEffort === undefined
        ? t('effort.providerDefault')
        : reasoning.efforts.find(level => level.id === effectiveEffort)?.name ?? effectiveEffort
  const effortChoices = useMemo<readonly EffortChoice[]>(() => reasoning === undefined
    ? []
    : [
      ...reasoning.defaultEffort === undefined
        ? [{ key: 'provider-default', effort: undefined, label: t('effort.providerDefault') }]
        : [],
      ...reasoning.efforts.map((effort: ModelReasoningEffort) => {
        const translated = compactEffortZh[effort.id]
        return {
          key: `effort:${effort.id}`,
          effort: effort.id,
          label: compact && translated && effort.name.toLowerCase() === effort.id
            ? resolveText({ en: effort.name, zh: translated }) : effort.name,
        }
      }),
    ], [reasoning, t, compact, resolveText])
  const busy = pending !== null

  const changePane = (next: Pane): void => {
    if (compact && pane !== next) transitionFrom.current = menuRef.current?.getBoundingClientRect() ?? null
    setPane(next)
  }

  useLayoutEffect(() => {
    const from = transitionFrom.current
    transitionFrom.current = null
    const menu = menuRef.current
    if (!open || !from || !menu?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const to = menu.getBoundingClientRect()
    if (!from.height || !to.height || (from.height === to.height && from.width === to.width)) return
    const animation = menu.animate([
      { width: `${from.width}px`, height: `${from.height}px` },
      { width: `${to.width}px`, height: `${to.height}px` },
    ], { duration: 210, easing: 'cubic-bezier(.22, 1, .36, 1)' })
    return () => animation.cancel()
  }, [open, pane])

  const reload = (): void => {
    lastActionRef.current = 'load'
    load()
  }

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent): void => {
      // The portaled card is outside the trigger subtree; check both.
      if (rootRef.current?.contains(event.target as Node) === true) return
      if (menuRef.current?.contains(event.target as Node) === true) return
      setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => { document.removeEventListener('mousedown', closeOutside) }
  }, [open])

  useLayoutEffect(() => {
    if (!showSearch) {
      setQuery('')
      setHighlightedIndex(null)
    }
  }, [showSearch])

  // Pane switches unmount the focused row; restore focus inside the menu so
  // keyboard navigation remains available.
  const paneFocus = useRef<'drill' | 'model' | 'effort' | null>(null)
  const previousShowSearch = useRef(showSearch)
  useEffect(() => {
    const changedSearchMode = previousShowSearch.current !== showSearch
    previousShowSearch.current = showSearch
    const intent = paneFocus.current ?? (changedSearchMode && pane === 'model' ? 'drill' : null)
    paneFocus.current = null
    if (!open || intent === null) return
    if (intent === 'drill') {
      if (pane === 'model' && showSearch && !isMobileDevice()) {
        searchRef.current?.focus()
        return
      }
      // The checked row is the value in use; a pane without one opens on its
      // first row.
      const checked = menuRef.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]:not([disabled])')
      const target = checked ?? itemRefs.current.find(item => item !== null && !item.disabled)
      // Rows a selection in flight disabled cannot take the keyboard; the
      // trigger does, so the card's keys still reach the menu.
      ;(target ?? triggerRef.current)?.focus()
      return
    }
    const cell = itemRefs.current[intent === 'effort' ? 1 : 0]
    ;(cell !== null && cell !== undefined && !cell.disabled ? cell : triggerRef.current)?.focus()
  }, [open, pane, showSearch])

  useEffect(() => {
    const viewport = groupsRef.current
    if (viewport === null) return
    return observeStickyMenuGroups(viewport)
  }, [available, open, pane, filteredGroups])

  useLayoutEffect(() => {
    if (open && pane === 'model' && activeModelIndex >= 0) {
      itemRefs.current[activeModelIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [open, pane, activeModelIndex, visibleModels])

  if (!available) return null

  const show = (): void => {
    setSelectionFocus(false)
    triggerRef.current?.focus()
    setQuery('')
    setHighlightedIndex(null)
    if (compact || currentChoice === undefined) paneFocus.current = 'drill'
    setPane(currentChoice === undefined ? 'model' : 'root')
    setOpen(true)
    reload()
  }

  const changeQuery = (next: string): void => {
    setQuery(next)
    setHighlightedIndex(0)
  }

  const close = (restoreFocus = false): void => {
    setOpen(false)
    setPane('root')
    if (restoreFocus) queueMicrotask(() => { triggerRef.current?.focus() })
  }

  const closeAfterSelection = (): void => {
    setSelectionFocus(true)
    close(true)
  }

  const drill = (next: Pane): void => {
    setQuery('')
    setHighlightedIndex(null)
    paneFocus.current = 'drill'
    changePane(next)
  }

  /** Leave a drilled pane for the root one, handing the keyboard back to its cell. */
  const back = (from: Exclude<Pane, 'root'>): void => {
    paneFocus.current = from
    changePane('root')
  }

  const moveFocus = (offset: number): void => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>(
      'button[role="menuitem"]:not([disabled]), button[role="menuitemradio"]:not([disabled]), button[role="switch"]:not([disabled])',
    ) ?? [])
    if (items.length === 0) return
    const active = items.findIndex(item => item === document.activeElement)
    // Focus outside the rows (the trigger, which keeps it while the menu
    // opens) enters at the end the step comes from: the first row forward,
    // the last row backward.
    const next = active === -1
      ? (offset > 0 ? 0 : items.length - 1)
      : (active + offset + items.length) % items.length
    items[next]?.focus()
  }

  const onRootKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      // Escape backs out of a drilled pane first, then closes.
      if (pane !== 'root' && currentChoice !== undefined) back(pane)
      else close(true)
      return
    }
    if (!open) return
    if (compact && pane === 'root') {
      if (event.key === 'Tab') {
        const controls = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [])
        const next = controls[controls.indexOf(document.activeElement as HTMLElement) + (event.shiftKey ? -1 : 1)]
        event.preventDefault()
        if (next) next.focus()
        else close(true)
      }
      return
    }
    if (pane === 'model' && showSearch && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      if (!busy && visibleModels.length > 0) {
        const direction = event.key === 'ArrowDown' ? 1 : -1
        setHighlightedIndex((activeModelIndex + direction + visibleModels.length) % visibleModels.length)
        searchRef.current?.focus()
      }
      return
    }
    if (pane === 'model' && showSearch && event.target instanceof HTMLInputElement
      && (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey))) {
      if (event.key === 'Tab' && visibleModels.length === 0) return
      event.preventDefault()
      const highlighted = visibleModels[activeModelIndex]
      if (!busy && highlighted !== undefined) choose(highlighted)
      return
    }
    // Tab settles like Enter and Shift+Tab leaves like Escape, so the menu's
    // keys mean what they mean in the composer. Both are consumed: the card
    // keeps the browser's focus traversal out while it is open.
    if (event.key === 'Tab') {
      if (event.shiftKey) {
        event.preventDefault()
        if (pane !== 'root' && currentChoice !== undefined) back(pane)
        else close(true)
        return
      }
      // Settling activates the row the keyboard is on; with focus still on the
      // trigger, Tab enters the menu at the value in use instead. Any other
      // control inside the card (a retry button) keeps the browser's traversal,
      // so the keystroke stays unconsumed there.
      const focused = document.activeElement
      const rows = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>(
        'button[role="menuitem"]:not([disabled]), button[role="menuitemradio"]:not([disabled]), button[role="switch"]:not([disabled])',
      ) ?? [])
      if (focused instanceof HTMLButtonElement && rows.includes(focused)) {
        event.preventDefault()
        focused.click()
        return
      }
      if (focused !== triggerRef.current) return
      event.preventDefault()
      if (pane === 'model' && showSearch) {
        setHighlightedIndex(null)
        searchRef.current?.focus()
        return
      }
      const checked = menuRef.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]:not([disabled])')
      ;(checked ?? rows.find(item => !item.disabled))?.focus()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(event.key === 'ArrowDown' ? 1 : -1)
    }
  }

  const onBlur = (event: FocusEvent<HTMLDivElement>): void => {
    if (event.relatedTarget instanceof Node && (
      rootRef.current?.contains(event.relatedTarget) === true
      || menuRef.current?.contains(event.relatedTarget) === true
    )) return
    close()
  }

  const settleSelection = (result: Awaited<ReturnType<ModelSelectInjected['select']>>, onSuccess?: () => void): void => {
    if (result === undefined) return
    if (result.ok) {
      if (rootRef.current !== null) onSuccess?.()
      return
    }
    const { error } = result
    toastSeq.current += 1
    setToast({
      seq: toastSeq.current,
      text: error.code === 'session/writer-held'
        ? t('error.sessionInUse')
        : t('error.action', { message: `${error.code}: ${error.message}` }),
    })
  }

  const submit = (selection: ModelSelection, onSuccess?: () => void): void => {
    lastActionRef.current = 'select'
    // Disabled option rows cannot retain focus while a selection is pending.
    if (onSuccess) {
      setSelectionFocus(true)
      triggerRef.current?.focus()
    }
    void select(selection).then((result) => { settleSelection(result, onSuccess) })
  }

  const choose = (selection: ModelSelection): void => {
    const list = groupsRef.current
    const finish = compact ? () => {
      if (list && groupsRef.current === list) back('model')
    } : closeAfterSelection
    if (state.current?.provider === selection.provider && state.current.model === selection.model) {
      finish()
      return
    }
    submit(selection, finish)
  }

  const chooseEffort = (effort: string | undefined): void => {
    if (state.current === null) return
    if (effectiveEffort === effort) {
      if (!compact) closeAfterSelection()
      return
    }
    const selection: ModelSelection = {
      provider: state.current.provider,
      model: state.current.model,
      ...effort === undefined ? {} : { reasoningEffort: effort },
    }
    submit(selection, compact ? undefined : closeAfterSelection)
  }

  const waiting = currentChoice === undefined && state.status === 'loading'
  const modelLabel = waiting
    ? t('trigger.loading')
    : currentChoice?.model.name
      ?? t('trigger.fallback')
  const groupLabel = compact ? currentChoice?.group.provider.name : undefined
  const modelAndGroup = groupLabel ? `${modelLabel} · ${groupLabel}` : modelLabel
  const triggerEffort = compact && reasoning
    ? effortChoices.find(choice => choice.effort === effectiveEffort)?.label ?? effortLabel
    : effortLabel
  const triggerLabel = triggerEffort === undefined ? modelAndGroup : `${modelAndGroup}${compact ? ' ' : ' · '}${triggerEffort}`
  const triggerAria = waiting
    ? t('trigger.loading')
    : currentChoice === undefined
      ? t('trigger.selectAria')
      : triggerEffort === undefined
        ? t('trigger.aria', { model: modelAndGroup })
        : t('trigger.ariaEffort', { model: modelAndGroup, effort: triggerEffort })
  const renderModelLabel = (
    provider: ModelLabelOwner['provider'], model: ModelLabelOwner['model'],
    placement: ModelLabelOwner['placement'], selected: boolean,
  ) => (
    <span data-provider-id={provider.id} data-model-id={model.id}>
      {renderSlot('conversation.input.model.label', {
        provider, model, placement, selected,
      }, {
        fallback: model.badge === undefined ? model.name : (
          <span className={css.badgedName}>
            {placement === 'trigger' ? <><Tag className={css.badge} tone={model.badge.tone}>{resolveText(model.badge.text)}</Tag>{' '}</> : null}
            <span className={css.badgedNameText}>{model.name}</span>
            {placement === 'trigger' ? null : <>{' '}<Tag className={css.badge} tone={model.badge.tone}>{resolveText(model.badge.text)}</Tag></>}
          </span>
        ),
      })}
    </span>
  )
  let itemIndex = 0
  let modelIndex = 0
  const itemRef = () => {
    const at = itemIndex++
    return (node: HTMLButtonElement | null) => { itemRefs.current[at] = node }
  }

  return (
    <div
      ref={rootRef}
      className={css.root}
      onKeyDown={onRootKeyDown}
      onBlur={onBlur}
      onMouseDown={(event) => {
        // WebKit blurs a focused row before click unless the button's mousedown keeps focus.
        if (event.target instanceof Element && event.target.closest('button') !== null) event.preventDefault()
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={clsx(css.trigger, compact && css.compactTrigger)}
        style={anchorStyle}
        aria-label={triggerAria}
        aria-haspopup={compact ? 'dialog' : 'menu'}
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        title={triggerLabel}
        aria-busy={busy}
        data-selection-focus={selectionFocus ? '' : undefined}
        onBlur={() => { setSelectionFocus(false) }}
        disabled={locked}
        onClick={() => {
          if (open) {
            close(true)
          } else {
            show()
          }
        }}
      >
        {!compact && <IconDataOutlineRegular className={css.triggerIcon} size={16} />}
        <span className={css.triggerLabel}>
          {currentChoice === undefined ? modelLabel : renderModelLabel(currentChoice.group.provider, currentChoice.model, 'trigger', true)}
        </span>
        {groupLabel && <span className={css.triggerGroup}> · {groupLabel}</span>}
        {triggerEffort !== undefined && <span className={css.triggerEffort}>
          {compact && effortChoices.map(choice => <i key={choice.key} aria-hidden="true" data-label={choice.label} />)}
          <span>{compact ? ' ' : ''}{triggerEffort}</span>
        </span>}
        {busy && !savingEffort
          ? <StateDot state="ongoing" />
          : !compact && <IconChevronDownOutlineRegular className={clsx(css.chevron, open && css.chevronOpen)} />}
      </button>

      {/* Portaled to body (Menu primitive's portal mode) so the sidebar and
          column overflow clips cannot crop the card; synthetic events still
          bubble through this React subtree, keeping onKeyDown/onBlur live. */}
      {open && createPortal(
        <MenuSurface
          ref={menuRef}
          id={`${id}-menu`}
          className={clsx(css.menu, compact && (pane === 'root' ? css.compactMenu : css.expandedMenu))}
          style={anchorStyle}
          role={compact ? 'dialog' : pane === 'model' ? 'group' : 'menu'}
          aria-label={t('menu.aria')}
          aria-busy={state.status === 'loading' || busy}
        >
          {pane === 'root' && (
            <>
              {compact ? <CompactModelControls
                choices={effortChoices} effort={effectiveEffort} label={effortLabel}
                model={currentChoice ? renderModelLabel(currentChoice.group.provider, currentChoice.model, 'menu', true) : modelLabel}
                group={currentChoice?.group.provider.name ?? ''} disabled={locked || busy}
                modelRef={itemRef()} openModels={() => { drill('model') }} commit={chooseEffort} sliderName={t('menu.effort')}
              /> : <>
                <button ref={itemRef()} type="button" role="menuitem" className={css.cell} onClick={() => { drill('model') }}>
                  <span className={css.cellLabel}>{t('menu.model')}</span>
                  <span className={css.cellValue}>
                    {currentChoice === undefined ? modelLabel : renderModelLabel(currentChoice.group.provider, currentChoice.model, 'menu', true)}
                  </span>
                  <IconChevronRightOutlineRegular className={css.cellChevron} />
                </button>
                {reasoning !== undefined && (
                  <button ref={itemRef()} type="button" role="menuitem" className={css.cell} onClick={() => { drill('effort') }}>
                    <span className={css.cellLabel}>{t('menu.effort')}</span>
                    <span className={css.cellValue}>{effortLabel}</span>
                    <IconChevronRightOutlineRegular className={css.cellChevron} />
                  </button>
                )}
              </>}
              {renderSlot('conversation.input.model.options', {
                locked: locked || busy,
                dismiss: () => {
                  close()
                  triggerRef.current?.focus()
                },
                reportFailure: (message) => { setToast({ seq: ++toastSeq.current, text: message }) },
              })}
            </>
          )}

          {pane === 'model' && (
            <>
              {showSearch && <div className={css.searchRow}>
                <Input
                  ref={searchRef}
                  className={clsx(css.search, query !== '' && css.searchWithQuery)}
                  type="text"
                  role="searchbox"
                  aria-label={t('search.placeholder')}
                  aria-controls={`${id}-models`}
                  aria-activedescendant={activeModelIndex < 0 ? undefined : `${id}-model-${activeModelIndex}`}
                  placeholder={t('search.placeholder')}
                  value={query}
                  readOnly={busy}
                  onChange={(event) => { changeQuery(event.target.value) }}
                />
                {query !== '' && (
                  <button
                    type="button"
                    className={css.searchClear}
                    aria-label={t('search.clear')}
                    disabled={busy}
                    onClick={() => {
                      changeQuery('')
                      searchRef.current?.focus()
                    }}
                  >
                    <IconCloseFillRegular />
                  </button>
                )}
              </div>}
              {state.status === 'loading' && (
                <div className={css.status}>{t('status.loading')}</div>
              )}
              {state.error !== null && lastActionRef.current === 'load' && (
                <div className={css.error}>
                  <span>{t('error.action', { message: state.error })}</span>
                  <button type="button" className={css.retry} onClick={reload}>{t('retry')}</button>
                </div>
              )}
              {state.failures.map(failure => (
                <div className={css.warning} key={failure.id}>
                  <span>{t('warning.groupLoad', { name: failure.id === 'deepseek-account' ? t('provider.account') : failure.name, message: failure.message })}</span>
                  <button type="button" className={css.retry} onClick={reload}>{t('retry')}</button>
                </div>
              ))}
              <div
                ref={groupsRef}
                id={`${id}-models`}
                className={clsx(css.groups, 'scrollable')}
                role="menu"
                aria-label={t('menu.model')}
                hidden={filteredGroups.length === 0}
              >
                {filteredGroups.map((group) => {
                  return (
                    <MenuGroup key={group.id} label={group.provider.name}>
                      {group.models.map((model) => {
                        const index = modelIndex++
                        const selected = state.current?.provider === group.id && state.current.model === model.id
                        return (
                          <button
                            ref={itemRef()}
                            type="button"
                            role="menuitemradio"
                            aria-checked={selected}
                            id={`${id}-model-${index}`}
                            tabIndex={showSearch ? -1 : 0}
                            onFocus={() => { setHighlightedIndex(index) }}
                            data-highlighted={index === activeModelIndex ? '' : undefined}
                            className={clsx(
                              css.option, css.modelOption, selected && css.selected, index === activeModelIndex && css.optionActive,
                            )}
                            onMouseMove={busy || index === activeModelIndex ? undefined : () => {
                              if (showSearch) setHighlightedIndex(index)
                              else itemRefs.current[index]?.focus()
                            }}
                            key={model.id}
                            title={model.name}
                            disabled={busy}
                            onClick={() => { choose({ provider: group.id, model: model.id }) }}
                          >
                            <span className={css.optionCopy}>
                              <span className={css.modelName}>{renderModelLabel(group.provider, model, 'option', selected)}</span>
                            </span>
                            <span className={css.check}>
                              {pending?.provider === group.id && pending.model === model.id
                                ? <StateDot state="ongoing" />
                                : selected ? <IconCheckOutlineRegular /> : null}
                            </span>
                          </button>
                        )
                      })}
                    </MenuGroup>
                  )
                })}
              </div>
              {state.status === 'ready' && filteredGroups.length === 0 && (
                <div className={css.empty} role="status">{t(choices.length === 0 ? 'empty.models' : 'search.empty')}</div>
              )}
            </>
          )}

          {pane === 'effort' && (
            <>
              {state.error !== null && lastActionRef.current === 'load' && (
                <div className={css.error}>
                  <span>{t('error.action', { message: state.error })}</span>
                  <button type="button" className={css.retry} onClick={reload}>{t('action.reload')}</button>
                </div>
              )}
              <div className={clsx(css.groups, 'scrollable')}>
                {effortChoices.length === 0
                  ? <div className={css.empty}>{t('empty.efforts')}</div>
                  : effortChoices.map(level => (
                    <button
                      ref={itemRef()}
                      type="button"
                      role="menuitemradio"
                      aria-checked={effectiveEffort === level.effort}
                      className={clsx(css.option, effectiveEffort === level.effort && css.selected)}
                      key={level.key}
                      disabled={busy}
                      onClick={() => { chooseEffort(level.effort) }}
                    >
                      <span className={css.optionCopy}>
                        <span className={css.modelName}>{level.label}</span>
                      </span>
                      <span className={css.check}>
                        {pending !== null && pending.provider === state.current?.provider
                          && pending.model === state.current.model && pending.reasoningEffort === level.effort
                          ? <StateDot state="ongoing" />
                          : effectiveEffort === level.effort ? <IconCheckOutlineRegular /> : null}
                      </span>
                    </button>
                  ))}
              </div>
            </>
          )}
        </MenuSurface>,
        document.body,
      )}
      {toast !== null && (
        <Toast
          key={toast.seq}
          text={toast.text}
          icon={<IconWarningOutlineRegular />}
          anchor={rootRef.current?.closest<HTMLElement>('[data-composer-card]') ?? null}
          onDone={() => { setToast(null) }}
        />
      )}
    </div>
  )
}
