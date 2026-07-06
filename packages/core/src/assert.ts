/**
 * Exhaustiveness guard: call in the `default`/fall-through of a switch over a
 * union type. If a union member is left unhandled, the argument is no longer
 * `never` and compilation fails at the call site.
 */
export function assertNever(value: never, label = "value"): never {
  throw new Error(`Unhandled ${label}: ${String(value)}`);
}
