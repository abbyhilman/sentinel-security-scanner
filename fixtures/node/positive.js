// Synthetic unsafe data flow for local parser and future scanner workflow checks.
export function evaluateRequest(req) {
  return eval(req.query.expression);
}
