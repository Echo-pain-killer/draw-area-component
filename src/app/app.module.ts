import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { DrawAreaComponent } from './components/draw-area/draw-area.component';
import { TestComponent } from './components/test/test.component';
import { DrawRectComponent } from './components/draw-rect/draw-rect.component';

@NgModule({
  declarations: [
    AppComponent,
    DrawAreaComponent,
    TestComponent,
    DrawRectComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
