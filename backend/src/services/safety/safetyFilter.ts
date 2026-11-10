export interface SafetyScanResult {
  sanitizedText: string;
  containsSensitiveData: boolean;
  detectedTypes: string[];
}

const SENSITIVE_PATTERNS: Array<{ type: string; regex: RegExp; replacement: string }> = [
  {
    type: "api_key_or_token",
    regex: /\b(?:sk-[a-zA-Z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|AQ\.[a-zA-Z0-9._-]{16,}|vach_[a-zA-Z0-9_-]{16,}|sb_(?:secret|publishable)_[a-zA-Z0-9_-]{10,}|ghp_[a-zA-Z0-9]{20,})\b/g,
    replacement: "[REDACTED_SECRET]",
  },
  {
    type: "password_disclosure",
    regex: /\b(my\s+password\s+is\s+|password\s*[:=]\s*)\S+/gi,
    replacement: "$1[REDACTED_PASSWORD]",
  },
  {
    type: "credit_card",
    regex: /\b(?:\d[ -]*?){13,19}\b/g,
    replacement: "[REDACTED_CARD]",
  },
  {
    type: "aadhaar_number",
    regex: /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    replacement: "[REDACTED_ID]",
  },
  {
    type: "pan_card",
    regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g,
    replacement: "[REDACTED_PAN]",
  },
  {
    type: "ssn",
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: "[REDACTED_SSN]",
  },
];

export function scanAndSanitizeText(text: string): SafetyScanResult {
  let sanitized = text;
  const detectedTypes: string[] = [];

  for (const rule of SENSITIVE_PATTERNS) {
    rule.regex.lastIndex = 0;
    if (rule.regex.test(sanitized)) {
      detectedTypes.push(rule.type);
      rule.regex.lastIndex = 0;
      sanitized = sanitized.replace(rule.regex, rule.replacement);
    }
    rule.regex.lastIndex = 0;
  }

  return {
    sanitizedText: sanitized,
    containsSensitiveData: detectedTypes.length > 0,
    detectedTypes,
  };
}

export function isEducationalMemorySafe(text: string): boolean {
  const scan = scanAndSanitizeText(text);
  return !scan.containsSensitiveData;
}

