import { exec } from 'child_process';
import util from 'util';
import path from 'path';

const execAsync = util.promisify(exec);

export class GitService {
  private rootDir: string;

  constructor(rootDir?: string) {
    this.rootDir = rootDir || path.resolve(process.cwd(), '..');
  }

  public async checkoutBranch(branchName: string): Promise<void> {
    try {
      await execAsync(`git checkout -b ${branchName}`, { cwd: this.rootDir });
    } catch (e) {
      // Branch might exist, try switching
      await execAsync(`git checkout ${branchName}`, { cwd: this.rootDir });
    }
  }

  public async getDiffStat(): Promise<string> {
    try {
      const { stdout } = await execAsync(
        'git show --stat --oneline --no-color',
        { cwd: this.rootDir }
      );
      return stdout;
    } catch (e) {
      return '';
    }
  }
}
