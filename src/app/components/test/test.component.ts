import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import * as AMapLoader from '@amap/amap-jsapi-loader';
import { from } from 'rxjs';

@Component({
  selector: 'app-test',
  templateUrl: './test.component.html',
  styleUrls: ['./test.component.less'],
})
export class TestComponent implements OnInit,AfterViewInit {
  @ViewChild('map')
  mapContainer: ElementRef;

  amap: AMap.Map;
  mapVisible:boolean = false

  constructor() {}

  ngOnInit(): void {}

  ngAfterViewInit():void {
    this.createMap()
  }

  createMap() {
    from(
      AMapLoader.load({
        key: '27d8c4820927f96d44e1fc2679c8a6c9',
        version: '2.0',
      }),
    ).subscribe((AMap: any) => {
      this.amap = new AMap.Map(this.mapContainer.nativeElement, {
        mapStyle: 'amap://styles/light',
        viewMode: '3D',
        features: ['bg', 'road'],
        center: [114.065671, 22.560183],
        zoom: 17,
        pitchEnable: false,
        rotateEnable: false,
      });
      this.mapVisible = true
    });
  }
}
