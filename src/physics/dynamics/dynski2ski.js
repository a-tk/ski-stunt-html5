// A detached ski: one link, three degrees of freedom.
// Generated closed-form dynamics, ported statement for statement from DynSki2Ski.java.
// eval(state, torq, fext, ac): state = (x, vx, y, vy, th0, w0, ...), torq = joint torques,
// fext = (Fx, Fy, torque) per link about the link origin; writes the accelerations into ac.
import { G } from '../../util/math.js';
import { linEqSolv } from '../../util/linsolve.js';

const MAX_EQNS = 20;

export class DynSki2Ski {
  eval(var1, var2, var3, var4) {
    const var5 = 1.0;
    const var6 = 0.25295;
    const var7 = 0.576601;
    const var8 = -1.198019;
    const var9 = Array.from({ length: MAX_EQNS }, () => new Array(MAX_EQNS).fill(0));
    const var10 = new Array(MAX_EQNS).fill(0);
    const var11 = new Array(MAX_EQNS).fill(0);
    const var17 = new Array(128).fill(0);
    const var12 = var1[4];
    const var13 = var1[5];
    const var14 = -1.198019 + var12;
    const var15 = Math.sin(var14);
    const var16 = Math.cos(var14);
    var17[0] = -var13 * var13 * 0.576601 * var16;
    var17[1] = -var15 * 0.576601;
    var17[2] = -var13 * var13 * 0.576601 * var15;
    var17[3] = var16 * 0.576601;
    var17[4] = -var3[0];
    var17[5] = -var3[1] - 1.0 * G;
    var17[6] = 1.0 * G * 0.576601 * var16 + var2[0] + var3[2];
    var17[7] = -0.576601 * var16;
    var17[8] = 0.576601 * var15;
    var9[0][0] = 1.0;
    var9[0][1] = 0.0;
    var9[0][2] = 1.0 * var17[1];
    var9[1][0] = 0.0;
    var9[1][1] = 1.0;
    var9[1][2] = 1.0 * var17[3];
    var9[2][0] = var17[8];
    var9[2][1] = var17[7];
    var9[2][2] = var17[8] * var17[1] + var17[7] * var17[3] - 0.25295;
    var10[0] = -1.0 * var17[0] - var17[4];
    var10[1] = -1.0 * var17[2] - var17[5];
    var10[2] = -var17[8] * var17[0] - var17[7] * var17[2] - var17[6];
    linEqSolv(var9, var10, var11, 3);
    var4[0] = var11[0];
    var4[1] = var11[1];
    var4[2] = var11[2];
    return 0;
  }
}
