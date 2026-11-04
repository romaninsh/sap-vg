import { describe, expect, it } from "vitest";
import { cleanError, money, moneyShort } from "./ui";
import { pnlSeries } from "./charts";

describe("money", () => {
  it("formats cents", () => {
    expect(money(123456)).toBe("$1,234.56");
    expect(money(null)).toBe("—");
  });
  it("abbreviates large amounts", () => {
    expect(moneyShort(255_000_000)).toBe("$2.55M");
    expect(moneyShort(82_400_000)).toBe("$824K");
    expect(moneyShort(95_000)).toBe("$950");
  });
});

describe("cleanError", () => {
  it("keeps the database's reason from an event error", () => {
    expect(cleanError('Error while processing event so_ship: An error occurred: Not enough Lounge Chair in Main plant: 48 on hand, 132 needed"'))
      .toBe("Not enough Lounge Chair in Main plant: 48 on hand, 132 needed");
  });
  it("words a refused status change", () => {
    expect(cleanError("Found 'confirmed' for field `status` … but field must conform to: …")).toBe("That change isn't allowed in this status");
  });
});

describe("pnlSeries", () => {
  it("aligns revenue and costs by month, filling a missing month with 0", () => {
    const s = pnlSeries([
      { label: "Nov 25", series: "Costs", dollars: 5 },
      { label: "Nov 25", series: "Revenue", dollars: 9 },
      { label: "Dec 25", series: "Costs", dollars: 6 },
    ]);
    expect(s).toEqual({ labels: ["Nov 25", "Dec 25"], revenue: [9, 0], costs: [5, 6] });
  });
});
