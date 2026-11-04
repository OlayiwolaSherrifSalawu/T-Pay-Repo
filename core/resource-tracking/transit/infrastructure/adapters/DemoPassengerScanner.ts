import type { IPassengerScanner, NearbyPassenger } from '../../application/ports/IPassengerScanner';

/**
 * Fixed passengers for the tracker demo. No radio is involved and no money moves:
 * this only drives the seat manifest. Real payments go through signed vouchers.
 */
export class DemoPassengerScanner implements IPassengerScanner {
  public async scan(): Promise<NearbyPassenger[]> {
    return [
      { deviceId: 'DEMO-PASSENGER-142', name: 'Chidi Eze', protocol: 'wifi_direct' },
      { deviceId: 'DEMO-PASSENGER-089', name: 'Amara Okafor', protocol: 'bluetooth_ble' },
    ];
  }
}
