import { Vector3 } from "three/src/math/Vector3";
import * as turf from '@turf/turf'

type coordinate2D = [number, number];

/**
 * 计算点在向量的左边还是右边 返回为true表示坐标 false表示右边
 *
 * @param {coordinate2D} start
 * @param {coordinate2D} end
 * @param {coordinate2D} outPoint
 * @return {*}
 */
export const getDirection = (start: coordinate2D, end: coordinate2D, outPoint: coordinate2D) => {
  // 基准向量方向
  const basicVector = new Vector3(end[0] - start[0], end[1] - start[1], 0);
  // 外部向量方向
  const outVector = new Vector3(outPoint[0] - start[0], outPoint[1] - start[1], 0);

  // 计算法向量 从基准向量到外部向量
  const nVector = new Vector3().crossVectors(basicVector, outVector);
  // if (nVector.z === 0) {
  //   throw Error('外部点在向量上');
  // }
  return nVector.z > 0;
};


/**
 * 获取两条直线交点
 *
 * @param line1 直线1
 * @param line2 直线2
 */
 export function lineIntersect(line1, line2): number[] {
   if([...new Set([...line1.coordinates,...line2.coordinates].map(item => item.toString()))].length < 4) {
     return null
   }
  // 两条线平行则没有交点
  if (turf.booleanParallel(turf.lineString(line1.coordinates), turf.lineString(line2.coordinates))) {
    return null;
  }
  const a1 = line1.coordinates[1][1] - line1.coordinates[0][1];
  const a2 = line2.coordinates[1][1] - line2.coordinates[0][1];
  const b1 = line1.coordinates[0][0] - line1.coordinates[1][0];
  const b2 = line2.coordinates[0][0] - line2.coordinates[1][0];
  const c1 = a1 * line1.coordinates[0][0] + b1 * line1.coordinates[0][1];
  const c2 = a2 * line2.coordinates[0][0] + b2 * line2.coordinates[0][1];
  const denominator = a1 * b2 - a2 * b1;
  return [(b2 * c1 - b1 * c2) / denominator, (a1 * c2 - a2 * c1) / denominator];
}
