import posix from 'posix';
import Project from '../lib/project';

async function run(paths) {
  const project = new Project();
  await project.compile(paths);

  //const currentNpmCommand = JSON.parse(process.env.npm_config_argv).original[0];
  //if (currentNpmCommand === 'install') {
  //  await project.linkAll();
  //}
}

run(process.argv.slice(1)).catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  /* eslint-disable lines-around-comment, no-process-exit */
  process.exit(1);
  /* eslint-enable lines-around-comment, no-process-exit */
});
