import { describe, it, expect } from 'vitest';
import { PIIRedactor } from '../../src/nlp/pii';

describe('PIIRedactor', () => {
  it('should redact emails by default', async () => {
    const text = "Please contact me at test.user@example.com for more info.";
    const expected = "Please contact me at [REDACTED_EMAIL] for more info.";
    const result = await PIIRedactor.redact(text);
    expect(result).toBe(expected);
  });

  it('should redact URLs by default', async () => {
    const text = "Check out https://www.github.com/percolo for the source code.";
    const expected = "Check out [REDACTED_URL] for the source code.";
    const result = await PIIRedactor.redact(text);
    expect(result).toBe(expected);
  });

  it('should optionally redact money', async () => {
    const text = "The invoice is for $500.00 dollars.";
    const noMoneyRedact = await PIIRedactor.redact(text, { maskMoney: false });
    expect(noMoneyRedact).toBe(text);

    const moneyRedact = await PIIRedactor.redact(text, { maskMoney: true });
    expect(moneyRedact).toContain("[REDACTED_MONEY]");
    expect(moneyRedact).not.toContain("$500.00");
  });

  it('should support custom regex patterns', async () => {
    const text = "My SSN is 123-45-6789 and my ID is ABC-123.";
    // Simple mock SSN regex
    const ssnRegex = /\d{3}-\d{2}-\d{4}/g;

    const result = await PIIRedactor.redact(text, {
      customRegex: [
        { name: "SSN", regex: ssnRegex }
      ]
    });

    expect(result).toContain("[REDACTED_SSN]");
    expect(result).not.toContain("123-45-6789");
  });

  it('should redact a batch of documents', async () => {
    const docs = [
      "Contact support@test.com.",
      "Visit http://test.com."
    ];
    const results = await PIIRedactor.redactBatch(docs);
    expect(results[0]).toContain("[REDACTED_EMAIL]");
    expect(results[1]).toContain("[REDACTED_URL]");
  });

  it('should handle empty text gracefully', async () => {
    expect(await PIIRedactor.redact('')).toBe('');
    expect(await PIIRedactor.redact('   ')).toBe('   ');
  });
});
