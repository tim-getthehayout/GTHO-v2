/** Starting testing policy only. Enforcement reads mutable database policy rows. */
export const INITIAL_BILLING_POLICY = Object.freeze({
  rate_requests: 30, rate_window_seconds: 600,
  monthly_requests: 2000, monthly_audio_minutes: 600,
});
