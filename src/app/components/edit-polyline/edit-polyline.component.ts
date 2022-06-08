import { Component, Input, OnInit } from '@angular/core';
import { MapEventObject } from 'src/app/interface/map.interface';
import * as turf from '@turf/turf';

type TLineString = turf.helpers.Feature<
  turf.helpers.LineString,
  {
    bearing: number;
  }
>;
@Component({
  selector: 'app-edit-polyline',
  templateUrl: './edit-polyline.component.html',
  styleUrls: ['./edit-polyline.component.less'],
})
export class EditPolylineComponent implements OnInit {
  @Input() map: AMap.Map;

  data = [
    [114.064161, 22.560906],
    [114.064684, 22.561235],
    [114.065314, 22.560871],
    [114.066004, 22.561158],
  ];

  polyLineOverlayGroup: AMap.OverlayGroup;

  // 这个map记录了当前需要吸附的线，key为线的type（手动添加的），
  // value部分，isAbsorb为true则表示吸附的是这条线，line是线数据
  isAbsorbMap: Map<string | number, { isAbsorb: boolean; line: TLineString }> = new Map();

  mousePos: [number, number]; // 鼠标位置

  activeAbsorbLine: AMap.Polyline; // 被吸附的线

  constructor() {}

  ngOnInit(): void {
    this.map.setFitView(
      new AMap.Polyline({
        path: this.data.map((item) => new AMap.LngLat(item[0], item[1])),
      }) as any,
    );
    this.drawOriginPolyline();
  }

  drawOriginPolyline() {
    this.polyLineOverlayGroup = new AMap.OverlayGroup();
    this.map.add(this.polyLineOverlayGroup as any);
    this.data.forEach((item, index, arr) => {
      const circleMarker = new AMap.CircleMarker({
        center: new AMap.LngLat(item[0], item[1]),
        strokeColor: '#336AFE',
        strokeWeight: 2,
        fillColor: '#fff',
        radius: 4,
        cursor: 'pointer',
        draggable: true,
        extData: {
          index,
        },
      });
      this.polyLineOverlayGroup.addOverlay(circleMarker);
      this.pointEvent(circleMarker);

      if (index === arr.length - 1) {
        return;
      }
      const polyLine = new AMap.Polyline({
        path: [new AMap.LngLat(item[0], item[1]), new AMap.LngLat(arr[index + 1][0], arr[index + 1][1])],
        strokeColor: '#336AFE',
        strokeStyle: 'dashed',
        strokeDasharray: [4, 4],
        bubble: true,
        extData: {
          index,
        },
      });
      this.polyLineOverlayGroup.addOverlay(polyLine);
    });
  }

  pointEvent(point: AMap.CircleMarker) {
    const { index } = point.getExtData();
    point.on('dragging', (data: MapEventObject<AMap.CircleMarker>) => {
      this.mousePos = [data.lnglat.lng, data.lnglat.lat];
      // 点拖拽处理
      this.pointDragging(index);
      // 与前后两点的正交吸附处理
      this.orthogonalAdsorbent(index);
      // 与前后两个点行成90°吸附
      this.adsorbent90(index);
    });
  }

  getCenter(point: AMap.CircleMarker) {
    return [point.getCenter().lng, point.getCenter().lat];
  }

  pointDragging(index: number) {
    const points: AMap.CircleMarker[] = this.polyLineOverlayGroup.getOverlays().filter((item) => item.className === 'Overlay.CircleMarker'),
      lines: AMap.Polyline[] = this.polyLineOverlayGroup.getOverlays().filter((item) => item.className === 'Overlay.Polyline');

    const prePoint = index === 0 ? null : points[index - 1],
      nextPoint = index === points.length - 1 ? null : points[index + 1];

    // 更新拖拽点前一条线
    if (prePoint) {
      lines[index - 1].setPath(
        [this.getCenter(points[index - 1]), this.getCenter(points[index])].map((item) => new AMap.LngLat(item[0], item[1])),
      );
    }
    // 更新拖拽点的后一条线
    if (nextPoint) {
      lines[index].setPath(
        [this.getCenter(points[index]), this.getCenter(points[index + 1])].map((item) => new AMap.LngLat(item[0], item[1])),
      );
    }
  }

  // 正交吸附
  orthogonalAdsorbent(index: number) {
    const points: AMap.CircleMarker[] = this.polyLineOverlayGroup.getOverlays().filter((item) => item.className === 'Overlay.CircleMarker');

    const dragPoint = points[index],
      prePoint = index === 0 ? null : points[index - 1],
      nextPoint = index === points.length - 1 ? null : points[index + 1];

    const adsorbLines = [
      ...this.getPointCross(prePoint ? (this.getCenter(prePoint) as [number, number]) : null, [0, 90]),
      ...this.getPointCross(nextPoint ? (this.getCenter(nextPoint) as [number, number]) : null, [0, 90]),
    ];
    this.adsorbent(adsorbLines, dragPoint, 2);
  }

  /**
   * 实现吸附逻辑
   * @param lines 需要吸附的线
   * @param points 已有的点数据
   * @param distance 小于这个距离就吸附
   */
  adsorbent(lines: TLineString[], dragPoint: AMap.CircleMarker, adsorbDistance: number) {
    lines.forEach((line) => {
      const distance = turf.pointToLineDistance(this.mousePos, line, { units: 'meters' });
      // 如果距离小于等于 adsorbDistance m,则吸附
      if (distance > adsorbDistance) {
        this.isAbsorbMap.set(line.id, { isAbsorb: false, line });
        return;
      }
      this.isAbsorbMap.set(line.id, { isAbsorb: true, line });

      // 鼠标点往线的垂直方向，正向和反向画两个点连成线，找该线与原始线的交点
      const bearing1 = line.properties.bearing - 90,
        bearing2 = line.properties.bearing + 90,
        pt1 = turf.destination(this.mousePos, 100, bearing1, { units: 'meters' }).geometry.coordinates, // 作垂线的一个点
        pt2 = turf.destination(this.mousePos, 100, bearing2, { units: 'meters' }).geometry.coordinates, // 作垂线的另一个点
        lineStr = turf.lineString([pt1, pt2]); // 垂线

      const targetPoint = turf.lineIntersect(line, lineStr); // 垂线和线的交点
      if (targetPoint.features.length === 0) {
        return;
      }

      // 吸附
      dragPoint.setCenter(targetPoint.features[0].geometry.coordinates as [number, number]);
    });

    // 显示吸附的线
    this.showAbsorbLine();
  }

  // 显示被吸附的线
  showAbsorbLine() {
    // 被吸附的线
    const line = [...this.isAbsorbMap.values()].find((item) => item.isAbsorb)?.line;
    // 如果没有被吸附的线，则删除activeAbsorbLine
    if (!line) {
      if (this.activeAbsorbLine) {
        this.map.remove(this.activeAbsorbLine);
        this.activeAbsorbLine = null;
      }
      return;
    }
    // 创建或更新吸附线
    if (!this.activeAbsorbLine) {
      this.activeAbsorbLine = new AMap.Polyline({
        path: line.geometry.coordinates.map((item) => new AMap.LngLat(item[0], item[1])),
        strokeColor: '#FAAD14',
        strokeStyle: 'dashed',
        strokeDasharray: [4, 4],
        bubble: true,
      });
      this.map.add(this.activeAbsorbLine);
    } else {
      this.activeAbsorbLine.setPath(line.geometry.coordinates.map((item) => new AMap.LngLat(item[0], item[1])));
      this.activeAbsorbLine.setOptions({
        strokeColor: '#FAAD14',
      });
    }
  }

  // 以originPoint为中心，向bearing中每个方向绘长线
  getPointCross(originPoint: [number, number], bearings: number[]) {
    if (!originPoint) {
      return [];
    }
    const result: TLineString[] = [];
    bearings.forEach((bearing) => {
      const point1 = turf.destination(originPoint, 1, bearing).geometry.coordinates as number[];
      const point2 = turf.destination(originPoint, 1, bearing - 180).geometry.coordinates as number[];
      const line = turf.lineString([point1, point2]) as TLineString;
      line.properties.bearing = bearing;
      line.id = `${originPoint.toString()}-${bearing}`; // 构建唯一id
      result.push(line);
    });
    return result;
  }

  // 90°吸附
  adsorbent90(index: number) {
    const points: AMap.CircleMarker[] = this.polyLineOverlayGroup.getOverlays().filter((item) => item.className === 'Overlay.CircleMarker');

    const dragPoint = points[index],
      prePoint = index === 0 ? null : points[index - 1],
      nextPoint = index === points.length - 1 ? null : points[index + 1];

    // prePoint，nextPoint两点中点
    const centerPoint = turf.midpoint(this.getCenter(prePoint), this.getCenter(nextPoint)).geometry.coordinates,
      bearing1 = turf.bearing(centerPoint, this.getCenter(prePoint)),
      bearing2 = turf.bearing(centerPoint, this.getCenter(nextPoint)),
      distance = turf.distance(this.getCenter(prePoint), this.getCenter(nextPoint), { units: 'meters' }) / 2;

    // 以prePoint,nextPoint两点为直径构建一个圆
    const arc1 = turf.lineArc(centerPoint, distance, bearing1, bearing2, { units: 'meters' }).geometry.coordinates;
    const arc2 = turf.lineArc(centerPoint, distance, bearing2, bearing1, { units: 'meters' }).geometry.coordinates;

    const circular: TLineString[] = [];
    [...arc1,...arc2].forEach((point,index,arr) => {
      if(index === arr.length - 1) {
        return
      }
      const line = turf.lineString([point,arr[index + 1]]) as TLineString
      line.properties.bearing = turf.bearing(point,arr[index + 1])
      circular.push(line)
    })
    this.adsorbent(circular,dragPoint,4)
  }
}
