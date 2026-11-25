import * as THREE from "three";

// The cartoon look: flat bands of shade instead of smooth lighting (a toon
// material with a three-step ramp), plus a dark ink outline around solid
// shapes. The outline is the "inverted hull" trick — a slightly bigger copy
// of the shape, drawn inside-out in ink, so only its rim peeks out. It's far
// cheaper on an iPad than a full-screen outline pass.

const ramp = (() => {
  // Dark, mid, lit. Nearest filtering keeps the bands crisp.
  const tones = new Uint8Array([90, 170, 255]);
  const tex = new THREE.DataTexture(tones, tones.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

const materials = new Map<string, THREE.MeshToonMaterial>();

/** A shared cel-shaded material in this colour. */
export function toon(color: THREE.ColorRepresentation, emissive = 0x000000): THREE.MeshToonMaterial {
  const key = `${new THREE.Color(color).getHexString()}:${emissive}`;
  let mat = materials.get(key);
  if (!mat) {
    mat = new THREE.MeshToonMaterial({ color, gradientMap: ramp, emissive });
    materials.set(key, mat);
  }
  return mat;
}

export const INK = new THREE.MeshBasicMaterial({ color: 0x1a1208, side: THREE.BackSide });

/**
 * Give a mesh an ink outline `thickness` metres wide. Works for shapes centred
 * on their own origin (boxes, cylinders, spheres) — the hull is scaled per axis
 * so the rim is the same width on every side.
 */
export function outline<T extends THREE.Mesh>(mesh: T, thickness = 0.04): T {
  const geo = mesh.geometry;
  geo.computeBoundingBox();
  const size = new THREE.Vector3();
  geo.boundingBox!.getSize(size);
  const hull = new THREE.Mesh(geo, INK);
  hull.scale.set(
    size.x > 0 ? (size.x + thickness * 2) / size.x : 1,
    size.y > 0 ? (size.y + thickness * 2) / size.y : 1,
    size.z > 0 ? (size.z + thickness * 2) / size.z : 1
  );
  hull.raycast = () => {};
  hull.castShadow = false;
  hull.receiveShadow = false;
  mesh.add(hull);
  return mesh;
}

/** A cel-shaded, outlined mesh that casts and catches shadows. */
export function part(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  thickness = 0.04
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, toon(color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (thickness > 0) outline(mesh, thickness);
  return mesh;
}

/** A sign: chunky text painted on a board, for labelling stations. */
export function sign(text: string, color: number, width = 4): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext("2d")!;
  g.fillStyle = `#${new THREE.Color(color).getHexString()}`;
  g.fillRect(0, 0, 512, 128);
  g.lineWidth = 12;
  g.strokeStyle = "#1a1208";
  g.strokeRect(6, 6, 500, 116);
  g.fillStyle = "#fffbe8";
  g.strokeStyle = "#1a1208";
  g.lineWidth = 8;
  g.textAlign = "center";
  g.textBaseline = "middle";
  let size = 64;
  do {
    g.font = `900 ${size}px "Trebuchet MS", "Arial Black", sans-serif`;
    size -= 4;
  } while (g.measureText(text).width > 460 && size > 20);
  g.strokeText(text, 256, 68);
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 4),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  return mesh;
}
