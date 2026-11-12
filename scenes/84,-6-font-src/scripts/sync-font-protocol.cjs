// Regenerate only the four font-capable serializers from protocol PR #489.
// Uses the SDK's protoc options; preserves every other installed SDK module.
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { createRequire } = require('node:module')

const scene = process.cwd()
const resolveScene = createRequire(path.join(scene, 'package.json'))
const protocolRoot = path.dirname(resolveScene.resolve('@dcl/protocol/package.json'))
const ecsRoot = path.dirname(resolveScene.resolve('@dcl/ecs/package.json'))
const protocol = require(path.join(protocolRoot, 'package.json'))
const expected = '1.0.0-35133806160.commit-1767aed'
if (protocol.version !== expected) throw new Error(`Expected protocol ${expected}; got ${protocol.version}`)
const protoc = resolveScene.resolve('@protobuf-ts/protoc/protoc.js')
const ts = resolveScene('typescript')
const resolveProtocol = createRequire(path.join(protocolRoot, 'package.json'))
const pluginRoot = path.dirname(resolveProtocol.resolve('@dcl/ts-proto/package.json'))
const pluginInfo = require(path.join(pluginRoot, 'package.json'))
const plugin = path.join(pluginRoot, pluginInfo.bin['protoc-gen-dcl_ts_proto'])
const components = [
  ['text_shape', 'PBTextShape', 22],
  ['ui_text', 'PBUiText', 9],
  ['ui_input', 'PBUiInput', 16],
  ['ui_dropdown', 'PBUiDropdown', 13]
]
const work = fs.mkdtempSync(path.join(scene, 'node_modules', '.font-protocol-'))
const src = path.join(work, 'src')
fs.mkdirSync(src)
try {
  const wrapper = path.join(work, process.platform === 'win32' ? 'plugin.bat' : 'plugin')
  fs.writeFileSync(wrapper, process.platform === 'win32'
    ? `@echo off\r\n"${process.execPath}" "${plugin}" %*\r\n`
    : `#!/bin/sh\nexec '${process.execPath.replace(/'/g, "'\\''")}' '${plugin.replace(/'/g, "'\\''")}' "$@"\n`, { mode: 0o755 })
  const protoRoot = path.join(protocolRoot, 'proto')
  for (const [name, , field] of components) {
    const definition = fs.readFileSync(path.join(protoRoot, 'decentraland/sdk/components', `${name}.proto`), 'utf8')
    if (!new RegExp(`optional\\s+string\\s+font_src\\s*=\\s*${field}\\s*;`).test(definition)) {
      throw new Error(`Unexpected font_src wire field in ${name}`)
    }
  }
  // protoc invokes Windows batch plugins through cmd, where parcel commas split unquoted paths.
  const result = spawnSync(process.execPath, [protoc,
    `--plugin=protoc-gen-dcl_ts_proto=${process.platform === 'win32' ? '' : './'}${path.basename(wrapper)}`,
    '--dcl_ts_proto_opt=esModuleInterop=true,outputJsonMethods=false,forceLong=false,outputPartialMethods=false,fileSuffix=.gen,unrecognizedEnum=false,oneof=unions',
    `--dcl_ts_proto_out=${src}`, `--proto_path=${protoRoot}`,
    ...components.map(([name]) => `decentraland/sdk/components/${name}.proto`)
  ], { cwd: work, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr || 'protoc failed')
  function files(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const filename = path.join(directory, entry.name)
      return entry.isDirectory() ? files(filename) : [filename]
    })
  }
  for (const filename of files(src)) {
    const text = fs.readFileSync(filename, 'utf8').replace(/^import type/gm, 'import').replace(/export enum/g, 'export const enum').replace(/export const protobufPackage/g, 'const protobufPackageSarasa')
    fs.writeFileSync(filename, text)
  }
  const roots = components.map(([name]) => path.join(src, 'decentraland/sdk/components', `${name}.gen.ts`))
  for (const [folder, module] of [['dist', ts.ModuleKind.ESNext], ['dist-cjs', ts.ModuleKind.CommonJS]]) {
    const program = ts.createProgram(roots, {
      target: ts.ScriptTarget.ES2020, module, moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true, skipLibCheck: true, strict: true, declaration: true,
      preserveConstEnums: true, rootDir: src, outDir: path.join(work, folder)
    })
    const diagnostics = ts.getPreEmitDiagnostics(program)
    if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: x => x, getCurrentDirectory: () => scene, getNewLine: () => '\n'
    }))
    if (program.emit().emitSkipped) throw new Error(`Failed to compile ${folder}`)
  }
  // Imported protobuf types can be emitted as declarations only. Exercise the
  // regenerated serializers against the exact runtime dependencies kept in ECS.
  for (const relative of ['decentraland/common/colors.gen.js', 'decentraland/sdk/components/common/texts.gen.js']) {
    const destination = path.join(work, 'dist-cjs', relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(path.join(ecsRoot, 'dist-cjs/components/generated/pb', relative), destination)
  }
  // Validate generated encodings against the exact pinned protocol before touching SDK files.
  for (const [name, type] of components) {
    const generated = require(path.join(work, 'dist-cjs/decentraland/sdk/components', `${name}.gen.js`))[type]
    const reference = require(path.join(protocolRoot, 'out-js/decentraland/sdk/components', `${name}.gen.js`))[type]
    const value = generated.decode(new Uint8Array())
    value.fontSrc = 'fonts/AtkinsonHyperlegible-Regular.ttf'
    const encoded = generated.encode(value).finish()
    if (reference.decode(encoded).fontSrc !== value.fontSrc ||
        generated.decode(reference.encode(value).finish()).fontSrc !== value.fontSrc) {
      throw new Error(`fontSrc round-trip failed: ${name}`)
    }
  }
  for (const folder of ['dist', 'dist-cjs']) {
    for (const [name] of components) {
      for (const extension of ['js', 'd.ts']) {
        const relative = `decentraland/sdk/components/${name}.gen.${extension}`
        fs.copyFileSync(path.join(work, folder, relative), path.join(ecsRoot, folder, 'components/generated/pb', relative))
      }
    }
  }
  for (const [name, type] of components) {
    const installed = require(path.join(ecsRoot, 'dist-cjs/components/generated/pb/decentraland/sdk/components', `${name}.gen.js`))[type]
    const value = installed.decode(new Uint8Array())
    value.fontSrc = 'fonts/check.ttf'
    if (installed.decode(installed.encode(value).finish()).fontSrc !== value.fontSrc) throw new Error(`Installed serializer failed: ${name}`)
  }
  console.log(`Regenerated and verified four fontSrc serializers from @dcl/protocol ${expected}`)
} finally {
  const resolvedWork = fs.realpathSync(work)
  const resolvedModules = fs.realpathSync(path.join(scene, 'node_modules'))
  if (path.dirname(resolvedWork) !== resolvedModules || !path.basename(resolvedWork).startsWith('.font-protocol-')) {
    throw new Error(`Refusing to remove unexpected temporary path: ${resolvedWork}`)
  }
  fs.rmSync(resolvedWork, { recursive: true, force: true })
}
