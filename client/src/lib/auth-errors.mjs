export function authErrorMessage(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = typeof error?.message === 'string' ? error.message : '';
  if (code === 'over_email_send_rate_limit' || /email rate limit/i.test(message)) return 'The confirmation-email service has reached its sending limit. Signup could not finish. Repeated attempts will not help; wait for the limit to reset or ask the project owner to configure email delivery.';
  if (code === 'email_not_confirmed') return 'Confirm your CareTrail email before signing in. Your Supabase dashboard login is a separate account.';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) return 'The email or password does not match a CareTrail account. If you have not registered here yet, choose Create an account.';
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') return 'Too many requests. Wait before trying again.';
  if (code === 'email_address_not_authorized') return 'The project email service cannot deliver to this address yet. The project owner needs to configure its email provider.';
  return message || 'We could not complete this account request. Please try again.';
}
