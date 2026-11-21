import { currentLang } from './i18n.js'

const defaultResolution = '1536x1024'
const resolutionPattern = /^\d{2,5}[x×]\d{2,5}$|^auto$/i

function resolution(value) {
  return typeof value === 'string' && resolutionPattern.test(value.trim())
    ? value.trim().toLowerCase().replace('×', 'x')
    : undefined
}

export function imageSize(image) {
  return resolution(image.size) ?? defaultResolution
}

export function settingsPatch(input) {
  const { exportDir, generateImages, imageCount, shotCount, assistant, voice } = input
  const size = resolution(input.resolution)
  if (input.resolution !== undefined && !size) {
    throw Object.assign(new Error(currentLang() === 'en' ? 'Enter a resolution such as 1536x1024, or auto.' : '请输入 1536x1024 这类分辨率，或填写 auto。'), { status: 400 })
  }
  return { exportDir, generateImages, imageCount, shotCount, assistant, voice, ...(size ? { image: { size } } : {}) }
}

export async function deskSettings(settings, media) {
  const { exportDir, generateImages, imageCount, shotCount, image, assistant, voice } = settings
  return { exportDir, generateImages, imageCount, shotCount, resolution: imageSize(image), language: 'auto', assistant, voice, imageReady: await media.available() }
}

export async function generateDeskImage(media, image, prompt, signal) {
  try {
    return await media.generate({ prompt, size: imageSize(image), signal })
  } catch (error) {
    const english = currentLang() === 'en'
    const message = error?.code === 'AUTH_REQUIRED'
      ? (english ? 'Sign in to NovaFlow to generate images.' : '请先登录 NovaFlow 账号。')
      : ['MEDIA_MODEL_UNAVAILABLE', 'MEDIA_GROUP_REQUIRED'].includes(error?.code)
        ? (english ? 'Select an image model in NovaFlow Settings → Models.' : '请在 NovaFlow「设置 → 模型」中选择可用的图片生成模型。')
        : (english ? 'Image generation did not return a file. Check NovaFlow generation history before retrying.' : '生图未返回图片，请先查看 NovaFlow 生成历史再决定是否重试。')
    throw Object.assign(new Error(message, { cause: error }), { permanent: true })
  }
}
