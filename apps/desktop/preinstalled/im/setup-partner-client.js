function SetupPartnerPicker({ channel, rpc }) {
  const [data, setData] = React49.useState(null);
  const [error, setError] = React49.useState('');
  const [busy, setBusy] = React49.useState(false);
  const [revision, refresh] = React49.useReducer(n => n + 1, 0);
  React49.useEffect(() => {
    const controller = new AbortController();
    setError('');
    rpc('get', { channel }, controller.signal).then(unwrapRpcResult16).then(value => {
      if (!controller.signal.aborted) setData(value);
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [channel, rpc, revision]);
  async function choose(id) {
    setBusy(true);
    setError('');
    try { setData(unwrapRpcResult16(await rpc('set', { channel, id }))); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return h2('div', { className: 'dim-targetField', style: { marginBottom: 12 } },
    h2('label', null, '新接入账号的对话对象', h2('select', {
      value: data?.selected ?? '', disabled: busy || !data,
      onChange: event => void choose(event.target.value),
    }, h2('option', { value: '' }, '独立'),
    data?.selected && !data.bots.some(bot => bot.id === data.selected) ? h2('option', { value: data.selected, disabled: true }, '所选 Bot 已不存在') : null,
    (data?.bots ?? []).map(bot => h2('option', { key: bot.id, value: bot.id }, `团队：${bot.name}`)))),
    data?.selected ? h2('small', null, ['weixin', 'feishu'].includes(channel) ? '扫码接入后，扫码人的私聊会使用所选 Bot。手动接入时请在账号中确认私聊。' : '接入后，在账号的「对话对象」中确认要绑定的私聊。') : null,
    error ? h2('span', { role: 'alert' }, error, ' ', h2('button', { type: 'button', onClick: refresh }, '重试')) : null);
}
