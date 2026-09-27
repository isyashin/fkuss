export function calculatePreviewTotal(lines, prices) {
  return lines.reduce((sum, line) => {
    const price = Number(prices[line.id]) || 0;
    const quantity = Math.max(0, Math.floor(Number(line.quantity) || 0));
    return sum + price * quantity;
  }, 0);
}
