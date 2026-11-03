/**
 * Public profile copy for each barber, keyed by staff id.
 * TODO(team-bios): the client has not provided roles, titles or bios yet. Do not invent them.
 * While `role` is empty the card shows only "BARBERO"; while `bio` is empty no
 * description or "Ver más" is shown.
 */
export interface TeamProfile {
  /** e.g. "Barbero senior". Empty until the client confirms it. */
  role: string
  /** One or two sentences. Empty until the client provides it. */
  bio: string
}

export const teamProfiles: Record<string, TeamProfile> = {
  leonardo: { role: '', bio: '' },
  isaac: { role: '', bio: '' },
}

/** Order on the home page. */
export const teamOrder = ['leonardo', 'isaac']
