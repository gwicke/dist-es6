import Directory from './directory';
import PackageJson from '../lib/package-json';

function binAdapter(packageDir, binPath, babel = true) {
  if (!babel) {
    return `#!/usr/bin/env node
'use strict';
require('${packageDir.join(binPath)}');
`;
  }

  return `#!/usr/bin/env node
'use strict';
[
  '${packageDir.join('node_modules/babel/register.js')}',
  'babel/register',
  '${require.resolve('babel/register')}'
].some(function(babelRegisterPath) {
  try {
    require(babelRegisterPath)({stage: 0});
    return true;
  } catch(e) {
    return false;
  }
});
require('${packageDir.join(binPath)}');
`;
}

export default class Project {
  constructor(...projectPath) {
    this.directory = new Directory(...projectPath);
  }

  async packageJson() {
    if (!this.cachedPackageJson) {
      this.cachedPackageJson = await this.directory.readFile('package.json');
    }
    return this.cachedPackageJson;
  }

  async link(packagePath) {
    const packageDir = new Directory(packagePath);
    const [packageJson, nodeModules] = await* [
      packageDir.readFile('package.json'),
      this.directory.mkdir('node_modules')
    ];

    if (packagePath !== this.directory.path) {
      const installedPackages = await nodeModules.ls();
      const {dependencies = {}} = packageJson;
      const installArgs = Object.keys(dependencies)
        .filter(name => installedPackages.indexOf(name) === -1)
        .map(name => `'${name}@${dependencies[name]}'`)
        .join(' ');
      if (installArgs.trim()) {
        const output = await this.directory.execSh(
          `npm install ${installArgs}`
        );
        if (output.trim()) {
          process.stdout.write(`${output.trim()}\n`);
        }
      }
    }

    const [bin] = await* [
      await nodeModules.mkdir('.bin'),
      nodeModules.symlink(packageDir.join('src'), packageJson.name)
    ];
    await* Object.keys(Object(packageJson.bin))
      .map(async binName => {
        const binPath = packageJson.bin[binName];
        const binContents = await packageDir.readFile(binPath);
        await bin.writeFile(
          binName,
          binAdapter(
            packageDir,
            binPath,
            binContents.indexOf('#!/usr/bin/env node') !== 0
          )
        );
        await bin.chmod(binName, '755');
      });
  }

  async linkAll() {
    const {linkDependencies = {}} = await this.packageJson();
    await this.link(this.directory.path);
    for (const name of Object.keys(linkDependencies)) {
      await this.link(this.directory.join(linkDependencies[name]));
    }
  }

  async compile() {
    await this.directory.rm('dist');
    const distDirectory = await this.directory.mkdir('dist');

    const packageJson = await this.packageJson();
    const distPackageJson = new PackageJson(packageJson)
      .moveTo('src')
      .toProduction()
      .addBabelRuntime()
      .toJSON();

    await distDirectory.writeFile('package.json', distPackageJson);

    await* (packageJson.files || [])
      .filter(fileName => fileName.indexOf('src') !== 0)
      .map(fileName => distDirectory.cp(this.directory.join(fileName), fileName));

    await this.directory.mkdir('src');
    await this.directory.execSh([
      `'${require.resolve('babel/bin/babel')}'`,
      '--stage 0',
      '--optional runtime',
      '--copy-files',
      'src',
      '--out-dir dist'
    ].join(' '));

    const {bin = {}} = distPackageJson;
    const shebang = '#!/usr/bin/env node';
    await* Object.keys(bin).map(async binName => {
      const binPath = bin[binName];
      const binContents = await distDirectory.readFile(binPath);
      await distDirectory.writeFile(
        binPath,
        binContents.indexOf(shebang) !== 0 ?
          `${shebang}\n${binContents}` :
          binContents
      );
      await distDirectory.chmod(binPath, '755');
    });
  }
}
