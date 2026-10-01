// LU decomposition with implicit scaling (Numerical Recipes style), ported from util/Util.java.
// Matrices are arrays of rows (0-based). ludcmp/lin_eq_solv work in place, as in Java.
import { TINY } from './math.js';

/** In-place LU decomposition. Returns 0 if a row is all zeros (singular), else 1. d[0] = +-1. */
export function ludcmp(a, n, indx, d) {
  let imax = 0;
  const vv = new Array(n).fill(0);
  d[0] = 1;
  for (let i = 0; i < n; i++) {
    let big = 0;
    for (let j = 0; j < n; j++) {
      const t = Math.abs(a[i][j]);
      if (t > big) big = t;
    }
    if (big === 0) return 0;
    vv[i] = 1 / big;
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < j; i++) {
      let sum = a[i][j];
      for (let k = 0; k < i; k++) sum -= a[i][k] * a[k][j];
      a[i][j] = sum;
    }
    let big = 0;
    for (let i = j; i < n; i++) {
      let sum = a[i][j];
      for (let k = 0; k < j; k++) sum -= a[i][k] * a[k][j];
      a[i][j] = sum;
      const dum = vv[i] * Math.abs(sum);
      if (dum >= big) { big = dum; imax = i; }
    }
    if (j !== imax) {
      for (let k = 0; k < n; k++) {
        const dum = a[imax][k];
        a[imax][k] = a[j][k];
        a[j][k] = dum;
      }
      d[0] = -d[0];
      vv[imax] = vv[j];
    }
    indx[j] = imax;
    if (a[j][j] === 0) a[j][j] = TINY;
    if (j !== n - 1) {
      const dum = 1 / a[j][j];
      for (let i = j + 1; i < n; i++) a[i][j] *= dum;
    }
  }
  return 1;
}

/** Solves with the LU factors from ludcmp; b is replaced by the solution. */
export function lubksb(a, n, indx, b) {
  let ii = -1;
  for (let i = 0; i < n; i++) {
    const ip = indx[i];
    let sum = b[ip];
    b[ip] = b[i];
    if (ii !== -1) {
      for (let j = ii; j <= i - 1; j++) sum -= a[i][j] * b[j];
    } else if (sum !== 0) {
      ii = i;
    }
    b[i] = sum;
  }
  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i];
    for (let j = i + 1; j < n; j++) sum -= a[i][j] * b[j];
    b[i] = sum / a[i][i];
  }
}

/** Solves a x = b (n unknowns): a and b are destroyed, x gets the solution. Returns 0 if singular. */
export function linEqSolv(a, b, x, n) {
  const indx = new Array(40).fill(0);
  const d = [0];
  if (ludcmp(a, n, indx, d) === 0) return 0;
  lubksb(a, n, indx, b);
  for (let i = 0; i < n; i++) x[i] = b[i];
  return 1;
}
