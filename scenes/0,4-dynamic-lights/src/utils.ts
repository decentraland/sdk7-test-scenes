import {
  engine,
  Tween,
  EasingFunction,
  TweenSequence,
  TweenLoop,
  VisibilityComponent,
  PBLightSource_ShadowType,
  MeshCollider,
  pointerEventsSystem,
  InputAction,
  PointerEvents,
  LightSource,
  Transform,
  Material
} from '@dcl/sdk/ecs'
import { Quaternion, Color3, Vector3 } from '@dcl/sdk/math'

export function setupCornellBox(suffix: string) {
  const box1 = engine.getEntityOrNullByName(`Box1${suffix}`)
  const box2 = engine.getEntityOrNullByName(`Box2${suffix}`)
  if (box2) {
    Tween.create(box2, {
      mode: Tween.Mode.Rotate({
        start: Quaternion.fromEulerDegrees(0, 0, 0),
        end: Quaternion.fromEulerDegrees(0, 180, 0)
      }),
      duration: 2000,
      easingFunction: EasingFunction.EF_LINEAR
    })
    TweenSequence.create(box2, {
      loop: TweenLoop.TL_RESTART,
      sequence: [
        {
          mode: Tween.Mode.Rotate({
            start: Quaternion.fromEulerDegrees(0, 180, 0),
            end: Quaternion.fromEulerDegrees(0, 360, 0)
          }),
          duration: 2000,
          easingFunction: EasingFunction.EF_LINEAR
        }
      ]
    })
  }

  const sphere1 = engine.getEntityOrNullByName(`Sphere1${suffix}`)
  const sphere2 = engine.getEntityOrNullByName(`Sphere2${suffix}`)
  const sphere3 = engine.getEntityOrNullByName(`Sphere3${suffix}`)

  if (sphere1) VisibilityComponent.create(sphere1, { visible: false })
  if (sphere2) VisibilityComponent.create(sphere2, { visible: false })
  if (sphere3) VisibilityComponent.create(sphere3, { visible: false })

  const light = engine.getEntityOrNullByName(`Light Spawn Point${suffix}`)
  let isLightOn = true
  let isLightTweenOn = false
  let light1component = addLight(
    light,
    true,
    10,
    250,
    Color3.White(),
    Vector3.create(90, 0, 0),
    PBLightSource_ShadowType.ST_HARD
  )

  // turn off and on
  const button1 = engine.getEntityOrNullByName(`Button${suffix}`)
  if (button1) {
    MeshCollider.setBox(button1)

    pointerEventsSystem.onPointerDown(
      {
        entity: button1,
        opts: { button: InputAction.IA_PRIMARY, hoverText: `Turn ${isLightOn ? 'off' : 'on'} light` }
      },
      function () {
        isLightOn = !isLightOn

        let comp = PointerEvents.getOrCreateMutable(button1)
        if (comp.pointerEvents[0].eventInfo) {
          comp.pointerEvents[0].eventInfo.hoverText = `Turn ${isLightOn ? 'off' : 'on'} light`
        }
        if (light) {
          light1component = LightSource.getMutable(light)
          light1component.active = isLightOn
        }
      }
    )
  }

  // change color white => green => blue => red
  const button2 = engine.getEntityOrNullByName(`Button_2${suffix}`)
  if (button2) {
    MeshCollider.setBox(button2)

    let currentColor = 0
    let color = Color3.White()
    let currentColorText = 'white'

    pointerEventsSystem.onPointerDown(
      {
        entity: button2,
        opts: { button: InputAction.IA_PRIMARY, hoverText: `Change light color, current is ${currentColorText}` }
      },
      function () {
        currentColor++
        if (currentColor > 3) {
          currentColor = 0
          color = Color3.White()
          currentColorText = 'white'
        } else {
          if (currentColor == 1) {
            color = Color3.Green()
            currentColorText = 'green'
          }
          if (currentColor == 2) {
            color = Color3.Blue()
            currentColorText = 'blue'
          }
          if (currentColor == 3) {
            color = Color3.Red()
            currentColorText = 'red'
          }
        }

        let comp = PointerEvents.getOrCreateMutable(button2)
        if (comp.pointerEvents[0].eventInfo) {
          comp.pointerEvents[0].eventInfo.hoverText = `Change light color, current is ${currentColorText}`
        }

        if (light) {
          light1component = LightSource.getMutable(light)
          light1component.color = color
        }
      }
    )
  }

  // change range
  const button3 = engine.getEntityOrNullByName(`Button_3${suffix}`)
  if (button3) {
    MeshCollider.setBox(button3)

    let currentRange = 10

    pointerEventsSystem.onPointerDown(
      {
        entity: button3,
        opts: { button: InputAction.IA_PRIMARY, hoverText: `Change light range, current is ${currentRange}` }
      },
      function () {
        currentRange += 5
        if (currentRange > 10) {
          currentRange = 0
        }

        let comp = PointerEvents.getOrCreateMutable(button3)
        if (comp.pointerEvents[0].eventInfo) {
          comp.pointerEvents[0].eventInfo.hoverText = `Change light range, current is ${currentRange}`
        }

        if (light) {
          light1component = LightSource.getMutable(light)
          light1component.range = currentRange
        }
      }
    )
  }

  // change intensity
  const button4 = engine.getEntityOrNullByName(`Button_4${suffix}`)
  if (button4) {
    MeshCollider.setBox(button4)

    let currentIntensity = 100

    pointerEventsSystem.onPointerDown(
      {
        entity: button4,
        opts: {
          button: InputAction.IA_PRIMARY,
          hoverText: `Change light brightness, current is ${currentIntensity} lumens`
        }
      },
      function () {
        currentIntensity += 50
        if (currentIntensity > 500) {
          currentIntensity = 0
        }

        let comp = PointerEvents.getOrCreateMutable(button4)
        if (comp.pointerEvents[0].eventInfo) {
          comp.pointerEvents[0].eventInfo.hoverText = `Change light brightness, current is ${currentIntensity} lumens`
        }

        if (light) {
          light1component = LightSource.getMutable(light)
          light1component.brightness = currentIntensity
        }
      }
    )
  }

  // tween light
  const button5 = engine.getEntityOrNullByName(`Button_5${suffix}`)
  if (button5) {
    MeshCollider.setBox(button5)

    pointerEventsSystem.onPointerDown(
      {
        entity: button5,
        opts: {
          button: InputAction.IA_PRIMARY,
          hoverText: `Turn ${isLightTweenOn ? 'off' : 'on'} tween`
        }
      },
      function () {
        if (light) {
          isLightTweenOn = !isLightTweenOn

          let comp = PointerEvents.getOrCreateMutable(button5)
          if (comp.pointerEvents[0].eventInfo) {
            comp.pointerEvents[0].eventInfo.hoverText = `Turn ${isLightTweenOn ? 'off' : 'on'} tween`
          }

          let transform = Transform.get(light)
          let tween = Tween.getOrCreateMutable(light, {
            duration: 2500,
            easingFunction: EasingFunction.EF_LINEAR,
            mode: Tween.Mode.Rotate({
              start: Quaternion.fromEulerDegrees(90, 0, 0),
              end: Quaternion.fromEulerDegrees(105, 0, 0)
            })
          })

          TweenSequence.createOrReplace(light, {
            sequence: [
              {
                duration: 5000,
                easingFunction: EasingFunction.EF_LINEAR,
                mode: Tween.Mode.Rotate({
                  start: Quaternion.fromEulerDegrees(105, 0, 0),
                  end: Quaternion.fromEulerDegrees(45, 0, 0)
                })
              },
              {
                duration: 5000,
                easingFunction: EasingFunction.EF_LINEAR,
                mode: Tween.Mode.Rotate({
                  start: Quaternion.fromEulerDegrees(45, 0, 0),
                  end: Quaternion.fromEulerDegrees(105, 0, 0)
                })
              }
            ],
            loop: TweenLoop.TL_YOYO
          })

          tween.playing = isLightTweenOn
          if (!isLightTweenOn) {
            Tween.getOrCreateMutable(light, {
              duration: 2000,
              easingFunction: EasingFunction.EF_LINEAR,
              playing: true,
              mode: Tween.Mode.Rotate({
                start: transform.rotation,
                end: Quaternion.fromEulerDegrees(90, 0, 0)
              })
            })
          }
        }
      }
    )
  }

  // change spot inner angle
  const button6 = engine.getEntityOrNullByName(`Button_6${suffix}`)
  if (button6) {
    MeshCollider.setBox(button6)

    let innerAngle = 21.8
    let outerAngle = 30

    pointerEventsSystem.onPointerDown(
      {
        entity: button6,
        opts: {
          button: InputAction.IA_PRIMARY,
          hoverText: `Change light inner angle, current inner: ${innerAngle} and outer: ${outerAngle}`
        }
      },
      function () {
        if (light) {
          light1component = LightSource.getMutable(light)
          if (light1component.type && light1component.type.$case === 'spot') {
            outerAngle = light1component.type.spot.outerAngle!
          }
          innerAngle += 5
          if (innerAngle > 90) {
            innerAngle = 0
          }

          let comp = PointerEvents.getOrCreateMutable(button6)
          if (comp.pointerEvents[0].eventInfo) {
            comp.pointerEvents[0].eventInfo.hoverText = `Change light inner angle, current inner: ${innerAngle} and outer: ${outerAngle}`
          }

          if (light1component.type && light1component.type.$case === 'spot') {
            light1component.type.spot.innerAngle = innerAngle
          }
        }
      }
    )
  }

  // Show/Hide boxes
  const button7 = engine.getEntityOrNullByName(`Button_7${suffix}`)
  if (button7) {
    MeshCollider.setBox(button7)

    pointerEventsSystem.onPointerDown(
      {
        entity: button7,
        opts: {
          button: InputAction.IA_PRIMARY,
          hoverText: `Show/Hide boxes`
        }
      },
      function () {
        if (box1) {
          let comp = VisibilityComponent.getOrCreateMutable(box1)
          comp.visible = !comp.visible
        }
        if (box2) {
          let comp = VisibilityComponent.getOrCreateMutable(box2)
          comp.visible = !comp.visible
        }
      }
    )
  }

  // Show/Hide spheres
  const button8 = engine.getEntityOrNullByName(`Button_8${suffix}`)
  if (button8) {
    MeshCollider.setBox(button8)

    pointerEventsSystem.onPointerDown(
      {
        entity: button8,
        opts: {
          button: InputAction.IA_PRIMARY,
          hoverText: `Show/Hide spheres`
        }
      },
      function () {
        if (sphere1) {
          let comp = VisibilityComponent.getOrCreateMutable(sphere1)
          comp.visible = !comp.visible
        }
        if (sphere2) {
          let comp = VisibilityComponent.getOrCreateMutable(sphere2)
          comp.visible = !comp.visible
        }
        if (sphere3) {
          let comp = VisibilityComponent.getOrCreateMutable(sphere3)
          comp.visible = !comp.visible
        }
      }
    )
  }

  // change spot outer angle
  const button9 = engine.getEntityOrNullByName(`Button_9${suffix}`)
  if (button9) {
    MeshCollider.setBox(button9)

    let innerAngle = 21.8
    let outerAngle = 30

    pointerEventsSystem.onPointerDown(
      {
        entity: button9,
        opts: {
          button: InputAction.IA_PRIMARY,
          hoverText: `Change light outer angle, current inner: ${innerAngle} and outer: ${outerAngle}`
        }
      },
      function () {
        if (light) {
          light1component = LightSource.getMutable(light)
          if (light1component.type && light1component.type.$case === 'spot') {
            innerAngle = light1component.type.spot.innerAngle!
          }
          outerAngle += 5
          if (outerAngle > 90) {
            outerAngle = 0
          }

          let comp = PointerEvents.getOrCreateMutable(button9)
          if (comp.pointerEvents[0].eventInfo) {
            comp.pointerEvents[0].eventInfo.hoverText = `Change light outer angle, current inner: ${innerAngle} and outer: ${outerAngle}`
          }

          if (light1component.type && light1component.type.$case === 'spot') {
            light1component.type.spot.outerAngle = outerAngle
          }
        }
      }
    )
  }
}
export function addLight(
  light: any,
  isSpot: boolean,
  range: number = 10,
  brightness: number = 100,
  color: Color3 = Color3.create(1, 1, 1),
  lightRotation?: Vector3,
  shadowType: PBLightSource_ShadowType = PBLightSource_ShadowType.ST_NONE,
  shadowMaskTexture: string | undefined = undefined,
  innerAngle: number = 21.8,
  outerAngle: number = 30
) {
  if (lightRotation) {
    let lightTransform = Transform.getMutable(light)
    if (lightTransform) {
      lightTransform.rotation = Quaternion.fromEulerDegrees(lightRotation.x, lightRotation.y, lightRotation.z)
    }
  }

  if (!light) {
    light = engine.addEntity()
  }

  if (isSpot) {
    let smt =
      shadowMaskTexture != undefined
        ? Material.Texture.Common({
            src: shadowMaskTexture
          })
        : undefined

    return LightSource.create(light, {
      active: true,
      color: color,
      brightness: brightness,
      range: range,
      type: LightSource.Type.Spot({
        innerAngle: innerAngle,
        outerAngle: outerAngle,
        shadow: shadowType,
        shadowMaskTexture: smt
      })
    })
  } else {
    return LightSource.create(light, {
      color: color,
      range: range,
      active: true,
      brightness: brightness,
      type: LightSource.Type.Point({
        shadow: shadowType
      })
    })
  }
}

export function setupStage() {
  const stageLightLeftEntity = engine.getEntityOrNullByName(`Stage_light_left`)
  const stageLightRightEntity = engine.getEntityOrNullByName(`Stage_light_right`)
  const stageSpotLightEntity = engine.getEntityOrNullByName(`Stage_light_cookie`)

  let isLightOn = true
  let isSpotlightLightOn = false
  let isLightTweenOn = false
  let stageLightLeftComponent = addLight(
    stageLightLeftEntity,
    true,
    20,
    3500,
    Color3.Yellow(),
    Vector3.create(45, 90, 0),
    PBLightSource_ShadowType.ST_HARD
  )
  stageLightLeftComponent.active = isLightOn

  let stageLightRightComponent = addLight(
    stageLightRightEntity,
    true,
    20,
    3500,
    Color3.Green(),
    Vector3.create(45, -90, 0),
    PBLightSource_ShadowType.ST_HARD
  )
  stageLightRightComponent.active = isLightOn

  let stageSpotLightComponent = addLight(
    stageSpotLightEntity,
    true,
    20,
    1500,
    Color3.White(),
    Vector3.create(15, 0, 0),
    PBLightSource_ShadowType.ST_HARD,
    undefined,
    40,
    55
  )
  stageSpotLightComponent.active = isSpotlightLightOn

  // turn off and on
  const button1 = engine.getEntityOrNullByName(`Button_Stage`)
  if (button1) {
    MeshCollider.setBox(button1)

    pointerEventsSystem.onPointerDown(
      {
        entity: button1,
        opts: { button: InputAction.IA_PRIMARY, hoverText: `Turn ${isLightOn ? 'off' : 'on'} stage lights` }
      },
      function () {
        isLightOn = !isLightOn
        isSpotlightLightOn = !isSpotlightLightOn

        let comp = PointerEvents.getOrCreateMutable(button1)
        if (comp.pointerEvents[0].eventInfo) {
          comp.pointerEvents[0].eventInfo.hoverText = `Turn ${isLightOn ? 'off' : 'on'} stage lights`
        }
        if (stageLightLeftEntity) {
          stageLightLeftComponent = LightSource.getMutable(stageLightLeftEntity)
          stageLightLeftComponent.active = isLightOn
        }
        if (stageLightRightEntity) {
          stageLightRightComponent = LightSource.getMutable(stageLightRightEntity)
          stageLightRightComponent.active = isLightOn
        }
        if (stageSpotLightEntity) {
          stageSpotLightComponent = LightSource.getMutable(stageSpotLightEntity)
          stageSpotLightComponent.active = isSpotlightLightOn
        }
      }
    )
  }

  // toggle tween
  const button2 = engine.getEntityOrNullByName(`Button_2_Stage`)
  if (button2) {
    MeshCollider.setBox(button2)

    pointerEventsSystem.onPointerDown(
      {
        entity: button2,
        opts: {
          button: InputAction.IA_PRIMARY,
          hoverText: `Turn ${isLightTweenOn ? 'off' : 'on'} tween`
        }
      },
      function () {
        isLightTweenOn = !isLightTweenOn
        if (stageLightLeftEntity) {
          let comp = PointerEvents.getOrCreateMutable(button2)
          if (comp.pointerEvents[0].eventInfo) {
            comp.pointerEvents[0].eventInfo.hoverText = `Turn ${isLightTweenOn ? 'off' : 'on'} tween`
          }

          let transform = Transform.get(stageLightLeftEntity)
          let tween = Tween.getOrCreateMutable(stageLightLeftEntity, {
            duration: 2500,
            easingFunction: EasingFunction.EF_LINEAR,
            mode: Tween.Mode.Rotate({
              start: Quaternion.fromEulerDegrees(45, 90, 0),
              end: Quaternion.fromEulerDegrees(60, 90, 0)
            })
          })

          TweenSequence.createOrReplace(stageLightLeftEntity, {
            sequence: [
              {
                duration: 2500,
                easingFunction: EasingFunction.EF_LINEAR,
                mode: Tween.Mode.Rotate({
                  start: Quaternion.fromEulerDegrees(60, 90, 0),
                  end: Quaternion.fromEulerDegrees(45, 90, 0)
                })
              }
            ],
            loop: TweenLoop.TL_YOYO
          })

          tween.playing = isLightTweenOn
          if (!isLightTweenOn) {
            Tween.getOrCreateMutable(stageLightLeftEntity, {
              duration: 2000,
              easingFunction: EasingFunction.EF_LINEAR,
              playing: true,
              mode: Tween.Mode.Rotate({
                start: transform.rotation,
                end: Quaternion.fromEulerDegrees(45, 90, 0)
              })
            })
          }
        }
        if (stageLightRightEntity) {
          let transform = Transform.get(stageLightRightEntity)
          let tween = Tween.getOrCreateMutable(stageLightRightEntity, {
            duration: 2500,
            easingFunction: EasingFunction.EF_LINEAR,
            mode: Tween.Mode.Rotate({
              start: Quaternion.fromEulerDegrees(45, -90, 0),
              end: Quaternion.fromEulerDegrees(60, -90, 0)
            })
          })

          TweenSequence.createOrReplace(stageLightRightEntity, {
            sequence: [
              {
                duration: 2500,
                easingFunction: EasingFunction.EF_LINEAR,
                mode: Tween.Mode.Rotate({
                  start: Quaternion.fromEulerDegrees(60, -90, 0),
                  end: Quaternion.fromEulerDegrees(45, -90, 0)
                })
              }
            ],
            loop: TweenLoop.TL_YOYO
          })

          tween.playing = isLightTweenOn
          if (!isLightTweenOn) {
            Tween.getOrCreateMutable(stageLightRightEntity, {
              duration: 2000,
              easingFunction: EasingFunction.EF_LINEAR,
              playing: true,
              mode: Tween.Mode.Rotate({
                start: transform.rotation,
                end: Quaternion.fromEulerDegrees(45, -90, 0)
              })
            })
          }
        }
      }
    )
  }

  // toggle spotlight with cookie
  const button3 = engine.getEntityOrNullByName(`Button_3_Stage`)
  if (button3) {
    MeshCollider.setBox(button3)

    pointerEventsSystem.onPointerDown(
      {
        entity: button3,
        opts: {
          button: InputAction.IA_PRIMARY,
          hoverText: `Turn ${isSpotlightLightOn ? 'off' : 'on'} spotlight`
        }
      },
      function () {
        if (stageSpotLightEntity) {
          isSpotlightLightOn = !isSpotlightLightOn
          stageSpotLightComponent.active = isSpotlightLightOn
          let comp = PointerEvents.getOrCreateMutable(button3)
          if (comp.pointerEvents[0].eventInfo) {
            comp.pointerEvents[0].eventInfo.hoverText = `Turn ${isSpotlightLightOn ? 'off' : 'on'} spotlight`
          }

          let transform = Transform.get(stageSpotLightEntity)
          let tween = Tween.getOrCreateMutable(stageSpotLightEntity, {
            duration: 2500,
            easingFunction: EasingFunction.EF_LINEAR,
            mode: Tween.Mode.Rotate({
              start: Quaternion.fromEulerDegrees(0, 0, 0),
              end: Quaternion.fromEulerDegrees(0, 20, 0)
            })
          })

          TweenSequence.createOrReplace(stageSpotLightEntity, {
            sequence: [
              {
                duration: 2500,
                easingFunction: EasingFunction.EF_LINEAR,
                mode: Tween.Mode.Rotate({
                  start: Quaternion.fromEulerDegrees(0, 20, 0),
                  end: Quaternion.fromEulerDegrees(0, -20, 0)
                })
              },
              {
                duration: 2500,
                easingFunction: EasingFunction.EF_LINEAR,
                mode: Tween.Mode.Rotate({
                  start: Quaternion.fromEulerDegrees(0, -20, 0),
                  end: Quaternion.fromEulerDegrees(0, 20, 0)
                })
              }
            ],
            loop: TweenLoop.TL_YOYO
          })

          tween.playing = isSpotlightLightOn
          if (!isSpotlightLightOn) {
            Tween.getOrCreateMutable(stageSpotLightEntity, {
              duration: 2000,
              easingFunction: EasingFunction.EF_LINEAR,
              playing: true,
              mode: Tween.Mode.Rotate({
                start: transform.rotation,
                end: Quaternion.fromEulerDegrees(0, 0, 0)
              })
            })
          }
        }
      }
    )
  }

  // toggle spotlight cookie
  const button4 = engine.getEntityOrNullByName(`Button_4_Stage`)
  if (button4) {
    MeshCollider.setBox(button4)

    let maskIndex = 0
    pointerEventsSystem.onPointerDown(
      {
        entity: button4,
        opts: {
          button: InputAction.IA_PRIMARY,
          hoverText: `Toggle spotlight shadow mask`
        }
      },
      function () {
        if (stageSpotLightEntity) {
          stageSpotLightComponent = LightSource.getMutable(stageSpotLightEntity)

          let batSymbol = 'assets/batsymbol2.png'
          let window = 'assets/window_04.png'

          if (stageSpotLightComponent.type?.$case === 'spot') {
            if (maskIndex === 0) {
              stageSpotLightComponent.type.spot.shadowMaskTexture = Material.Texture.Common({ src: batSymbol })
            } else if (maskIndex === 1) {
              stageSpotLightComponent.type.spot.shadowMaskTexture = Material.Texture.Common({ src: window })
            } else {
              stageSpotLightComponent.type.spot.shadowMaskTexture = undefined
            }

            maskIndex = (maskIndex + 1) % 3
          }
        }
      }
    )
  }
}

export function setupBlackRoom() {
  const pointLight_Outside_Entity = engine.getEntityOrNullByName('PointLight_BlackRoom_Outside')
  const pointLight_Inside_Entity = engine.getEntityOrNullByName('PointLight_BlackRoom_Inside')
  let isOn = false

  let light_Inside_Component = addLight(
    pointLight_Inside_Entity,
    false,
    15,
    350,
    Color3.create(1, 0.5, 0.5),
    Vector3.create(90, 0, 0),
    PBLightSource_ShadowType.ST_HARD
  )
  light_Inside_Component.active = isOn

  addLight(
    pointLight_Outside_Entity,
    false,
    15,
    350,
    Color3.White(),
    Vector3.create(90, 0, 0),
    PBLightSource_ShadowType.ST_SOFT
  )

  // toggle inside light on/off
  const button = engine.getEntityOrNullByName(`Button_BlackRoom`)
  if (button) {
    MeshCollider.setBox(button)

    pointerEventsSystem.onPointerDown(
      {
        entity: button,
        opts: {
          button: InputAction.IA_PRIMARY,
          hoverText: `Turn ${isOn ? 'off' : 'on'} spotlight`
        }
      },
      function () {
        if (pointLight_Inside_Entity) {
          light_Inside_Component = LightSource.getMutable(pointLight_Inside_Entity)

          let comp = PointerEvents.getOrCreateMutable(button)
          if (comp.pointerEvents[0].eventInfo) {
            comp.pointerEvents[0].eventInfo.hoverText = `Turn ${isOn ? 'off' : 'on'} spotlight`
          }
          isOn = !isOn
          light_Inside_Component.active = isOn
        }
      }
    )
  }
}
