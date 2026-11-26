/** Localized release dialog content delivered to the isolated renderer. */
export interface ReleaseCardView {
  readonly pages?: { previous: string; next: string }
  readonly percent?: number
  readonly releaseNotes?: string
  readonly releaseNotesLabel?: string
  readonly message: string
  readonly detail: string
  readonly buttons: readonly string[]
  readonly cancelId: number
  readonly closeLabel: string
}
