import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { point } from '@turf/turf';
import { BehaviorSubject, combineLatest, filter, fromEvent, map, Subject, switchMap, take, takeUntil } from 'rxjs';
import { MapEventObject } from 'src/app/interface/map.interface';

@Component({
  selector: 'app-draw-line',
  templateUrl: './draw-line.component.html',
  styleUrls: ['./draw-line.component.less'],
})
export class DrawLineComponent implements OnInit, OnDestroy {
  @Input() map: AMap.Map;

  @Output() getPoints = new EventEmitter<[number,number][]>()

  private componentDestroySubject: Subject<null> = new Subject();
  private mapEventSubject: Subject<MapEventObject> = new Subject();

  pointDataSubject: BehaviorSubject<[number, number][]> = new BehaviorSubject([]);

  pointOverlayGroup: AMap.OverlayGroup;
  lineOverlayGroup: AMap.OverlayGroup;

  activeLine: AMap.Polyline;

  constructor() {}

  ngOnInit(): void {
    this.map.setDefaultCursor('crosshair');
    this.eventHandle();
    // 地图点击事件处理
    this.clickHandle();
    // 画点
    this.drawPoint();
    // 画线
    this.drawLine();
    // 鼠标动态线
    this.drawMouseLine();
    // 结束绘制
    this.endDraw();
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
        const point = [event.lnglat.lng, event.lnglat.lat] as [number, number];
        this.pointDataSubject.next([...this.pointDataSubject.value, point]);
      });
  }

  drawPoint(): void {
    // 初始化组并绑定事件
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
            strokeColor: '#FAAD14',
            strokeWeight: 2,
            fillColor: '#fff',
            radius: 4,
            bubble: true,
          });
          this.pointOverlayGroup.addOverlay(circleMarker);
        }
      });
    });
  }

  drawLine(): void {
    // 初始化组并绑定事件
    this.lineOverlayGroup = new AMap.OverlayGroup();
    this.map.add(this.lineOverlayGroup as any);
    this.pointDataSubject
      .pipe(
        takeUntil(this.componentDestroySubject),
        filter((points) => points.length > 1),
      )
      .subscribe((points) => {
        points.forEach((point, index) => {
          if (index === 0) {
            return;
          }
          if (index < this.lineOverlayGroup.getOverlays().length + 1) {
            (this.lineOverlayGroup.getOverlays()[index - 1] as AMap.Polyline).setPath([
              new AMap.LngLat(...point),
              new AMap.LngLat(...points[index - 1]),
            ]);
          } else {
            const polyline = new AMap.Polyline({
              path: [new AMap.LngLat(...point), new AMap.LngLat(...points[points.length - 2])],
              strokeColor: '#FAAD14',
              strokeStyle: 'dashed',
              strokeDasharray: [4, 4],
              bubble: true,
            });
            this.lineOverlayGroup.addOverlay(polyline);
          }
        });
      });
  }

  drawMouseLine(): void {
    combineLatest([this.pointDataSubject, this.mapEventSubject])
      .pipe(
        takeUntil(this.componentDestroySubject),
        filter(([points, event]) => event.type === 'mousemove' && points.length > 0),
      )
      .subscribe(([points, event]) => {
        const point = points[points.length - 1];
        const mousePos = [event.lnglat.lng, event.lnglat.lat] as [number, number];
        if (this.activeLine) {
          this.activeLine.setPath([point, mousePos]);
          return;
        }
        this.activeLine = new AMap.Polyline({
          path: [point, mousePos],
          strokeColor: '#FAAD14',
          strokeStyle: 'dashed',
          strokeDasharray: [4, 4],
          bubble: true,
        });
        this.map.add(this.activeLine);
      });
  }

  endDraw(): void {
    fromEvent(window, 'keyup')
      .pipe(
        takeUntil(this.componentDestroySubject),
        filter((event: KeyboardEvent) => event.key.toLocaleLowerCase() === 'escape'),
      )
      .subscribe((event) => {
        this.map.remove(this.activeLine)
        this.map.off('click', this.sendMapEvent);
        this.map.off('mousemove', this.sendMapEvent);
        this.map.setDefaultCursor('default');
        this.getPoints.emit(this.pointDataSubject.value)
      });
  }
}
