import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { registerManagementRpc } from '../plugin-src/management-rpc.mjs'

const channels = new Set(['weixin', 'feishu', 'dingtalk', 'qq', 'wecom', 'wecomApp', 'slack', 'telegram', 'discord', 'whatsapp', 'imessage', 'matrix'])

// The choice belongs to this Host, including when the pairing page is closed.
export function installSetupPartners(ctx, config, service) {
  const dir = join(config.dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'integrations')
  const file = join(dir, 'novaflow-im-setup.json')
  let tail = Promise.resolve()
  const serialize = fn => {
    const result = tail.then(fn)
    tail = result.catch(() => {})
    return result
  }
  async function read() {
    try { return JSON.parse(await readFile(file, 'utf8')) }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error }
  }
  async function write(choices) {
    await mkdir(dir, { recursive: true })
    await writeFile(`${file}.tmp`, JSON.stringify(choices), { mode: 0o600 })
    await rename(`${file}.tmp`, file)
  }
  registerManagementRpc(ctx, '/novaflow-partner', async (method, payload) => {
    try {
      const channel = payload?.channel
      if (!channels.has(channel) || !['get', 'set'].includes(method)) throw new Error('请求无效')
      if (config[channel]?.harnessBaseUrl !== undefined) throw new Error('团队 Bot 仅支持本机 Host')
      const roster = await service.dsBot.status()
      if (roster.state !== 'ready') throw new Error('暂时无法读取团队 Bot')
      const bots = roster.bots.map(({ id, name }) => ({ id, name }))
      const selected = await serialize(async () => {
        const choices = await read()
        if (method === 'set') {
          if (payload.id === '') delete choices[channel]
          else {
            if (!bots.some(bot => bot.id === payload.id)) throw new Error('所选 Bot 已不存在')
            const accounts = await service.listBots()
            choices[channel] = { id: payload.id, existing: accounts.filter(a => a.channel === (channel === 'wecomApp' ? 'wecom-app' : channel)).map(a => a.botId), since: Date.now() }
          }
          await write(choices)
        }
        const choice = choices[channel]
        return choice && !choice.existing.includes(payload.botId) ? choice.id : ''
      })
      return { ok: true, value: { selected, bots } }
    } catch (error) { return { ok: false, error: { code: 'partner/unavailable', message: error.message, details: {} } } }
  }, { authority: config.rpcAuthority })

  // Bind only the verified pairing owner. Group members and other private
  // senders must not inherit the owner's team session.
  service.applySetupPartner = (channel, botId, account, workspaces) => serialize(async () => {
    const choices = await read()
    const choice = choices[channel]
    if (!choice || choice.existing.includes(botId) || !(Date.parse(account.createdAt) >= choice.since)) return
    const owner = channel === 'weixin' ? account.ownerUserId : account.ownerOpenIds?.find(id => id.startsWith('ou_'))
    if (!owner || owner === '*') return
    const key = `p2p:${owner}`
    if (!workspaces.dsBotConversationKeys(botId).includes(key)) await workspaces.setDsBotBinding(botId, key, choice.id)
    delete choices[channel]
    await write(choices)
  })
}
