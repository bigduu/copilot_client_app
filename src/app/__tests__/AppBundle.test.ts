// @vitest-environment node
import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"

const runBundleCheck = () => {
  const script = `
import viteConfig from './vite.config.ts'
import { build } from 'vite'

const config = typeof viteConfig === 'function' ? await viteConfig() : viteConfig
const result = await build({
  ...config,
  logLevel: 'silent',
  mode: 'development',
  build: {
    ...config.build,
    write: false,
    emptyOutDir: false,
  },
})
const outputs = Array.isArray(result) ? result.flatMap((item) => item.output) : result.output
const code = outputs.filter((item) => item.type === 'chunk').map((item) => item.code).join('\\\\n')
const hasConfigProvider = /(?:\\.|\\b)jsx(?:s|DEV)?\\(\\s*ConfigProvider\\b/.test(code)
const hasAntApp = /(?:\\.|\\b)jsx(?:s|DEV)?\\(\\s*AntApp\\b/.test(code)
console.log(JSON.stringify({ hasConfigProvider, hasAntApp }))
`

  const output = execFileSync("node", ["--input-type=module", "-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "development" },
  })

  const lines = output.trim().split("\n")
  return JSON.parse(lines[lines.length - 1] ?? "{}")
}

describe("App bundle", () => {
  it("does not leave ConfigProvider or AntApp as free identifiers", () => {
    const { hasConfigProvider, hasAntApp } = runBundleCheck()
    expect(hasConfigProvider).toBe(false)
    expect(hasAntApp).toBe(false)
  }, 20000)
})
