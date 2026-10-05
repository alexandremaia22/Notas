import { describe, expect, it } from 'vitest'
import { appendTranscript, formatDuration } from './format'

describe('formatDuration', () => {
  it('formata minutos e segundos', () => {
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(65_000)).toBe('01:05')
  })

  it('inclui horas em aulas longas', () => {
    expect(formatDuration(3_725_000)).toBe('1:02:05')
  })

  it('trata valores negativos como zero', () => {
    expect(formatDuration(-10)).toBe('00:00')
  })
})

describe('appendTranscript', () => {
  it('junta trechos com um espaço e normaliza espaços', () => {
    expect(appendTranscript('', '  olá   turma ')).toBe('olá turma')
    expect(appendTranscript('olá turma', ' hoje vamos ')).toBe('olá turma hoje vamos')
  })

  it('ignora trechos vazios', () => {
    expect(appendTranscript('olá', '   ')).toBe('olá')
  })
})
