import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { engine, Transform, MeshRenderer, Material } from '@dcl/sdk/ecs'
import { InstantiateGlobalInputCameras } from "./globalInputCameras";
import { InstantiateControllableCamera } from "./controllableCamera";
import { InstantiateModifierAreas } from "./modifierAreas";

// Environment setup
const groundEntity = engine.addEntity()
Transform.create(groundEntity, {
  position: Vector3.create(8, 0.01, 8),
  rotation: Quaternion.fromEulerDegrees(90, 0, 0),
  scale: Vector3.create(16, 16, 0.1),
})
MeshRenderer.setPlane(groundEntity)
Material.setBasicMaterial(groundEntity, { diffuseColor: Color4.Gray() })

InstantiateGlobalInputCameras()

InstantiateModifierAreas()

InstantiateControllableCamera()
