const split = (name: string, category: string) => ({
  male: `wearables/${name}/${name}_m_${category}.glb`,
  female: `wearables/${name}/${name}_f_${category}.glb`
})
const unisex = (name: string, category: string) => {
  const path = `wearables/${name}/${name}_${category}.glb`
  return { male: path, female: path }
}

export const WEARABLES: Record<string, { male: string; female: string }> = {
  green_hoodie: split('green_hoodie', 'upper_body'),
  pride_tshirt: split('pride_tshirt', 'upper_body'),
  kilt: split('kilt', 'lower_body'),
  bear_slippers: unisex('bear_slippers', 'feet'),
  matrix_sunglasses: unisex('matrix_sunglasses', 'eyewear'),
  laurel_wreath: unisex('laurel_wreath', 'tiara')
}

export const WEARABLE_NAMES = Object.keys(WEARABLES)

export const NPC_KEY = 'npc'
