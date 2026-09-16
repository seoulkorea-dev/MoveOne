/**
 * 의존성 없는 최소 XLSX 리더.
 * data.go.kr 표준데이터가 XLSX 로만 제공되는 경우가 있어, 엑셀로 CSV 변환하는
 * 수작업 없이 바로 읽으려고 만들었다. 시트 1개의 셀 값을 문자열로만 꺼낸다.
 * (서식·수식·날짜 변환은 다루지 않는다 — 좌표/역명 적재에는 필요 없다.)
 */
import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'

const SIG_EOCD = 0x06054b50
const SIG_CD = 0x02014b50
const SIG_LOCAL = 0x04034b50

/** ZIP 중앙 디렉터리를 읽어 { 파일명: Buffer } 로 돌려준다. */
function unzip(buf, wanted) {
  // EOCD 를 뒤에서부터 찾는다 (주석이 붙어 있을 수 있어 최대 64KB 탐색).
  let eocd = -1
  const from = Math.max(0, buf.length - 66_000)
  for (let i = buf.length - 22; i >= from; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('ZIP 구조를 읽지 못했습니다 (EOCD 없음). 파일이 XLSX 가 맞는지 확인하세요.')

  const count = buf.readUInt16LE(eocd + 10)
  let off = buf.readUInt32LE(eocd + 16)
  if (off === 0xffffffff) throw new Error('ZIP64 형식은 지원하지 않습니다. 엑셀에서 CSV 로 저장해 주세요.')

  const out = new Map()
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== SIG_CD) break
    const method = buf.readUInt16LE(off + 10)
    const compSize = buf.readUInt32LE(off + 20)
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const cmtLen = buf.readUInt16LE(off + 32)
    const localOff = buf.readUInt32LE(off + 42)
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen)
    off += 46 + nameLen + extraLen + cmtLen

    if (!wanted(name)) continue
    if (buf.readUInt32LE(localOff) !== SIG_LOCAL) continue
    const lNameLen = buf.readUInt16LE(localOff + 26)
    const lExtraLen = buf.readUInt16LE(localOff + 28)
    const start = localOff + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(start, start + compSize)
    out.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw))
  }
  return out
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
function unescapeXml(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    return ENT[e] ?? m
  })
}

/** <si> 하나에 여러 <t> 가 나뉘어 있을 수 있다(서식 조각). 전부 이어붙인다. */
function parseSharedStrings(xml) {
  const out = []
  for (const m of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    let s = ''
    for (const t of m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) s += t[1]
    out.push(unescapeXml(s))
  }
  return out
}

/** "BC12" -> 열 인덱스(0부터) */
function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? 'A'
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function parseSheet(xml, shared) {
  const rows = []
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = []
    for (const cm of rm[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cm[1]
      const body = cm[2]
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1]
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? 'n'
      let val = ''
      if (type === 'inlineStr') {
        for (const t of body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) val += t[1]
        val = unescapeXml(val)
      } else {
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1]
        if (v !== undefined && v !== null) {
          val = type === 's' ? (shared[Number(v)] ?? '') : unescapeXml(v)
        }
      }
      const i = ref ? colIndex(ref) : row.length
      while (row.length < i) row.push('')
      row[i] = val
    }
    rows.push(row)
  }
  // 자체 닫힌 빈 셀(<c .../>)로 끝나는 행 때문에 길이가 어긋날 수 있어 맞춰준다.
  const width = rows.reduce((a, r) => Math.max(a, r.length), 0)
  for (const r of rows) while (r.length < width) r.push('')
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''))
}

/** XLSX 파일의 첫 시트를 2차원 문자열 배열로 읽는다. */
export function readXlsx(path) {
  const buf = readFileSync(path)
  if (buf.length < 4 || buf.readUInt16LE(0) !== 0x4b50) {
    throw new Error('XLSX(ZIP) 파일이 아닙니다. 확장자와 실제 형식이 다를 수 있습니다.')
  }
  const files = unzip(buf, (n) => n === 'xl/sharedStrings.xml' || n.startsWith('xl/worksheets/sheet'))
  const shared = files.has('xl/sharedStrings.xml')
    ? parseSharedStrings(files.get('xl/sharedStrings.xml').toString('utf8'))
    : []
  const sheetName = [...files.keys()]
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort()[0]
  if (!sheetName) throw new Error('워크시트를 찾지 못했습니다.')
  return parseSheet(files.get(sheetName).toString('utf8'), shared)
}
