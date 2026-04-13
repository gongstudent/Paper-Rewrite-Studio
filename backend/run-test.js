const { execSync } = require('child_process');
const fs = require('fs');
let log = '';
try {
  const output = execSync('npx jest --config ./jest.config.js --no-cache', { encoding: 'utf-8', stdio: 'pipe' });
  log += '--- STDOUT ---\n' + output;
} catch (error) {
  log += '--- STDERR ---\n' + error.stderr + '\n--- STDOUT ---\n' + error.stdout;
}
fs.writeFileSync('out-node.txt', log, 'utf8');
