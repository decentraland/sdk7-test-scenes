import { engine, Entity, InputAction, pointerEventsSystem, Transform } from "@dcl/sdk/ecs"
import { onEnterScene, onLeaveScene } from '@dcl/sdk/src/players'

export namespace SM_PlayerRoster {

	// MARK: Vars
	let playerEntities: Map<string, Entity> = new Map()
	let currentPlayer: string | null = null
	let players: string[] =  []


	// MARK: Scene Events
	onEnterScene((player) => {
		if (!player) return
		console.log('ENTERED SCENE', player)
		players.push(player.userId)
		playerEntities.set(player.userId, player.entity)
	})

	onLeaveScene((userId) => {
		if (!userId) return
		console.log('LEFT SCENE', userId)
		players = players.filter((player) => player !== userId)
		playerEntities.delete(userId)
	})


	// MARK: Getters
	export function getPlayerCount(): number {
		return players.length
	}

	export function getCurrentPlayerUserId(): string | null {
		return currentPlayer
	}

	export function getCurrentPlayerEntity(): Entity | null {
		if (!currentPlayer) return null
		return playerEntities.get(currentPlayer) ?? null
	}


	// MARK: Update Player Index
	export function updatePlayerIndex(delta: number) {
		// No current player? Go to first or last entry
		if (!currentPlayer) {
			if (delta > 0) {
				currentPlayer = players[delta-1]
			} else {
				currentPlayer = players[players.length - Math.abs(delta)]
			}
			return currentPlayer
		}

		// Find the index of the current player
		const currentIndex = players.indexOf(currentPlayer)

		// Get the new index - remeber that we treat index -1 as "no target", so need to account for that
		let newIndex = currentIndex + delta
		if (newIndex < -1) {
			newIndex += (players.length + 1)
		} else if (newIndex >= players.length) {
			newIndex -= (players.length + 1)
		}

		currentPlayer = players[newIndex]
		return currentPlayer
	}

}
