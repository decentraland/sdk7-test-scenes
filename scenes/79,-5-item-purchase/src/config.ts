// Everything a tester may need to change lives in this file.

export type Environment = 'zone' | 'org'

/** `zone` is the test network (Amoy), `org` is production (Polygon). It must match the explorer's environment. */
export const ENVIRONMENT: Environment = 'zone'

/** Public marketplace API. Used only to print the name and price on each sign; the explorer resolves the price itself. */
export const MARKETPLACE_API = `https://marketplace-api.decentraland.${ENVIRONMENT}`

/** A wearable with a primary listing that can be bought with credits. */
export const WEARABLE_URN = 'urn:decentraland:amoy:collections-v2:0x5dd15a3a3e4e036683720a9eb73e483ff40e6f79:0'

/**
 * An emote with a primary listing that can be bought with credits, in the same
 * `urn:decentraland:<network>:collections-v2:<contract>:<itemId>` form as the wearable.
 * Left empty on purpose: the emote machine stays disabled until this is filled in.
 */
export const EMOTE_URN = 'urn:decentraland:amoy:collections-v2:0x32f9b3a934ba86470cbdb5cf270e55cbbf769224:0'

/** How long a machine waits for the purchase modal to close before giving up on the outcome. */
export const PURCHASE_TIMEOUT_MS = 10 * 60 * 1000

export type CollectionItem = {
  contractAddress: string
  itemId: string
}

/** Splits a collections-v2 item urn into its contract address and item id. Returns undefined for anything else. */
export function parseCollectionItemUrn(urn: string): CollectionItem | undefined {
  const parts = urn.split(':')
  if (parts.length !== 6 || parts[3] !== 'collections-v2') return undefined

  const [contractAddress, itemId] = [parts[4], parts[5]]
  if (!contractAddress.startsWith('0x') || !/^\d+$/.test(itemId)) return undefined

  return { contractAddress, itemId }
}
