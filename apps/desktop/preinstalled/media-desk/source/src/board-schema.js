export const PORTS = {
  text: { inputs: [], outputs: [{ id: 'text', type: 'TEXT' }] },
  image: { inputs: [], outputs: [{ id: 'image', type: 'IMAGE' }] },
  video: { inputs: [], outputs: [{ id: 'video', type: 'VIDEO' }] },
  imageGen: { inputs: [{ id: 'prompt', type: 'TEXT', label: '提示词' }, { id: 'reference', type: 'IMAGE', label: '参考图', multiple: true }], outputs: [{ id: 'image', type: 'IMAGE' }] },
  videoGen: { inputs: [{ id: 'prompt', type: 'TEXT', label: '提示词' }, { id: 'firstFrame', type: 'IMAGE', label: '首帧' }, { id: 'reference', type: 'IMAGE', label: '参考图', multiple: true }], outputs: [{ id: 'video', type: 'VIDEO' }] },
  group: { inputs: [], outputs: [] },
}

export const NODE_INFO = {
  text: { label: '文本', w: 240, h: 160 },
  image: { label: '图片', w: 240, h: 176 },
  video: { label: '视频', w: 256, h: 160 },
  imageGen: { label: '图片生成', w: 240, h: 176 },
  videoGen: { label: '视频生成', w: 256, h: 160 },
  group: { label: '分组', w: 480, h: 360 },
}

export const RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3', '21:9']
export const TIERS = ['1K', '2K']

export const NODE_TYPES = Object.keys(NODE_INFO)
export const IMAGE_TIERS = { '1K': 1024, '2K': 2048 }
