import type { Tool } from '../lib/types'
import type { PenSettings } from './NoteCanvas'

const COLORS = ['#1f2937', '#2563eb', '#dc2626', '#16a34a', '#9333ea', '#f59e0b']
const WIDTHS = [2, 4, 8]

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: 'pen', label: 'Caneta', icon: '✒️' },
  { id: 'highlighter', label: 'Marca-texto', icon: '🖍️' },
  { id: 'eraser', label: 'Borracha', icon: '🧽' },
]

interface ToolbarProps {
  settings: PenSettings
  onChange: (settings: PenSettings) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
}

export function Toolbar({ settings, onChange, canUndo, canRedo, onUndo, onRedo, onClear }: ToolbarProps) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Ferramentas de escrita">
      <div className="toolbar-group">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className="tool-button"
            aria-pressed={settings.tool === tool.id}
            title={tool.label}
            onClick={() => onChange({ ...settings, tool: tool.id })}
          >
            <span aria-hidden="true">{tool.icon}</span>
            <span className="sr-only">{tool.label}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-group" aria-label="Cores">
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className="color-swatch"
            style={{ backgroundColor: color }}
            aria-pressed={settings.color === color}
            title={`Cor ${color}`}
            disabled={settings.tool === 'eraser'}
            onClick={() => onChange({ ...settings, color })}
          />
        ))}
      </div>

      <div className="toolbar-group" aria-label="Espessura">
        {WIDTHS.map((width) => (
          <button
            key={width}
            type="button"
            className="width-button"
            aria-pressed={settings.width === width}
            title={`Espessura ${width}`}
            disabled={settings.tool === 'eraser'}
            onClick={() => onChange({ ...settings, width })}
          >
            <span className="width-dot" style={{ width: width + 4, height: width + 4 }} />
          </button>
        ))}
      </div>

      <div className="toolbar-group">
        <button type="button" className="tool-button" onClick={onUndo} disabled={!canUndo} title="Desfazer">
          ↶<span className="sr-only">Desfazer</span>
        </button>
        <button type="button" className="tool-button" onClick={onRedo} disabled={!canRedo} title="Refazer">
          ↷<span className="sr-only">Refazer</span>
        </button>
        <button type="button" className="tool-button" onClick={onClear} title="Limpar página">
          🗑️<span className="sr-only">Limpar página</span>
        </button>
      </div>
    </div>
  )
}
