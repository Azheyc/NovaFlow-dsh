import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished, vi } from 'vitest'
import { downloadNovaFlowDmg } from '../src/updates/novaflow-dmg.ts'

it('downloads the exact mirrored DMG, reports progress without Content-Length and rejects invalid replacements', async () => {
  const cache = await mkdtemp(join(tmpdir(), 'novaflow-dmg-'))
  onTestFinished(() => rm(cache, { recursive: true, force: true }))
  const version = '1.0.2'
  const url = `https://gh-proxy.com/https://github.com/Azheyc/NovaFlow-dsh/releases/download/v${version}/NovaFlow-${version}-mac-arm64.dmg`
  const contents = Buffer.from('disk image')
  const sha512 = createHash('sha512').update(contents).digest('base64')
  const file = { url, size: contents.length, sha512 }
  const info = { files: [file], version, path: url, sha512, releaseDate: '' }
  const request = vi.fn(async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(contents.subarray(0, 4)); controller.enqueue(contents.subarray(4)); controller.close()
  } })))
  const signal = new AbortController().signal
  const progress = vi.fn()
  const installer = await downloadNovaFlowDmg(info, cache, request, signal, progress)
  expect(request).toHaveBeenCalledWith(url, expect.objectContaining({ credentials: 'omit' }))
  expect(progress.mock.calls).toEqual([[40], [100]])
  for (const invalid of [{ size: contents.length + 1 }, { size: 1 }, { sha512: createHash('sha512').digest('base64') }]) {
    await expect(downloadNovaFlowDmg({ ...info, files: [{ ...file, ...invalid }] }, cache, request, signal, progress))
      .rejects.toThrow(/size|SHA-512/)
  }
  request.mockClear()
  await expect(downloadNovaFlowDmg({ ...info, files: [{ ...file, url: 'https://example.com/fake.dmg' }] }, cache, request, signal, progress))
    .rejects.toThrow(/verified DMG/)
  expect(request).not.toHaveBeenCalled()
  expect(await readdir(cache)).toEqual(['NovaFlow.dmg'])
  expect(await readFile(installer)).toEqual(contents)
})
