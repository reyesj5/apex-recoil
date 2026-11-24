import tokens from '@/styles/tokens.json';

// The design tokens' colors for the canvas, which can't use classes: Konva takes the same values the
// interface does, from client/styles/tokens.json.

const values = new Map<string, string>(
  tokens.color.tokens.map((t) => [t.name, typeof t.value === 'string' ? t.value : String(Object.values(t.value)[0])]),
);

/** A color token's value, with an alias such as "{volt}" followed to what it names */
export function tokenColor(name: string): string {
  const value = values.get(name);
  if (value === undefined) throw new Error(`No color token named ${name}`);
  const alias = /^\{(.+)\}$/.exec(value);
  return alias ? tokenColor(alias[1]) : value;
}
