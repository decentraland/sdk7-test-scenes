import { getSceneInformation } from '~system/Runtime'

const WORLDS_SERVER = 'https://worlds-content-server.decentraland.org'
const WALLET = /^0x[0-9a-fA-F]{40}$/

export function isWallet(value: string): boolean {
  return WALLET.test(value)
}

// The scene owner's wallet, for the Intro's default avatar: scene.json "owner" when it
// holds a wallet, else the owner of the World's NAME (a public endpoint, no signature).
// null in Genesis City without "owner", or when the lookup fails.
export async function findSceneOwner(): Promise<string | null> {
  try {
    const { metadataJson } = await getSceneInformation({})
    const metadata = JSON.parse(metadataJson) as { owner?: unknown; worldConfiguration?: { name?: unknown } }
    if (typeof metadata.owner === 'string' && isWallet(metadata.owner)) return metadata.owner.toLowerCase()
    const world = metadata.worldConfiguration?.name
    if (typeof world !== 'string' || world === '') return null
    const response = await fetch(`${WORLDS_SERVER}/world/${encodeURIComponent(world)}/permissions`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const { owner } = (await response.json()) as { owner?: unknown }
    return typeof owner === 'string' && isWallet(owner) ? owner.toLowerCase() : null
  } catch (e) {
    console.log('[FEEDBACK] Could not find the scene owner for the Intro avatar:', e)
    return null
  }
}
