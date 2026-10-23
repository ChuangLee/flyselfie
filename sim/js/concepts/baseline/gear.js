// B0 helmet camera mesh.
export function createGear(scene, THREE) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 0.035), new THREE.MeshPhysicalMaterial({ color: 0x111317, roughness: 0.4, clearcoat: 0.6 }));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 20), new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.05, clearcoat: 1 }));
  lens.rotation.z = Math.PI / 2; lens.position.x = 0.035;
  g.add(body, lens);
  body.castShadow = true;
  scene.add(g);
  return {
    hideInPip: [g],
    setVisible(v) { g.visible = v; },
    update(d, ctx) {
      const h = ctx.skier.headPos;
      if (!h) return;
      const f = ctx.fwd.clone();
      g.position.copy(h).add(new THREE.Vector3(0, 0.12, 0)).addScaledVector(f, 0.02);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), f);
    },
  };
}
