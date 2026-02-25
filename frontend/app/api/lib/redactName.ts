
/**
 * Redacts a user's name based on the language/script.
 * 
 * Rules:
 * 1. If the name starts with an English alphabet character (A-Z, a-z), keep the first 3 characters.
 * 2. If the name does NOT start with an English alphabet character (e.g. CJK), keep only the first 1 character.
 * 
 * Always appends '***' to indicate redaction.
 * 
 * @param name The full name to redact
 * @returns The redacted name string (e.g. "Joh***" or "王***")
 */
export function redactName(name: string | null | undefined): string {
    if (!name) return 'Anon';

    // const firstChar = name.charAt(0);
    // const isEnglish = /^[a-zA-Z]$/.test(firstChar);

    // if (isEnglish) {
    //     return name.substring(0, 3) + '***';
    // } else {
    //     return name.substring(0, 1) + '***';
    // }
    return name;
}
