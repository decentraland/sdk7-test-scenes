import {
    Animator,
    ColliderLayer,
    engine,
    GltfContainer,
    InputAction,
    pointerEventsSystem,
    Transform,
    MeshRenderer,
    MeshCollider,
    Material,
    VideoPlayer,
    GltfNodeModifiers,
    EventSystemCallback,
} from '@dcl/sdk/ecs'
import { Vector3, Color4, Quaternion } from '@dcl/sdk/math'

export function main() {
    const shark = engine.addEntity()
    Transform.create(shark, {
        position: Vector3.create(6, 1.5, 10),
        rotation: Quaternion.fromEulerDegrees(0, 180, 0)
    })
    GltfContainer.create(shark, {
        src: 'models/shark.glb',
        visibleMeshesCollisionMask: ColliderLayer.CL_POINTER,
        invisibleMeshesCollisionMask: undefined
    })
    Animator.create(shark, {
        states: [
            {
                clip: 'swim',
                playing: false,
                loop: true,
                weight: 1,
            },
            {
                clip: 'bite',
                playing: false,
                loop: true,
                weight: 0.5,
            }
        ]
    })
    VideoPlayer.create(shark, {
        src: 'https://player.vimeo.com/external/878776484.m3u8?s=0b62be8cfb1d35f8bf30fcb33170a6f3a86620fe&logging=false',
        playing: true,
    })
    let clickCounter = 0;
    pointerEventsSystem.onPointerDown(
        {
            entity: shark,
            opts: {
                button: InputAction.IA_POINTER,
                hoverText: "Animate!",
            }},
        () => {
            if (clickCounter === 0)
            {
                clickCounter = 1;
                Animator.playSingleAnimation(shark, "swim");
            } else if (clickCounter === 1) {
                clickCounter = 2;
                Animator.playSingleAnimation(shark, "bite");
            } else if (clickCounter === 2) {
                clickCounter = 3;
                Animator.playSingleAnimation(shark, "swim");
                let animation = Animator.getClip(shark,"bite");
                animation.playing = true;
            } else {
                Animator.stopAllAnimations(shark);
                clickCounter = 0;
            }
        }
    )

    // Video playing on GLTF since initialization
    const cake = engine.addEntity()
    Transform.create(cake, {
        position: Vector3.create(11, 1, 10),
        scale: Vector3.create(0.05, 0.05, 0.05)
    })
    GltfContainer.create(cake, { src: 'models/cake.glb' })
    GltfNodeModifiers.create(
        cake,
        {
            modifiers: [
                { path: '', material: { material: { $case: 'pbr', pbr: { texture: Material.Texture.Video({ videoPlayerEntity: shark }), } }} }
            ]
        }
    )

    createClickableCube(
        Vector3.create(4, 1, 7),
        "VIDEO on ALL the Shark",
        () => {
            GltfNodeModifiers.createOrReplace(
                shark,
                {
                    modifiers: [{
                        path: '',
                        material: {
                            material: {
                                $case: 'pbr', pbr: {
                                    texture: Material.Texture.Video({ videoPlayerEntity: shark }),
                                }
                            }
                        }}
                    ]
                }
            )
        }
    )

    createClickableCube(
        Vector3.create(6, 1, 7),
        "VIDEO on Shark's Back",
        () => {
            GltfNodeModifiers.createOrReplace(
                shark,
                {
                    modifiers: [{
                        path: 'Scene/Scene_root/shark_skeleton/Sphere/Sphere.001/Sphere_2',
                        material: {
                            material: {
                                $case: 'pbr', pbr: {
                                    texture: Material.Texture.Video({ videoPlayerEntity: shark }),
                                }
                            }
                        }}
                    ]
                }
            )
        }
    )

    createClickableCube(
        Vector3.create(8, 1, 7),
        "Change shark EYEs node",
        () => {
            const randomizedColor = Color4.fromHexString(getRandomHexColor())
            GltfNodeModifiers.createOrReplace(
                shark,
                {
                    modifiers: [{
                        path: 'Scene/Scene_root/shark_skeleton/Sphere/Sphere.001',
                        material: {
                            material: {
                                $case: 'pbr', pbr: {
                                    albedoColor: randomizedColor,
                                }
                            }
                        }}
                    ]
                }
            )
        }
    )

    createClickableCube(
        Vector3.create(10, 1, 7),
        "Disable shark shadows",
        () => {
            GltfNodeModifiers.createOrReplace(
                shark,
                {
                    modifiers: [{
                        path: '',
                        overrideShadows: false
                    }
                    ]
                }
            )
        }
    )

    createClickableCube(
        Vector3.create(12, 1, 7),
        "Change ALL nodes",
        () => {
            const randomizedColor1 = Color4.fromHexString(getRandomHexColor())
            const randomizedColor2 = Color4.fromHexString(getRandomHexColor())
            const randomizedColor3 = Color4.fromHexString(getRandomHexColor())
            const randomizedColor4 = Color4.fromHexString(getRandomHexColor())

            GltfNodeModifiers.createOrReplace(
                shark,
                {
                    modifiers: [ {
                        path: 'Scene/Scene_root/shark_skeleton/Sphere/Sphere.001',
                        material: {
                            material: {
                                $case: 'pbr', pbr: {
                                    albedoColor: Color4.White(),
                                    emissiveIntensity: 100,
                                    // emissiveColor: Color4.Red()
                                    emissiveColor: randomizedColor1
                                }
                            }
                        }
                    },
                        {
                            path: 'Scene/Scene_root/shark_skeleton/Sphere/Sphere.001/Sphere_1',
                            material: {
                                material: {
                                    $case: 'unlit', unlit: {
                                        diffuseColor: randomizedColor2,
                                    }
                                }
                            }
                        },
                        {
                            path: 'Scene/Scene_root/shark_skeleton/Sphere/Sphere.001/Sphere_2',
                            material: {
                                material: {
                                    $case: 'pbr', pbr: {
                                        albedoColor: randomizedColor3,
                                    }
                                }
                            }
                        },
                        {
                            path: 'Scene/Scene_root/shark_skeleton/Sphere/Sphere.001/Sphere_3',
                            material: {
                                material: {
                                    $case: 'pbr', pbr: {
                                        albedoColor: randomizedColor4,
                                    }
                                }
                            }
                        }
                    ]
                }
            )
        }
    )

    createClickableCube(
        Vector3.create(6, 1, 5),
        "REMOVE GltfNodeModifier",
        () => {
            GltfNodeModifiers.deleteFrom(shark)
        }
    )


    // Primitive Mesh
    const cube = engine.addEntity()
    Transform.create(cube, {
        position: Vector3.create(14.5, 1, 14.5),
    })
    MeshRenderer.setBox(cube)
    MeshCollider.setBox(cube)
    pointerEventsSystem.onPointerDown(
        {
            entity: cube,
            opts: {
                button: InputAction.IA_POINTER,
                hoverText: "TOGGLE CUBE Material!",
            }},
        () => {
            if (!Material.has(cube)) {
                Material.setPbrMaterial(cube, {
                    albedoColor: Color4.Green(),
                    castShadows: false
                })
            } else {
                Material.deleteFrom(cube)
            }
        }
    )
}

function createClickableCube(position: Vector3, hoverText: string, callback: EventSystemCallback) {
    const cube = engine.addEntity()
    Transform.create(cube, {
        position: position,
    })
    MeshRenderer.setBox(cube)
    MeshCollider.setBox(cube)
    pointerEventsSystem.onPointerDown(
        {
            entity: cube,
            opts: {
                button: InputAction.IA_POINTER,
                hoverText: hoverText,
            }},
        callback)
}

function getRandomHexColor(): string {
    const letters = "0123456789ABCDEF";
    let color = "#";
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}
