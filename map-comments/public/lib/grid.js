// 地図を緯度経度 CELL_DEG 度ごとのマスに区切り、同じマスのコメントを「重なっている」とみなす。
// 0.0003度 ≒ 南北 33m・東西 27m (東京付近)。
// firestore.rules にも同じ値が書いてあるので、変えるときは両方を変えること。
export const CELL_DEG = 0.0003;
export const VANISH_LIMIT = 10;
export const MAX_TEXT_LENGTH = 140;

export function cellOf(lat, lng) {
  return `${Math.floor(lat / CELL_DEG)}_${Math.floor(lng / CELL_DEG)}`;
}

export function cellBounds(cellId) {
  const [y, x] = cellId.split('_').map(Number);
  return {
    south: y * CELL_DEG,
    north: (y + 1) * CELL_DEG,
    west: x * CELL_DEG,
    east: (x + 1) * CELL_DEG,
  };
}
