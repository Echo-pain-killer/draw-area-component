import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { BehaviorSubject, combineLatest, filter, Subject, switchMap, takeUntil } from 'rxjs';
import { MapEventObject } from 'src/app/interface/map.interface';
import * as turf from '@turf/turf';
import { getDirection } from '../../utils';
import { point } from '@turf/turf';

@Component({
  selector: 'app-draw-rect',
  templateUrl: './draw-rect.component.html',
  styleUrls: ['./draw-rect.component.less'],
})
export class DrawRectComponent implements OnInit, OnDestroy {
  @Input() map: AMap.Map;

  private componentDestroySubject: Subject<null> = new Subject();
  private mapEventSubject: Subject<MapEventObject> = new Subject();

  pointDataSubject: BehaviorSubject<[number, number][]> = new BehaviorSubject([]);

  pointOverlayGroup: AMap.OverlayGroup;
  lineOverlayGroup: AMap.OverlayGroup;

  activeLine: AMap.Polyline;
  activeRect: AMap.Polygon;

  thirdPoint: [number, number];
  fourthPoint: [number, number];

  constructor() {}

  ngOnInit(): void {
    this.eventHandle();
    // 地图点击事件处理
    this.clickHandle();
    // 画点
    this.drawPoint();
    // 画第一个点和鼠标间的连线
    this.drawEdgeGuide();
    // 绘制矩形的预览效果
    this.drawRectGuide();
    // 绘制直线
    this.drawLine();
  }

  ngOnDestroy(): void {
    this.componentDestroySubject.next(null);
    this.componentDestroySubject.unsubscribe();

    // 关闭map的监听
    this.map.off('click', this.sendMapEvent);
    this.map.off('mousemove', this.sendMapEvent);
  }

  eventHandle(): void {
    this.map.on('click', this.sendMapEvent);
    this.map.on('mousemove', this.sendMapEvent);
  }

  sendMapEvent = (data: MapEventObject) => {
    this.mapEventSubject.next(data);
  };

  clickHandle(): void {
    this.mapEventSubject
      .pipe(
        takeUntil(this.componentDestroySubject),
        filter((event) => event.type === 'click'),
      )
      .subscribe((event) => {
        const pointCount = this.pointDataSubject.value.length;
        const point = [event.lnglat.lng, event.lnglat.lat] as [number, number];
        if (pointCount < 2) {
          this.pointDataSubject.next([...this.pointDataSubject.value, point]);
        }
        if (pointCount === 2) {
          this.pointDataSubject.next([...this.pointDataSubject.value, this.thirdPoint, this.fourthPoint]);
        }
      });
  }

  drawPoint(): void {
    this.pointOverlayGroup = new AMap.OverlayGroup();
    this.map.add(this.pointOverlayGroup as any);

    this.pointDataSubject.pipe(takeUntil(this.componentDestroySubject)).subscribe((points) => {
      points.forEach((point, index) => {
        if (index < this.pointOverlayGroup.getOverlays().length) {
          // group中已有实例，只修改数据
          (this.pointOverlayGroup.getOverlays()[index] as AMap.Circle).setCenter(new AMap.LngLat(...(point as [number, number])));
        } else {
          // 创建实例并加入组
          const circleMarker = new AMap.CircleMarker({
            center: new AMap.LngLat(point[0], point[1]),
            fillOpacity: 0,
            strokeOpacity: 0,
            bubble: true,
          });
          this.pointOverlayGroup.addOverlay(circleMarker);
        }
      });
    });
  }

  // 只绘制了一个点的时候，生成该点与鼠标之间的连线
  drawEdgeGuide(): void {
    combineLatest([this.pointDataSubject, this.mapEventSubject])
      .pipe(
        takeUntil(this.componentDestroySubject),
        filter(([points, event]) => points.length === 1 && event.type === 'mousemove'),
      )
      .subscribe(([points, event]) => {
        const point = points[0];
        const mousePos = new AMap.LngLat(event.lnglat.lng, event.lnglat.lat);
        if (!this.activeLine) {
          this.activeLine = new AMap.Polyline({
            path: [point, mousePos],
            bubble: true,
          });
          this.map.add(this.activeLine);
          return;
        }
        this.activeLine.setPath([point, mousePos]);
      });
  }

  // 绘制了两个点后，根据鼠标位置生成另外两个点
  drawRectGuide(): void {
    combineLatest([this.pointDataSubject, this.mapEventSubject])
      .pipe(
        takeUntil(this.componentDestroySubject),
        filter(([points, event]) => points.length === 2 && event.type === 'mousemove'),
      )
      .subscribe(([points, event]) => {
        const mousePos = [event.lnglat.lng, event.lnglat.lat] as [number, number];
        // 已绘制两个点的斜率
        const bearing = turf.bearing(turf.point(points[0]), turf.point(points[1]));
        // 沿斜率向两端点一定距离找到远处的点
        const farPoint1 = turf.destination(points[0], 1, bearing, { units: 'kilometers' }).geometry.coordinates;
        const farPoint2 = turf.destination(points[1], 1, bearing - 180, { units: 'kilometers' }).geometry.coordinates;
        // 已绘制的两个点连成的线段，并向两端加长
        const line = turf.lineString([farPoint1, farPoint2]);
        // 鼠标到连线的距离
        const distance = turf.pointToLineDistance(turf.point(mousePos), line, { units: 'meters' });

        // 判断鼠标位置在向量的哪一边
        const side = getDirection(points[0], points[1], mousePos);

        // 绘制剩下两个点，并将四个点绘制成矩形
        this.thirdPoint = turf.destination(points[1], distance, side ? bearing - 90 : bearing + 90, { units: 'meters' }).geometry
          .coordinates as [number, number];
        this.fourthPoint = turf.destination(points[0], distance, side ? bearing - 90 : bearing + 90, { units: 'meters' }).geometry
          .coordinates as [number, number];

        if (!this.activeRect) {
          // 将四个点连成矩形
          this.activeRect = new AMap.Polygon({
            path: [...points, this.thirdPoint, this.fourthPoint],
            bubble: true,
          });
          this.map.add(this.activeRect);
          return;
        }
        this.activeRect.setPath([...points, this.thirdPoint, this.fourthPoint])
      });
  }

  // 绘制线
  drawLine(): void {
    this.lineOverlayGroup = new AMap.OverlayGroup();
    this.map.add(this.lineOverlayGroup as any);

    this.pointDataSubject
      .pipe(
        takeUntil(this.componentDestroySubject),
        filter((points) => points.length > 1),
      )
      .subscribe((points) => {
        // 有两个及以上的点画线
        this.map.remove(this.activeLine);
        points.forEach((point, index, arr) => {
          if (index < arr.length - 1) {
            const polyline = new AMap.Polyline({
              path: [new AMap.LngLat(...point), new AMap.LngLat(...arr[index + 1])],
              bubble: true,
            });
            this.lineOverlayGroup.addOverlay(polyline);
          }
        });
        // 当有四个点的时候，绘制矩形
        if (points.length === 4) {
          this.map.remove(this.activeRect);
          const polyline = new AMap.Polygon({
            path: points,
          });
          this.map.add(polyline);
          this.lineOverlayGroup.clearOverlays();
        }
      });
  }
}
