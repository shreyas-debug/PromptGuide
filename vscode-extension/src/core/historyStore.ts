import * as fs from 'fs';
import * as path from 'path';

export class HistoryStore {
  private readonly filePath: string;

  constructor(globalStorageFsPath: string) {
    this.filePath = path.join(globalStorageFsPath, 'prompt_history.json');
  }

  public getFileHistory(fileUri: string): any[] {
    try {
      if (!fs.existsSync(this.filePath)) { return []; }
      const content = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(content);
      
      // Handle new format vs old format
      if (parsed.data && Array.isArray(parsed.accessOrder)) {
        return parsed.data[fileUri] || [];
      } else {
        return parsed[fileUri] || [];
      }
    } catch {
      return [];
    }
  }

  public saveFileHistory(fileUri: string, score: number, tokens: number): any[] {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      let data: Record<string, any[]> = {};
      let accessOrder: string[] = [];
      
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(content);
        
        if (parsed.data && Array.isArray(parsed.accessOrder)) {
          data = parsed.data;
          accessOrder = parsed.accessOrder;
        } else {
          // Migrate old format
          data = parsed;
          accessOrder = Object.keys(data);
        }
      }

      const history = data[fileUri] || [];
      history.push({
        timestamp: Date.now(),
        score,
        tokens
      });
      if (history.length > 15) {
        history.shift();
      }
      data[fileUri] = history;

      // Update access order (move to back as most recently used)
      accessOrder = accessOrder.filter(uri => uri !== fileUri);
      accessOrder.push(fileUri);

      // Evict if we exceed 100 top-level keys
      while (accessOrder.length > 100) {
        const oldestUri = accessOrder.shift();
        if (oldestUri) {
          delete data[oldestUri];
        }
      }

      fs.writeFileSync(this.filePath, JSON.stringify({ data, accessOrder }, null, 2), 'utf-8');
      return history;
    } catch (err) {
      console.error('PromptGuide: Failed to save file history:', err);
      return [];
    }
  }
}
