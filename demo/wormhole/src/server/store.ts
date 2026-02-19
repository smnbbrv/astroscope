// in-memory counter storage — resets on server restart
let count = 0;

export function getCount(): number {
  return count;
}

export function setCount(value: number): number {
  count = value;

  return count;
}
