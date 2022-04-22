# DrawArea

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 13.1.2.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

# 使用说明

该组件是一个angular2组件，依赖turf.js库，高德地图为2.0版本。

将draw-area组件拷贝到自己项目中使用。test组件展示了最基本的使用方式。进入项目npm start就可以启动

# API文档

| Name | Description |
| ---- | ---- |
| map  | 高德地图的地图实例|
| point | 点的样式，暂时只支持AMap.CircleMarker类型|
| line | 线的样式，暂时只支持AMap.Polyline类型 |
| areaFillColor | 区域的填充颜色 |
| areaFillOpacity | 区域的填充透明度 |
| guideVisible | 是否绘制辅助线 |
| lineSpace | 辅助线与两点连线之间的间距（px） |
| guideStrokeColor | 辅助线颜色 |
| guideArcColor | 角弧度线颜色 |
| guideTextStyle| 文本样式 |
| guideArcTextStyle| 角度文本样式 |
| centerIconOption | 区域中心icon配置 |




