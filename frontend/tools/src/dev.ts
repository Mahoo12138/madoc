import type { PackageName } from '@madoc-tools/utils/workspace';

import { Option, PackageSelectorCommand } from './command';

export class DevCommand extends PackageSelectorCommand {
  static override paths = [['dev'], ['d']];

  protected override availablePackages: PackageName[] = [
    '@madoc/web',
    '@madoc/server',
    '@madoc/electron',
    '@madoc/electron-renderer',
    '@madoc/mobile',
    '@madoc/ios',
    '@madoc/android',
    '@madoc/admin',
  ];

  protected deps = Option.Boolean('--deps', {
    description: 'Run dev with dependencies',
  });

  async execute() {
    const name = await this.getPackage();
    const args = [];

    if (this.deps) {
      args.push('--deps');
    }

    args.push(name, 'dev');

    await this.cli.run(args);
  }
}
