import {
  engine,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  pointerEventsSystem,
  InputAction
} from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'
import { signedFetch } from '~system/SignedFetch'

export function main() {
  // Create a clickable cube at the center of the scene
  const cube = engine.addEntity()

  Transform.create(cube, {
    position: Vector3.create(8, 1, 8),
    scale: Vector3.create(1, 1, 1)
  })

  MeshRenderer.setBox(cube)
  MeshCollider.setBox(cube)

  Material.setPbrMaterial(cube, {
    albedoColor: Color4.create(0.2, 0.5, 0.8, 1) // Blue - ready state
  })

  // Add click interaction to trigger signedFetch
  pointerEventsSystem.onPointerDown(
      {
        entity: cube,
        opts: {
          button: InputAction.IA_POINTER,
          hoverText: 'Test signedFetch'
        }
      },
      async () => {
        console.log('Cube clicked! Making signedFetch request...')

        // Change cube color to indicate loading
        Material.setPbrMaterial(cube, {
          albedoColor: Color4.create(1, 1, 0, 1) // Yellow while loading
        })

        try {
          // Make a signed GET request to a test endpoint
          // Using httpbin.org which echoes back request info
          const response = await signedFetch({
            url: 'https://httpbin.org/get',
            init: {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' }
            }
          })

          console.log('signedFetch response received!')
          console.log('Status:', response.ok ? 'OK' : 'Failed')
          console.log('Status Code:', response.status)

          if (response.body) {
            const data = JSON.parse(response.body)
            console.log('Response data:', JSON.stringify(data, null, 2))

            // Check if our signed headers were included
            if (data.headers) {
              console.log('--- Request Headers Sent ---')
              for (const [key, value] of Object.entries(data.headers)) {
                console.log(`  ${key}: ${value}`)
              }
            }
          }

          // Change cube color to green on success
          Material.setPbrMaterial(cube, {
            albedoColor: Color4.create(0.2, 0.8, 0.2, 1) // Green = success
          })
        } catch (error) {
          console.error('signedFetch failed:', error)

          // Change cube color to red on error
          Material.setPbrMaterial(cube, {
            albedoColor: Color4.create(0.8, 0.2, 0.2, 1) // Red = error
          })
        }
      }
  )

  console.log('=== signedFetch Test Scene ===')
  console.log('Click the cube to make a signed request to httpbin.org')
  console.log('Blue = Ready | Yellow = Loading | Green = Success | Red = Error')
}
