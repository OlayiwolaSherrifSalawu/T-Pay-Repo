export interface NearbyPassenger {
  deviceId: string;
  name: string;
  protocol: 'bluetooth_ble' | 'wifi_direct';
}

export interface IPassengerScanner {
  scan(): Promise<NearbyPassenger[]>;
}
