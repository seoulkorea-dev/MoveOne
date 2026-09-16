#!/usr/bin/env node
/* eslint-disable no-console -- CLI 스크립트라 콘솔 출력이 곧 사용자 인터페이스입니다 */
/**
 * 역 마스터를 subway_station 테이블에 적재한다. CSV / XLSX 둘 다 읽는다.
 *
 * 지원하는 데이터셋 (헤더를 보고 자동 판별):
 *   1) 국가철도공단_도시광역철도_역사정보 (data.go.kr 15013205) — 수도권 전체, 권장
 *      컬럼: 역번호 · 역사명 · 노선번호 · 노선명 · 위도 · 경도 · 운영기관명 ...
 *   2) 서울교통공사_1_8호선 역사 좌표 (data.go.kr 15099316) — 서울 1~8호선만
 *      컬럼: 고유역번호(외부역코드) · 역명 · 호선 · 위도 · 경도
 *
 * 사용:
 *   node scripts/seed-stations.mjs                       # data/ 안에서 자동으로 찾음
 *   node scripts/seed-stations.mjs data/역사정보.xlsx     # 파일 지정
 *
 * 같은 출처(source)의 기존 행은 지우고 새로 넣는다. 다른 출처 행은 건드리지 않는다.
 * 마이그레이션과 같은 관리자 역할로 실행할 것 (moveone_app 은 읽기 전용).
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join, extname } from 'node:path'
import pg from 'pg'
import { readXlsx } from './lib/xlsx-lite.mjs'

const DSN =
  process.env.MIGRATION_DATABASE_URL ||
  process.env.DATABASE_URL_ADMIN ||
  process.env.DATABASE_URL

if (!DSN) {
  console.error('DATABASE_URL (또는 MIGRATION_DATABASE_URL) 이 필요합니다.')
  process.exit(1)
}

// ── 입력 파일 찾기 ────────────────────────────────────────────────
function findInput() {
  if (process.argv[2]) return resolve(process.cwd(), process.argv[2])
  const dir = resolve(process.cwd(), 'data')
  const cands = existsSync(dir)
    ? readdirSync(dir).filter((f) => ['.csv', '.xlsx'].includes(extname(f).toLowerCase())).sort()
    : []
  if (cands.length === 1) return join(dir, cands[0])
  if (cands.length > 1) {
    // 옛 데이터셋이 남아 있는 채로 새 것을 받는 일이 잦다.
    // 임의로 고르면 조용히 옛 것을 적재하게 되므로 반드시 지정하게 한다.
    console.error('data/ 안에 후보가 여러 개입니다. 쓸 파일을 지정해 주세요:')
    for (const c of cands) console.error('   node scripts/seed-stations.mjs data/' + c)
    process.exit(1)
  }
  console.error('역 마스터 파일을 찾지 못했습니다. data/README.md 를 참고하세요.')
  process.exit(1)
}

const INPUT = findInput()
if (!existsSync(INPUT)) {
  console.error(`파일이 없습니다: ${INPUT}`)
  process.exit(1)
}

// ── 읽기 ──────────────────────────────────────────────────────────
function decode(buf) {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf)
  const bad = (utf8.match(/�/g) ?? []).length
  if (bad > 5) {
    try {
      return new TextDecoder('euc-kr').decode(buf)
    } catch {
      console.error('EUC-KR 디코딩을 지원하지 않는 Node 빌드입니다. 파일을 UTF-8 로 변환해 주세요.')
      process.exit(1)
    }
  }
  return utf8.replace(/^﻿/, '')
}

function parseCsv(text) {
  const rows = []
  let row = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false }
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (c !== '\r') cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''))
}

const isXlsx = extname(INPUT).toLowerCase() === '.xlsx'
let rows
try {
  rows = isXlsx ? readXlsx(INPUT) : parseCsv(decode(readFileSync(INPUT)))
} catch (e) {
  console.error(`파일을 읽지 못했습니다: ${e.message}`)
  process.exit(1)
}
if (rows.length < 2) { console.error('데이터가 없습니다.'); process.exit(1) }
console.log(`입력: ${INPUT} (${isXlsx ? 'XLSX' : 'CSV'}), ${rows.length - 1}행`)

// ── 컬럼 매칭 ─────────────────────────────────────────────────────
const norm = (s) => String(s ?? '').replace(/\s/g, '').replace(/[()]/g, '')
function findCol(headers, ...cands) {
  for (const c of cands) {
    const i = headers.findIndex((h) => norm(h) === norm(c))
    if (i >= 0) return i
  }
  for (const c of cands) {
    const i = headers.findIndex((h) => norm(h).includes(norm(c)))
    if (i >= 0) return i
  }
  return -1
}

const headers = rows[0]
// 국가철도공단(역사명/노선명) 인지, 서울교통공사(역명/호선) 인지 판별
const kric = findCol(headers, '역사명') >= 0 && findCol(headers, '노선명') >= 0
const SOURCE = kric ? 'kric' : 'sto'

const iName = kric ? findCol(headers, '역사명') : findCol(headers, '역명', 'STATIONNAME')
const iLine = kric ? findCol(headers, '노선명') : findCol(headers, '호선', 'LINENAME')
const iLat = findCol(headers, '위도', 'LATITUDE')
const iLng = findCol(headers, '경도', 'LONGITUDE')
const iCode = kric ? findCol(headers, '역번호') : findCol(headers, '외부역코드', '고유역번호')
const iOper = kric ? findCol(headers, '운영기관명') : -1
const iLineNo = kric ? findCol(headers, '노선번호') : -1

if ([iName, iLine, iLat, iLng].some((i) => i < 0)) {
  console.error('필요한 컬럼을 찾지 못했습니다. 헤더:', headers.join(' | '))
  process.exit(1)
}
console.log(
  `데이터셋: ${kric ? '국가철도공단 (수도권 전체)' : '서울교통공사 (1~8호선)'}  source=${SOURCE}\n` +
  `컬럼: 역명=${headers[iName]} 노선=${headers[iLine]} 위도=${headers[iLat]} 경도=${headers[iLng]}` +
  (iCode >= 0 ? ` 역번호=${headers[iCode]}` : '') +
  (iOper >= 0 ? ` 운영기관=${headers[iOper]}` : ''),
)

// ── 행 정리 ───────────────────────────────────────────────────────
const cell = (r, i) => (i >= 0 ? String(r[i] ?? '').trim() : '')
const records = []
let skippedOutside = 0
for (const r of rows.slice(1)) {
  const name = cell(r, iName)
  const line = cell(r, iLine)
  const lat = Number(cell(r, iLat))
  const lng = Number(cell(r, iLng))
  if (!name || !line || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
  // 전국 데이터셋이므로 수도권 밖(부산·대구·광주·대전 등)은 제외한다.
  if (lat < 36.5 || lat > 38.5 || lng < 125.5 || lng > 128.5) { skippedOutside++; continue }
  records.push({
    name, line, lat, lng,
    code: cell(r, iCode) || null,
    oper: cell(r, iOper) || null,
    lineNo: cell(r, iLineNo) || null,
  })
}
if (records.length === 0) {
  console.error('수도권 범위 안의 역이 한 건도 없습니다. 위도/경도 컬럼이 바뀌었는지 확인하세요.')
  process.exit(1)
}
console.log(`적재 대상: ${records.length}건` + (skippedOutside ? ` (수도권 밖 ${skippedOutside}건 제외)` : ''))

// ── 적재 ──────────────────────────────────────────────────────────
const client = new pg.Client({ connectionString: DSN })
await client.connect()
try {
  await client.query('begin')
  const del = await client.query('delete from subway_station where source = $1', [SOURCE])
  if (del.rowCount) console.log(`기존 ${SOURCE} 행 ${del.rowCount}건 삭제`)
  for (const r of records) {
    await client.query(
      `insert into subway_station (station_name, line_name, ext_station_code, lat, lng, operator, line_no, source)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (source, station_name, line_name) do update
         set ext_station_code = excluded.ext_station_code,
             lat = excluded.lat, lng = excluded.lng,
             operator = excluded.operator, line_no = excluded.line_no,
             updated_at = now()`,
      [r.name, r.line, r.code, r.lat, r.lng, r.oper, r.lineNo, SOURCE],
    )
  }
  await client.query('commit')

  const { rows: sum } = await client.query(
    `select source, count(*)::int as c, count(distinct line_name)::int as lines
       from subway_station group by source order by source`,
  )
  console.log('적재 완료:')
  for (const s of sum) console.log(`  ${s.source}: ${s.c}개 역 / ${s.lines}개 노선`)
  const { rows: tot } = await client.query('select count(*)::int as c from subway_station')
  console.log(`  합계: ${tot[0].c}개 행`)
} catch (e) {
  await client.query('rollback')
  console.error('적재 실패:', e.message)
  process.exitCode = 1
} finally {
  await client.end()
}
