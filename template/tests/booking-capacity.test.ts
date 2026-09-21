import { describe, expect, it, vi } from "vitest";
import { createReservationWithCapacity } from "@/lib/booking/capacity";

describe("createReservationWithCapacity", () => {
  it("locks the local slot before aggregating and creating the reservation", async () => {
    const calls: string[] = [];
    const lockValues: unknown[] = [];
    const tx = {
      $executeRaw: vi.fn(async (_query: TemplateStringsArray, ...values: unknown[]) => {
        lockValues.push(...values);
        calls.push("lock");
        return 1;
      }),
      reservation: {
        aggregate: vi.fn(async () => {
          calls.push("aggregate");
          return { _sum: { guests: 2 } };
        }),
        create: vi.fn(async ({ data }: { data: { date: string; time: string; guests: number } }) => {
          calls.push("create");
          return { id: "reservation-1", ...data };
        }),
      },
    };

    await expect(
      createReservationWithCapacity(
        tx,
        { date: "2030-01-02", time: "19:30", guests: 3 },
        6,
        { date: "2030-01-02", time: "19:30", guests: 3 },
      ),
    ).resolves.toMatchObject({ id: "reservation-1" });
    expect(calls).toEqual(["lock", "aggregate", "create"]);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(lockValues).toEqual(["booking:2030-01-02:19:30"]);
    expect(tx.reservation.aggregate).toHaveBeenCalledWith({
      where: {
        date: "2030-01-02",
        time: "19:30",
        status: { in: ["new", "confirmed"] },
      },
      _sum: { guests: true },
    });
  });

  it("rejects a reservation that would exceed the locked slot capacity without creating it", async () => {
    const tx = {
      $executeRaw: vi.fn(async () => 1),
      reservation: {
        aggregate: vi.fn(async () => ({ _sum: { guests: 5 } })),
        create: vi.fn(),
      },
    };

    await expect(
      createReservationWithCapacity(
        tx,
        { date: "2030-01-02", time: "19:30", guests: 2 },
        6,
        { date: "2030-01-02", time: "19:30", guests: 2 },
      ),
    ).resolves.toBeNull();
    expect(tx.reservation.create).not.toHaveBeenCalled();
  });
});
