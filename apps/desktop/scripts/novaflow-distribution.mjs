/** NovaFlow's independent Windows distribution identity and mirrored GitHub release feed. */
export const NOVAFLOW_APP_ID = 'vip.ycnovaflow.desktop'

/** @param {NodeJS.ProcessEnv} environment Packaging environment. @returns {boolean} Whether this is the NovaFlow distribution. */
export function isNovaFlowDistribution(environment) {
  return environment.DSH_DESKTOP_APP_ID === NOVAFLOW_APP_ID
}

/** @param {NodeJS.ProcessEnv} environment @param {string} version @param {string} os @param {string} arch @param {string} suffix @returns {string} Desktop artifact name without the extension. */
export function desktopDistributionArtifactBase(environment, version, os, arch, suffix) {
  const novaFlow = isNovaFlowDistribution(environment)
  const prefix = novaFlow ? 'NovaFlow' : 'deepseek-harness'
  return `${prefix}-${version}-${os}-${arch}${novaFlow && suffix === '-unsigned' ? '' : suffix}`
}

/** GitHub latest release assets must include both stable.yml and nightly.yml. */
export const NOVAFLOW_UPDATE_URL = 'https://gh-proxy.com/https://github.com/Azheyc/NovaFlow-dsh/releases/latest/download/'
