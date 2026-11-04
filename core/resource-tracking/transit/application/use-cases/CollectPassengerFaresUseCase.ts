import type { ITransitRepository } from '../../domain/repositories/ITransitRepository';
import type { IPassengerScanner } from '../ports/IPassengerScanner';
import { Result } from '../../../../shared/domain/Result';
import { DomainEventBus } from '../../../../shared/domain/DomainEventBus';
import type { CollectFaresResultDTO } from '../dtos/TransitDTOs';

export class CollectPassengerFaresUseCase {
  private transitRepo: ITransitRepository;
  private passengerScanner: IPassengerScanner;

  constructor(transitRepo: ITransitRepository, passengerScanner: IPassengerScanner) {
    this.transitRepo = transitRepo;
    this.passengerScanner = passengerScanner;
  }

  public async execute(): Promise<Result<CollectFaresResultDTO>> {
    const trip = await this.transitRepo.getActiveTrip();
    if (trip.isFullyPaid) {
      return Result.ok({
        driverName: trip.driverName,
        totalSeats: trip.totalSeats,
        paidCount: trip.paidSeatsCount,
        unpaidCount: 0,
        isFullyPaid: true,
        newlyPaidPassengers: [],
        spokenDriverAlert: `All ${trip.totalSeats} seats are already fully paid. Ready to roll!`,
      });
    }

    // 1. Find the passengers to seat
    const passengers = await this.passengerScanner.scan();
    const newlyPaid: {
      seatNumber: number;
      passengerName: string;
      fareFormatted: string;
      paymentMethod: string;
    }[] = [];

    // 2. Seat each passenger who has not been recorded yet
    for (const passenger of passengers) {
      if (trip.isFullyPaid) break;

      const alreadyPaid = trip.seats.some((s) => s.passengerDeviceId === passenger.deviceId);
      if (alreadyPaid) continue;

      const recordResult = trip.recordPassengerPayment(
        passenger.name,
        passenger.deviceId,
        passenger.protocol
      );

      if (recordResult.isSuccess) {
        const seat = recordResult.getValue();
        newlyPaid.push({
          seatNumber: seat.seatNumber,
          passengerName: seat.passengerName!,
          fareFormatted: seat.fareAmount.format(),
          paymentMethod: seat.paymentMethod!,
        });
      }
    }

    // 3. Persist and dispatch domain events
    await this.transitRepo.saveTrip(trip);
    await DomainEventBus.publishAll(trip.domainEvents);
    trip.clearEvents();

    // 4. Generate audio voice readout for the driver
    let spokenAlert = '';
    if (trip.isFullyPaid) {
      spokenAlert = `All ${trip.totalSeats} passengers have paid their ₦300 fare to ${trip.driverName}. Your bus is ready to move!`;
    } else {
      spokenAlert = `${trip.paidSeatsCount} passengers have paid. You have ${trip.unpaidSeatsCount} seat${trip.unpaidSeatsCount > 1 ? 's' : ''} left.`;
    }

    return Result.ok({
      driverName: trip.driverName,
      totalSeats: trip.totalSeats,
      paidCount: trip.paidSeatsCount,
      unpaidCount: trip.unpaidSeatsCount,
      isFullyPaid: trip.isFullyPaid,
      newlyPaidPassengers: newlyPaid,
      spokenDriverAlert: spokenAlert,
    });
  }
}
