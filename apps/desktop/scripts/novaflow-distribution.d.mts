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
