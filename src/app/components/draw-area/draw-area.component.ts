import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import '@amap/amap-jsapi-types';
import { MapEventObject } from 'src/app/interface/map.interface';
import { filter, map, switchMap, take, takeUntil } from 'rxjs/operators';
import { Subject, BehaviorSubject, combineLatest } from 'rxjs';
import * as turf from '@turf/turf';

/**
 * @param map 高德地图的地图实例
 * @param point 点的样式，暂时支持AMap.CircleMarker
 * @param line 线的样式，暂时只支持AMap.Polyline类型
 *
 * @param areaFillColor 区域的填充颜色
 * @param areaFillOpacity 区域的填充透明度
 *
 * @param guideVisible 是否绘制辅助线
 * @param lineSpace 辅助线与两点连线之间的间距（px）
 * @param guideStrokeColor 辅助线颜色
 * @param guideArcColor 角弧度线颜色
 * @param guideTextStyle 文本样式
 * @param guideArcTextStyle 角度文本样式
 *
 * @param centerIconOption 区域中心icon配置
 *
 */
@Component({
  selector: 'app-draw-area',
  templateUrl: './draw-area.component.html',
  styleUrls: ['./draw-area.component.less'],
})
export class DrawAreaComponent implements OnInit, OnDestroy {
  @Input() map: AMap.Map;
  @Input() point: AMap.CircleMarker = new AMap.CircleMarker({
    strokeColor: '#336AFE',
    fillColor: '#f0f6ff',
    fillOpacity: 1,
    radius: 5,
    zIndex: 9,
  })

  @Input() line: AMap.Polyline = new AMap.Polyline({
    strokeColor: '#336AFE',
    strokeWeight: 4,
    strokeOpacity: 1,
    zIndex: 10,
  })

  @Input() areaFillColor = '#336AFE';
  @Input() areaFillOpacity = 0.07;

  @Input() guideVisible = true;
  @Input() lineSpace = 5;
  @Input() guideStrokeColor = '#336AFE';
  @Input() guideArcColor = '#336AFE';
  @Input() guideTextStyle: {
    [key: string]: string;
  } = {
    'background-color': '#336AFE',
    'border-radius': '8px',
    color: '#fff',
    padding: '0 5px',
  };
  @Input() guideArcTextStyle: {
    [key: string]: string;
  } = {
    'background-color': 'transparent',
    border: 'none',
    color: '#262626',
  };

  @Input() centerIconOption: {
    image: string; // 路径
    size?: [number, number];
    anchor?:
      | 'top-left'
      | 'top-center'
      | 'top-right'
      | 'middle-left'
      | 'center'
      | 'middle-right'
      | 'bottom-left'
      | 'bottom-center'
      | 'bottom-right';
  } = {
    image: '../../../assets/delete-fill.svg',
    size: [30, 30],
    anchor: 'center',
  };

  @Output() closeArea = new EventEmitter<[number, number][]>();

  private componentDestroySubject: Subject<null> = new Subject();
  private mapEventSubject: Subject<MapEventObject> = new Subject();

  pointDataSubject: BehaviorSubject<{
    points: [number, number][]; // 点数据（经纬度）
  }> = new BehaviorSubject({
    points: [],
  });

  isClosureSubject: BehaviorSubject<{
    isClosure: boolean; // 多边形是否闭合
    origin: number[]; // 坐标原点(经纬度)
  }> = new BehaviorSubject({ isClosure: false, origin: [] });

  polygon: AMap.Polygon; // 多边形填充区域

  pointOverlayGroup: AMap.OverlayGroup; // 保存点的组
  lineOverlayGroup: AMap.OverlayGroup; // 保存两点之间连线的组

  guideGroup: AMap.OverlayGroup; // 辅助线的组，用于将实例添加进Map
  guideGroupList: {
    line: AMap.Polyline;
    verticals: AMap.Polyline[];
    text: AMap.Text;
    arc: AMap.Polyline;
    arcText: AMap.Text;
  }[] = []; // 管理辅助线的数组，辅助线的增删改在这个数组中完成

  activePolyline: AMap.Polyline; // 鼠标移动时点与鼠标连线
  activePolygon: AMap.Polygon; // 鼠标移动时绘制的多边形
  activeGuidePolyline: AMap.Polyline; // 鼠标移动时平行辅助线
  activeGuidePolylineVertical: AMap.Polyline[]; // 鼠标移动时垂直辅助线
  activeGuideText: AMap.Text; // 鼠标移动时文字
  activeGuideArc: AMap.Polyline; // 鼠标移动时圆弧
  activeGuideArcText: AMap.Text; // 鼠标移动时角度文字

  deleteMarker: AMap.LabelMarker;

  isAbsorb:{
    [key:string]: boolean
  } = {}; // 是否是被吸附状态
  absorbPointData: number[]; // 被吸附时，吸附的点

  constructor() {}

  ngOnInit(): void {
    // 地图点击事件处理
    this.clickHandle();
    // 绑定地图事件
    this.eventHandle();
    // 画点
    this.drawPoint();
    // 画线
    this.drawLine();
    // 画面
    this.drawArea();
    // 画辅助线
    if (this.guideVisible) {
      this.drawGuideLine();
    }
    // 鼠标与点之间的连线
    this.pointDragHandle();

    this.adsorbPoint();
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
    this.isClosureSubject
      .pipe(
        takeUntil(this.componentDestroySubject),
        switchMap((data) => {
          return this.mapEventSubject.pipe(
            takeUntil(this.componentDestroySubject),
            filter((event) => event.type === 'click' && !data.isClosure),
          );
        }),
      )
      .subscribe((event) => {
        let point;
        // 只要鼠标点与南北线/东西线其中一条线的距离小于5m,就被认为是被吸附状态
        if (Object.values(this.isAbsorb).find(item => item) && this.absorbPointData.length > 0) {
          point = this.absorbPointData;
        } else {
          point = [event.lnglat.lng, event.lnglat.lat] as [number, number];
        }
        this.pointDataSubject.next({
          points: [...this.pointDataSubject.value.points, point],
        });
      });
  }

  drawPoint(): void {
    // 初始化组并绑定事件
    this.pointOverlayGroup = new AMap.OverlayGroup();
    this.map.add(this.pointOverlayGroup as any);

    this.pointDataSubject.pipe(takeUntil(this.componentDestroySubject)).subscribe((data) => {
      data.points.forEach((point, index) => {
        if (index < this.pointOverlayGroup.getOverlays().length) {
          // group中已有实例，只修改数据
          (this.pointOverlayGroup.getOverlays()[index] as AMap.Circle).setCenter(new AMap.LngLat(...(point as [number, number])));
        } else {
          // 创建实例并加入组
          const circleMarker = new AMap.CircleMarker({
            ...this.point.getOptions(),
            center: new AMap.LngLat(point[0], point[1]),
            cursor: 'pointer',
            extData: {
              index,
            },
          });
          // 绑定事件
          this.pointMarkerEventHandler(circleMarker);
          this.pointOverlayGroup.addOverlay(circleMarker);
        }
      });

      // 删除或撤销时，删除多余实例
      const pointMarkers = this.pointOverlayGroup.getOverlays();
      if (pointMarkers.length > data.points.length) {
        const removes: AMap.CircleMarker[] = pointMarkers.slice(data.points.length);
        this.pointOverlayGroup.removeOverlays(removes);
        removes.forEach((instance) => {
          instance.remove();
        });
      }
    });
  }

  pointMarkerEventHandler(point: AMap.CircleMarker): void {
    // 点击事件
    point.on('click', (event: MapEventObject<AMap.CircleMarker>) => {
      // 点击第一个点，闭合多边形，同时取消map点击事件
      combineLatest([this.pointDataSubject, this.isClosureSubject])
        .pipe(
          takeUntil(this.componentDestroySubject),
          take(1),
          filter(([pointsData, isClosureData]) => pointsData.points.length > 2 && !isClosureData.isClosure),
        )
        .subscribe((_) => {
          const { index } = event.target.getExtData();
          if (index !== 0) {
            return;
          }
          this.isClosureSubject.next({
            ...this.isClosureSubject.value,
            isClosure: true,
          });
          // 闭合后将点数据暴露出去
          this.closeArea.emit(this.pointDataSubject.value.points);
        });
    });
  }

  drawLine(): void {
    this.lineOverlayGroup = new AMap.OverlayGroup();
    this.map.add(this.lineOverlayGroup as any);

    combineLatest([this.pointDataSubject, this.isClosureSubject])
      .pipe(takeUntil(this.componentDestroySubject))
      .subscribe(([pointsData, isClosureData]) => {
        const points = pointsData.points;
        const isClosure = isClosureData.isClosure;
        let lastLineIndex: number;
        // 有两个及以上的点画线
        if (points.length > 1) {
          points.forEach((point, index) => {
            lastLineIndex = index;
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
                ...this.line.getOptions(),
                path: [new AMap.LngLat(...points[points.length - 1]), new AMap.LngLat(...points[points.length - 2])],
                extData: { index },
              });
              this.lineOverlayGroup.addOverlay(polyline);
            }
          });
        }

        if (isClosure) {
          const lineList: AMap.Polygon[] = this.lineOverlayGroup.getOverlays();
          if (points.length === lineList.length) {
            // 如果点数量与线数量相同，则说明闭合线已经绘制，只需要更新
            lineList[lineList.length - 1].setPath([new AMap.LngLat(...points[0]), new AMap.LngLat(...points[points.length - 1])]);
          } else {
            // 闭合多边形时，画最后一条线
            const polyline = new AMap.Polyline({
              ...this.line.getOptions(),
              path: [new AMap.LngLat(...points[0]), new AMap.LngLat(...points[points.length - 1])],
              extData: { index: lastLineIndex + 1 },
            });

            this.lineOverlayGroup.addOverlay(polyline);
          }
        }

        // 删除或撤销时，删除多余实例
        const lines = this.lineOverlayGroup.getOverlays();
        if (lines.length > points.length - (isClosure ? 0 : 1)) {
          const removes: AMap.CircleMarker[] = points.length === 0 ? lines : lines.slice(points.length - 1);
          this.lineOverlayGroup.removeOverlays(removes);
          removes.forEach((instance) => {
            instance.remove();
          });
        }
      });
  }

  drawArea(): void {
    combineLatest([this.pointDataSubject, this.isClosureSubject])
      .pipe(takeUntil(this.componentDestroySubject))
      .subscribe(([pointsData, isClosureData]) => {
        const points = pointsData.points;
        const isClosure = isClosureData.isClosure;
        // 闭合时绘制这个多边形
        if (isClosure) {
          // 如果有就更新，没有就创建
          if (this.polygon) {
            this.polygon.setPath(points);
          } else {
            this.polygon = new AMap.Polygon({
              path: points,
              strokeOpacity: 0,
              fillColor: this.areaFillColor,
              fillOpacity: this.areaFillOpacity,
              bubble: true,
            });
            this.map.add(this.polygon);
          }

          // 找到多边形质心，绘制删除按钮
          const polygon = turf.polygon([[...points, points[0]]]);
          const centerPos = turf.centerOfMass(polygon).geometry.coordinates as [number, number];
          this.drawDeleteIcon(centerPos);
        } else {
          this.polygon?.remove();
          this.deleteMarker?.remove();
          this.polygon = null;
          this.deleteMarker = null;
        }
      });
  }

  drawDeleteIcon(centerPos: [number, number]): void {
    if (this.deleteMarker) {
      this.deleteMarker.setPosition(centerPos);
    } else {
      this.deleteMarker = new AMap.LabelMarker({
        position: centerPos,
        icon: this.centerIconOption,
      });
      this.deleteMarker.on('click', (data: MapEventObject<AMap.Polyline>) => {
        this.deleteMarker?.remove();
        this.polygon?.remove();
        this.polygon = null;
        this.deleteMarker = null;
        this.isClosureSubject.next({ ...this.isClosureSubject.value, isClosure: false });
        this.pointDataSubject.next({ points: [] });
      });
      this.map.add(this.deleteMarker);
    }
  }

  // 绘制辅助线
  drawGuideLine(): void {
    this.guideGroup = new AMap.OverlayGroup();
    this.map.add(this.guideGroup as any);
    combineLatest([this.pointDataSubject, this.isClosureSubject])
      .pipe(takeUntil(this.componentDestroySubject))
      .subscribe(([pointsData, isClosureData]) => {
        const points = pointsData.points;
        const isClosure = isClosureData.isClosure;
        if (points.length > 1) {
          points.forEach((point, index) => {
            if (index === points.length - 1 && !isClosure) {
              return;
            }

            // 画长度标识辅助线
            const nextPoint = points[index === points.length - 1 ? 0 : index + 1];
            const clockwise: boolean = turf.booleanClockwise(turf.lineString([...points, points[0]])); // 获取是否是顺时针
            const originAngle: number = turf.bearing(points[index], nextPoint); // 计算当前点和下一个点之间的角度
            const transformAngle = clockwise
              ? originAngle > -90
                ? originAngle - 90
                : 360 + originAngle - 90
              : originAngle < 90
              ? originAngle + 90
              : originAngle + 90 - 360; // 旋转角度

            const auxiliaryPoints = [points[index], nextPoint].map((p) => {
              const destination = turf.destination(p, this.lineSpace, transformAngle, { units: 'meters' });
              return new AMap.LngLat(...(destination.geometry.coordinates as [number, number]));
            }); // 辅助线两端点坐标
            const transformPoints = auxiliaryPoints.map((lnglat) => [lnglat.lng, lnglat.lat]);
            const centerPos = turf.midpoint(transformPoints[0], transformPoints[1]); // 辅助线中点坐标
            const distance =
              turf
                .distance(turf.point(points[index]), turf.point(nextPoint), {
                  units: 'meters',
                })
                .toFixed(2) + 'm'; // 距离

            // 以当前点为中心画圆弧
            const previousPoint: [number, number] =
              (index > 0 && points.length > 2) || isClosure ? points[index === 0 ? points.length - 1 : index - 1] : null;
            const previousAngle = previousPoint ? turf.bearing(points[index], previousPoint) : null;
            const arcPoints = previousAngle
              ? clockwise
                ? turf.lineArc(point, 10, originAngle, previousAngle, {
                    units: 'meters',
                  }).geometry.coordinates
                : turf.lineArc(point, 10, previousAngle, originAngle, {
                    units: 'meters',
                  }).geometry.coordinates
              : null; // 获取圆弧上的点

            // 获取夹角角度
            let angle = index > 0 || isClosure ? Math.abs(turf.bearing(point, previousPoint) - turf.bearing(point, nextPoint)) : 0;
            angle = angle > 180 ? 360 - angle : angle;
            const arcCenterPoint = arcPoints ? (arcPoints[Math.floor(arcPoints?.length / 2)] as [number, number]) : null; // 圆弧中点
            const textPos = arcCenterPoint
              ? (turf.destination(arcCenterPoint, 10, turf.bearing(point, arcCenterPoint), { units: 'meters' }).geometry.coordinates as [
                  number,
                  number,
                ])
              : null; // 圆弧角度文字

            if (index < this.guideGroupList.length) {
              this.guideGroupList[index].line.setPath(auxiliaryPoints);
              this.guideGroupList[index].verticals.forEach((item, i) => {
                item.setExtData({ origin: i === 0 ? point : nextPoint });
                item.setPath(this.drawVerticalLine(item.getExtData().origin, transformAngle));
              });
              this.guideGroupList[index].text.setText(distance);
              this.guideGroupList[index].text.setPosition(centerPos.geometry.coordinates as [number, number]);
              this.guideGroupList[index].text.setAngle(Math.abs(transformAngle) > 90 ? (transformAngle + 180) % 360 : transformAngle);
              this.guideGroupList[index].arc.setPath(arcPoints as [number, number][]);
              this.guideGroupList[index].arc.setOptions({
                strokeOpacity: arcPoints ? 1 : 0,
              });
              this.guideGroupList[index].arcText.setPosition(textPos);
              this.guideGroupList[index].arcText.setText(textPos ? `${angle.toFixed(2)}°` : '');
            } else {
              // 平行线
              const line = new AMap.Polyline({
                path: auxiliaryPoints,
                strokeColor: this.guideStrokeColor,
                zIndex: 9,
              });
              // 垂直线
              const verticalLine = [this.drawVerticalLine(point, transformAngle), this.drawVerticalLine(nextPoint, transformAngle)].map(
                (item, i) => {
                  return new AMap.Polyline({
                    path: item,
                    strokeColor: this.guideStrokeColor,
                    extData: {
                      origin: i === 0 ? point : nextPoint,
                    },
                  });
                },
              );
              // 文本
              const text = new AMap.Text({
                position: centerPos.geometry.coordinates as [number, number],
                text: distance,
                anchor: 'center',
                angle: Math.abs(transformAngle) > 90 ? (transformAngle + 180) % 360 : transformAngle,
                style: this.guideTextStyle,
              });
              // 角度弧线
              const arc = new AMap.Polyline({
                path: arcPoints as [number, number][],
                strokeColor: this.guideArcColor,
              });
              // 角度文本
              const arcText = new AMap.Text({
                position: textPos,
                text: textPos ? `${angle.toFixed(2)}°` : '',
                anchor: 'center',
                style: this.guideArcTextStyle,
              });

              this.guideGroup.addOverlays([line, ...verticalLine, text, arc, arcText]);
              this.guideGroupList.push({
                line,
                text,
                verticals: verticalLine,
                arc,
                arcText,
              });
            }
          });
        }

        // 删除或撤销时，删除多余实例
        const lines = this.guideGroup.getOverlays();
        if (lines.length > (points.length - (isClosure ? 0 : 1)) * 6) {
          const removes: AMap.CircleMarker[] = points.length === 0 ? lines : lines.slice((points.length - 1) * 6);
          this.guideGroup.removeOverlays(removes);
          this.guideGroupList = this.guideGroupList.slice(0, points.length - 1);
          removes.forEach((instance) => {
            instance.remove();
          });
        }
      });
  }

  drawVerticalLine(point: [number, number], transformAngle: number): AMap.LngLat[] {
    // 画两条竖线
    const point1 = turf.destination(point, this.lineSpace * 0.5, transformAngle, { units: 'meters' });
    const point2 = turf.destination(point, this.lineSpace * 1.5, transformAngle, { units: 'meters' });
    return [
      new AMap.LngLat(...(point1.geometry.coordinates as [number, number])),
      new AMap.LngLat(...(point2.geometry.coordinates as [number, number])),
    ];
  }

  // 鼠标和绘制点之间的连线以及面
  pointDragHandle(): void {
    combineLatest([this.pointDataSubject, this.isClosureSubject])
      .pipe(
        takeUntil(this.componentDestroySubject),
        switchMap(([pointsData, isClosureData]) => {
          const points = pointsData.points;
          const isClosure = isClosureData.isClosure;
          // 闭合时删除
          if (isClosure || points.length <= 1) {
            this.activePolyline?.remove();
            this.activePolyline = null;
            this.activePolygon?.remove();
            this.activePolygon = null;
            this.activeGuidePolyline?.remove();
            this.activeGuidePolyline = null;
            this.activeGuidePolylineVertical?.forEach((item) => item.remove());
            this.activeGuidePolylineVertical = null;
            this.activeGuideText?.remove();
            this.activeGuideText = null;
            this.activeGuideArc?.remove();
            this.activeGuideArc = null;
            this.activeGuideArcText?.remove();
            this.activeGuideArcText = null;
          }

          return this.mapEventSubject.pipe(
            takeUntil(this.componentDestroySubject),
            filter((event) => event.type === 'mousemove' && !isClosure),
          );
        }),
      )
      .subscribe((data: MapEventObject) => {
        const points: AMap.LngLat[] = this.pointOverlayGroup.getOverlays().map((item) => item.getCenter());

        if (points.length === 0) {
          return;
        }
        this.drawWhenMousemove(this.mousemoveCalc(data.lnglat.lng, data.lnglat.lat));
      });
  }

  // 正南北和正东西方向吸附功能
  adsorbPoint(): void {
    combineLatest([this.pointDataSubject, this.isClosureSubject])
      .pipe(
        takeUntil(this.componentDestroySubject),
        filter(([pointsData, isClosureData]) => !isClosureData.isClosure && pointsData.points.length > 0),
        switchMap(([pointsData]) => {
          // 找出最后一个点正南北和正东西的两条线(线尽量的长，且不在地图上绘制)
          const originPoint = pointsData.points[pointsData.points.length - 1];
          const { NSLine, EWLine } = this.getPointCross(originPoint);
          return combineLatest([this.mapEventSubject, this.isClosureSubject, this.pointDataSubject]).pipe(
            takeUntil(this.componentDestroySubject),
            filter(
              ([event, isClosureData, pointsData]) =>
                event.type === 'mousemove' && !isClosureData.isClosure && pointsData.points.length > 0,
            ),
            map(([data]) => {
              // 如果鼠标位置在南北线或东西线一定距离之内
              // 更改鼠标与最后一个点之间的辅助线位置
              // 使得其平行于南北或东西
              const mousePos = turf.point([data.lnglat.lng, data.lnglat.lat]);
              [EWLine, NSLine].forEach((line) => {
                const distance = turf.pointToLineDistance(mousePos, line, { units: 'meters' });
                // 如果距离小于等于5m,则吸附
                if (distance > 5) {
                  this.isAbsorb[line.properties.type] = false;
                  return;
                }
                this.isAbsorb[line.properties.type] = true;
                // 鼠标点往线的垂直方向，正向和反向画两个点连成线，找该线与南北线或东西线的交点
                const bearing1 = line.properties.type === 'NS' ? 90 : 0;
                const bearing2 = line.properties.type === 'NS' ? -90 : 180;
                const pt1 = turf.destination(mousePos, 100, bearing1, { units: 'meters' }).geometry.coordinates; // 作垂线的一个点
                const pt2 = turf.destination(mousePos, 100, bearing2, { units: 'meters' }).geometry.coordinates; // 作垂线的另一个点
                const lineStr = turf.lineString([pt1, pt2]); // 垂线

                const targetPoint = turf.lineIntersect(line, lineStr); // 垂线和线的交点
                if (targetPoint.features.length === 0) {
                  return;
                }
                const intersection = targetPoint.features[0].geometry.coordinates; // 垂线和线的交点
                this.absorbPointData = intersection;
                // 改变鼠标与最后一个点之间辅助线的位置
                this.drawWhenMousemove(this.mousemoveCalc(intersection[0], intersection[1]));
              });
            }),
          );
        }),
      )
      .subscribe();
  }

  // 当前点的正南北线和正东西线
  getPointCross(originPoint: [number, number]) {
    const northPoint = turf.destination(originPoint, 1, 0).geometry.coordinates as number[];
    const southPoint = turf.destination(originPoint, 1, 180).geometry.coordinates as number[];
    const NSLine = turf.lineString([northPoint, southPoint]);
    NSLine.properties.type = 'NS';

    const westPoint = turf.destination(originPoint, 1, 90).geometry.coordinates as number[];
    const eastPoint = turf.destination(originPoint, 1, -90).geometry.coordinates as number[];
    const EWLine = turf.lineString([eastPoint, westPoint]);
    EWLine.properties.type = 'EW';

    return {
      NSLine,
      EWLine,
    };
  }

  // 画鼠标与最后一个点之间的辅助线所需参数的计算
  mousemoveCalc(lng: number, lat: number) {
    const points: AMap.LngLat[] = this.pointOverlayGroup.getOverlays().map((item) => item.getCenter());
    if (points.length === 0) {
      return;
    }
    const originPoints: [number, number][] = points.map((item) => [item.getLng(), item.getLat()]); // 最后一个点的坐标

    const mousePos = new AMap.LngLat(lng, lat); // 鼠标位置（AMap.LngLat类型）
    const mousePosition: [number, number] = [lng, lat]; // 鼠标位置（原始数据）

    const clockwise: boolean = turf.booleanClockwise(turf.lineString([...originPoints, mousePosition, originPoints[0]])); // 获取是否是顺时针
    const originAngle: number = turf.bearing(originPoints[originPoints.length - 1], mousePosition); // 计算两点之间的角度
    const transformAngle = clockwise
      ? originAngle > -90
        ? originAngle - 90
        : 360 + originAngle - 90
      : originAngle < 90
      ? originAngle + 90
      : originAngle + 90 - 360;
    const auxiliaryPoints = [originPoints[originPoints.length - 1], mousePosition].map((p) => {
      const destination = turf.destination(p, this.lineSpace, transformAngle, { units: 'meters' });
      return new AMap.LngLat(...(destination.geometry.coordinates as [number, number]));
    }); // 辅助线两端点坐标
    const transformPoints = auxiliaryPoints.map((lnglat) => [lnglat.lng, lnglat.lat]);
    const centerPos = turf.midpoint(transformPoints[0], transformPoints[1]); // 辅助线中点坐标
    const distance =
      turf.distance(turf.point(originPoints[originPoints.length - 1]), turf.point(mousePosition), { units: 'meters' }).toFixed(2) + 'm'; // 两点间距离

    // 以当前点为中心画圆弧
    const previousPoint: [number, number] = points.length > 1 ? originPoints[originPoints.length - 2] : null;
    const currentPoint: [number, number] = originPoints[originPoints.length - 1];
    const previousAngle = points.length > 1 ? turf.bearing(currentPoint, previousPoint) : null;
    const arcPoints = previousAngle
      ? clockwise
        ? turf.lineArc(currentPoint, 10, originAngle, previousAngle, { units: 'meters' }).geometry.coordinates
        : turf.lineArc(currentPoint, 10, previousAngle, originAngle, { units: 'meters' }).geometry.coordinates
      : null; // 圆弧上的点

    let angle =
      points.length > 1
        ? Math.abs(
            turf.bearing(originPoints[originPoints.length - 1], previousPoint) -
              turf.bearing(originPoints[originPoints.length - 1], mousePosition),
          )
        : 0;
    angle = angle > 180 ? 360 - angle : angle; // 夹角角度
    const arcCenterPoint = arcPoints ? (arcPoints[Math.floor(arcPoints?.length / 2)] as [number, number]) : [0, 0];
    const textPos = turf.destination(arcCenterPoint, 10, turf.bearing(originPoints[originPoints.length - 1], arcCenterPoint), {
      units: 'meters',
    }).geometry.coordinates as [number, number]; //圆弧角度文字

    return {
      angle,
      arcPoints,
      mousePos,
      centerPos,
      distance,
      textPos,
      transformAngle,
      auxiliaryPoints,
    };
  }

  drawWhenMousemove(option: {
    angle: number;
    arcPoints: turf.helpers.Position[];
    mousePos: AMap.LngLat;
    centerPos: turf.helpers.Feature<
      turf.helpers.Point,
      {
        [name: string]: any;
      }
    >;
    distance: string;
    textPos: [number, number];
    transformAngle: number;
    auxiliaryPoints: AMap.LngLat[];
  }) {
    const points: AMap.LngLat[] = this.pointOverlayGroup.getOverlays().map((item) => item.getCenter());
    const originPoints: [number, number][] = points.map((item) => [item.getLng(), item.getLat()]); // 最后一个点的坐标
    // 没有线和面时创建，有的话更新坐标
    if (
      !this.activePolyline ||
      !this.activePolygon ||
      !this.activeGuidePolyline ||
      !this.activeGuidePolylineVertical ||
      !this.activeGuideText ||
      !this.activeGuideArc ||
      !this.activeGuideArcText
    ) {
      this.activePolyline = new AMap.Polyline({
        path: [option.mousePos, points[points.length - 1]],
        strokeColor: this.line.getOptions().strokeColor,
        zIndex: 9,
        strokeStyle: 'dashed',
        strokeDasharray: [4, 4],
        bubble: true,
      });
      this.activePolygon = new AMap.Polygon({
        path: [option.mousePos, ...points],
        strokeOpacity: 0,
        fillColor: this.areaFillColor,
        fillOpacity: this.areaFillOpacity,
        bubble: true,
      });

      // 绘制辅助线
      // 平行线
      this.activeGuidePolyline = new AMap.Polyline({
        path: option.auxiliaryPoints,
        strokeColor: this.guideStrokeColor,
        zIndex: 9,
        bubble: true,
      });
      // 垂直线
      this.activeGuidePolylineVertical = [
        this.drawVerticalLine(originPoints[originPoints.length - 1], option.transformAngle),
        this.drawVerticalLine([option.mousePos.getLng(), option.mousePos.getLat()], option.transformAngle),
      ].map((item) => {
        return new AMap.Polyline({
          path: item,
          strokeColor: this.guideStrokeColor,
          bubble: true,
        });
      });
      // 文本
      this.activeGuideText = new AMap.Text({
        position: option.centerPos.geometry.coordinates as [number, number],
        text: option.distance,
        anchor: 'center',
        angle: Math.abs(option.transformAngle) > 90 ? (option.transformAngle + 180) % 360 : option.transformAngle,
        bubble: true,
        style: this.guideTextStyle,
      });
      // 圆弧
      this.activeGuideArc = new AMap.Polyline({
        path: option.arcPoints as [number, number][],
        strokeColor: this.guideArcColor,
        bubble: true,
      });
      // 角度文本
      this.activeGuideArcText = new AMap.Text({
        position: option.textPos,
        text: `${option.angle.toFixed(2)}°`,
        anchor: 'center',
        bubble: true,
        style: this.guideArcTextStyle,
      });
      this.map.add([
        this.activeGuidePolyline,
        ...this.activeGuidePolylineVertical,
        this.activeGuideText,
        this.activePolyline,
        this.activePolygon,
        this.activeGuideArc,
        this.activeGuideArcText,
      ]);
      return;
    }
    this.activePolyline.setPath([option.mousePos, points[points.length - 1]]);
    this.activePolygon.setPath([option.mousePos, ...points]);
    this.activeGuidePolyline.setPath(option.auxiliaryPoints);
    this.activeGuidePolylineVertical.forEach((line) => {
      line.setPath([
        this.drawVerticalLine(originPoints[originPoints.length - 1], option.transformAngle),
        this.drawVerticalLine([option.mousePos.getLng(), option.mousePos.getLat()], option.transformAngle),
      ]);
    });
    this.activeGuideText.setPosition(option.centerPos.geometry.coordinates as [number, number]);
    this.activeGuideText.setAngle(Math.abs(option.transformAngle) > 90 ? (option.transformAngle + 180) % 360 : option.transformAngle);
    this.activeGuideText.setText(option.distance);
    this.activeGuideArc.setPath(option.arcPoints as [number, number][]);
    this.activeGuideArcText.setPosition(option.textPos);
    this.activeGuideArcText.setText(`${option.angle.toFixed(2)}°`);
  }
}
