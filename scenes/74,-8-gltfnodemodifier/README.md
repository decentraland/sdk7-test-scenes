This scene shows how to use the `GltfNodeModifiers` component to manipulate either the whole GLTF meshes OR indivisual Gltf nodes:

- If GltfNodeModifiers is configured with ONLY 1 MODIFIER and that modifier has an EMPTY STRING PATH: the modifier will apply to ALL of the GLTF meshes
- Otherwise, the desired path for each modifier will try to be found and if it's found among the GLTF nodes, those will be updated individually~~~~
