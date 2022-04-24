import { Vector3 } from "three/src/math/Vector3";

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
