import type { Notebook, Page } from '../lib/types'

interface SidebarProps {
  notebooks: Notebook[]
  pages: Page[]
  selectedNotebookId: string | null
  selectedPageId: string | null
  onSelectNotebook: (id: string) => void
  onCreateNotebook: () => void
  onRenameNotebook: (notebook: Notebook) => void
  onDeleteNotebook: (notebook: Notebook) => void
  onSelectPage: (id: string) => void
  onAddPage: () => void
  onDeletePage: (page: Page) => void
}

export function Sidebar({
  notebooks,
  pages,
  selectedNotebookId,
  selectedPageId,
  onSelectNotebook,
  onCreateNotebook,
  onRenameNotebook,
  onDeleteNotebook,
  onSelectPage,
  onAddPage,
  onDeletePage,
}: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="Cadernos">
      <div className="sidebar-header">
        <h1 className="brand">📓 Notas</h1>
        <button type="button" className="primary small" onClick={onCreateNotebook}>
          + Caderno
        </button>
      </div>

      <ul className="list">
        {notebooks.map((notebook) => (
          <li key={notebook.id} className={notebook.id === selectedNotebookId ? 'list-item active' : 'list-item'}>
            <button type="button" className="list-main" onClick={() => onSelectNotebook(notebook.id)}>
              {notebook.title}
            </button>
            <button
              type="button"
              className="icon-button"
              title="Renomear caderno"
              onClick={() => onRenameNotebook(notebook)}
            >
              ✏️<span className="sr-only">Renomear {notebook.title}</span>
            </button>
            <button
              type="button"
              className="icon-button"
              title="Excluir caderno"
              onClick={() => onDeleteNotebook(notebook)}
            >
              🗑️<span className="sr-only">Excluir {notebook.title}</span>
            </button>
          </li>
        ))}
        {notebooks.length === 0 && <li className="muted">Nenhum caderno ainda.</li>}
      </ul>

      {selectedNotebookId && (
        <>
          <div className="sidebar-header">
            <h2 className="section-title">Páginas</h2>
            <button type="button" className="small" onClick={onAddPage}>
              + Página
            </button>
          </div>
          <ul className="list">
            {pages.map((page, position) => (
              <li key={page.id} className={page.id === selectedPageId ? 'list-item active' : 'list-item'}>
                <button type="button" className="list-main" onClick={() => onSelectPage(page.id)}>
                  Página {position + 1}
                </button>
                {pages.length > 1 && (
                  <button
                    type="button"
                    className="icon-button"
                    title="Excluir página"
                    onClick={() => onDeletePage(page)}
                  >
                    🗑️<span className="sr-only">Excluir página {position + 1}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </nav>
  )
}
