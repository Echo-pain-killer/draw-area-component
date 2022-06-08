import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { DrawAreaComponent } from './components/draw-area/draw-area.component';
import { TestComponent } from './components/test/test.component';
import { DrawRectComponent } from './components/draw-rect/draw-rect.component';
import { XtectDrawRectComponent } from './components/xtect-draw-rect/xtect-draw-rect.component';
import { registerLocaleData } from '@angular/common';
import zh from '@angular/common/locales/zh';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { DrawLineComponent } from './components/draw-line/draw-line.component';
import { EditRectComponent } from './components/edit-rect/edit-rect.component';
import { EditPolylineComponent } from './components/edit-polyline/edit-polyline.component';

registerLocaleData(zh);

@NgModule({
  declarations: [AppComponent, DrawAreaComponent, TestComponent, DrawRectComponent, XtectDrawRectComponent, DrawLineComponent, EditRectComponent, EditPolylineComponent],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    HttpClientModule,
    BrowserAnimationsModule,
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
