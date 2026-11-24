export const boardWorkflows = [
  {
    label: '故事创作', icon: 'pen', skill: 'laotang-storycraft-zh',
    description: '把点子写成故事，或接着修改已有稿。',
    prompt: '请先读取 {skill} 技能，根据下面的点子或原稿写故事。如果是改稿，保留已定的人物和结局，只修改我指定的部分。这一轮交付故事文本。\n我的想法或修改要求：',
  },
  {
    label: '电影级分镜', icon: 'film', skill: 'laotang-cinematic-storyboard-s10-free',
    description: '把剧本和对白拆成有时长、有机位的镜头。',
    prompt: '请先读取 {skill} 技能，保留原剧情和逐字对白。新项目先给开拍确认卡；已有确认条件就沿用，按分镜号、时间、镜长、画面重点给我预览，供我挑选需要细化的镜头。\n剧本、对白或画布节点：',
  },
  {
    label: '提取故事资产', icon: 'list', skill: 'laotang-asset-extractor',
    description: '列出每场的人物、道具、场景和状态变化。',
    prompt: '请先读取 {skill} 技能，从指定场次提取人物、道具和场景。沿用已有资产编号，标明首次出场、原文依据，以及后续场次要接上的服装、道具或环境变化。\n剧本和场次范围：',
  },
  {
    label: '角色资产板', icon: 'user', skill: 'laotang-character-board',
    description: '用人物设定写出可复用的角色参考板提示词。',
    prompt: '请先读取 {skill} 技能，用指定角色卡或参考图写一份中文角色板提示词。保持各视图中的脸型、服装和身形一致，区分固定特征与本场变化。先交付可复制的提示词。\n角色设定或参考节点：',
  },
  {
    label: '场景补充视角', icon: 'image', skill: 'laotang-scene-reference-zh',
    description: '从同一场景换机位，保持布局和光源连贯。',
    prompt: '请先读取 {skill} 技能，依据我指定的场景参考图，为新机位写中文提示词。保持空间布局、固定物件和光源位置，说明新角度能看到什么、哪些会被遮挡。如果缺少可查看的原图，请先向我要图。\n场景参考与目标机位：',
  },
  {
    label: '落实到画布', icon: 'branch',
    description: '把定稿、参考图和分镜接成可执行的节点。',
    prompt: '请先用 canvas_read 查看当前画布，按我指定的范围复用已有文案和素材。用 canvas_edit 把缺少的文本、图片或视频生成节点补齐，连接提示词和参考素材，核对参考图或首帧的用途。列出已准备的节点和仍缺的素材，等我确认后再提交生成。\n要落实的分镜或节点：',
  },
]
