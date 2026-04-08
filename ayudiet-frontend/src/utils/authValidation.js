const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

export const isValidEmail = (value = "") => EMAIL_REGEX.test(String(value).trim());
