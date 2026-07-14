const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function runLogged(command, args, {
  cwd,
  env = process.env,
  logPath,
  echo = false,
  spawnSync = childProcess.spawnSync,
} = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false,
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  fs.mkdirSync(path.dirname(logPath), {recursive: true});
  fs.writeFileSync(logPath, `$ ${command} ${args.join(' ')}\n\n${stdout}\n${stderr}`);
  if (echo && stdout) process.stdout.write(stdout);
  if (echo && stderr) process.stderr.write(stderr);
  if (result.status !== 0) {
    const error = new Error(`${command} ${args.join(' ')} falhou (exit ${result.status}). Log: ${logPath}`);
    error.logPath = logPath;
    error.exitCode = result.status;
    throw error;
  }
  return result;
}

module.exports = {runLogged};
