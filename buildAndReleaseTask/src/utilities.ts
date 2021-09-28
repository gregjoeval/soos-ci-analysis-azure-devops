export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const isNil = (value: unknown): value is null | undefined =>
  value === null || value === undefined;

export const createEnumValueMapper = <TInput, TEnum, TValue>(
  enumObject: TEnum,
  defaultValue: TValue
): ((input: TInput) => TValue) => {
  const entries = Object.entries(enumObject);
  const validInputs = Object.values(enumObject);
  return (input) => {
    const entry = entries.find(([, value]) => input === value);
    if (entry === undefined) {
      return defaultValue;
    }
    const [key] = entry;
    // have to do this because we cant constrain TEnum to be an enum yet (https://github.com/microsoft/TypeScript/issues/30611)
    return (enumObject as unknown as Record<string, TValue>)[key];
  };
};
