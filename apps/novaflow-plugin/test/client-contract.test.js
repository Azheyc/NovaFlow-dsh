import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {RELEASE_VERSION,clientDelivery} from '../src/release.js'

const source=await readFile(new URL('../client.js',import.meta.url),'utf8')
const manifest=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'))
const host=await readFile(new URL('../index.js',import.meta.url),'utf8')

test('account client has matching dictionaries and no package installation surface',async()=>{
  const begin=source.indexOf('    const dictionaries = ')+25
  const end=source.indexOf(';\n    const platform',begin)
  const embedded=JSON.parse(source.slice(begin,end))
  for(const language of ['en','zh']){
    const locale=JSON.parse(await readFile(new URL('../locale/'+language+'.json',import.meta.url),'utf8'))
    assert.deepEqual(embedded[language],locale.ui)
    assert.equal(Object.keys(locale.ui).some(key=>/recommendDraft|recommendNoInstall|recommendPrompt/.test(key)),false)
  }
  for(const forbidden of ['ctx.uiWorkspace','startSession','installationPrompt','recommendNoInstall','recommendAllDraft','synchronizeRecommendations'])assert.equal(source.includes(forbidden),false,forbidden)
  for (const removed of ['pluginSetup','confirm_plugins','PluginSetup','InstallDialog']) assert.equal(source.includes(removed),false)
  assert.doesNotMatch(host,/new PluginBootstrap|checkPackageRuntime/)
})
test('release diagnostics identify the exact advertised revisioned client resource',()=>{
  assert.equal(manifest.version,RELEASE_VERSION)
  const entry={id:manifest.name,url:'plugins/??@local/novaflow-dsh-plugin/client.js&rev=fixture',rev:'fixture'}
  const delivery=clientDelivery({get:name=>name==='clientModules'?{graph:()=>({entries:[entry]})}:undefined})
  assert.deepEqual(delivery,{version:manifest.version,clientRevision:'fixture',clientURL:entry.url})
  assert.equal(clientDelivery({get:()=>undefined}).clientURL,null)
})
