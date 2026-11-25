// Every number worth tweaking lives here, so design changes are one edit.
// Distances are in metres, times in seconds, angles in radians.

export const PLAYER = {
  /** Walking speed. */
  speed: 5,
  /** How fast the worker turns to face where they're walking (higher = snappier). */
  turnRate: 12,
  /** Collision radius. */
  radius: 0.45,
};

export const CAMERA = {
  /** How far behind the worker the camera sits, when nothing's in the way. */
  distance: 6,
  /** Height of the point the camera orbits — about the worker's shoulders. */
  targetHeight: 1.6,
  /** Look-up / look-down limits. */
  minPitch: -0.35,
  maxPitch: 1.2,
  startPitch: 0.35,
  fov: 60,
};

export const LOOK = {
  /** Radians per pixel of mouse movement. */
  mouse: 0.0025,
  /** Radians per pixel of finger drag. Fingers move less than mice, so higher. */
  touch: 0.006,
};

export const STICK = {
  /** How far (px) the thumb travels from where it landed for full speed. */
  radius: 60,
  /** Ignore tiny wobbles under this fraction of full tilt. */
  deadZone: 0.12,
  /** Touches starting in this fraction of the screen's width (from the left) drive the stick. */
  zoneWidth: 0.45,
};

export const KERNELS = {
  /** Most kernels that can exist at once. Keeps the iPad's frame rate up. */
  max: 1400,
  /** Kernels per second pouring out of the jammed cleaner. */
  spillRate: 28,
  radius: 0.08,
  gravity: 18,
};

export const SHOVEL = {
  /** Most kernels one scoop holds. */
  capacity: 45,
  /** How far in front of the worker the shovel reaches. */
  reach: 1.6,
  /** Throw speed forward and up when tossing. */
  tossForward: 4.5,
  tossUp: 6.5,
};

export const PUMP = {
  /** Popcorn puffs sent up the pipe per full pump stroke. */
  perStroke: 6,
  /** How close the worker must be to grab the handle. */
  reach: 2.2,
};

/** The factory floor runs from -halfX..halfX and -halfZ..halfZ. */
export const ROOM = { halfX: 22, halfZ: 13, height: 9 };

/**
 * The process, in order. Each station stands against the back wall at `x`.
 * Add, remove or reorder stations here.
 */
export const STATIONS = {
  husker: { label: "1  CORN HUSKER", x: -15, color: 0x4caf50 },
  cleaner: { label: "2  KERNEL CLEANER", x: -6, color: 0x2196f3 },
  popper: { label: "3  POPPER", x: 4, color: 0xe53935 },
  flavor: { label: "4  BUTTER & SALT", x: 16, color: 0xffb300 },
} as const;
