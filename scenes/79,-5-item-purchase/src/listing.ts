import { MARKETPLACE_API, parseCollectionItemUrn } from './config'

export type Listing = {
  name: string
  priceCredits: number
  available: number
}

type UnifiedCatalogResponse = {
  data?: Array<{ name?: string; priceCredits?: number; available?: number }>
}

/**
 * Reads the primary listing of an item from the public catalog, to label a machine.
 * Returns undefined when the item has no primary listing or the request fails.
 * This is display only: the purchase itself never uses what the scene read here.
 */
export async function fetchListing(urn: string): Promise<Listing | undefined> {
  const item = parseCollectionItemUrn(urn)
  if (!item) return undefined

  const url =
    `${MARKETPLACE_API}/v3/catalog/unified` +
    `?contractAddress=${item.contractAddress}&itemId=${item.itemId}&listingType=primary&first=1`

  try {
    const response = await fetch(url)
    if (!response.ok) return undefined

    const body = (await response.json()) as UnifiedCatalogResponse
    const row = body.data?.[0]
    if (!row) return undefined

    return {
      name: row.name ?? 'Unnamed item',
      priceCredits: row.priceCredits ?? 0,
      available: row.available ?? 0
    }
  } catch (error) {
    console.error(`Could not read the listing of ${urn}`, error)
    return undefined
  }
}
