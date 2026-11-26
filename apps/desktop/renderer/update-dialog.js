/** Main-owned copy and responses; Escape is cancellation, never acceptance. */
const api = window.dshUpdateDialog
let view
let responding = false
let releaseModule
let releaseVisible = false
let releaseRequest = 0
function renderRelease(state) {
  const request = ++releaseRequest
  releaseVisible = true
  document.querySelector('main').hidden = true
  document.body.classList.add('release-visible', 'visible')
  if (!releaseModule) {
    const styles = document.createElement('link')
    styles.rel = 'stylesheet'
    styles.href = 'generated/release-card.css'
    document.head.append(styles)
    releaseModule = import('./generated/release-card.js')
  }
  void releaseModule.then(module => {
    if (releaseVisible && request === releaseRequest) module.showReleaseCard(state, respond)
  }).catch(() => {
    if (request !== releaseRequest) return
    releaseVisible = false
    document.body.classList.remove('release-visible')
    view = undefined
    render({ ...state, pages: undefined })
  })
}
function respond(index) {
  if (responding || view === undefined || view.busyButton !== undefined) return
  responding = true
  void api.respond(view.revision, index).catch(() => { responding = false })
}
document.getElementById('close').addEventListener('click', () => { respond(view.cancelId) })
document.addEventListener('keydown', event => {
  if (releaseVisible) return
  if (event.key === 'Escape' && view !== undefined) { event.preventDefault(); respond(view.cancelId) }
  if (event.key !== 'Tab') return
  const controls = [...document.querySelectorAll('button:not(:disabled), #notes:not([hidden]) > [tabindex="0"], details:not([hidden]) > summary, details[open]:not([hidden]) > pre')]
  if (controls.length === 0) { event.preventDefault(); return }
  const current = controls.indexOf(document.activeElement)
  const next = current < 0 ? (event.shiftKey ? controls.length - 1 : 0)
    : (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length
  event.preventDefault()
  controls[next].focus()
})
function render(state) {
  if (state && view && state.revision < view.revision) return
  if (state?.pages) {
    if (state.revision !== view?.revision) responding = false
    view = state
    document.documentElement.lang = state.locale
    document.title = state.title
    renderRelease(state)
    return
  }
  if (releaseVisible) {
    ++releaseRequest
    releaseVisible = false
    document.body.classList.remove('release-visible')
    void releaseModule.then(module => { if (!releaseVisible) module.hideReleaseCard() }).catch(() => {})
  }
  if (state === null) {
    responding = true
    document.body.classList.remove('visible')
    return
  }
  if (view !== undefined && state.revision < view.revision) return
  document.getElementById('transfer').hidden = state.percent === undefined
  if (state.percent !== undefined) {
    document.getElementById('progress').value = state.percent
    document.getElementById('progress').setAttribute('aria-label', state.message)
    document.getElementById('percent').textContent = `${Math.floor(state.percent)}%`
  }
  if (state.revision === view?.revision) return
  responding = false
  view = state
  document.documentElement.lang = state.locale
  document.title = state.title
  document.getElementById('title').textContent = state.message
  document.getElementById('detail').textContent = state.detail
  document.getElementById('detail').hidden = state.detail === ''
  document.getElementById('notes').hidden = !state.releaseNotes
  document.getElementById('notes-label').textContent = state.releaseNotesLabel ?? ''
  document.getElementById('notes-body').textContent = state.releaseNotes ?? ''
  document.getElementById('close').disabled = state.busyButton !== undefined
  document.getElementById('close').setAttribute('aria-label', state.closeLabel)
  document.getElementById('technical-details').hidden = state.technicalDetails === ''
  document.getElementById('technical-details-label').textContent = state.technicalDetailsLabel
  document.getElementById('technical-details-content').textContent = state.technicalDetails
  document.getElementById('technical-details').open = false
  document.getElementById('actions').replaceChildren()
  for (const [index, label] of state.buttons.entries()) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.disabled = state.busyButton !== undefined
    if (state.busyButton === index) button.setAttribute('aria-busy', 'true')
    button.className = index === 0 ? 'primary' : 'secondary'
    button.addEventListener('click', () => { respond(index) })
    document.getElementById('actions').append(button)
  }
  document.querySelector('main').hidden = false
  const notes = document.getElementById('notes-body')
  notes.tabIndex = notes.scrollHeight > notes.clientHeight ? 0 : -1
  notes.scrollTop = 0
  document.getElementById('dialog').scrollTop = 0
  document.body.classList.add('visible')
  document.getElementById('dialog').focus()
}
let received = false
const unsubscribe = api.subscribe(state => { received = true; render(state) })
window.addEventListener('pagehide', unsubscribe, { once: true })
void api.status().then(state => { if (!received) render(state) })
