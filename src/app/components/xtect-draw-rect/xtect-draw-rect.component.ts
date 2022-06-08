import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import * as turf from '@turf/turf';
import { BehaviorSubject, combineLatest, filter, Subject, take, takeUntil } from 'rxjs';
import { MapEventObject } from 'src/app/interface/map.interface';
import { getDirection } from 'src/app/utils';

@Component({
  selector: 'app-xtect-draw-rect',
  templateUrl: './xtect-draw-rect.component.html',
  styleUrls: ['./xtect-draw-rect.component.less'],
})
export class XtectDrawRectComponent implements OnInit, AfterViewInit {
  @Input() map: AMap.Map;
  @Output() points = new EventEmitter<[number, number][]>();

  @ViewChild('lengthInput') lengthInput: ElementRef<HTMLInputElement>;

  componentDestroySubject: Subject<null> = new Subject();
  mapEventSubject: Subject<MapEventObject> = new Subject();

  pointDataSubject: BehaviorSubject<[number, number][]> = new BehaviorSubject([]);
  pointOverlayGroup: AMap.OverlayGroup;
  lineOverlayGroup: AMap.OverlayGroup;
  guideOverlayGroup: AMap.OverlayGroup;
  activeGuideOverlayGroup: AMap.OverlayGroup;

  activeLine: AMap.Polyline;
  activeRect: AMap.Polygon;
  activeText: AMap.Text;

  // 通过鼠标移动产生的矩形点
  thirdPoint: [number, number];
  fourthPoint: [number, number];

  // 通过输入框输入数值产生的矩形点
  newThirdPoint: [number, number];
  newFourthPoint: [number, number];

  // 合规范围
  MIN_LIMIT = 30;
  MAX_LIMIT = 60;

  // 可探讨范围
  MIN_DISCUSS = 20;
  MAX_DISCUSS = 80;

  length = 0;

  mousePos: [number, number]; // 鼠标位置
  inputNewPos: [number, number] = null; // 通过input输入后找到的点

  // redo/undo相关
  undo_buffer: [number, number][] = JSON.parse(JSON.stringify(this.pointDataSubject.value));
  redo_buffer: [number, number][] = [];

  constructor() {}

  ngOnInit(): void {
    this.map.setDefaultCursor('crosshair');
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
    // 正交吸附
    this.orthogonalAdsorbent();
    // 绘制时动态的长度标识
    this.activeTextDraw();
    // 每条边的长度标识
    this.textDraw();
  }

  ngAfterViewInit(): void {}

  ngOnDestroy(): void {
    this.map.setDefaultCursor('default');
    this.componentDestroySubject.next(null);
    this.componentDestroySubject.unsubscribe();

    // 关闭map的监听
    this.map.off('click', this.sendMapEvent);
    this.map.off('mousemove', this.sendMapEvent);
  }

  save_state_for_undo() {
    this.undo_buffer.push(JSON.parse(JSON.stringify(this.pointDataSubject.value)));
    this.redo_buffer = [];
  }

  // 撤销
  undo() {
    // 撤销时清除地图上的overlay，在触发事件时会重新绘制
    if (this.activeLine) {
      this.map.remove(this.activeLine);
      this.activeLine = null;
    }
    if (this.activeRect) {
      this.map.remove(this.activeRect);
      this.activeRect = null;
    }
    if (this.activeText) {
      this.map.remove(this.activeText);
      this.activeText = null;
    }
    this.activeGuideOverlayGroup.clearOverlays();
    this.lineOverlayGroup.clearOverlays();
    this.guideOverlayGroup.clearOverlays();

    // 将第一个点都撤销了后，不再记录之后的操作
    this.undo_buffer.length !== 0 ? this.redo_buffer.push(this.undo_buffer.pop()) : null;
    this.pointDataSubject.next(
      JSON.parse(JSON.stringify(this.undo_buffer[this.undo_buffer.length - 1] ? this.undo_buffer[this.undo_buffer.length - 1] : [])),
    );
  }

  // 重做
  redo() {
    if (this.redo_buffer.length >= 1) {
      this.pointDataSubject.next(
        JSON.parse(JSON.stringify(this.redo_buffer[this.redo_buffer.length - 1] ? this.redo_buffer[this.redo_buffer.length - 1] : [])),
      );
      this.undo_buffer.push(this.redo_buffer.pop());
    }
  }

  // 地图处理
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
        // 第一个点存鼠标点击位置
        if (pointCount === 0) {
          this.pointDataSubject.next([...this.pointDataSubject.value, point]);
        }
        // 第二个点存activeLine的path中第二个点
        if (pointCount === 1) {
          const activePoint = (this.activeLine.getPath() as AMap.LngLat[]).map((item) => [item.lng, item.lat])[1] as [number, number];
          this.pointDataSubject.next([...this.pointDataSubject.value, this.inputNewPos ? this.inputNewPos : activePoint]);
        }
        if (pointCount === 2) {
          this.pointDataSubject.next([
            ...this.pointDataSubject.value,
            this.newThirdPoint ? this.newThirdPoint : this.thirdPoint,
            this.newFourthPoint ? this.newFourthPoint : this.fourthPoint,
          ]);
          console.log(this.pointDataSubject.value)
        }

        this.save_state_for_undo();
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
        const point = points[0],
          mousePos = new AMap.LngLat(event.lnglat.lng, event.lnglat.lat),
          mousePosition = [event.lnglat.lng, event.lnglat.lat];
        if (!this.activeLine) {
          this.activeLine = new AMap.Polyline({
            path: [point, mousePos],
            strokeColor: '#336AFE',
            strokeStyle: 'dashed',
            strokeDasharray: [6, 6],
            bubble: true,
          });
          this.map.add(this.activeLine);
          return;
        }

        this.activeLine.setPath([point, mousePos]);
        this.length = +turf.distance(point, mousePosition, { units: 'meters' }).toFixed(2);
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
        const mousePos = [event.lnglat.lng, event.lnglat.lat] as [number, number],
          // 已绘制两个点的斜率
          bearing = turf.bearing(turf.point(points[0]), turf.point(points[1])),
          // 沿斜率向两端点一定距离找到远处的点
          farPoint1 = turf.destination(points[0], 1, bearing, { units: 'kilometers' }).geometry.coordinates,
          farPoint2 = turf.destination(points[1], 1, bearing - 180, { units: 'kilometers' }).geometry.coordinates,
          // 已绘制的两个点连成的线段，并向两端加长
          line = turf.lineString([farPoint1, farPoint2]),
          // 鼠标到连线的距离
          distance = turf.pointToLineDistance(turf.point(mousePos), line, { units: 'meters' });
        // 判断鼠标位置在向量的哪一边
        const side = getDirection(points[0], points[1], mousePos);

        // 绘制剩下两个点，并将四个点绘制成矩形
        this.thirdPoint = turf.destination(points[1], distance, side ? bearing - 90 : bearing + 90, { units: 'meters' }).geometry
          .coordinates as [number, number];
        this.fourthPoint = turf.destination(points[0], distance, side ? bearing - 90 : bearing + 90, { units: 'meters' }).geometry
          .coordinates as [number, number];

        this.length = +turf.distance(points[1], this.thirdPoint, { units: 'meters' }).toFixed(2);

        if (!this.activeRect) {
          // 将四个点连成矩形
          this.activeRect = new AMap.Polygon({
            path: [...points, this.thirdPoint, this.fourthPoint],
            fillColor: '#8378EA',
            strokeColor: '#336AFE',
            strokeStyle: 'dashed',
            strokeDasharray: [6, 6],
            bubble: true,
          });
          this.map.add(this.activeRect);
          return;
        }
        this.activeRect.setPath([...points, this.thirdPoint, this.fourthPoint]);
        this.activeRect.setOptions({
          fillColor: '#8378EA',
        });
      });
  }

  // 绘制线
  drawLine(): void {
    this.lineOverlayGroup = new AMap.OverlayGroup();
    this.map.add(this.lineOverlayGroup as any);

    let polygon;
    this.pointDataSubject
      .pipe(
        takeUntil(this.componentDestroySubject),
        filter((points) => points.length > 1),
      )
      .subscribe((points) => {
        // 有两个及以上的点画线
        if (this.activeLine) {
          this.map.remove(this.activeLine);
          this.activeLine = null;
        }
        points.forEach((point, index, arr) => {
          if (index < arr.length - 1) {
            const polyline = new AMap.Polyline({
              path: [new AMap.LngLat(...point), new AMap.LngLat(...arr[index + 1])],
              strokeColor: '#336AFE',
              strokeStyle: 'dashed',
              strokeDasharray: [6, 6],
              bubble: true,
            });
            this.lineOverlayGroup.addOverlay(polyline);
          }
        });
        // 当有四个点的时候，绘制矩形
        if (points.length === 4) {
          this.map.remove(this.activeRect);
          this.activeRect = null;
          polygon = new AMap.Polygon({
            path: points,
            fillColor: '#8378EA',
            strokeColor: '#336AFE',
            strokeStyle: 'dashed',
            strokeDasharray: [6, 6],
          });
          this.map.add(polygon);
          this.lineOverlayGroup.clearOverlays();
          this.points.emit(points);
        } else {
          if(polygon) this.map.remove(polygon)
        }
      });
  }

  // 正交吸附
  orthogonalAdsorbent() {
    combineLatest([this.pointDataSubject, this.mapEventSubject])
      .pipe(
        takeUntil(this.componentDestroySubject),
        filter(([points, event]) => points.length === 1 && event.type === 'mousemove'),
      )
      .subscribe(([points, event]) => {
        // 找出最后一个点正南北和正东西的两条线(线尽量的长，且不在地图上绘制)
        const mousePos = turf.point([event.lnglat.lng, event.lnglat.lat]),
          { NSLine, EWLine } = this.getPointCross(points[0]);
        [EWLine, NSLine].forEach((line) => {
          const distance = turf.pointToLineDistance(mousePos, line, { units: 'meters' });
          // 如果距离小于等于1m,则吸附
          if (distance > 1) {
            return;
          }
          // 鼠标点往线的垂直方向，正向和反向画两个点连成线，找该线与南北线或东西线的交点
          const bearing1 = line.properties.type === 'NS' ? 90 : 0,
            bearing2 = line.properties.type === 'NS' ? -90 : 180,
            pt1 = turf.destination(mousePos, 100, bearing1, { units: 'meters' }).geometry.coordinates, // 作垂线的一个点
            pt2 = turf.destination(mousePos, 100, bearing2, { units: 'meters' }).geometry.coordinates, // 作垂线的另一个点
            lineStr = turf.lineString([pt1, pt2]); // 垂线

          const targetPoint = turf.lineIntersect(line, lineStr); // 垂线和线的交点
          if (targetPoint.features.length === 0) {
            return;
          }
          const intersection = targetPoint.features[0].geometry.coordinates as [number, number]; // 垂 线和线的交点

          this.activeLine.setPath([points[0], intersection]);
        });
      });
  }

  // 当前点的正南北线和正东西线
  getPointCross(originPoint: [number, number]) {
    const northPoint = turf.destination(originPoint, 1, 0).geometry.coordinates as number[],
      southPoint = turf.destination(originPoint, 1, 180).geometry.coordinates as number[],
      NSLine = turf.lineString([northPoint, southPoint]);
    NSLine.properties.type = 'NS';

    const westPoint = turf.destination(originPoint, 1, 90).geometry.coordinates as number[],
      eastPoint = turf.destination(originPoint, 1, -90).geometry.coordinates as number[],
      EWLine = turf.lineString([eastPoint, westPoint]);
    EWLine.properties.type = 'EW';

    return {
      NSLine,
      EWLine,
    };
  }

  // 根据输入的数值设定长度
  inputEnter() {
    if (this.length < this.MIN_LIMIT || this.length > this.MAX_LIMIT) {
      return;
    }
    const points = this.pointDataSubject.value;
    // 画第二个点的时候
    if (points.length === 1) {
      const bearing = turf.bearing(points[0], this.mousePos);
      this.inputNewPos = turf.destination(points[0], this.length, bearing, { units: 'meters' }).geometry.coordinates as [number, number];

      this.activeLine.setPath([points[0], this.inputNewPos]);
    }

    // 画第三和第四个点的时候
    if (points.length === 2) {
      const side = getDirection(points[0], points[1], this.mousePos),
        bearing = turf.bearing(turf.point(points[0]), turf.point(points[1]));
      this.newThirdPoint = turf.destination(points[1], this.length, side ? bearing - 90 : bearing + 90, { units: 'meters' }).geometry
        .coordinates as [number, number];
      this.newFourthPoint = turf.destination(points[0], this.length, side ? bearing - 90 : bearing + 90, { units: 'meters' }).geometry
        .coordinates as [number, number];

      this.activeRect.setPath([...points, this.newThirdPoint, this.newFourthPoint]);
    }
  }

  // 绘制时动态长度标识
  activeTextDraw(): void {
    this.activeGuideOverlayGroup = new AMap.OverlayGroup();
    this.map.add(this.activeGuideOverlayGroup as any);
    combineLatest([this.pointDataSubject, this.mapEventSubject])
      .pipe(
        takeUntil(this.componentDestroySubject),
        filter(([points, event]) => event.type === 'mousemove'),
      )
      .subscribe(([points, event]) => {
        this.lengthInput.nativeElement.focus();
        this.mousePos = [event.lnglat.lng, event.lnglat.lat];
        // 绘制第二个点时鼠标与第一个点之间的动态长度标识
        if (points.length === 1) {
          const point = points[0],
            mousePos = [event.lnglat.lng, event.lnglat.lat],
            distance = turf.distance(point, mousePos, { units: 'meters' }),
            midpoint = turf.midpoint(turf.point(point), turf.point(mousePos)).geometry.coordinates as [number, number],
            angle = turf.bearing(point, mousePos),
            style = {
              padding: '4px',
              color: '#737373',
              border: '1px solid',
              'border-radius': '4px',
              'border-color':
                distance < this.MIN_DISCUSS || distance > this.MAX_DISCUSS
                  ? '#ff4040'
                  : distance < this.MIN_LIMIT || distance > this.MAX_LIMIT
                  ? '#faad14'
                  : '#336afe',
              'background-color':
                distance < this.MIN_DISCUSS || distance > this.MAX_DISCUSS
                  ? '#FFF2F0'
                  : distance < this.MIN_LIMIT || distance > this.MAX_LIMIT
                  ? '#FFFBE6'
                  : '#F0F6FF',
            };
          if (!this.activeText) {
            this.activeText = new AMap.Text({
              position: midpoint,
              text: distance.toFixed(2) + 'm',
              anchor: 'center',
              angle: angle > 0 ? angle - 90 : angle + 90,
              style,
              bubble: true,
            });
            this.map.add(this.activeText);
            return;
          }
          this.activeText.setPosition(midpoint);
          this.activeText.setAngle(angle > 0 ? angle - 90 : angle + 90);
          this.activeText.setText(distance.toFixed(2) + 'm');
          this.activeText.setStyle(style);
        }

        // 绘制第三个和第四个点时的动态长度标识
        if (points.length === 2) {
          if (this.activeText) this.map.remove(this.activeText);
          [points[0], points[1], this.thirdPoint, this.fourthPoint].forEach((point, index, arr) => {
            const point1 = point,
              point2 = index === arr.length - 1 ? arr[0] : arr[index + 1],
              distance = turf.distance(point1, point2, { units: 'meters' }),
              midpoint = turf.midpoint(turf.point(point1), turf.point(point2)).geometry.coordinates as [number, number],
              angle = turf.bearing(point1, point2),
              style = {
                padding: '4px',
                color: '#737373',
                border: '1px solid',
                'border-radius': '4px',
                'border-color':
                  distance < this.MIN_DISCUSS || distance > this.MAX_DISCUSS
                    ? '#ff4040'
                    : distance < this.MIN_LIMIT || distance > this.MAX_LIMIT
                    ? '#faad14'
                    : '#336afe',
                'background-color':
                  distance < this.MIN_DISCUSS || distance > this.MAX_DISCUSS
                    ? '#FFF2F0'
                    : distance < this.MIN_LIMIT || distance > this.MAX_LIMIT
                    ? '#FFFBE6'
                    : '#F0F6FF',
              };

            const overlays = this.activeGuideOverlayGroup.getOverlays() as AMap.Text[];
            if (index < overlays.length) {
              overlays[index].setPosition(midpoint);
              overlays[index].setAngle(angle > 0 ? angle - 90 : angle + 90);
              overlays[index].setText(distance.toFixed(2) + 'm');
              overlays[index].setStyle(style);
              return;
            }
            const text = new AMap.Text({
              position: midpoint,
              text: distance.toFixed(2) + 'm',
              anchor: 'center',
              angle: angle > 0 ? angle - 90 : angle + 90,
              style,
              bubble: true,
            });
            this.activeGuideOverlayGroup.addOverlay(text);
          });
        }

        // 移除动态标记
        if (points.length === 4) {
          this.activeGuideOverlayGroup.clearOverlays();
        }
      });
  }

  // 绘制每条线的长度文本
  textDraw(): void {
    this.guideOverlayGroup = new AMap.OverlayGroup();
    this.map.add(this.guideOverlayGroup as any);
    this.pointDataSubject
      .pipe(
        takeUntil(this.componentDestroySubject),
        filter((points) => points.length > 1),
      )
      .subscribe((points) => {
        points.forEach((point, index, arr) => {
          const point1 = point,
            point2 = index === arr.length - 1 ? arr[0] : arr[index + 1],
            distance = turf.distance(point1, point2, { units: 'meters' }),
            midpoint = turf.midpoint(turf.point(point1), turf.point(point2)).geometry.coordinates as [number, number],
            angle = turf.bearing(point1, point2),
            style = {
              padding: '4px',
              color: '#737373',
              border: '1px solid',
              'border-radius': '4px',
              'border-color':
                distance < this.MIN_DISCUSS || distance > this.MAX_DISCUSS
                  ? '#ff4040'
                  : distance < this.MIN_LIMIT || distance > this.MAX_LIMIT
                  ? '#faad14'
                  : '#336afe',
              'background-color':
                distance < this.MIN_DISCUSS || distance > this.MAX_DISCUSS
                  ? '#FFF2F0'
                  : distance < this.MIN_LIMIT || distance > this.MAX_LIMIT
                  ? '#FFFBE6'
                  : '#F0F6FF',
            };

          const guideOverlays = this.guideOverlayGroup.getOverlays() as AMap.Text[];
          if (index < guideOverlays.length) {
            guideOverlays[index].setPosition(midpoint);
            guideOverlays[index].setAngle(angle > 0 ? angle - 90 : angle + 90);
            guideOverlays[index].setText(distance.toFixed(2) + 'm');
            guideOverlays[index].setStyle(style);
            return;
          }
          const text = new AMap.Text({
            position: midpoint,
            text: distance.toFixed(2) + 'm',
            anchor: 'center',
            angle: angle > 0 ? angle - 90 : angle + 90,
            style,
            bubble: true,
          });
          this.guideOverlayGroup.addOverlay(text);
        });
      });
  }
}
