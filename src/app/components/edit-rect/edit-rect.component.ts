import { Component, Input, OnInit } from '@angular/core';
import { MapEventObject } from 'src/app/interface/map.interface';
import * as turf from '@turf/turf';
import { getDirection, lineIntersect } from 'src/app/utils';
import { BehaviorSubject, Subject, takeUntil } from 'rxjs';
import Decimal from 'decimal.js';

@Component({
  selector: 'app-edit-rect',
  templateUrl: './edit-rect.component.html',
  styleUrls: ['./edit-rect.component.less'],
})
export class EditRectComponent implements OnInit {
  destroy$: Subject<null> = new Subject();
  @Input() map: AMap.Map;

  pointData = [
    [114.066072, 22.560467],
    [114.066582, 22.560486],
    [114.06659887879212, 22.560099640952803],
    [114.0660888787898, 22.560080640952805],
  ];

  pointDataSubject: BehaviorSubject<number[]> = new BehaviorSubject([]);

  polygon: AMap.OverlayGroup;

  nextBearing: number;
  preBearing: number;

  constructor() {}

  ngOnInit(): void {
    this.drawOriginPolygon();
  }

  drawOriginPolygon() {
    this.pointDataSubject.pipe(takeUntil(this.destroy$));

    this.polygon = new AMap.OverlayGroup();
    this.map.add(this.polygon as any);

    const getCursor = (index: number) => {
      switch (index) {
        case 0:
          return 'nw-resize';
        case 1:
          return 'ne-resize';
        case 2:
          return 'se-resize';
        case 3:
          return 'sw-resize';
      }
    };
    this.pointData.forEach((point, index, arr) => {
      const point1 = point,
        point2 = index === arr.length - 1 ? arr[0] : arr[index + 1];
      // 画线
      const polyline = new AMap.Polyline({
        path: [point1, point2].map((point) => new AMap.LngLat(point[0], point[1])),
        strokeColor: '#214CD9',
        strokeWeight: 4,
        extData: { index, isShadowLine: false },
      });
      // 因为拖拽无法固定轨迹，所以将拖拽事件绑定到透明线上
      // 然后根据事件中鼠标的位置，更新点和线的数据
      const shadowPolyline = new AMap.Polyline({
        path: [point1, point2].map((point) => new AMap.LngLat(point[0], point[1])),
        strokeOpacity: 0,
        strokeWeight: 8,
        extData: { index, isShadowLine: true },
        draggable: true,
        cursor: index % 2 !== 0 ? 'e-resize' : 'n-resize',
      });
      this.polygon.addOverlay(polyline);
      this.polygon.addOverlay(shadowPolyline);
      this.lineEvent(shadowPolyline);

      // 画点
      const circleMarker = new AMap.CircleMarker({
        center: new AMap.LngLat(point[0], point[1]),
        strokeColor: '#336AFE',
        strokeWeight: 2,
        fillColor: '#fff',
        radius: 4,
        cursor: getCursor(index),
        extData: { index },
        draggable: true,
      });
      this.polygon.addOverlay(circleMarker);
      this.pointEvent(circleMarker);
    });
  }

  lineEvent(line: AMap.Polyline) {
    const { index } = line.getExtData();
    line.on('dragging', (data: MapEventObject<AMap.Polyline>) => {
      const mousePos = [data.lnglat.lng, data.lnglat.lat];
      this.lineDragging(index, mousePos);
    });
    line.on('dragend', (data: MapEventObject<AMap.Polyline>) => {
      const mousePos = [data.lnglat.lng, data.lnglat.lat];
      this.lineDragging(index, mousePos);
    });
  }

  lineDragging(index: number, mousePos: number[]) {
    const overlays = this.polygon.getOverlays(),
      realLine: AMap.Polyline[] = overlays.filter(
        (overlay) => overlay.className === 'Overlay.Polyline' && overlay.getExtData().isShadowLine === false,
      ),
      shadowLine: AMap.Polyline[] = overlays.filter(
        (overlay) => overlay.className === 'Overlay.Polyline' && overlay.getExtData().isShadowLine === true,
      ),
      originPoints: AMap.CircleMarker[] = overlays.filter((overlay) => overlay.className === 'Overlay.CircleMarker');

    // 找到被拖拽线的两端点（顺时针方向）
    const dragPoint1 = originPoints[index],
      dragPoint2 = index === 3 ? originPoints[0] : originPoints[index + 1];

    // 被拖拽线的对边两端点（顺时针方向）
    const oppositePoint1 = originPoints[(index + 2) % 4],
      oppositePoint2 = originPoints[(index + 3) % 4];

    // 拖拽线的斜率
    const bearing = turf.bearing(turf.point(this.getCenter(oppositePoint1)), turf.point(this.getCenter(oppositePoint2))),
      // 沿斜率向两端点一定距离找到远处的点
      farPoint1 = turf.destination(this.getCenter(oppositePoint1), 1, bearing, { units: 'kilometers' }).geometry.coordinates,
      farPoint2 = turf.destination(this.getCenter(oppositePoint2), 1, bearing - 180, { units: 'kilometers' }).geometry.coordinates,
      // 将线段加长
      line = turf.lineString([farPoint1, farPoint2]),
      // 鼠标到连线的距离
      distance = turf.pointToLineDistance(turf.point(mousePos), line, { units: 'meters' });

    // 判断鼠标位置在向量的哪一边
    const side = getDirection(
      this.getCenter(oppositePoint1) as [number, number],
      this.getCenter(oppositePoint2) as [number, number],
      mousePos as [number, number],
    );

    // 生成新的点，并更新点数据
    const newPoint1 = turf.destination(this.getCenter(oppositePoint2), distance, side ? bearing - 90 : bearing + 90, { units: 'meters' })
      .geometry.coordinates as [number, number];
    const newPoint2 = turf.destination(this.getCenter(oppositePoint1), distance, side ? bearing - 90 : bearing + 90, { units: 'meters' })
      .geometry.coordinates as [number, number];

    // 如果有点重合，则不执行
    if ([...new Set([newPoint1, newPoint2, oppositePoint1, oppositePoint2])].length < 4) {
      return;
    }

    dragPoint1.setCenter(newPoint1);
    dragPoint2.setCenter(newPoint2);

    // 更新线的数据（包括shadowLine）
    realLine.forEach((line: AMap.Polyline, index: number, arr) => {
      const newPath =
        index === arr.length - 1
          ? [this.getCenter(originPoints[index]), this.getCenter(originPoints[0])].map((item) => new AMap.LngLat(item[0], item[1]))
          : [this.getCenter(originPoints[index]), this.getCenter(originPoints[index + 1])].map((item) => new AMap.LngLat(item[0], item[1]));
      line.setPath(newPath);
      shadowLine[index].setPath(newPath);
    });
  }

  // 获取circleMarker的center
  getCenter(point: AMap.CircleMarker) {
    return [point.getCenter().lng, point.getCenter().lat];
  }

  pointEvent(point: AMap.CircleMarker) {
    const { index } = point.getExtData();

    point.on('dragstart', (data: MapEventObject<AMap.Polyline>) => {
      const overlays = this.polygon.getOverlays(),
        originPoints: AMap.CircleMarker[] = overlays.filter((overlay) => overlay.className === 'Overlay.CircleMarker');
      // 拖拽点下一个点
      const dNextPoint = index === originPoints.length - 1 ? originPoints[0] : originPoints[index + 1],
        // 拖拽点上一个点
        dPrePoint = index === 0 ? originPoints[originPoints.length - 1] : originPoints[index - 1],
        // 拖拽点对角线上的点
        diagonalPoint = originPoints[(index + 2) % 4];
      // 拖拽点和侧边两点的形成线段的斜率
      this.nextBearing = turf.bearing(this.getCenter(dPrePoint), this.getCenter(diagonalPoint));
      this.preBearing = turf.bearing(this.getCenter(dNextPoint), this.getCenter(diagonalPoint));
    });
    point.on('dragging', (data: MapEventObject<AMap.Polyline>) => {
      this.pointDragging1(index);
    });
    point.on('dragend', (data: MapEventObject<AMap.Polyline>) => {
      this.pointDragging1(index);
    });
  }

  // 使用边长及夹角计算点
  pointDragging1(index: number) {
    const overlays = this.polygon.getOverlays(),
      originPoints: AMap.CircleMarker[] = overlays.filter((overlay) => overlay.className === 'Overlay.CircleMarker'),
      realLine: AMap.Polyline[] = overlays.filter(
        (overlay) => overlay.className === 'Overlay.Polyline' && overlay.getExtData().isShadowLine === false,
      ),
      shadowLine: AMap.Polyline[] = overlays.filter(
        (overlay) => overlay.className === 'Overlay.Polyline' && overlay.getExtData().isShadowLine === true,
      );
    // 找到拖拽点和对角线上的点
    const dragPoint = originPoints[index],
      diagonalPoint = originPoints[(index + 2) % 4];

    // 拖拽点两侧的点（顺时针）
    const sidePoint1 = originPoints[index === 0 ? 3 : index - 1],
      sidePoint2 = originPoints[index === 3 ? 0 : index + 1];

    // 计算拖拽点和对角线上的点形成的线段与正北方向夹角
    const diagonalBearing = turf.bearing(this.getCenter(diagonalPoint), this.getCenter(dragPoint));

    // 计算对角线与两边线夹角的余弦值
    const cos1 = Math.cos(turf.degreesToRadians(Math.abs(this.preBearing - diagonalBearing))),
      cos2 = Math.cos(turf.degreesToRadians(Math.abs(this.nextBearing - diagonalBearing)));

    // 鼠标与diagonalPoint之间的距离
    const distance = turf.distance(turf.point(this.getCenter(dragPoint)), turf.point(this.getCenter(diagonalPoint)), { units: 'meters' });

    // 计算侧边两点的新坐标
    const newDistance1 = new Decimal(distance).mul(cos1).toDP(4).toNumber(),
      newDistance2 = new Decimal(distance).mul(cos2).toDP(4).toNumber();

    const newPos1 = turf.destination(this.getCenter(diagonalPoint), newDistance1, this.preBearing, { units: 'meters' }).geometry
      .coordinates;
    const newPos2 = turf.destination(this.getCenter(diagonalPoint), newDistance2, this.nextBearing, { units: 'meters' }).geometry
      .coordinates;

    if ([...new Set([newPos1, newPos2, this.getCenter(dragPoint), this.getCenter(diagonalPoint)])].length < 4) {
      return;
    }

    // 更新两侧点的坐标
    sidePoint1.setCenter(new AMap.LngLat(newPos1[0], newPos1[1]));
    sidePoint2.setCenter(new AMap.LngLat(newPos2[0], newPos2[1]));

    // 更新线的路径
    realLine.forEach((line, index, arr) => {
      const newPath =
        index === arr.length - 1
          ? [this.getCenter(originPoints[index]), this.getCenter(originPoints[0])].map((item) => new AMap.LngLat(item[0], item[1]))
          : [this.getCenter(originPoints[index]), this.getCenter(originPoints[index + 1])].map((item) => new AMap.LngLat(item[0], item[1]));
      line.setPath(newPath);
      shadowLine[index].setPath(newPath);
    });
  }

  pointDragging3(index: number) {
    const overlays = this.polygon.getOverlays(),
      originPoints: AMap.CircleMarker[] = overlays.filter((overlay) => overlay.className === 'Overlay.CircleMarker'),
      realLine: AMap.Polyline[] = overlays.filter(
        (overlay) => overlay.className === 'Overlay.Polyline' && overlay.getExtData().isShadowLine === false,
      ),
      shadowLine: AMap.Polyline[] = overlays.filter(
        (overlay) => overlay.className === 'Overlay.Polyline' && overlay.getExtData().isShadowLine === true,
      );

    // 拖拽的点
    const dragPoint = originPoints[index],
      // 拖拽点下一个点
      dNextPoint = index === originPoints.length - 1 ? originPoints[0] : originPoints[index + 1],
      // 拖拽点上一个点
      dPrePoint = index === 0 ? originPoints[originPoints.length - 1] : originPoints[index - 1],
      // 拖拽点对角线上的点
      diagonalPoint = originPoints[(index + 2) % 4];

    // 以拖拽点对角线上的点为中心，沿矩形两边得到两条长度为2公里的线
    const lines = this.getPointCross(this.getCenter(diagonalPoint) as [number, number], [this.nextBearing, this.preBearing]);

    // 以拖拽点为中心，沿矩形两边得到长度为2公里的线
    const dragLines = this.getPointCross(this.getCenter(dragPoint) as [number, number], [this.preBearing, this.nextBearing]);

    // 找拖拽点沿矩形两边的斜率与lines的交点
    lines.forEach((line, index) => {
      dragLines.forEach((dragLine) => {
        const intersectLine = turf.lineIntersect(line, dragLine)?.features?.[0]?.geometry.coordinates;
        if (!intersectLine) {
          return;
        }

        if (index === 0) {
          dNextPoint.setCenter(new AMap.LngLat(intersectLine[0], intersectLine[1]));
        }
        if (index === 1) {
          dPrePoint.setCenter(new AMap.LngLat(intersectLine[0], intersectLine[1]));
        }
        // 更新线的路径
        realLine.forEach((line, index, arr) => {
          const newPath =
            index === arr.length - 1
              ? [this.getCenter(originPoints[index]), this.getCenter(originPoints[0])].map((item) => new AMap.LngLat(item[0], item[1]))
              : [this.getCenter(originPoints[index]), this.getCenter(originPoints[index + 1])].map(
                  (item) => new AMap.LngLat(item[0], item[1]),
                );
          line.setPath(newPath);
          shadowLine[index].setPath(newPath);
        });
      });
    });
  }

  // 以originPoint为中心，向bearing中每个方向绘长线
  getPointCross(originPoint: [number, number], bearings: number[]) {
    const result: turf.helpers.Feature<
      turf.helpers.LineString,
      {
        [name: string]: any;
      }
    >[] = [];
    bearings.forEach((bearing) => {
      const point1 = turf.destination(originPoint, 1, bearing).geometry.coordinates as number[];
      const point2 = turf.destination(originPoint, 1, bearing - 180).geometry.coordinates as number[];
      const line = turf.lineString([point1, point2]);
      result.push(line);
    });
    return result;
  }
}
