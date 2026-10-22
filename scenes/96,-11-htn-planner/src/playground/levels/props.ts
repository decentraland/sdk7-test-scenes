// Props and helpers shared by the basics levels (1-4).
import { distanceXZ, Vec3 } from '../../htn-planner'
import type { Marker } from '../sim'

export const near = (a: Vec3, b: Vec3 | undefined, r = 1) => b !== undefined && distanceXZ(a, b) <= r
export const GREY = { r: 0.5, g: 0.5, b: 0.55 }
export const WOOD = { r: 0.45, g: 0.3, b: 0.15 }
export const LEAF = { r: 0.2, g: 0.6, b: 0.25 }
export const box = (id: string, position: Vec3, scale: Vec3, color = GREY, label?: string, solid = false): Marker => ({ id, shape: 'box', position, scale, color, label, solid })
