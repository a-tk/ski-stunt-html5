// Constants and small helpers shared by the engine (port of util/Const.java and Util.frand).
export const M_PI = Math.PI;
export const NOVAL = 9999;
export const RAD_TO_DEG = 180 / Math.PI;
export const DEG_TO_RAD = Math.PI / 180;
/** Gravity (negative: y points up). */
export const G = -9.8;
export const TINY = 1.0e-20;
export const FLOAT_MAX = 3.4028234663852886e38;

/** a*r + (1-r)*b with r uniform in [0,1) -- the Java Util.frand. */
export function frand(a, b, rng = Math.random) {
  const r = rng();
  return a * r + (1 - r) * b;
}
