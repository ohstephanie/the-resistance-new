// Participant code management
// Codes can be set via environment variable PARTICIPANT_CODES (comma-separated)
// or loaded from a file

export class ParticipantCodeManager {
  private validCodes: Set<string>;
  
  constructor() {
    this.validCodes = new Set();
    this.loadCodes();
  }
  
  private loadCodes(): void {
    // Load from environment variable
    const envCodes = process.env.PARTICIPANT_CODES;
    if (envCodes) {
      const codes = envCodes.split(',').map(c => c.trim()).filter(c => c.length > 0);
      codes.forEach(code => this.validCodes.add(code));
      console.log(`[ParticipantCodes] Loaded ${codes.length} codes from environment variable`);
    }
    
    // If no codes in environment, use default codes for testing
    // In production, you should set PARTICIPANT_CODES environment variable
    if (this.validCodes.size === 0) {
      console.warn('[ParticipantCodes] No participant codes found in environment. Using default test codes.');
      // Default test codes - replace these with actual codes via environment variable
      const defaultCodes = ['TEST001', 'TEST002', 'TEST003'];
      defaultCodes.forEach(code => this.validCodes.add(code));
    }
  }
  
  verifyCode(code: string): boolean {
    if (!code || typeof code !== 'string') {
      return false;
    }
    return this.validCodes.has(code.trim().toUpperCase());
  }
  
  addCode(code: string): void {
    if (code && typeof code === 'string') {
      this.validCodes.add(code.trim().toUpperCase());
      console.log(`[ParticipantCodes] Added code: ${code.trim().toUpperCase()}`);
    }
  }
  
  removeCode(code: string): boolean {
    if (code && typeof code === 'string') {
      const removed = this.validCodes.delete(code.trim().toUpperCase());
      if (removed) {
        console.log(`[ParticipantCodes] Removed code: ${code.trim().toUpperCase()}`);
      }
      return removed;
    }
    return false;
  }
  
  getAllCodes(): string[] {
    return Array.from(this.validCodes).sort();
  }
  
  getCodeCount(): number {
    return this.validCodes.size;
  }
}
