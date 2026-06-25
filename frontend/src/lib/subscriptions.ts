// Cancellation reasons offered in the UI, matching the backend's accepted set.
export const CANCEL_REASONS: { value: string; label: string }[] = [
  { value: "customer_request", label: "Customer requested" },
  { value: "payment_failure", label: "Payment failure" },
  { value: "expired", label: "Term expired" },
  { value: "fraudulent", label: "Fraud" },
  { value: "other", label: "Other" },
];

const LABEL = new Map(CANCEL_REASONS.map((r) => [r.value, r.label]));

export function cancelReasonLabel(value?: string): string {
  if (!value) return "—";
  return LABEL.get(value) ?? value;
}
