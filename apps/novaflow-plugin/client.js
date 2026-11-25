window.__ModuleLoader__.load({
  id: '@local/novaflow-dsh-plugin',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    // The dictionaries below are kept identical to locale/{en,zh}.json ui.
    const dictionaries = {
  "en": {
    "nav": "Account and balance",
    "title": "NovaFlow account",
    "intro": "Sign in to NovaFlow to save the connection in Settings → Models. No API key copying is needed.",
    "signin": "Sign in to NovaFlow",
    "retry": "Try again",
    "loading": "Loading account…",
    "working": "Working…",
    "connected": "Connected",
    "signedout": "Not connected",
    "accountFallback": "NovaFlow account",
    "pending": "Waiting for authorization",
    "pendingHelp": "Complete sign-in and confirm authorization on NovaFlow. This page updates automatically when authorization finishes.",
    "openAuthorization": "Open authorization page",
    "popupHelp": "If no browser page opened, use the authorization link below.",
    "cancel": "Cancel authorization",
    "cancelled": "Authorization cancelled. You can sign in again when ready.",
    "expired": "Authorization expired. Start sign-in again.",
    "failed": "Authorization did not finish. Please try again.",
    "refresh": "Refresh model settings",
    "topUp": "Top up",
    "models": "Model configuration",
    "modelsHelp": "Edit models in Settings → Models. Refresh model settings restores the platform defaults for your NovaFlow providers.",
    "balance": "Account balance",
    "balanceUnknown": "Balance is currently unavailable. Check your balance on NovaFlow or try refreshing.",
    "balanceSignin": "Sign in to NovaFlow to view your balance.",
    "balanceLoading": "Fetching balance…",
    "balanceRefreshing": "Refreshing balance…",
    "balanceRefresh": "Refresh balance",
    "balanceError": "Could not refresh the balance.",
    "balanceStale": "Showing the last known balance.",
    "balancePersonal": "Personal balance",
    "balanceEnterprise": "Enterprise balance",
    "balanceAvailable": "Available balance",
    "balanceTotal": "Total balance",
    "balanceFrozen": "Frozen balance",
    "balanceCurrency": "CNY",
    "balanceMissing": "Unavailable",
    "balanceDailyRemaining": "Remaining today",
    "balanceMonthlyRemaining": "Remaining this month",
    "balanceUnlimited": "Unlimited",
    "balanceUnspecified": "Not set",
    "balanceBlocked": "Usage is restricted by spending limits.",
    "balanceAsOf": "Updated",
    "balanceDateUnknown": "Update time unavailable",
    "balanceDateLocale": "en",
    "platform": "Open NovaFlow",
    "signout": "Sign out",
    "signoutConfirm": "Sign out of NovaFlow and remove the local credentials and synced model configuration? Signing in again recreates the configuration from the platform. Running requests may be interrupted.",
    "signoutYes": "Confirm sign out",
    "keepConnected": "Stay connected",
    "warning": "Account synchronization needs attention. Refresh to retry or check your permissions on NovaFlow.",
    "networkError": "Could not reach the account service or NovaFlow. Check your network connection and try again.",
    "genericError": "The operation could not be completed. Please try again.",
    "authorizationError": "NovaFlow authorization was rejected or expired. Please sign in again.",
    "conflictError": "A managed model connection has changed. Review the connection settings before syncing again.",
    "unavailableError": "NovaFlow is temporarily unavailable. Please try again later.",
    "protocolError": "The account service returned an unexpected response. Please refresh or restart Harness.",
    "reconnectHelp": "The platform did not accept the saved authorization. Sign out and sign back in to synchronize your NovaFlow models again.",
    "revokeFailed": "You are signed out locally, but remote device revocation failed. Revoke this device in NovaFlow Security and access.",
    "dismissSignout": "Not now",
    "syncRetryHelp": "Your connection is saved, but account synchronization has not finished. Refresh to retry without signing in again.",
    "cleanupFailed": "Local NovaFlow cleanup did not finish. Sign in again to rebuild your model configuration.",
    "cleanupAndRevokeFailed": "Local NovaFlow cleanup and remote device revocation did not finish. Sign in again to rebuild your model configuration. Revoke the old device in NovaFlow Security and access.",
    "modelThinkingHelp": "In each model’s Advanced settings, configure the reasoning levels it supports. Then choose the reasoning depth for the current conversation in its model picker.",
    "modelConnectionHelp": "Claude models use Anthropic Messages; other models use OpenAI Responses. Keep the local connection address supplied by the plugin. Manage sign-in and refresh in Account and balance; no API key copying is needed.",
    "modelFooterTitle": "NovaFlow connection",
    "modelFooterHelp": "Signing in to NovaFlow saves native provider configuration here. Use the editors above to fetch, add, or edit models. Signing out keeps this configuration, but model requests require you to sign in again.",
    "mediaTitle": "NovaFlow Image",
    "imageModel": "Image generation model",
    "imageResolutionHint": "For best results, use 1K resolution.",
    "videoModel": "Video generation model",
    "chooseMedia": "Choose a model",
    "noMedia": "No models available for this account",
    "mediaSignin": "Sign in to NovaFlow to choose generation models.",
    "mediaUnavailable": "Selected model unavailable. Choose another model.",
    "mediaHelp": "The built-in NovaFlow Image MCP uses the models and groups selected here."
  },
  "zh": {
    "nav": "账户与余额",
    "title": "NovaFlow 账户",
    "intro": "登录 NovaFlow 后，连接会保存到「设置 → 模型」，无需复制 API Key。",
    "signin": "登录 NovaFlow",
    "retry": "重试",
    "loading": "正在读取账户…",
    "working": "正在处理…",
    "connected": "已连接",
    "signedout": "未连接",
    "accountFallback": "NovaFlow 账户",
    "pending": "等待网页授权",
    "pendingHelp": "请在 NovaFlow 网页完成登录并确认授权。授权完成后，此页面会自动更新。",
    "openAuthorization": "打开授权页面",
    "popupHelp": "如果浏览器页面没有打开，请点击下方授权链接。",
    "cancel": "取消授权",
    "cancelled": "授权已取消。需要时可重新登录。",
    "expired": "授权已过期，请重新发起登录。",
    "failed": "授权未完成，请重新尝试。",
    "refresh": "刷新模型配置",
    "topUp": "充值",
    "models": "模型配置",
    "modelsHelp": "可在「设置 → 模型」编辑模型。点击「刷新模型配置」会恢复 NovaFlow 提供商的平台默认配置。",
    "balance": "账户余额",
    "balanceUnknown": "余额暂时不可用，请前往 NovaFlow 查看或尝试刷新。",
    "balanceSignin": "登录 NovaFlow 后可查看余额。",
    "balanceLoading": "正在获取余额…",
    "balanceRefreshing": "正在刷新余额…",
    "balanceRefresh": "刷新余额",
    "balanceError": "余额刷新失败",
    "balanceStale": "上次查询的余额",
    "balancePersonal": "个人余额",
    "balanceEnterprise": "企业余额",
    "balanceAvailable": "可用余额",
    "balanceTotal": "总余额",
    "balanceFrozen": "冻结金额",
    "balanceCurrency": "元",
    "balanceMissing": "暂无数据",
    "balanceDailyRemaining": "今日剩余",
    "balanceMonthlyRemaining": "本月剩余",
    "balanceUnlimited": "无限制",
    "balanceUnspecified": "未设置",
    "balanceBlocked": "当前额度受限",
    "balanceAsOf": "更新时间",
    "balanceDateUnknown": "更新时间暂不可用",
    "balanceDateLocale": "zh-CN",
    "platform": "打开 NovaFlow",
    "signout": "退出登录",
    "signoutConfirm": "退出 NovaFlow 并清除本机登录凭据和同步的模型配置？重新登录时会按平台目录重建配置。正在进行的请求可能中断。",
    "signoutYes": "确认退出",
    "keepConnected": "保持登录",
    "warning": "账户同步需要处理，请刷新重试或前往 NovaFlow 检查权限。",
    "networkError": "无法连接账户服务或 NovaFlow，请检查网络连接后重试。",
    "genericError": "操作未能完成，请重试。",
    "authorizationError": "NovaFlow 授权被拒绝或已过期，请重新登录。",
    "conflictError": "受管模型连接已被修改，请检查连接设置后再同步。",
    "unavailableError": "NovaFlow 暂时不可用，请稍后重试。",
    "protocolError": "账户服务返回了异常响应，请刷新页面或重启 Harness。",
    "reconnectHelp": "已保存的授权未被平台接受。请退出后重新登录以同步 NovaFlow 模型。",
    "revokeFailed": "本机已退出，但远端设备撤销失败。请前往 NovaFlow「安全与访问」撤销该设备。",
    "dismissSignout": "暂不退出",
    "syncRetryHelp": "连接信息已保留，账户同步尚未完成。请刷新重试，无需重新登录。",
    "cleanupFailed": "NovaFlow 本机清理未完成。请重新登录以重建模型配置。",
    "cleanupAndRevokeFailed": "NovaFlow 本机清理和远端设备撤销未完成。请重新登录以重建模型配置，并在 NovaFlow「安全与访问」撤销旧设备。",
    "modelThinkingHelp": "在每个模型的「高级」设置中配置它支持的思考档位，再在对话的模型选择器中选择本次使用的思考深度。",
    "modelConnectionHelp": "Claude 系列使用 Anthropic Messages，其他模型使用 OpenAI Responses。请保留插件填入的本机连接地址；登录与刷新在「账户与余额」管理，无需复制 API Key。",
    "modelFooterTitle": "NovaFlow 连接",
    "modelFooterHelp": "NovaFlow 登录后会在此保存原生提供商配置。可直接使用上方编辑器获取、新增或编辑模型；退出登录会保留这些配置，但需重新登录后才能调用。",
    "mediaTitle": "NovaFlow Image",
    "imageModel": "图片生成模型",
    "imageResolutionHint": "建议优先1k分辨率，效果最好。",
    "videoModel": "视频生成模型",
    "chooseMedia": "选择模型",
    "noMedia": "当前账户暂无可用模型",
    "mediaSignin": "登录 NovaFlow 后可选择生成模型。",
    "mediaUnavailable": "已选模型暂不可用，请重新选择",
    "mediaHelp": "内置 NovaFlow Image MCP 使用此处选择的模型和分组。"
  }
};
    const platform = 'https://www.ycnovaflow.vip';
    const pendingPhases = new Set(['starting', 'waiting', 'exchanging']);
    const css = `
      .nf-account {display:flex;flex-direction:column;gap:16px;padding:8px 0;font-size:13px;line-height:22px;color:var(--dsw-alias-label-primary)}
      .nf-account * {box-sizing:border-box}
      .nf-account h2,.nf-account h3,.nf-account p {margin:0}
      .nf-account h2 {font-size:18px;line-height:28px;font-weight:600}
      .nf-account h3 {font-size:14px;font-weight:500}
      .nf-card {padding:16px;border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);display:flex;flex-direction:column;gap:12px}
      .nf-muted {color:var(--dsw-alias-label-secondary)}
      .nf-actions {display:flex;flex-wrap:wrap;align-items:center;gap:8px}
      .nf-button {display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:5px 12px;border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;text-decoration:none;cursor:pointer;line-height:22px}
      .nf-button:hover {text-decoration:underline}
      .nf-button:focus-visible,.nf-launcher:focus-visible {outline:2px solid var(--dsw-alias-label-primary);outline-offset:3px}
      .nf-button:disabled {opacity:.5;cursor:default;text-decoration:none}
      .nf-primary {font-weight:600}
      .nf-launcher {display:flex;align-items:center;gap:8px;width:100%;min-height:36px;padding:6px 8px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;text-align:left}
      .nf-launcher[data-narrow=true] {justify-content:center;padding:6px}
      .nf-avatar {display:flex;align-items:center;justify-content:center;flex:none;width:24px;height:24px;border-radius:50%;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:600}
      .nf-launcher-label {min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .nf-notice {padding:10px 12px;border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;overflow-wrap:anywhere}
      .nf-account-summary {display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 24px}
      .nf-account-summary h3 {font-size:18px;line-height:26px;overflow-wrap:anywhere;min-width:0}
      .nf-wallet {display:flex;align-items:center;flex-wrap:wrap;gap:8px 16px;min-width:0}
      .nf-balance-amount {font-size:24px;line-height:32px;font-weight:500;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
      .nf-account-page > .nf-card {padding:0;gap:0;overflow:hidden;border-radius:16px}
      .nf-account-page > .nf-card > .nf-account-summary {display:grid;grid-template-columns:minmax(0,1fr);gap:16px;padding:20px}
      .nf-account-page .nf-wallet {justify-content:space-between;padding:16px;border-radius:10px;background:var(--dsw-alias-bg-layer-2)}
      .nf-account-page .nf-wallet > div {min-width:0;max-width:100%}
      .nf-account-page .nf-balance-amount {margin-top:4px;font-size:30px;line-height:1.2}
      .nf-account-page > .nf-card > .nf-actions {padding:12px 20px;border-top:1px solid var(--dsw-alias-border-l1)}
      .nf-account-page > .nf-card > [role] {margin:0 20px 16px}
      .nf-account-page > .nf-card > .nf-actions .nf-signout {margin-inline-start:auto}
      .nf-account-page .nf-button:hover {background:var(--dsw-alias-bg-layer-2);text-decoration:none}
      .nf-account-page .nf-button.nf-top-up {padding-inline:17px;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-bg-layer-1);font-weight:500}
      .nf-account-page .nf-button.nf-top-up:hover {background:var(--dsw-alias-button-primary-hover)}
      .nf-picker {display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
      .nf-picker select {max-width:100%;min-width:min(200px,100%)}
      .nf-picker-field {display:flex;flex-direction:column;gap:4px}
      .nf-picker-hint {font-size:12px;line-height:18px}
    `;
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('novaflow.account', dictionaries));
        const translate = ctx.locale.bind('novaflow.account');
        let disposed = false;
        let pollTimer;
        let readPromise;
        let actionPromise;
        let generation = 0;
        let snapshot = { state: null, busy: null, error: null, loaded: false };
        const listeners = new Set();
        const controllers = new Set();
        const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
        const getSnapshot = () => snapshot;
        const isPending = state => !state?.connected && pendingPhases.has(state?.attempt?.phase);
        const safeAuthorization = state => {
          try {
            const url = new URL(state?.attempt?.authorizeUrl);
            return url.origin === platform && !url.username && !url.password ? url.href : null;
          } catch { return null; }
        };
        function publish(patch) {
          if (disposed) return;
          snapshot = { ...snapshot, ...patch };
          for (const listener of listeners) listener();
          clearTimeout(pollTimer);
          pollTimer = undefined;
          if (isPending(snapshot.state) || snapshot.state?.balance?.refreshing) pollTimer = setTimeout(() => { void readState(); }, 1800);
        }
        async function request(action, attemptId, fields) {
          const controller = new AbortController();
          controllers.add(controller);
          const timer = setTimeout(() => controller.abort(), 30000);
          try {
            const response = await fetch('/api/novaflow-account', {
              method: 'POST', credentials: 'same-origin', redirect: 'error',
              headers: { 'content-type': 'application/json', accept: 'application/json' },
              body: JSON.stringify({ action, ...fields, ...(attemptId ? { attemptId } : {}) }),
              signal: controller.signal,
            });
            const result = await response.json().catch(() => null);
            if (result?.ok !== true) {
              const error = new Error('NovaFlow operation failed');
              error.code = typeof result?.error?.code === 'string' ? result.error.code : 'PROTOCOL';
              throw error;
            }
            const state = result.value;
            if (!response.ok || !state || typeof state.connected !== 'boolean' || !Array.isArray(state.models)) {
              const error = new Error('Invalid account response'); error.code = 'PROTOCOL'; throw error;
            }
            return state;
          } finally { clearTimeout(timer); controllers.delete(controller); }
        }
        async function readState() {
          if (disposed || actionPromise) return;
          if (readPromise) return readPromise;
          const current = generation;
          const work = (async () => {
            try {
              const state = await request('state');
              if (current === generation) publish({ state, loaded: true, error: null });
            } catch (error) {
              if (current === generation) publish({ loaded: true, error: error.code || 'NETWORK' });
            }
          })();
          readPromise = work;
          try { await work; } finally { if (readPromise === work) readPromise = undefined; }
        }
        async function act(action, fields) {
          if (disposed || actionPromise) return;
          generation++;
          clearTimeout(pollTimer);
          publish({ busy: action, error: null });
          const work = (async () => {
            try {
              const state = await request(action, action === 'cancel' ? snapshot.state?.attempt?.id : undefined, fields);
              publish({ state, loaded: true });
              if (action === 'start' && !disposed) {
                const url = safeAuthorization(state);
                if (url) window.open(url, '_blank', 'noopener,noreferrer');
              }
            } catch (error) {
              if (action === 'refresh_balance') {
                publish({ state: { ...snapshot.state, balance: {
                  status: 'error', data: snapshot.state?.balance?.data || null,
                  error: error.code || 'NETWORK', refreshing: false,
                } } });
              } else publish({ error: error.code || 'NETWORK' });
            }
          })();
          actionPromise = work;
          try { await work; } finally {
            if (actionPromise === work) actionPromise = undefined;
            publish({ busy: null });
          }
        }
        function errorText(t, code) {
          if (!code) return null;
          const key = code === 'REVOKE_FAILED' ? 'revokeFailed'
            : code === 'SIGNOUT_REQUIRED' ? 'reconnectHelp'
            : /NETWORK|TIMEOUT/.test(code) ? 'networkError'
            : /AUTH|EXPIRED|UNAUTHORIZED|DENIED/.test(code) ? 'authorizationError'
            : /CONFLICT/.test(code) ? 'conflictError'
            : /PLATFORM_ERROR|UNAVAILABLE|HTTP_5/.test(code) ? 'unavailableError'
            : ['PROTOCOL', 'INVALID_RESPONSE'].includes(code) ? 'protocolError' : 'genericError';
          return t(key);
        }
        function useView() {
          const value = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
          React.useSyncExternalStore(callback => ctx.locale.subscribe(callback), () => ctx.locale.getSnapshot(), () => ctx.locale.getSnapshot());
          return { ...value, t: translate };
        }
        function button(text, onClick, disabled, primary) {
          return h('button', { type: 'button', className: `nf-button${primary ? ' nf-primary' : ''}`, disabled, onClick }, text);
        }
        function external(text, href = platform) {
          return h('a', { className: 'nf-button', href, target: '_blank', rel: 'noopener noreferrer' }, text);
        }
        const decimal = new Intl.NumberFormat('en', {minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false});
        function balanceMoney(value, t) {
          return typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)
            ? `${decimal.format(value).replace(/^-0\.00$/, '0.00')} ${t('balanceCurrency')}` : t('balanceMissing');
        }
        function AvailableBalance({ balance, busy, t }) {
          const data = balance?.data;
          const fetching = Boolean(balance?.status === 'loading' || balance?.refreshing || busy === 'refresh_balance');
          const failed = balance?.status === 'error';
          const stale = !!data && (failed || balance?.status === 'unavailable');
          return h('section', {className:'nf-wallet', 'aria-label':t('balanceAvailable'), 'aria-busy':fetching},
            h('div', null, h('p', {className:'nf-muted'}, t('balanceAvailable')),
              data ? h('p', {className:'nf-balance-amount'}, balanceMoney(data.wallet?.available, t))
                : h('p', {role:failed ? 'alert' : 'status'}, t(fetching ? 'balanceLoading' : failed ? 'balanceError' : 'balanceMissing')),
              stale && h('p', {className:'nf-muted',role:'status'}, t('balanceStale')),
              data?.limits?.canUse === false && h('p', {role:'alert'}, t('balanceBlocked'))),
            h('div', {className:'nf-actions'},
              h('a', { className:'nf-button nf-top-up', href:`${platform}/wallet`, target:'_blank', rel:'noopener noreferrer' }, t('topUp')),
              button(t(fetching ? 'balanceRefreshing' : 'balanceRefresh'), () => { void act('refresh_balance'); }, !!busy || fetching))
          );
        }
        function Account({ compact = false } = {}) {
          const { state, loaded, busy, error, t } = useView();
          const [confirmSignout, setConfirmSignout] = React.useState(false);
          React.useEffect(() => { setConfirmSignout(false); }, [state?.connected, state?.hasCredential]);
          const canSignout = !!(state?.connected || state?.hasCredential);
          const recovery = !state?.connected && !!state?.hasCredential;
          const credentialRejected = recovery && [error, state?.error].some(code => code === 'AUTH_REQUIRED' || code === 'SIGNOUT_REQUIRED');
          const waiting = isPending(state);
          const authorization = waiting ? safeAuthorization(state) : null;
          const phase = state?.attempt?.phase;
          const terminal = !state?.connected && ['cancelled', 'canceled', 'expired', 'failed'].includes(phase);
          return h('section', { className: compact ? 'nf-account' : 'nf-account nf-account-page', 'aria-busy': !!busy, 'aria-label': t('title') },
            h('style', null, css),
            !compact && h('h2', null, t('title')),
            !loaded ? h('p', { role: 'status' }, t('loading')) : h('div', { className: 'nf-card' },
              h('div', {className:'nf-account-summary'},
                h('h3', null, state?.connected ? state.account?.displayName || t('accountFallback') : waiting ? t('pending') : t('signedout')),
                state?.connected && !compact && h(AvailableBalance, {balance:state.balance,busy,t})),
              waiting && h('div', { role: 'status' }, h('p', null, t('pendingHelp')), h('p', { className: 'nf-muted' }, t('popupHelp'))),
              recovery && !waiting && h('p', { role: 'status' }, t(credentialRejected ? 'reconnectHelp' : 'syncRetryHelp')),
              terminal && h('p', { role: 'status' }, t(phase === 'expired' ? 'expired' : phase === 'failed' ? 'failed' : 'cancelled')),
              h('div', { className: 'nf-actions' },
                !canSignout && !waiting && button(busy ? t('working') : t('signin'), () => { void act('start'); }, !!busy, true),
                authorization && external(t('openAuthorization'), authorization),
                waiting && button(t('cancel'), () => { void act('cancel'); }, !!busy),
                canSignout && !waiting && !credentialRejected && button(busy ? t('working') : t('refresh'), () => { void act('refresh_models'); }, !!busy),
                external(t('platform')),
                canSignout && !confirmSignout && h('span', {className:'nf-signout'}, button(t('signout'), () => setConfirmSignout(true), !!busy))
              ),
              canSignout && confirmSignout && h('div', { className: 'nf-notice', role: 'group', 'aria-label': t('signout') },
                h('p', null, t('signoutConfirm')),
                h('div', { className: 'nf-actions' },
                  button(t(recovery ? 'dismissSignout' : 'keepConnected'), () => setConfirmSignout(false), !!busy),
                  button(busy ? t('working') : t('signoutYes'), () => { void act('signout'); }, !!busy, true)
                )
              )
            ),
            (error || state?.error) && h('div', { className: 'nf-notice', role: 'alert' },
              h('p', null, errorText(t, error || state.error)),
              !credentialRejected && button(t('retry'), () => { if (canSignout && !waiting) void act('refresh'); else void readState(); }, !!busy)
            ),
            state?.warning && h('p', { className: 'nf-notice', role: 'status' }, t(({ REVOKE_FAILED: 'revokeFailed', MODEL_CLEANUP_FAILED: 'cleanupFailed', CLEANUP_AND_REVOKE_FAILED: 'cleanupAndRevokeFailed' })[state.warning] || 'warning'))
          );
        }
        function Launcher({ wide, openSettings }) {
          const { state, t } = useView();
          const label = state?.connected ? state.account?.displayName || t('accountFallback') : t('title');
          return h(React.Fragment, null, h('style', null, css),
            h('button', { type: 'button', className: 'nf-launcher', 'data-narrow': wide === false, title: label, 'aria-label': t('nav'), onClick: () => openSettings('account') },
              h('span', { className: 'nf-avatar', 'aria-hidden': true }, 'N'),
              wide !== false && h('span', { className: 'nf-launcher-label' }, label)
            )
          );
        }
        function SignIn() { return h(Account, { compact: true }); }
        function MediaModelSettings() {
          const { state, busy, loaded, error, t } = useView();
          const imageHintId = React.useId();
          function picker(kind, title, descriptionId) {
            const rows = (state.mediaModels || []).filter(row => row.kind === kind);
            const key = row => JSON.stringify([row.group, row.id]);
            const selected = state.media?.selected?.[kind];
            const available = selected && rows.some(row => key(row) === key(selected));
            return h('label', {className:'nf-picker'}, h('span', null, t(title)),
              h('select', {className:'nf-button', value:available ? key(selected) : '',
                'aria-describedby': descriptionId,
                disabled:!!busy || !state.media?.owner || !rows.length,
                onChange:event => {
                  const row = rows.find(item => key(item) === event.target.value);
                  if (row) void act('set_media_model', {kind, model:row.id, group:row.group, owner:state.media.owner});
                }}, h('option', {value:'',disabled:true}, t(selected && !available ? 'mediaUnavailable' : rows.length ? 'chooseMedia' : 'noMedia')),
                rows.map(row => h('option', {key:key(row),value:key(row)}, `${row.id} · ${row.group}`))));
          }
          return h('section', {className:'nf-account', 'aria-label':t('mediaTitle')}, h('style', null, css),
            h('div', {className:'nf-card'}, h('h3', null, t('mediaTitle')),
              !loaded ? h('p', {role:'status'}, t('loading')) : !state?.connected ? h('p', null, t('mediaSignin')) :
              h(React.Fragment, null, h('p', {className:'nf-muted'}, t('mediaHelp')),
                h('div', {className:'nf-picker-field'}, picker('image','imageModel',imageHintId),
                  h('p', {id:imageHintId,className:'nf-muted nf-picker-hint'}, t('imageResolutionHint'))),
                picker('video','videoModel')),
              error && h('p', {role:'alert'}, errorText(t,error))));
        }
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section', id: 'account', order: -10, priority: 100, label: () => translate('nav'),
        }, Account));
        ctx.slots.inject('settings.launcher', () => ctx.slots.register({ name: 'settings.launcher', priority: 100 }, Launcher));
        ctx.slots.inject('settings.models.sign-in', () => ctx.slots.register({ name: 'settings.models.sign-in', priority: 100 }, SignIn));
        ctx.slots.inject('settings.models.header', () => ctx.slots.register({
          name: 'settings.models.header', id: 'novaflow-media-models', order: 20,
        }, MediaModelSettings));
        ctx.slots.inject('settings.models.footer', () => {
          if (ctx.slots.spec('settings.models.header') !== undefined) return;
          ctx.slots.register({ name: 'settings.models.footer', id: 'novaflow-native-model-guidance', order: 20 }, MediaModelSettings);
        });
        ctx.effect(() => {
          const focus = () => { if (!document.hidden) void readState(); };
          window.addEventListener('focus', focus);
          document.addEventListener('visibilitychange', focus);
          void readState();
          return () => {
            disposed = true;
            generation++;
            clearTimeout(pollTimer);
            for (const controller of controllers) controller.abort();
            controllers.clear();
            listeners.clear();
            window.removeEventListener('focus', focus);
            document.removeEventListener('visibilitychange', focus);
          };
        });
      },
    };
  },
});
