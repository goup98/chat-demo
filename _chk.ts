
import { readFileSync, readdirSync } from 'node:fs'
import { readSessionFile, readSessionIndex, checkManifest } from './src/services/chat/history/schema.ts'
const base = '/tmp/ds_split_check'
const packs = readdirSync(base)
let allOk = true
for (const p of packs) {
  const files = readdirSync(`${base}/${p}`)
  let ok = 0; const bad = []
  for (const f of files) {
    try { readSessionFile(JSON.parse(readFileSync(`${base}/${p}/${f}`, 'utf8'))); ok++ }
    catch (e) { bad.push(f) }
  }
  console.log(`${p}: ${files.length} 个会话, 通过 ${ok}, 失败 ${bad.length} ${bad.length? '✗':''}`)
  if (bad.length) { allOk = false; console.log('   失败样本:', bad.slice(0,3)) }
}

// 每包的 manifest / index 也验一遍
const { execSync } = await import('node:child_process')
console.log(allOk ? '\n全部会话校验通过' : '\n有失败项')
