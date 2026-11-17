import path from 'path'
import Bun from 'bun'

const pythonProcess = Bun.spawn(['uv', 'run', 'sayogen', "-p", "3000", ...process.argv.slice(2)], {
  cwd: path.resolve(__dirname, "../.."),

  stdout: 'inherit',
  stderr: 'inherit',

  onExit: () => {
    viteProcess.kill()
   }
})

const viteProcess = Bun.spawn(['bun', 'run', 'vite', '--config', path.join(__dirname, 'vite.config.ts')], {
  cwd: path.resolve(__dirname, "../../"),

  stdout: 'inherit',
  stderr: 'inherit',

  onExit: () => {
    pythonProcess.kill()
  }
})
