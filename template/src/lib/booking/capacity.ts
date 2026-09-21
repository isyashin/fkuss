type BookingSlot = {
  date: string;
  time: string;
  guests: number;
};

type BookingCapacityTransaction<TData extends object, TResult> = {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  reservation: {
    aggregate(args: {
      where: {
        date: string;
        time: string;
        status: { in: string[] };
      };
      _sum: { guests: true };
    }): Promise<{ _sum: { guests: number | null } }>;
    create(args: { data: TData }): Promise<TResult>;
  };
};

/**
 * Serializes reservations for one local date/time slot and checks capacity
 * using the same transaction that creates the reservation.
 */
export async function createReservationWithCapacity<TData extends object, TResult>(
  tx: BookingCapacityTransaction<TData, TResult>,
  slot: BookingSlot,
  maxGuestsPerSlot: number,
  data: TData,
): Promise<TResult | null> {
  const lockKey = `booking:${slot.date}:${slot.time}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

  const slotLoad = await tx.reservation.aggregate({
    where: {
      date: slot.date,
      time: slot.time,
      status: { in: ["new", "confirmed"] },
    },
    _sum: { guests: true },
  });
  const taken = slotLoad._sum.guests ?? 0;
  if (taken + slot.guests > maxGuestsPerSlot) {
    return null;
  }

  return tx.reservation.create({ data });
}
