export interface MapEventObject<Target = any, OriginEvent = Event> {
  lnglat?: AMap.LngLat;
  pixel?: AMap.Pixel;
  type: string;
  target?: Target;
  originEvent: OriginEvent;
}
