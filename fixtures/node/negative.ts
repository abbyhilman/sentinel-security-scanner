// Synthetic safe example: user input is treated as plain text.
export function displayRequestValue(value: unknown): string {
  return String(value).replace(/[<>]/gu, '');
}
