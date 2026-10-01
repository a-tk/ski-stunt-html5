import { G } from '../../util/math.js';

/**
 * A free rigid body with 3 degrees of freedom (x, y, angle) whose link origin is its center of mass:
 * the dynamics of a pushable object. Forces and torque come in through fext; gravity is added here.
 */
export class DynRigid {
  constructor(mass, inertia) {
    this.mass = mass;
    this.inertia = inertia;
  }

  eval(state, torq, fext, ac) {
    ac[0] = fext[0] / this.mass;
    ac[1] = fext[1] / this.mass + G;
    ac[2] = fext[2] / this.inertia;
    return 0;
  }
}
