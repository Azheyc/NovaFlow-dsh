/** NovaFlow-specific welcome copy; other supported shell languages use English until translated. */
const en = {
  brand: 'NovaFlow',
  detail: 'Authorize in your browser. Your models and connection are configured automatically.',
  reconnectTitle: 'Reconnect your NovaFlow account',
  reconnectDescription: 'NovaFlow rejected the saved authorization. Sign in again to restore access; your model settings are kept.',
  reconnect: 'Clear authorization and sign in',
}
const zh: typeof en = {
  brand: 'NovaFlow',
  detail: '在浏览器完成授权，自动同步模型与连接配置',
  reconnectTitle: '重新连接 NovaFlow 账号',
  reconnectDescription: 'NovaFlow 未接受已保存的授权。重新登录可恢复访问，已保存的模型设置会保留',
  reconnect: '清除旧授权并登录',
}

/** @param locale - Selected shell locale. @returns Chinese or English NovaFlow copy. */
export function novaFlowWelcomeCopy(locale: string): typeof en {
  return locale.toLowerCase().startsWith('zh') ? zh : en
}
