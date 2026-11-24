/** Independent NovaFlow installation identity. */
export const NOVAFLOW_APP_ID: 'vip.ycnovaflow.desktop'
/** Mirrored GitHub latest release asset directory. */
export const NOVAFLOW_UPDATE_URL: string
/**
 * Select the NovaFlow distribution without affecting upstream builds.
 * @param environment Packaging environment.
 * @returns Whether the independent NovaFlow application id is selected.
 */
export function isNovaFlowDistribution(environment: NodeJS.ProcessEnv): boolean
/**
 * Return the desktop distribution's base artifact name without a file extension.
 * @param environment - Packaging environment.
 * @param version - Product version or electron-builder macro.
 * @param os - Target system or electron-builder macro.
 * @param arch - Target architecture or electron-builder macro.
 * @param suffix - Output class suffix.
 * @returns Artifact name shared by the builder and CLI.
 */
export function desktopDistributionArtifactBase(environment: NodeJS.ProcessEnv, version: string, os: string, arch: string, suffix: string): string
