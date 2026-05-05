import { engine, AvatarLocomotionSettings, Transform, MeshRenderer, MeshCollider, ColliderLayer, Material, TextShape, Billboard, BillboardMode, pointerEventsSystem, InputAction } from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'

export function main() {
    console.log('Locomotion Settings Test Scene')
    
    AvatarLocomotionSettings.createOrReplace(engine.PlayerEntity, {
        walkSpeed: 5,
        jogSpeed: 15,
        runSpeed: 30,
        jumpHeight: 25,
        runJumpHeight: 35,
        hardLandingCooldown: 1
    })

    // Create clickable cubes (3m apart) arranged into two rows (+ / -)
    const spacing = 3 // meters between cube centers
    const sceneSize = 16
    const desiredMargin = 2 // keep some room from parcel borders so text doesn't get cut

    type SettingKey = 'walkSpeed' | 'jogSpeed' | 'runSpeed' | 'jumpHeight' | 'runJumpHeight' | 'hardLandingCooldown'

    const controls: Array<{ key: SettingKey; label: string; step: number }> = [
        { key: 'walkSpeed', label: 'Walk Speed', step: 1 },
        { key: 'jogSpeed', label: 'Jog Speed', step: 1 },
        { key: 'runSpeed', label: 'Run Speed', step: 1 },
        { key: 'jumpHeight', label: 'Jump Height', step: 1 },
        { key: 'runJumpHeight', label: 'Run Jump Ht', step: 1 },
        { key: 'hardLandingCooldown', label: 'Landing CD', step: 0.5 }
    ]

    function clamp(value: number, min: number, max: number) {
        return Math.max(min, Math.min(max, value))
    }

    function updateSetting(key: SettingKey, delta: number) {
        const settings = AvatarLocomotionSettings.getMutable(engine.PlayerEntity)
        const current = Number((settings as any)[key]) || 0
        let next = current + delta

        // Simple sane bounds
        const minByKey: Partial<Record<SettingKey, number>> = {
            walkSpeed: 0,
            jogSpeed: 0,
            runSpeed: 0,
            jumpHeight: 0,
            runJumpHeight: 0,
            hardLandingCooldown: 0
        }
        const maxByKey: Partial<Record<SettingKey, number>> = {
            walkSpeed: 50,
            jogSpeed: 60,
            runSpeed: 80,
            jumpHeight: 100,
            runJumpHeight: 120,
            hardLandingCooldown: 10
        }

        next = clamp(next, minByKey[key] ?? 0, maxByKey[key] ?? 999)
        ;(settings as any)[key] = next
        console.log(`${String(key)} set to`, next)
    }

    function createLabeledButton(position: Vector3, text: string, color: Color4, onClick: () => void) {
        const entity = engine.addEntity()
        Transform.create(entity, {
            position,
            rotation: Quaternion.Zero(),
            scale: Vector3.create(1, 1, 1)
        })
        MeshRenderer.setBox(entity)
        Material.setPbrMaterial(entity, { albedoColor: color })
        MeshCollider.setBox(entity, ColliderLayer.CL_POINTER)

        pointerEventsSystem.onPointerDown(
            { entity, opts: { button: InputAction.IA_POINTER, hoverText: text, maxDistance: 8 } },
            onClick
        )

        // Floating label above the cube
        const label = engine.addEntity()
        Transform.create(label, {
            parent: entity,
            position: Vector3.create(0, 1.2, 0)
        })
        Billboard.create(label, { billboardMode: BillboardMode.BM_Y })
        TextShape.create(label, {
            text,
            fontSize: 6
        })

        return entity
    }

    // Layout: two rows (minus on front row, plus on back row), 6 columns
    const columns = 6
    const totalWidth = (columns - 1) * spacing
    // Center horizontally, but ensure we keep at least desiredMargin from the left edge
    const startCentered = (sceneSize - totalWidth) / 2
    let startX = startCentered < desiredMargin ? desiredMargin : startCentered

    // Place rows near scene center on Z, with margin
    const centerZ = sceneSize / 2
    const minusRowZ = centerZ - spacing * 0.5
    const plusRowZ = centerZ + spacing * 0.5

    for (let idx = 0; idx < controls.length; idx++) {
        const control = controls[idx]
        const x = startX + idx * spacing
        // Decrease (front row)
        createLabeledButton(
            Vector3.create(x, 1, minusRowZ),
            `${control.label} -`,
            Color4.Red(),
            () => updateSetting(control.key, -control.step)
        )
        // Increase (back row)
        createLabeledButton(
            Vector3.create(x, 1, plusRowZ),
            `${control.label} +`,
            Color4.Green(),
            () => updateSetting(control.key, +control.step)
        )
    }
}